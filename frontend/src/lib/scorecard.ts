import type { RoomView } from '@blankblitz/shared';
import { roomUrl } from './router';

/** Emoji summary for WhatsApp / Discord. */
export function buildScorecard(view: RoomView): string {
  const teams = [...view.teams].sort((a, b) => b.score - a.score);
  const lines = [`🔤 BlankBlitz — ${view.settings.mode === 'blitz' ? 'Blitz' : 'Spotlight'} match`];
  lines.push(teams.map((t) => `${t.emoji} ${t.name} ${t.score}`).join('  vs  '));
  for (const r of view.history) {
    const row = r.teams
      .map((t) => {
        const team = view.teams.find((x) => x.id === t.teamId);
        const marks = '✅'.repeat(t.wordsSolved) + '❌'.repeat(t.wordsTotal - t.wordsSolved);
        return `${team?.emoji ?? ''}${marks} +${t.points}`;
      })
      .join('  ');
    lines.push(`R${r.round}: ${row}`);
  }
  const top = teams[0];
  const tie = teams.length > 1 && teams[1]?.score === top?.score;
  lines.push(tie ? '🤝 Draw!' : `🏆 ${top?.name} wins!`);
  lines.push(`Play: ${roomUrl(view.code)}`);
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts (e.g. LAN IP over http)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
