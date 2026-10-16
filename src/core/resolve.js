// Works out who is playing in each game of a phase, and who won.
//
// Bracket games point at earlier games, so a game's teams are only known
// once those games are decided. Byes advance automatically.
export const BYE = 'BYE';

function winnerSide(result) {
  if (!result) return null;
  // result.forfeit names the side that forfeited ('A', 'B' or 'both').
  if (result.forfeit === 'both') return null;
  if (result.forfeit === 'A') return 1;
  if (result.forfeit === 'B') return 0;
  if (result.scoreA > result.scoreB) return 0;
  if (result.scoreB > result.scoreA) return 1;
  return null; // tie
}

// Returns Map<gameId, Resolved> where Resolved is
//   { teams: [a, b], status, winner, loser }
// teams entries are a team id, BYE, or null (not yet known).
// status: 'pending' | 'ready' | 'final' | 'bye' | 'not-needed' | 'conflict'
export function resolvePhase(phase) {
  const byId = new Map(phase.games.map((g) => [g.id, g]));
  const memo = new Map();

  function slotTeam(slot) {
    if (!slot) return null;
    if (slot.teamId) return slot.teamId;
    if (slot.bye) return BYE;
    if (slot.from) {
      const src = resolve(byId.get(slot.from));
      if (!src) return null;
      if (src.status === 'not-needed') return null;
      return slot.take === 'winner' ? src.winner : src.loser;
    }
    return null;
  }

  function resolve(g) {
    if (!g) return null;
    if (memo.has(g.id)) return memo.get(g.id);
    const teams = [slotTeam(g.slots[0]), slotTeam(g.slots[1])];
    let out = { teams, status: 'pending', winner: null, loser: null };

    if (g.ifNecessary) {
      const gate = resolve(byId.get(g.ifNecessary.gameId));
      const decided = gate && (gate.status === 'final' || gate.status === 'bye');
      if (decided && gate.winner === gate.teams[g.ifNecessary.unlessWinnerSlot]) {
        out.status = 'not-needed';
        memo.set(g.id, out);
        return out;
      }
    }

    const [a, b] = teams;
    if (a === BYE || b === BYE) {
      const winner = a === BYE ? b : a;
      if (winner === null) {
        out.status = 'pending';
      } else {
        out = { teams, status: 'bye', winner, loser: BYE };
      }
    } else if (a !== null && b !== null) {
      if (g.result) {
        if (g.result.teamA && (g.result.teamA !== a || g.result.teamB !== b)) {
          out.status = 'conflict';
        } else {
          const side = winnerSide(g.result);
          out.status = 'final';
          if (side !== null) {
            out.winner = teams[side];
            out.loser = teams[1 - side];
          }
        }
      } else {
        out.status = 'ready';
      }
    }
    memo.set(g.id, out);
    return out;
  }

  const all = new Map();
  for (const g of phase.games) all.set(g.id, resolve(g));
  return all;
}

// Phase is complete when every game is decided or not needed.
export function phaseComplete(phase, resolved = resolvePhase(phase)) {
  if (!phase.games.length) return false;
  if (phase.format === 'swiss' && (phase.config.rounds || 0) > currentRound(phase)) return false;
  return [...resolved.values()].every((r) => ['final', 'bye', 'not-needed'].includes(r.status));
}

export function currentRound(phase) {
  return phase.games.reduce((m, g) => Math.max(m, g.round || 0), 0);
}
