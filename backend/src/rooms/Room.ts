/**
 * A Room is the authoritative state machine for one lobby + match.
 *
 *   LOBBY ──start──▶ SELECTING ──▶ PLAYING ──▶ ROUND_END ──▶ (next round | GAME_END) ──▶ LOBBY
 *
 * All mutations happen synchronously on the Node event loop, so there are no
 * race conditions between players. Time-based transitions are driven by tick().
 */
import {
  BOARD_COUNTDOWN_SEC,
  CHAT_MAX,
  DEFAULT_SETTINGS,
  NICKNAME_MAX,
  ROUND_END_TIME_SEC,
  TEAM_META,
  VOTE_DURATION_SEC,
  autoAttempts,
  autoRoundTime,
  autoTotalRounds,
  roomSettingsSchema,
  type BotLevel,
  type ChatChannel,
  type ChatMessage,
  type Phase,
  type RoomSettings,
  type RoomSummary,
  type RoomView,
  type RoundResult,
  type SelectionView,
  type VoiceChannel,
  type VoicePresence,
  type VoteType,
  type VoteView,
  voiceChannelOf,
} from '@blankblitz/shared';
import { botDelayMs, botName, decide } from '../bots/brain';
import { dictionary } from '../dictionary';
import {
  boardView,
  createBoard,
  guessLetter,
  isFinished,
  isPlayable,
  penalise,
  progressOf,
  solveWord,
  startBoard,
  timeoutBoard,
  type Board,
} from '../game/board';
import { GameError, assert } from '../utils/errors';
import { logger } from '../utils/logger';
import { timingSafeEqual } from 'node:crypto';
import { TokenBucket } from '../socket/rateLimit';
import { between, roomKey, secretToken, shortId } from '../utils/random';
import type { Player, PlayerLook, RoomHooks, RoomTiming, Selection, Team, Vote } from './types';

const CHAT_HISTORY = 50;

export class Room {
  readonly code: string;
  readonly isQuickMatch: boolean;
  readonly createdAt = Date.now();
  /** Password for private rooms (embedded in invite links). */
  private readonly roomKey = roomKey();
  /** Throttles wrong-password guesses against this room from all IPs combined. */
  private readonly keyFailures = new TokenBucket(10, 0.2);

  private settings: RoomSettings;
  private phase: Phase = 'LOBBY';
  private hostId: string | null = null;
  private readonly players = new Map<string, Player>();
  private teams: Team[] = [];
  private readonly bannedTokens = new Set<string>();

  private round = 0;
  private totalRounds = 0;
  private wordsPerBoard = 1;
  private phaseEndsAt: number | null = null;
  /** When this round's word selection began — players who arrive later don't see teammates' words. */
  private selectionStartedAt = 0;
  private selections: Selection[] = [];
  private boards: Board[] = [];
  private spotlightOrder: number[] = [];
  private activeTeamId: number | null = null;
  private history: RoundResult[] = [];
  private votes: Vote[] = [];

  /** Players currently in voice (humans only). */
  private readonly voice = new Map<string, VoicePresence>();

  private lobbyChat: ChatMessage[] = [];
  private teamChat = new Map<number, ChatMessage[]>();

  private dirty = false;
  private flushScheduled = false;
  private emptySince: number | null = null;
  private disposed = false;

