// Standings, tiebreakers and final placements.
import { bonusesHeard } from './scoring.js';
import { BYE, resolvePhase } from './resolve.js';

export const TIEBREAKERS = {
  winPct: { label: 'Winning percentage', value: (r) => r.pct },
  headToHead: { label: 'Head-to-head record among tied teams', value: null },
  pointDiff: { label: 'Point differential per game', value: (r) => r.ppg - r.papg },
  ppg: { label: 'Points per game', value: (r) => r.ppg },
  papg: { label: 'Fewest points allowed per game', value: (r) => -r.papg },
  ppb: { label: 'Points per bonus', value: (r) => r.ppb },
  wins: { label: 'Total wins', value: (r) => r.w },
};

export const DEFAULT_TIEBREAKERS = ['winPct', 'headToHead', 'pointDiff', 'ppg'];

function emptyRow(teamId) {
  return {
    teamId,
    gp: 0, w: 0, l: 0, t: 0,
    forfeitWins: 0, forfeitLosses: 0,
    scoredGames: 0, pf: 0, pa: 0,
    powers: 0, tens: 0, negs: 0, bonusPoints: 0, bonusesHeard: 0, statGames: 0,
    pct: 0, ppg: 0, papg: 0, ppb: 0,
  };
}

// games: [{ teamA, teamB, result }] with known team ids.
export function tallyGames(teamIds, games) {
  const rows = new Map(teamIds.map((id) => [id, emptyRow(id)]));
  for (const g of games) {
    const { teamA, teamB, result } = g;
    if (!result || teamA === BYE || teamB === BYE) continue;
    const a = rows.get(teamA);
    const b = rows.get(teamB);
    if (!a || !b) continue;
    a.gp++; b.gp++;
    if (result.forfeit) {
      if (result.forfeit === 'A' || result.forfeit === 'both') a.l++, a.forfeitLosses++;
      if (result.forfeit === 'B' || result.forfeit === 'both') b.l++, b.forfeitLosses++;
      if (result.forfeit === 'A') b.w++, b.forfeitWins++;
      if (result.forfeit === 'B') a.w++, a.forfeitWins++;
      continue;
    }
    if (result.scoreA > result.scoreB) a.w++, b.l++;
    else if (result.scoreB > result.scoreA) b.w++, a.l++;
    else a.t++, b.t++;
    for (const [row, own, opp, stats] of [
      [a, result.scoreA, result.scoreB, result.statsA],
      [b, result.scoreB, result.scoreA, result.statsB],
    ]) {
      row.scoredGames++;
      row.pf += own;
      row.pa += opp;
      if (stats) {
        row.statGames++;
        row.powers += Number(stats.powers) || 0;
        row.tens += Number(stats.tens) || 0;
        row.negs += Number(stats.negs) || 0;
        row.bonusPoints += Number(stats.bonusPoints) || 0;
        row.bonusesHeard += bonusesHeard(stats);
      }
    }
  }
  for (const r of rows.values()) {
    r.pct = r.gp ? (r.w + r.t / 2) / r.gp : 0;
    r.ppg = r.scoredGames ? r.pf / r.scoredGames : 0;
    r.papg = r.scoredGames ? r.pa / r.scoredGames : 0;
    r.ppb = r.bonusesHeard ? r.bonusPoints / r.bonusesHeard : 0;
  }
  return rows;
}

const EPS = 1e-9;

// Sorts rows by the tiebreaker chain. Teams still tied after every
// tiebreaker share a rank and are flagged `tied`.
export function rankRows(rows, games, tiebreakers = DEFAULT_TIEBREAKERS) {
  function keyFor(tb, group) {
    if (tb === 'headToHead') {
      const ids = new Set(group.map((r) => r.teamId));
      const inGroup = games.filter((g) => ids.has(g.teamA) && ids.has(g.teamB));
      const h2h = tallyGames([...ids], inGroup);
      return (r) => (h2h.get(r.teamId).gp ? h2h.get(r.teamId).pct : 0.5);
    }
    return TIEBREAKERS[tb].value;
  }

  function rank(group, i) {
    if (group.length <= 1) return group.map((r) => ({ ...r, tiedWith: 0 }));
    if (i >= tiebreakers.length) return group.map((r) => ({ ...r, tiedWith: group.length - 1 }));
    const key = keyFor(tiebreakers[i], group);
    const sorted = [...group].sort((x, y) => key(y) - key(x));
    const out = [];
    let start = 0;
    for (let j = 1; j <= sorted.length; j++) {
      if (j === sorted.length || Math.abs(key(sorted[j]) - key(sorted[start])) > EPS) {
        out.push(...rank(sorted.slice(start, j), i + 1));
        start = j;
      }
    }
    return out;
  }

  const ranked = rank([...rows], 0);
  // Assign shared ranks to teams that remain fully tied.
  let place = 1;
  for (let i = 0; i < ranked.length; ) {
    const size = ranked[i].tiedWith + 1;
    for (let j = i; j < i + size; j++) {
      ranked[j].rank = place;
      ranked[j].tied = size > 1;
    }
    place += size;
    i += size;
  }
  return ranked;
}

