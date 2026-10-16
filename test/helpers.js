import { createTournament, addTeam } from '../src/core/tournament.js';

export function tournamentWithTeams(n, opts) {
  const t = createTournament(opts);
  for (let i = 1; i <= n; i++) addTeam(t, { name: `Team ${i}` });
  return t;
}

export const ids = (t) => t.teams.map((x) => x.id);
export const nameOf = (t, id) => t.teams.find((x) => x.id === id)?.name;

// Plays every ready game: the lower-numbered team wins unless `winner` says otherwise.
import { resolvePhase } from '../src/core/resolve.js';
import { recordResult } from '../src/core/tournament.js';

export function playAll(t, phase, winner = (a, b) => (num(t, a) < num(t, b) ? a : b)) {
  for (let guard = 0; guard < 100; guard++) {
    const resolved = resolvePhase(phase);
    const ready = phase.games.filter((g) => resolved.get(g.id).status === 'ready');
    if (!ready.length) return;
    for (const g of ready) {
      const [a, b] = resolved.get(g.id).teams;
      const w = winner(a, b, g);
      recordResult(t, g.id, w === a ? { scoreA: 300, scoreB: 100 } : { scoreA: 100, scoreB: 300 });
    }
  }
}

function num(t, id) {
  return Number(nameOf(t, id).replace(/\D/g, ''));
}