  constructor(
    code: string,
    private readonly hooks: RoomHooks,
    private readonly timing: RoomTiming,
    opts: { settings?: Partial<RoomSettings>; quickMatch?: boolean } = {},
  ) {
    this.code = code;
    this.isQuickMatch = opts.quickMatch ?? false;
    this.settings = roomSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...opts.settings });
    this.resetTeams();
  }

  // ───────────────────────────── membership ─────────────────────────────

  get humanCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.isBot) n++;
    return n;
  }

  get capacity(): number {
    return this.settings.teamCount * this.settings.teamSize;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** Password to put in invite links (null for public rooms). */
  get inviteKey(): string | null {
    return this.isPublic ? null : this.roomKey;
  }

  get isPublic(): boolean {
    return this.settings.visibility === 'public';
  }

  get language(): string {
    return this.settings.language;
  }

  /** Seats a new human could still take (free seats + bots that would be replaced). */
  get openSeats(): number {
    let bots = 0;
    for (const p of this.players.values()) if (p.isBot) bots++;
    return Math.max(0, this.capacity - this.players.size) + bots;
  }

  /** Public room-browser entry (no secrets, no player ids). */
  summary(): RoomSummary {
    const host = this.hostId ? this.players.get(this.hostId) : undefined;
    return {
      code: this.code,
      hostName: host?.name ?? '—',
      humans: this.humanCount,
      capacity: this.capacity,
      phase: this.phase,
      mode: this.settings.mode,
      teamCount: this.settings.teamCount,
      teamSize: this.settings.teamSize,
      language: this.settings.language,
      voice: this.settings.voice,
    };
  }

  /** True if a new human could take a seat (free seat or a bot to replace). */
  hasOpenSeat(): boolean {
    return this.players.size < this.capacity || [...this.players.values()].some((p) => p.isBot);
  }

  join(
    rawName: string,
    socketId: string,
    sessionToken?: string,
    look: PlayerLook = { avatar: null, picture: null },
    /** Private-room password, or `true` for trusted callers (the room creator). */
    key?: string | true,
  ): { player: Player; resumed: boolean } {
    const now = Date.now();
    if (sessionToken) {
      assert(!this.bannedTokens.has(sessionToken), 'You were removed from this room');
      const existing = [...this.players.values()].find((p) => p.sessionToken === sessionToken);
      if (existing) {
        if (existing.socketId && existing.socketId !== socketId) {
          this.hooks.detachSocket(existing.socketId, 'Opened in another tab');
        }
        existing.socketId = socketId;
        existing.connected = true;
        existing.avatar = look.avatar;
        existing.picture = look.picture;
        existing.disconnectedAt = null;
        this.hostId ??= existing.id;
        this.emptySince = null;
        this.sendChatHistory(existing);
        this.markDirty();
        return { player: existing, resumed: true };
      }
    }

    if (!this.isPublic && key !== true) this.checkKey(key);

    let teamId: number;
    if (this.players.size < this.capacity) {
      teamId = this.smallestTeam();
    } else {
      const bot = this.pickBotToReplace();
      assert(bot, 'Room is full');
      teamId = bot.teamId;
      this.removePlayer(bot.id, null, { replaceWithBot: false, silent: true, successorId: undefined });
    }

    const player: Player = {
      id: shortId(),
      name: this.uniqueName(rawName),
      teamId,
      isBot: false,
      botLevel: 'off',
      sessionToken: secretToken(),
      socketId,
      connected: true,
      disconnectedAt: null,
      joinedAt: now,
      revoked: false,
      teamMuted: false,
      nextBotActionAt: null,
      avatar: look.avatar,
      picture: look.picture,
    };
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    this.emptySince = null;
    this.reassignOrphanedSlots();
    this.systemMessage('lobby', null, `${player.name} joined ${TEAM_META[teamId]?.name ?? 'a'} team`);
    this.sendChatHistory(player);
    this.markDirty();
    return { player, resumed: false };
  }

  private checkKey(key: string | undefined): void {
    assert(key, 'This room is private — use the invite link or enter its password');
    const ok = key.length === this.roomKey.length && timingSafeEqual(Buffer.from(key), Buffer.from(this.roomKey));
    if (ok) return;
    assert(this.keyFailures.take(), 'Too many wrong passwords for this room — try again in a minute');
    throw new GameError('Wrong room password');
  }

  leave(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.removePlayer(playerId, null, { replaceWithBot: this.inGame() && this.settings.botLevel !== 'off' });
  }

  disconnect(playerId: string, socketId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return; // stale socket (player already resumed elsewhere)
    p.connected = false;
    p.socketId = null;
    p.disconnectedAt = Date.now();
    this.voice.delete(p.id); // client re-joins voice after reconnecting
    if (this.hostId === p.id) this.migrateHost();
    if (this.connectedHumans().length === 0) this.emptySince = Date.now();
    this.markDirty();
  }

  findPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  /** Should the manager dispose of this room? */
  isAbandoned(now: number, ttlMs: number): boolean {
    if (this.humanCount === 0) return true;
    return this.emptySince !== null && now - this.emptySince > ttlMs;
  }

  dispose(): void {
    this.disposed = true;
    for (const p of this.players.values()) {
      if (p.socketId) this.hooks.detachSocket(p.socketId, 'Room closed');
    }
    this.players.clear();
    this.voice.clear();
  }

  // ───────────────────────────── lobby ─────────────────────────────

  updateSettings(playerId: string, patch: Partial<RoomSettings>): void {
    this.assertHost(playerId);
    assert(this.phase === 'LOBBY', 'Settings can only be changed in the lobby');
    const next = roomSettingsSchema.parse({ ...this.settings, ...patch });
    assert(this.humanCount <= next.teamCount * next.teamSize, 'Not enough seats for the current players');
    this.settings = next;
    if (!next.voice) this.voice.clear();
    this.resetTeams();
    this.rebalance();
    this.markDirty();
  }

  switchTeam(playerId: string, teamId: number): void {
    const p = this.requirePlayer(playerId);
    assert(this.phase === 'LOBBY', 'You can only switch teams in the lobby');
    assert(teamId < this.settings.teamCount, 'Invalid team');
    if (p.teamId === teamId) return;
    assert(this.membersOf(teamId).length < this.settings.teamSize, 'That team is full');
    p.teamId = teamId;
    this.markDirty();
  }

  hostKick(playerId: string, targetId: string): void {
    this.assertHost(playerId);
    assert(this.phase === 'LOBBY', 'Use a team vote to remove players during a match');
    assert(targetId !== playerId, 'You cannot kick yourself');
    const target = this.requirePlayer(targetId);
    if (target.sessionToken) this.bannedTokens.add(target.sessionToken);
    this.removePlayer(targetId, 'Removed by the host', { replaceWithBot: false });
  }

  // ───────────────────────────── match lifecycle ─────────────────────────────

  start(playerId: string): void {
    this.assertHost(playerId);
    assert(this.phase === 'LOBBY', 'The match has already started');
    if (this.settings.botLevel !== 'off') this.fillBots(this.settings.botLevel);
    for (let t = 0; t < this.settings.teamCount; t++) {
      assert(this.membersOf(t).length > 0, `${TEAM_META[t]?.name} team needs at least one player (or enable bots)`);
    }
    const maxMembers = Math.max(...this.teams.map((t) => this.membersOf(t.id).length));
    this.wordsPerBoard = this.settings.wordsPerRound === 'perPlayer' ? maxMembers : this.settings.wordsPerRound;
    this.totalRounds =
      this.settings.totalRounds === 'auto' ? autoTotalRounds(this.wordsPerBoard) : this.settings.totalRounds;
    this.history = [];
    this.round = 0;
    this.resetTeams();
    for (const p of this.players.values()) {
      p.revoked = false;
      p.teamMuted = false;
    }
    this.systemMessage('lobby', null, `Match started — ${this.totalRounds} rounds, good luck!`);
    this.beginSelection(Date.now());
  }

  backToLobby(playerId: string): void {
    this.assertHost(playerId);
    assert(this.phase === 'GAME_END', 'The match is still running');
    this.toLobby();
  }

  private toLobby(): void {
    for (const p of [...this.players.values()]) {
      if (p.isBot) this.players.delete(p.id);
      p.revoked = false;
      p.teamMuted = false;
    }
    this.phase = 'LOBBY';
    this.phaseEndsAt = null;
    this.boards = [];
    this.selections = [];
    this.votes = [];
    this.activeTeamId = null;
    this.round = 0;
    this.resetTeams();
    this.rebalance();
    this.markDirty();
  }

  private beginSelection(now: number): void {
    this.selectionStartedAt = now;
    this.round += 1;
    this.phase = 'SELECTING';
    this.phaseEndsAt = now + this.settings.selectionTimeSec * 1000;
    this.boards = [];
    this.activeTeamId = null;
    const n = this.settings.teamCount;
    this.selections = this.teams.map((setter) => {
      const members = this.membersOf(setter.id);
      return {
        setterTeamId: setter.id,
        // Rotation: team i sets words for team i-1, so every team guesses someone else's words.
        targetTeamId: (setter.id + n - 1) % n,
        slots: Array.from({ length: this.wordsPerBoard }, (_, slotIndex) => ({
          slotIndex,
          // Rotate who sets which slot each round so setting duty is shared.
          assignedTo: members.length > 0 ? (members[(slotIndex + this.round - 1) % members.length]?.id ?? null) : null,
          word: null,
          category: null,
          locked: false,
        })),
      };
    });
    for (const p of this.players.values()) {
      p.nextBotActionAt = p.isBot ? now + between(1000, 3500) / this.timing.botSpeed : null;
    }
    this.markDirty();
  }

  selectWord(playerId: string, slotIndex: number, word: string, category: string | null, hint: string | null = null): void {
    const p = this.requirePlayer(playerId);
    assert(this.phase === 'SELECTING', 'Word selection is closed');
    const sel = this.selections.find((s) => s.setterTeamId === p.teamId);
    const slot = sel?.slots[slotIndex];
    assert(sel && slot, 'Invalid word slot');
    const assignee = slot.assignedTo ? this.players.get(slot.assignedTo) : undefined;
    const assigneeAway = !assignee || (!assignee.isBot && !assignee.connected);
    assert(slot.assignedTo === p.id || assigneeAway, 'That word belongs to a teammate');
    const len = this.settings.wordLength;
    assert(len === 'any' || word.length === len, `Word must be ${len} letters long`);
    assert(dictionary().isValid(word), `"${word}" is not in the dictionary`);
    if (hint) {
      // A hint must not just give the answer away.
      const letters = hint.toUpperCase().replace(/[^A-Z]/g, '');
      assert(!letters.includes(word), "The hint can't contain the word itself");
    }
    assert(
      !sel.slots.some((s) => s.slotIndex !== slotIndex && s.word === word),
      'Your team already picked that word',
    );
    slot.word = word;
    slot.category = hint ?? category;
    slot.locked = true;
    if (assigneeAway) slot.assignedTo = p.id;
    this.markDirty();
    if (this.selections.every((s) => s.slots.every((x) => x.locked))) this.beginPlaying(Date.now());
  }

  private beginPlaying(now: number): void {
    const attempts = this.settings.attempts === 'auto' ? autoAttempts(this.wordsPerBoard) : this.settings.attempts;
    const seconds =
      this.settings.roundTimeSec === 'auto' ? autoRoundTime(this.wordsPerBoard) : this.settings.roundTimeSec;

    this.boards = this.selections.map((sel) => {
      const used = new Set(sel.slots.map((s) => s.word).filter((w): w is string => w !== null));
      for (const slot of sel.slots) {
        if (slot.word) continue; // auto-pick for anyone who ran out of time
        const auto = dictionary().randomWord(this.settings.wordLength, used, this.settings.wordDifficulty);
        used.add(auto.word);
        slot.word = auto.word;
        slot.category = auto.category;
        slot.locked = true;
      }
      return createBoard({
        teamId: sel.targetTeamId,
        setterTeamId: sel.setterTeamId,
        words: sel.slots.map((s) => ({ word: s.word as string, category: s.category })),
        attempts,
        durationMs: seconds * 1000,
      });
    });
    this.boards.sort((a, b) => a.teamId - b.teamId);

    this.phase = 'PLAYING';
    const startAt = now + BOARD_COUNTDOWN_SEC * 1000 * this.timing.pauseScale;
    if (this.settings.mode === 'blitz') {
      for (const b of this.boards) this.activateBoard(b, startAt);
      this.phaseEndsAt = startAt + seconds * 1000;
    } else {
      const n = this.settings.teamCount;
      this.spotlightOrder = Array.from({ length: n }, (_, i) => (i + this.round - 1) % n);
      this.activateSpotlight(this.spotlightOrder[0] as number, startAt);
    }
    for (const p of this.players.values()) p.nextBotActionAt = null;
    this.markDirty();
  }

  private activateBoard(board: Board, startAt: number): void {
    startBoard(board, startAt);
    if (this.settings.inputControl === 'relay') {
      const order = this.relayOrder(board.teamId);
      const first = order.length > 0 ? order[(this.round - 1) % order.length] : undefined;
      board.relay = {
        activeId: first?.id ?? null,
        deadline: startAt + this.settings.shotClockSec * 1000,
      };
    }
  }

  private activateSpotlight(teamId: number, startAt: number): void {
    const board = this.boardFor(teamId);
    if (!board) return;
    this.activeTeamId = teamId;
    this.activateBoard(board, startAt);
    this.phaseEndsAt = board.endsAt;
    this.systemMessage('lobby', null, `Spotlight on ${TEAM_META[teamId]?.name} team!`);
  }

  private endRound(now: number): void {
    for (const b of this.boards) timeoutBoard(b);
    const result: RoundResult = {
      round: this.round,
      teams: this.boards.map((b) => {
        const team = this.teams[b.teamId];
        if (team) team.score += b.points;
        const prog = progressOf(b);
        return {
          teamId: b.teamId,
          points: b.points,
          wordsSolved: prog.wordsSolved,
          wordsTotal: prog.wordsTotal,
          words: b.slots.map((s) => s.word),
          status: b.status,
        };
      }),
    };
    this.history.push(result);
    this.votes = this.votes.filter((v) => v.type === 'kick');
    this.phase = 'ROUND_END';
    this.phaseEndsAt = now + ROUND_END_TIME_SEC * 1000 * this.timing.pauseScale;
    const summary = result.teams
      .map((t) => `${TEAM_META[t.teamId]?.name}: ${t.words.join(', ')} (+${t.points})`)
      .join(' · ');
    this.systemMessage('lobby', null, `Round ${this.round} over — ${summary}`);
    this.markDirty();
  }

  private endGame(): void {
    this.phase = 'GAME_END';
    this.phaseEndsAt = null;
    this.activeTeamId = null;
    const best = Math.max(...this.teams.map((t) => t.score));
    const winners = this.teams.filter((t) => t.score === best).map((t) => TEAM_META[t.id]?.name);
    this.systemMessage(
      'lobby',
      null,
      winners.length > 1 ? `It's a tie between ${winners.join(' & ')}!` : `${winners[0]} team wins the match!`,
    );
    this.markDirty();
  }

  // ───────────────────────────── gameplay input ─────────────────────────────

  guess(playerId: string, slot: number, letter: string): void {
    const p = this.requirePlayer(playerId);
    const board = this.requireActiveBoard(p);
    assert(this.canSubmit(p, board, Date.now()), "You don't have input control right now");
    this.applyGuess(p, board, slot, letter);
  }

  solve(playerId: string, slot: number, word: string): boolean {
    const p = this.requirePlayer(playerId);
    const board = this.requireActiveBoard(p);
    assert(this.canSubmit(p, board, Date.now()), "You don't have input control right now");
    return this.applySolve(p, board, slot, word);
  }

  ghost(playerId: string, slot: number, letter: string | null): void {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'PLAYING') return;
    const payload = { playerId: p.id, slot, letter, at: Date.now() };
    for (const mate of this.membersOf(p.teamId)) {
      if (mate.id !== p.id && mate.socketId) this.hooks.emit(mate.socketId, 'play:ghost', payload);
    }
  }

  setCaptain(playerId: string, targetId: string): void {
    const p = this.requirePlayer(playerId);
    const target = this.requirePlayer(targetId);
    const team = this.teams[p.teamId];
    assert(team, 'Invalid team');
    assert(target.teamId === p.teamId, 'Captain must be on your team');
    assert(team.captainId === p.id || this.hostId === p.id, 'Only the captain can hand over captaincy');
    assert(!target.revoked, 'That player has input revoked');
    assert(target.isBot || target.connected, 'That player is offline');
    team.captainId = target.id;
    this.systemMessage('team', p.teamId, `${target.name} is now captain`);
    this.markDirty();
  }

  private applyGuess(p: Player, board: Board, slot: number, letter: string): void {
    assert(board.slots[slot] && !board.slots[slot].solved, 'That word is already solved');
    const outcome = guessLetter(board, slot, letter, p.id, Date.now());
    if (outcome.kind === 'repeat') throw new GameError(`${letter} was already guessed`);
    this.afterInput(board, p);
  }

  private applySolve(p: Player, board: Board, slot: number, word: string): boolean {
    const target = board.slots[slot];
    assert(target && !target.solved, 'That word is already solved');
    assert(word.length === target.word.length, `The word has ${target.word.length} letters`);
    const correct = solveWord(board, slot, word, p.id, Date.now());
    this.systemMessage(
      'team',
      board.teamId,
      correct ? `${p.name} nailed an ALL-IN on ${word}!` : `${p.name} missed an ALL-IN (${word}) — −2 attempts`,
    );
    this.afterInput(board, p);
    return correct;
  }

  private afterInput(board: Board, p: Player): void {
    if (board.relay && board.relay.activeId === p.id) this.advanceRelay(board, Date.now());
    this.markDirty();
    this.checkPlayingProgress(Date.now());
  }

  private canSubmit(p: Player, board: Board, now: number): boolean {
    if (p.teamId !== board.teamId || p.revoked) return false;
    if (!p.isBot && !p.connected) return false;
    if (!isPlayable(board, now)) return false;
    switch (this.settings.inputControl) {
      case 'open':
        return true;
      case 'captain':
        return this.teams[p.teamId]?.captainId === p.id;
      case 'relay':
        return board.relay?.activeId === p.id;
    }
  }

  private relayOrder(teamId: number): Player[] {
    return this.membersOf(teamId).filter((m) => !m.revoked && (m.isBot || m.connected));
  }

  private advanceRelay(board: Board, now: number): void {
    if (!board.relay) return;
    const order = this.relayOrder(board.teamId);
    const idx = order.findIndex((m) => m.id === board.relay?.activeId);
    const next = order.length > 0 ? order[(idx + 1) % order.length] : undefined;
    board.relay.activeId = next?.id ?? null;
    board.relay.deadline = now + this.settings.shotClockSec * 1000;
    if (next?.isBot) next.nextBotActionAt = null;
  }

  // ───────────────────────────── votes ─────────────────────────────

  startVote(playerId: string, type: VoteType, targetId: string): void {
    const p = this.requirePlayer(playerId);
    const target = this.requirePlayer(targetId);
    assert(!p.isBot, 'Bots cannot vote');
    assert(target.id !== p.id, 'You cannot start a vote against yourself');
    assert(target.teamId === p.teamId, 'You can only vote on teammates');
    assert(
      !this.votes.some((v) => v.targetId === targetId && v.type === type),
      'A vote on that player is already running',
    );
    const reverse = (type === 'revoke' && target.revoked) || (type === 'mute' && target.teamMuted);
    const vote: Vote = {
      id: shortId(),
      type,
      teamId: p.teamId,
      targetId,
      initiatorId: p.id,
      yes: new Set([p.id]),
      no: new Set(),
      expiresAt: Date.now() + VOTE_DURATION_SEC * 1000,
      reverse,
    };
    this.votes.push(vote);
    const verb = { revoke: reverse ? 'restore input for' : 'revoke input from', mute: reverse ? 'unmute' : 'mute', kick: 'kick' }[type];
    this.systemMessage('team', p.teamId, `${p.name} started a vote to ${verb} ${target.name}`);
    this.resolveVote(vote);
    this.markDirty();
  }

  castVote(playerId: string, voteId: string, yes: boolean): void {
    const p = this.requirePlayer(playerId);
    const vote = this.votes.find((v) => v.id === voteId);
    assert(vote && vote.teamId === p.teamId, 'Vote not found');
    assert(this.eligibleVoters(vote).some((v) => v.id === p.id), 'You cannot vote on this');
    assert(!vote.yes.has(p.id) && !vote.no.has(p.id), 'You already voted');
    (yes ? vote.yes : vote.no).add(p.id);
    this.resolveVote(vote);
    this.markDirty();
  }

  /** Eligible = connected human teammates, excluding the target. */
  private eligibleVoters(vote: Vote): Player[] {
    return this.membersOf(vote.teamId).filter((m) => !m.isBot && m.connected && m.id !== vote.targetId);
  }

  private votesNeeded(vote: Vote): number {
    return Math.floor(this.eligibleVoters(vote).length / 2) + 1; // strictly more than 50%
  }

  private resolveVote(vote: Vote): void {
    const eligible = new Set(this.eligibleVoters(vote).map((p) => p.id));
    const yes = [...vote.yes].filter((id) => eligible.has(id)).length;
    const no = [...vote.no].filter((id) => eligible.has(id)).length;
    const needed = this.votesNeeded(vote);
    const target = this.players.get(vote.targetId);
    if (!target) {
      this.votes = this.votes.filter((v) => v !== vote);
      return;
    }
    if (yes >= needed) {
      this.votes = this.votes.filter((v) => v !== vote);
      this.applyVote(vote, target);
    } else if (eligible.size - no < needed) {
      this.votes = this.votes.filter((v) => v !== vote);
      this.systemMessage('team', vote.teamId, `Vote against ${target.name} failed`);
    }
  }

  private applyVote(vote: Vote, target: Player): void {
    switch (vote.type) {
      case 'revoke':
        target.revoked = !vote.reverse;
        this.systemMessage('team', vote.teamId, `${target.name} ${target.revoked ? 'lost' : 'regained'} input control`);
        break;
      case 'mute':
        target.teamMuted = !vote.reverse;
        this.systemMessage('team', vote.teamId, `${target.name} was ${target.teamMuted ? 'muted' : 'unmuted'} for the team`);
        break;
      case 'kick':
        if (target.sessionToken) this.bannedTokens.add(target.sessionToken);
        this.removePlayer(target.id, 'Removed by team vote', { replaceWithBot: this.inGame(), botLevel: 'medium' });
        break;
    }
    // Revoked relay shooters / captains are skipped right away.
    for (const b of this.boards) {
      if (b.relay && b.relay.activeId === target.id && target.revoked) this.advanceRelay(b, Date.now());
    }
  }

  // ───────────────────────────── chat ─────────────────────────────

  chat(playerId: string, channel: ChatChannel, text: string): void {
    const p = this.requirePlayer(playerId);
    if (channel === 'lobby') {
      assert(this.phase !== 'SELECTING' && this.phase !== 'PLAYING', 'Lobby chat is closed during rounds — use team chat');
    }
    this.pushMessage({
      id: shortId(),
      channel,
      teamId: channel === 'team' ? p.teamId : null,
      authorId: p.id,
      authorName: p.name,
      text: text.slice(0, CHAT_MAX),
      at: Date.now(),
      system: false,
    });
  }

  private systemMessage(channel: ChatChannel, teamId: number | null, text: string): void {
    this.pushMessage({ id: shortId(), channel, teamId, authorId: null, authorName: 'BlankBlitz', text, at: Date.now(), system: true });
  }

  private pushMessage(msg: ChatMessage): void {
    const list = msg.channel === 'lobby' ? this.lobbyChat : (this.teamChat.get(msg.teamId ?? -1) ?? []);
    list.push(msg);
    if (list.length > CHAT_HISTORY) list.splice(0, list.length - CHAT_HISTORY);
    if (msg.channel === 'team') this.teamChat.set(msg.teamId ?? -1, list);
    for (const p of this.players.values()) {
      if (!p.socketId) continue;
      if (msg.channel === 'team' && p.teamId !== msg.teamId) continue;
      this.hooks.emit(p.socketId, 'chat:message', msg);
    }
  }

  /** Arrived after this round's words were chosen (e.g. joined mid-match, or a second tab). */
  private isLateJoiner(p: Player): boolean {
    return this.inGame() && p.joinedAt > this.selectionStartedAt;
  }

  private sendChatHistory(p: Player): void {
    if (!p.socketId) return;
    let team = this.teamChat.get(p.teamId) ?? [];
    // Don't hand a late joiner the team's discussion of this round's secret words.
    if (this.isLateJoiner(p)) team = team.filter((m) => m.at < this.selectionStartedAt);
    const all = [...this.lobbyChat, ...team].sort((a, b) => a.at - b.at);
    this.hooks.emit(p.socketId, 'chat:history', all);
  }

  // ───────────────────────────── voice ─────────────────────────────
  // The server never touches media on the P2P path; it only authorises who may
  // talk to whom (signaling + relay), so channel rules hold even under fallback.

  voiceJoin(playerId: string, mic: boolean): VoicePresence {
    const p = this.requirePlayer(playerId);
    assert(this.settings.voice, 'Voice is turned off for this room');
    assert(!p.isBot && p.connected, 'Not connected');
    const presence: VoicePresence = { session: shortId(), mic, muted: false };
    this.voice.set(p.id, presence);
    this.markDirty();
    return presence;
  }

  voiceLeave(playerId: string): void {
    if (this.voice.delete(playerId)) this.markDirty();
  }

  voiceMute(playerId: string, muted: boolean): void {
    const v = this.voice.get(playerId);
    assert(v, 'You are not in voice');
    v.muted = muted;
    this.markDirty();
  }

  private channelOf(p: Player): VoiceChannel {
    return voiceChannelOf(this.phase, p.teamId);
  }

  /** Validate a signaling message; returns the target socket and sender session, or null to drop. */
  voiceSignalRoute(fromId: string, toId: string, toSession: string): { socketId: string; fromSession: string } | null {
    const from = this.voice.get(fromId);
    const to = this.voice.get(toId);
    const target = this.players.get(toId);
    if (!from || !to || !target?.socketId || fromId === toId || to.session !== toSession) return null;
    return { socketId: target.socketId, fromSession: from.session };
  }

  /**
   * Sockets allowed to receive a relayed audio frame from `fromId`.
   * Enforces: sender in voice and unmuted, not team-muted on team voice,
   * and receivers in voice on the same channel.
   */
  voiceRelayTargets(fromId: string, to: readonly string[]): string[] {
    const sender = this.players.get(fromId);
    const presence = this.voice.get(fromId);
    if (!sender || !presence || presence.muted || !presence.mic) return [];
    const channel = this.channelOf(sender);
    if (sender.teamMuted && channel !== 'lobby') return [];
    const out: string[] = [];
    for (const id of new Set(to)) {
      const r = this.players.get(id);
      if (!r?.socketId || id === fromId || !this.voice.has(id)) continue;
      if (this.channelOf(r) === channel) out.push(r.socketId);
    }
    return out;
  }

  // ───────────────────────────── time ─────────────────────────────

  tick(now: number): void {
    if (this.disposed) return;
    this.expireDisconnected(now);
    this.expireVotes(now);
    this.ensureCaptains();

    switch (this.phase) {
      case 'SELECTING':
        this.tickBotSelection(now);
        if (this.phase === 'SELECTING' && this.phaseEndsAt !== null && now >= this.phaseEndsAt) this.beginPlaying(now);
        break;
      case 'PLAYING':
        this.tickPlaying(now);
        break;
      case 'ROUND_END':
        if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) {
          if (this.round >= this.totalRounds) this.endGame();
          else this.beginSelection(now);
        }
        break;
      default:
        break;
    }
  }

  private tickPlaying(now: number): void {
    for (const board of this.boards) {
      if (board.status !== 'active') continue;
      if (board.endsAt !== null && now >= board.endsAt) {
        timeoutBoard(board);
        this.markDirty();
        continue;
      }
      if (board.relay && isPlayable(board, now)) {
        const active = board.relay.activeId ? this.players.get(board.relay.activeId) : undefined;
        if (!active || active.revoked || (!active.isBot && !active.connected)) {
          this.advanceRelay(board, now);
          this.markDirty();
        } else if (board.relay.deadline !== null && now >= board.relay.deadline) {
          penalise(board, 1);
          this.systemMessage('team', board.teamId, `${active.name}'s shot-clock expired — −1 attempt`);
          this.advanceRelay(board, now);
          this.markDirty();
        }
      }
      if (board.status === 'active') this.tickBots(board, now);
    }
    this.checkPlayingProgress(now);
  }

  private checkPlayingProgress(now: number): void {
    if (this.phase !== 'PLAYING') return;
    if (this.settings.mode === 'blitz') {
      if (this.boards.every(isFinished)) this.endRound(now);
      return;
    }
    const current = this.activeTeamId !== null ? this.boardFor(this.activeTeamId) : undefined;
    if (current && !isFinished(current)) return;
    const idx = this.spotlightOrder.indexOf(this.activeTeamId ?? -1);
    const nextTeam = this.spotlightOrder[idx + 1];
    if (nextTeam === undefined) this.endRound(now);
    else this.activateSpotlight(nextTeam, now + BOARD_COUNTDOWN_SEC * 1000 * this.timing.pauseScale);
    this.markDirty();
  }

  private tickBots(board: Board, now: number): void {
    const members = this.membersOf(board.teamId);
    // Bots assisting humans hold back so the humans stay in charge of their board.
    const humansPresent = members.some((m) => !m.isBot && m.connected && !m.revoked);
    for (const bot of members) {
      if (!bot.isBot || !this.canSubmit(bot, board, now)) continue;
      if (bot.nextBotActionAt === null) {
        let delay = botDelayMs(bot.botLevel, this.timing.botSpeed) * (humansPresent ? 2.5 : 1);
        if (board.relay) delay = Math.min(delay, this.settings.shotClockSec * 1000 * 0.7);
        bot.nextBotActionAt = now + delay;
        continue;
      }
      if (now < bot.nextBotActionAt) continue;
      bot.nextBotActionAt = null;
      const slotIndex = board.slots.findIndex((s) => !s.solved);
      const slot = board.slots[slotIndex];
      if (!slot) continue;
      const action = decide(bot.botLevel, slot);
      try {
        if (action.kind === 'guess') this.applyGuess(bot, board, slotIndex, action.letter);
        else this.applySolve(bot, board, slotIndex, action.word);
      } catch (err) {
        logger.debug('bot action rejected', { room: this.code, err: String(err) });
      }
      if (board.status !== 'active') break;
    }
  }

  private tickBotSelection(now: number): void {
    for (const sel of this.selections) {
      for (const slot of sel.slots) {
        if (slot.locked || !slot.assignedTo) continue;
        const bot = this.players.get(slot.assignedTo);
        if (!bot?.isBot || bot.nextBotActionAt === null || now < bot.nextBotActionAt) continue;
        const used = new Set(sel.slots.map((s) => s.word).filter((w): w is string => w !== null));
        const pickWord = dictionary().randomWord(this.settings.wordLength, used, this.settings.wordDifficulty);
        try {
          this.selectWord(bot.id, slot.slotIndex, pickWord.word, pickWord.category);
        } catch (err) {
          logger.debug('bot selection rejected', { room: this.code, err: String(err) });
        }
        if (this.phase !== 'SELECTING') return;
      }
    }
  }

  private expireDisconnected(now: number): void {
    for (const p of [...this.players.values()]) {
      if (p.isBot || p.connected || p.disconnectedAt === null) continue;
      if (now - p.disconnectedAt > this.timing.reconnectGraceMs) {
        this.removePlayer(p.id, null, { replaceWithBot: this.inGame() && this.settings.botLevel !== 'off' });
      }
    }
  }

  private expireVotes(now: number): void {
    const expired = this.votes.filter((v) => now >= v.expiresAt);
    if (expired.length === 0) return;
    this.votes = this.votes.filter((v) => now < v.expiresAt);
    for (const v of expired) this.systemMessage('team', v.teamId, 'A vote expired');
    this.markDirty();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private inGame(): boolean {
    return this.phase === 'SELECTING' || this.phase === 'PLAYING' || this.phase === 'ROUND_END';
  }

  private resetTeams(): void {
    const old = this.teams;
    this.teams = Array.from({ length: this.settings.teamCount }, (_, id) => ({
      id,
      score: 0,
      captainId: old[id]?.captainId ?? null,
    }));
  }

  private membersOf(teamId: number): Player[] {
    return [...this.players.values()].filter((p) => p.teamId === teamId).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private connectedHumans(): Player[] {
    return [...this.players.values()].filter((p) => !p.isBot && p.connected);
  }

  private smallestTeam(): number {
    let best = 0;
    let bestCount = Infinity;
    for (let t = 0; t < this.settings.teamCount; t++) {
      const c = this.membersOf(t).length;
      if (c < bestCount && c < this.settings.teamSize) {
        best = t;
        bestCount = c;
      }
    }
    return best;
  }

  private pickBotToReplace(): Player | undefined {
    const bots = [...this.players.values()].filter((p) => p.isBot);
    // Prefer replacing a bot on the team with the fewest humans.
    return bots.sort(
      (a, b) =>
        this.membersOf(a.teamId).filter((m) => !m.isBot).length - this.membersOf(b.teamId).filter((m) => !m.isBot).length,
    )[0];
  }

  /** Move players out of teams that no longer exist / are over capacity. */
  private rebalance(): void {
    for (const p of [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)) {
      const t = p.teamId;
      const members = this.membersOf(t);
      const overflow = t >= this.settings.teamCount || members.indexOf(p) >= this.settings.teamSize;
      if (overflow) {
        p.teamId = -1;
        p.teamId = this.smallestTeam();
      }
    }
  }

  private fillBots(level: BotLevel): void {
    const now = Date.now();
    for (let t = 0; t < this.settings.teamCount; t++) {
      while (this.membersOf(t).length < this.settings.teamSize) this.addBot(t, level, now);
    }
  }

  private addBot(teamId: number, level: BotLevel, now: number): Player {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const bot: Player = {
      id: shortId(),
      name: botName(taken),
      teamId,
      isBot: true,
      botLevel: level === 'off' ? 'low' : level,
      sessionToken: null,
      socketId: null,
      connected: true,
      disconnectedAt: null,
      joinedAt: now + this.players.size, // keep deterministic seat order
      revoked: false,
      teamMuted: false,
      nextBotActionAt: null,
      avatar: null,
      picture: null,
    };
    this.players.set(bot.id, bot);
    return bot;
  }

  private removePlayer(
    playerId: string,
    kickReason: string | null,
    opts: { replaceWithBot: boolean; botLevel?: BotLevel; silent?: boolean; successorId?: string },
  ): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    this.voice.delete(playerId);
    if (kickReason && p.socketId) this.hooks.detachSocket(p.socketId, kickReason);
    let replacement: Player | undefined;
    if (opts.replaceWithBot) {
      replacement = this.addBot(p.teamId, opts.botLevel ?? this.settings.botLevel, p.joinedAt);
    }
    // Hand over seat-bound responsibilities to the replacement (or let helpers re-pick).
    for (const sel of this.selections) {
      for (const slot of sel.slots) if (slot.assignedTo === playerId) slot.assignedTo = replacement?.id ?? null;
    }
    for (const team of this.teams) if (team.captainId === playerId) team.captainId = null;
    for (const b of this.boards) if (b.relay?.activeId === playerId) this.advanceRelay(b, Date.now());
    this.votes = this.votes.filter((v) => v.targetId !== playerId);
    for (const v of this.votes) this.resolveVote(v);
    if (this.hostId === playerId) this.migrateHost();
    this.reassignOrphanedSlots();
    if (!opts.silent && !p.isBot) this.systemMessage('lobby', null, `${p.name} left the room`);
    if (this.connectedHumans().length === 0 && this.emptySince === null) this.emptySince = Date.now();
    this.markDirty();
  }

  private reassignOrphanedSlots(): void {
    for (const sel of this.selections) {
      const members = this.membersOf(sel.setterTeamId);
      sel.slots.forEach((slot, i) => {
        if (slot.locked || (slot.assignedTo && this.players.has(slot.assignedTo))) return;
        const m = members[i % Math.max(1, members.length)];
        slot.assignedTo = m?.id ?? null;
        if (m?.isBot) m.nextBotActionAt = Date.now() + between(800, 2000) / this.timing.botSpeed;
      });
    }
  }

  private migrateHost(): void {
    const next = this.connectedHumans().sort((a, b) => a.joinedAt - b.joinedAt)[0];
    const prev = this.hostId;
    this.hostId = next?.id ?? ([...this.players.values()].find((p) => !p.isBot)?.id ?? null);
    if (this.hostId && this.hostId !== prev) {
      const name = this.players.get(this.hostId)?.name;
      this.systemMessage('lobby', null, `${name} is now the host`);
    }
  }

  private ensureCaptains(): void {
    if (this.settings.inputControl !== 'captain') return;
    for (const team of this.teams) {
      const cap = team.captainId ? this.players.get(team.captainId) : undefined;
      const valid = cap && cap.teamId === team.id && !cap.revoked && (cap.isBot || cap.connected);
      if (valid) continue;
      const members = this.membersOf(team.id).filter((m) => !m.revoked && (m.isBot || m.connected));
      const next = members.find((m) => !m.isBot) ?? members[0];
      const nextId = next?.id ?? null;
      if (nextId !== team.captainId) {
        team.captainId = nextId;
        this.markDirty();
      }
    }
  }

  private uniqueName(raw: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(raw.toLowerCase())) return raw;
    for (let i = 2; i < 100; i++) {
      const suffix = ` ${i}`;
      const candidate = raw.slice(0, NICKNAME_MAX - suffix.length) + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return raw.slice(0, NICKNAME_MAX - 5) + ` ${Math.floor(Math.random() * 9999)}`;
  }

  private boardFor(teamId: number): Board | undefined {
    return this.boards.find((b) => b.teamId === teamId);
  }

  private requireActiveBoard(p: Player): Board {
    assert(this.phase === 'PLAYING', 'No round is being played');
    const board = this.boardFor(p.teamId);
    assert(board && board.status === 'active', 'Your board is not active');
    return board;
  }

  private requirePlayer(playerId: string): Player {
    const p = this.players.get(playerId);
    if (!p) throw new GameError('You are not in this room');
    return p;
  }

  private assertHost(playerId: string): void {
    assert(this.hostId === playerId, 'Only the host can do that');
  }

  // ───────────────────────────── state broadcast ─────────────────────────────

  /** Coalesce many mutations within one event-loop turn into a single broadcast. */
  markDirty(): void {
    this.dirty = true;
    if (this.flushScheduled || this.disposed) return;
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      if (!this.dirty || this.disposed) return;
      this.dirty = false;
      this.ensureCaptains();
      this.dirty = false;
      for (const p of this.players.values()) {
        if (p.socketId) this.hooks.emit(p.socketId, 'room:state', this.viewFor(p));
      }
    });
  }

  viewFor(viewer: Player): RoomView {
    const now = Date.now();
    const revealAll = this.phase === 'ROUND_END' || this.phase === 'GAME_END';
    const spotlight = this.settings.mode === 'spotlight';

    let selection: SelectionView | null = null;
    if (this.phase === 'SELECTING' || this.phase === 'PLAYING') {
      const sel = this.selections.find((s) => s.setterTeamId === viewer.teamId);
      const late = this.isLateJoiner(viewer);
      if (sel) {
        selection = {
          targetTeamId: sel.targetTeamId,
          wordLength: this.settings.wordLength,
          slots: sel.slots.map((s) => ({
            slotIndex: s.slotIndex,
            assignedTo: s.assignedTo,
            locked: s.locked,
            // Late joiners only see the word they set themselves (anti second-tab peeking).
            word: late && s.assignedTo !== viewer.id ? null : s.word,
            category: s.category,
          })),
        };
      }
    }

    const votes: VoteView[] = this.votes
      .filter((v) => v.teamId === viewer.teamId)
      .map((v) => ({
        id: v.id,
        type: v.type,
        targetId: v.targetId,
        initiatorId: v.initiatorId,
        yes: v.yes.size,
        no: v.no.size,
        needed: this.votesNeeded(v),
        expiresAt: v.expiresAt,
        voted: v.yes.has(viewer.id) || v.no.has(viewer.id),
        reverse: v.reverse,
      }));

    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      youId: viewer.id,
      hostId: this.hostId,
      players: [...this.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          teamId: p.teamId,
          isBot: p.isBot,
          isHost: p.id === this.hostId,
          connected: p.connected,
          revoked: p.revoked,
          teamMuted: p.teamMuted,
          voice: this.voice.get(p.id) ?? null,
          avatar: p.avatar,
          picture: p.picture,
        })),
      teams: this.teams.map((t) => ({
        id: t.id,
        name: TEAM_META[t.id]?.name ?? `Team ${t.id + 1}`,
        emoji: TEAM_META[t.id]?.emoji ?? '⬜',
        color: TEAM_META[t.id]?.color ?? '#888',
        score: t.score,
        captainId: this.settings.inputControl === 'captain' ? t.captainId : null,
      })),
      serverNow: now,
      round: this.round,
      totalRounds: this.totalRounds,
      wordsPerBoard: this.wordsPerBoard,
      phaseEndsAt: this.phaseEndsAt,
      selection,
      boards: this.boards.map((b) => {
        const own = b.teamId === viewer.teamId;
        const detailed = own || spotlight;
        const reveal = revealAll || (isFinished(b) && detailed);
        return boardView(b, detailed, reveal);
      }),
      activeTeamId: spotlight ? this.activeTeamId : null,
      votes,
      history: this.history,
      isQuickMatch: this.isQuickMatch,
      roomKey: this.inviteKey,
    };
  }
}
