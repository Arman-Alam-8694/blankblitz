/**
 * View models sent from server to client.
 * The server builds a per-recipient view so secrets (unsolved words) never leave the server.
 */
import type { RoomSettings } from './schemas';
import type { VoicePresence } from './voice';

export type Phase = 'LOBBY' | 'SELECTING' | 'PLAYING' | 'ROUND_END' | 'GAME_END';
export type GameMode = 'blitz' | 'spotlight';
export type InputControl = 'open' | 'captain' | 'relay';
export type BotLevel = 'off' | 'low' | 'medium';
export type VoteType = 'revoke' | 'mute' | 'kick';
export type ChatChannel = 'team' | 'lobby';
export type BoardStatus = 'pending' | 'active' | 'solved' | 'failed' | 'timeout';

export interface PlayerView {
  id: string;
  name: string;
  teamId: number;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  /** Input rights revoked by team vote. */
  revoked: boolean;
  /** Voice-muted for the team by vote. */
  teamMuted: boolean;
  /** Present while the player is in voice. */
  voice: VoicePresence | null;
  /** Preset avatar id (see AVATAR_IDS), or null. */
  avatar: string | null;
  /** Google profile photo URL (signed-in players who chose it), or null. */
  picture: string | null;
}

export interface TeamView {
  id: number;
  name: string;
  emoji: string;
  color: string;
  score: number;
  captainId: string | null;
}

export interface SlotView {
  length: number;
  /** Revealed letters (null = still blank). Only present for viewers allowed to see the board. */
  letters?: (string | null)[];
  guessed?: string[];
  wrong?: string[];
  category: string | null;
  solved: boolean;
  solvedBy: string | null;
  allIn: boolean;
}

export interface BoardProgress {
  lettersRevealed: number;
  lettersTotal: number;
  wordsSolved: number;
  wordsTotal: number;
}

export interface BoardView {
  /** Team that is guessing this board. */
  teamId: number;
  /** Team that set the words. */
  setterTeamId: number;
  status: BoardStatus;
  attemptsLeft: number;
  attemptsMax: number;
  startsAt: number | null;
  endsAt: number | null;
  /** True when the viewer may see letters (own board, spotlight spectating, or after reveal). */
  detailed: boolean;
  slots: SlotView[];
  progress: BoardProgress;
  points: number;
  relay: { activePlayerId: string | null; deadline: number | null } | null;
}

export interface SelectionSlotView {
  slotIndex: number;
  assignedTo: string | null;
  locked: boolean;
  /** Visible only to the setter's own team. */
  word: string | null;
  category: string | null;
}

export interface SelectionView {
  /** Board (guessing team) that the viewer's team is setting words for. */
  targetTeamId: number;
  wordLength: number | 'any';
  slots: SelectionSlotView[];
}

export interface VoteView {
  id: string;
  type: VoteType;
  targetId: string;
  initiatorId: string;
  yes: number;
  no: number;
  needed: number;
  expiresAt: number;
  /** Whether the viewer already voted. */
  voted: boolean;
  /** True when the vote reverses an existing revoke/mute. */
  reverse: boolean;
}

export interface RoundTeamResult {
  teamId: number;
  points: number;
  wordsSolved: number;
  wordsTotal: number;
  words: string[];
  status: BoardStatus;
}

export interface RoundResult {
  round: number;
  teams: RoundTeamResult[];
}

export interface RoomView {
  code: string;
  phase: Phase;
  settings: RoomSettings;
  youId: string;
  hostId: string | null;
  players: PlayerView[];
  teams: TeamView[];
  serverNow: number;
  round: number;
  totalRounds: number;
  wordsPerBoard: number;
  phaseEndsAt: number | null;
  selection: SelectionView | null;
  boards: BoardView[];
  /** Spotlight mode: the team currently on stage. */
  activeTeamId: number | null;
  votes: VoteView[];
  history: RoundResult[];
  isQuickMatch: boolean;
  /** Private rooms: the password, shared with members so they can invite others (null for public rooms). */
  roomKey: string | null;
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  teamId: number | null;
  authorId: string | null;
  authorName: string;
  text: string;
  at: number;
  system: boolean;
}

export interface GhostPreview {
  playerId: string;
  slot: number;
  letter: string | null;
  at: number;
}

/** One entry in the public room browser. */
export interface RoomSummary {
  code: string;
  hostName: string;
  humans: number;
  capacity: number;
  phase: Phase;
  mode: GameMode;
  teamCount: number;
  teamSize: number;
  language: string;
  voice: boolean;
}

/** Signed-in profile (Google). The token is an app-signed credential, not a Google token. */
export interface AuthProfile {
  name: string;
  picture: string | null;
  token: string;
}

export interface JoinResult {
  code: string;
  playerId: string;
  sessionToken: string;
  /** Private rooms: the password (for the invite link). */
  roomKey: string | null;
}

export type Ack<T = undefined> = (res: AckResponse<T>) => void;
export type AckResponse<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