// Games of a phase with their teams filled in.
export function phaseGames(phase, resolved = resolvePhase(phase)) {
  return phase.games.map((g) => {
    const r = resolved.get(g.id);
    return { ...g, teamA: r.teams[0], teamB: r.teams[1], resolved: r };
  });
}

function decidedGames(games) {
  return games.filter((g) => g.result && g.resolved?.status === 'final');
}

// Standings for one pool (or the whole phase when poolId is null).
export function poolStandings(tournament, phase, poolId = null) {
  const pool = poolId ? phase.pools.find((p) => p.id === poolId) : null;
  const teamIds = pool ? pool.teamIds : phase.teamIds;
  let games = decidedGames(phaseGames(phase)).filter((g) => !poolId || g.poolId === poolId);
  if (phase.config?.carryover) {
    const idx = tournament.phases.findIndex((p) => p.id === phase.id);
    const prev = tournament.phases[idx - 1];
    if (prev) {
      const ids = new Set(teamIds);
      const carried = decidedGames(phaseGames(prev)).filter((g) => ids.has(g.teamA) && ids.has(g.teamB));
      games = [...carried.map((g) => ({ ...g, carried: true })), ...games];
    }
  }
  const rows = tallyGames(teamIds, games);
  return rankRows([...rows.values()], games, tournament.settings.tiebreakers);
}

// Placements in an elimination bracket: teams are ordered by the deepest
// game they played, winners of that game ahead of losers.
export function bracketPlacements(phase) {
  const games = phaseGames(phase);
  const info = new Map(phase.teamIds.map((id) => [id, { teamId: id, depth: -1, won: false }]));
  for (const g of games) {
    const r = g.resolved;
    if (r.status !== 'final') continue;
    for (const team of r.teams) {
      const row = info.get(team);
      if (!row || g.order < row.depth) continue;
      row.depth = g.order;
      row.won = r.winner === team;
    }
  }
  // Teams with a game still to play are not placed yet.
  const stillScheduled = new Set();
  for (const g of games) {
    if (['ready', 'pending'].includes(g.resolved.status)) {
      g.resolved.teams.forEach((t) => t && t !== BYE && stillScheduled.add(t));
    }
  }
  const rows = [...info.values()].map((r) => ({ ...r, alive: stillScheduled.has(r.teamId) }));
  rows.sort((a, b) => b.depth - a.depth || Number(b.won) - Number(a.won));
  let place = 1;
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && rows[j].depth === rows[i].depth && rows[j].won === rows[i].won) j++;
    for (let x = i; x < j; x++) {
      rows[x].rank = place;
      rows[x].tied = j - i > 1;
    }
    place += j - i;
    i = j;
  }
  const records = tallyGames(phase.teamIds, decidedGames(games));
  return rows.map((r) => ({ ...records.get(r.teamId), ...r }));
}

export const ELIMINATION_FORMATS = new Set(['single-elim', 'double-elim']);

// Every team in the phase, best first, with { teamId, rank, pool, place }.
// Pools are combined by tier order (tiered pools) or by place across pools.
export function phaseRanking(tournament, phase) {
  if (ELIMINATION_FORMATS.has(phase.format)) {
    return bracketPlacements(phase).map((r) => ({ ...r, pool: null, place: r.rank }));
  }
  if (!phase.pools?.length || phase.pools.length === 1) {
    return poolStandings(tournament, phase, phase.pools?.[0]?.id ?? null).map((r) => ({
      ...r,
      pool: phase.pools?.[0]?.id ?? null,
      place: r.rank,
    }));
  }
  const perPool = phase.pools.map((pool, poolIndex) =>
    poolStandings(tournament, phase, pool.id).map((r) => ({ ...r, pool: pool.id, poolIndex, place: r.rank })),
  );
  const all = perPool.flat();
  if (phase.config?.assignment === 'tiered') {
    all.sort((a, b) => a.poolIndex - b.poolIndex || a.place - b.place);
  } else {
    all.sort((a, b) => a.place - b.place || b.pct - a.pct || (b.ppg - b.papg) - (a.ppg - a.papg) || b.ppg - a.ppg);
  }
  return all.map((r, i) => ({ ...r, rank: i + 1 }));
}

// Final order for the whole tournament: the latest phase decides, and teams
// that did not reach it follow in the order of the phase they left.
export function finalStandings(tournament) {
  const placed = new Set();
  const out = [];
  for (let i = tournament.phases.length - 1; i >= 0; i--) {
    const phase = tournament.phases[i];
    for (const r of phaseRanking(tournament, phase)) {
      if (placed.has(r.teamId)) continue;
      placed.add(r.teamId);
      out.push({ ...r, phaseId: phase.id });
    }
  }
  let prev = null;
  return out.map((r, i) => {
    const sharesPlace = prev && prev.phaseId === r.phaseId && prev.rank === r.rank;
    const overall = sharesPlace ? prev.overall : i + 1;
    prev = { ...r, overall };
    return prev;
  });
}
