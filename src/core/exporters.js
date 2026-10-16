// CSV exports for standings, for spreadsheets and results websites.
import { teamName } from './tournament.js';
import { poolStandings, bracketPlacements, finalStandings, ELIMINATION_FORMATS } from './standings.js';

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

const round = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : '');

export function standingsCsv(t, phase) {
  if (ELIMINATION_FORMATS.has(phase.format)) {
    return toCsv([
      ['Place', 'Team', 'W', 'L'],
      ...bracketPlacements(phase).map((r) => [r.alive ? '' : r.rank, teamName(t, r.teamId), r.w, r.l]),
    ]);
  }
  const rows = [['Pool', 'Rank', 'Team', 'W', 'L', 'T', 'Pct', 'PPG', 'PAPG', 'PPB', 'Powers', 'Tens', 'Negs']];
  for (const pool of phase.pools) {
    for (const r of poolStandings(t, phase, pool.id)) {
      rows.push([pool.name, r.rank, teamName(t, r.teamId), r.w, r.l, r.t, round(r.pct, 3), round(r.ppg), round(r.papg), round(r.ppb), r.powers, r.tens, r.negs]);
    }
  }
  return toCsv(rows);
}

export function finalCsv(t) {
  return toCsv([
    ['Place', 'Team', 'School'],
    ...finalStandings(t).map((r) => [r.overall, teamName(t, r.teamId), t.teams.find((x) => x.id === r.teamId)?.school ?? '']),
  ]);
}
