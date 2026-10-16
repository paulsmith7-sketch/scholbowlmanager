// The tournament document and the operations that change it.
//
// Everything lives in one plain JSON object so it can be saved locally,
// exported to a file, and moved between laptops on a USB stick.
import { uid } from './ids.js';
import { defaultScoring } from './scoring.js';
import { roundRobinRounds, distributeToPools } from './roundrobin.js';
import { singleElimination, doubleElimination } from './brackets.js';
import { swissPairings, pairKey } from './swiss.js';
import { resolvePhase, BYE, currentRound } from './resolve.js';
import { DEFAULT_TIEBREAKERS, phaseRanking, poolStandings } from './standings.js';

export const SCHEMA_VERSION = 1;

export const FORMATS = {
  'round-robin': { label: 'Round robin', description: 'Every team plays every other team.' },
  pools: { label: 'Pools', description: 'Teams split into pools; each pool plays a round robin.' },
  'single-elim': { label: 'Single elimination', description: 'Lose once and you are out.' },
  'double-elim': { label: 'Double elimination', description: 'Teams are out after their second loss.' },
  swiss: { label: 'Swiss', description: 'Teams with similar records are paired each round.' },
};

const POOL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function createTournament({ name = 'New tournament', date = '', location = '', scoringPreset = 'ihsa' } = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('t'),
    name,
    date,
    location,
    createdAt: now,
    updatedAt: now,
    settings: {
      scoring: defaultScoring(scoringPreset),
      tiebreakers: [...DEFAULT_TIEBREAKERS],
    },
    teams: [],
    rooms: [],
    phases: [],
  };
}

function touch(t) {
  t.updatedAt = new Date().toISOString();
  return t;
}

export function addTeam(t, { name, school = '' }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Team name is required.');
  if (t.teams.some((x) => x.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`There is already a team named "${trimmed}".`);
  }
  const team = { id: uid('tm'), name: trimmed, school: String(school).trim() };
  t.teams.push(team);
  touch(t);
  return team;
}

export function teamInUse(t, teamId) {
  return t.phases.some((p) => p.teamIds.includes(teamId));
}

export function removeTeam(t, teamId) {
  if (teamInUse(t, teamId)) throw new Error('This team is already scheduled. Delete the phase first.');
  t.teams = t.teams.filter((x) => x.id !== teamId);
  touch(t);
}

export function updateTeam(t, teamId, fields) {
  const team = t.teams.find((x) => x.id === teamId);
  if (!team) throw new Error('Team not found.');
  if (fields.name !== undefined) {
    const name = String(fields.name).trim();
    if (!name) throw new Error('Team name is required.');
    team.name = name;
  }
  if (fields.school !== undefined) team.school = String(fields.school).trim();
  touch(t);
  return team;
}

export function addRoom(t, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Room name is required.');
  const room = { id: uid('rm'), name: trimmed };
  t.rooms.push(room);
  touch(t);
  return room;
}

export function removeRoom(t, roomId) {
  t.rooms = t.rooms.filter((r) => r.id !== roomId);
  for (const p of t.phases) for (const g of p.games) if (g.roomId === roomId) g.roomId = null;
  touch(t);
}

export function teamName(t, teamId) {
  if (teamId === BYE) return 'Bye';
  if (!teamId) return 'TBD';
  return t.teams.find((x) => x.id === teamId)?.name ?? 'Unknown team';
}

function roundRobinGames(teamIds, { double, poolId, startRound = 1 }) {
  const games = [];
  const byes = [];
  roundRobinRounds(teamIds, { double }).forEach((round, i) => {
    const r = startRound + i;
    for (const [a, b] of round.pairs) {
      games.push({ id: uid('g'), round: r, poolId, slots: [{ teamId: a }, { teamId: b }] });
    }
    if (round.bye) byes.push({ round: r, poolId, teamId: round.bye });
  });
  return { games, byes };
}

// Rooms are handed out round by round in game order. When there are more
// games than rooms, the extra games are left without a room to assign by hand.
export function assignRooms(t, phase) {
  if (!t.rooms.length) return;
  const byRound = new Map();
  for (const g of phase.games) {
    if (g.slots.some((s) => s.bye)) continue;
    if (!byRound.has(g.round)) byRound.set(g.round, []);
    byRound.get(g.round).push(g);
  }
  for (const games of byRound.values()) {
    games.forEach((g, i) => {
      g.roomId = t.rooms[i]?.id ?? null;
    });
  }
}

// seededTeamIds: teams in seed order (best first). Seeding matters for
// brackets, pool distribution and the first Swiss round.
export function createPhase(t, { name, format, seededTeamIds, config = {} }) {
  if (!FORMATS[format]) throw new Error(`Unknown format "${format}".`);
  const teamIds = [...seededTeamIds];
  if (new Set(teamIds).size !== teamIds.length) throw new Error('A team is listed twice.');
  if (teamIds.length < 2) throw new Error('A phase needs at least two teams.');
  const phase = {
    id: uid('p'),
    name: name || FORMATS[format].label,
    format,
    config: { ...config },
    teamIds,
    pools: [],
    games: [],
    byes: [],
    createdAt: new Date().toISOString(),
  };

  if (format === 'round-robin') {
    const pool = { id: uid('pl'), name: 'All teams', teamIds };
    phase.pools = [pool];
    Object.assign(phase, roundRobinGames(teamIds, { double: config.double, poolId: pool.id }));
  } else if (format === 'pools') {
    const count = Number(config.poolCount) || 2;
    if (count < 1 || teamIds.length / count < 2) throw new Error('Each pool needs at least two teams.');
    const groups = distributeToPools(teamIds, count, config.assignment || 'snake');
    phase.pools = groups.map((ids, i) => ({
      id: uid('pl'),
      name: config.poolNames?.[i] || `Pool ${POOL_LETTERS[i] ?? i + 1}`,
      teamIds: ids,
    }));
    for (const pool of phase.pools) {
      const { games, byes } = roundRobinGames(pool.teamIds, { double: config.double, poolId: pool.id });
      phase.games.push(...games);
      phase.byes.push(...byes);
    }
    phase.games.sort((a, b) => a.round - b.round);
  } else if (format === 'single-elim') {
    phase.games = singleElimination(teamIds, { thirdPlaceGame: !!config.thirdPlaceGame });
  } else if (format === 'double-elim') {
    if (teamIds.length < 3) throw new Error('Double elimination needs at least three teams.');
    phase.games = doubleElimination(teamIds, { grandFinalReset: config.grandFinalReset !== false });
  } else if (format === 'swiss') {
    phase.config.rounds = Number(config.rounds) || Math.ceil(Math.log2(teamIds.length)) + 1;
    // Round 1: top half plays bottom half (1 v n/2+1, 2 v n/2+2, ...).
    const ids = [...teamIds];
    if (ids.length % 2 === 1) phase.byes.push({ round: 1, poolId: null, teamId: ids.pop() });
    const half = ids.length / 2;
    for (let i = 0; i < half; i++) {
      phase.games.push({ id: uid('g'), round: 1, poolId: null, slots: [{ teamId: ids[i] }, { teamId: ids[i + half] }] });
    }
  }

  for (const g of phase.games) g.phaseId = phase.id;
  assignRooms(t, phase);
  t.phases.push(phase);
  touch(t);
  return phase;
}

export function deletePhase(t, phaseId) {
  const idx = t.phases.findIndex((p) => p.id === phaseId);
  if (idx === -1) return;
  if (idx !== t.phases.length - 1) throw new Error('Delete later phases first.');
  t.phases.splice(idx, 1);
  touch(t);
}

export function findGame(t, gameId) {
  for (const phase of t.phases) {
    const game = phase.games.find((g) => g.id === gameId);
    if (game) return { phase, game };
  }
  return null;
}

// result: { scoreA, scoreB, forfeit?, statsA?, statsB?, notes? }
export function recordResult(t, gameId, result) {
  const found = findGame(t, gameId);
  if (!found) throw new Error('Game not found.');
  const { phase, game } = found;
  const resolved = resolvePhase(phase).get(gameId);
  const [teamA, teamB] = resolved.teams;
  if (!teamA || !teamB || teamA === BYE || teamB === BYE) {
    throw new Error('Both teams must be known before a result can be entered.');
  }
  if (resolved.status === 'not-needed') throw new Error('This game is not needed.');
  game.result = {
    scoreA: result.forfeit ? 0 : Number(result.scoreA),
    scoreB: result.forfeit ? 0 : Number(result.scoreB),
    forfeit: result.forfeit || null,
    statsA: result.statsA || null,
    statsB: result.statsB || null,
    notes: result.notes || '',
    teamA,
    teamB,
    enteredAt: new Date().toISOString(),
  };
  touch(t);
  return game.result;
}

export function clearResult(t, gameId) {
  const found = findGame(t, gameId);
  if (!found) throw new Error('Game not found.');
  delete found.game.result;
  found.game.clearedAt = new Date().toISOString();
  touch(t);
}

export function setGameRoom(t, gameId, roomId) {
  const found = findGame(t, gameId);
  if (!found) throw new Error('Game not found.');
  found.game.roomId = roomId || null;
  touch(t);
}

// Generates the next Swiss round from current standings.
export function nextSwissRound(t, phaseId) {
  const phase = t.phases.find((p) => p.id === phaseId);
  if (!phase || phase.format !== 'swiss') throw new Error('Not a Swiss phase.');
  const round = currentRound(phase);
  if (round >= phase.config.rounds) throw new Error('All Swiss rounds have been played.');
  const resolved = resolvePhase(phase);
  const unfinished = phase.games.filter((g) => g.round === round && resolved.get(g.id).status !== 'final');
  if (unfinished.length) throw new Error(`Finish round ${round} before pairing the next one.`);
  const ranked = poolStandings(t, phase, null).map((r) => r.teamId);
  const played = new Set(phase.games.map((g) => pairKey(g.slots[0].teamId, g.slots[1].teamId)));
  const hadBye = new Set(phase.byes.map((b) => b.teamId));
  const { pairs, bye } = swissPairings(ranked, played, hadBye);
  const next = round + 1;
  const games = pairs.map(([a, b]) => ({
    id: uid('g'),
    phaseId,
    round: next,
    poolId: null,
    slots: [{ teamId: a }, { teamId: b }],
  }));
  phase.games.push(...games);
  if (bye) phase.byes.push({ round: next, poolId: null, teamId: bye });
  assignRoomsForRound(t, phase, next);
  touch(t);
  return games;
}

function assignRoomsForRound(t, phase, round) {
  phase.games
    .filter((g) => g.round === round)
    .forEach((g, i) => {
      g.roomId = t.rooms[i]?.id ?? null;
    });
}

// Seeds for a follow-on phase (for example pools into playoffs).
//   perPool: take the top N from each pool (pool phases).
//   count:   take the top N overall.
export function advancingTeams(t, phaseId, { perPool = null, count = null } = {}) {
  const phase = t.phases.find((p) => p.id === phaseId);
  if (!phase) throw new Error('Phase not found.');
  let ranking = phaseRanking(t, phase);
  if (perPool) ranking = ranking.filter((r) => r.place <= perPool);
  if (count) ranking = ranking.slice(0, count);
  return ranking.map((r) => r.teamId);
}

// Combines results from another copy of the same tournament (for example a
// second scorekeeping laptop). For each game the most recent change wins.
export function mergeResults(local, incoming) {
  if (local.id !== incoming.id) throw new Error('These files are from different tournaments.');
  let updated = 0;
  const stamp = (g) => Math.max(Date.parse(g.result?.enteredAt || 0) || 0, Date.parse(g.clearedAt || 0) || 0);
  for (const phase of incoming.phases) {
    const localPhase = local.phases.find((p) => p.id === phase.id);
    if (!localPhase) continue;
    for (const g of phase.games) {
      const mine = localPhase.games.find((x) => x.id === g.id);
      if (!mine) {
        // Swiss rounds paired on the other laptop.
        localPhase.games.push(structuredClone(g));
        updated++;
        continue;
      }
      if (stamp(g) > stamp(mine)) {
        if (g.result) mine.result = structuredClone(g.result);
        else delete mine.result;
        mine.clearedAt = g.clearedAt;
        updated++;
      }
    }
    for (const b of phase.byes || []) {
      if (!localPhase.byes.some((x) => x.round === b.round && x.teamId === b.teamId)) localPhase.byes.push({ ...b });
    }
  }
  if (updated) touch(local);
  return updated;
}

export function validateTournament(data) {
  if (!data || typeof data !== 'object') throw new Error('This file is not a tournament.');
  for (const key of ['id', 'name', 'teams', 'phases', 'settings']) {
    if (!(key in data)) throw new Error(`This file is not a tournament (missing "${key}").`);
  }
  if ((data.schemaVersion || 0) > SCHEMA_VERSION) {
    throw new Error('This file was made by a newer version of the app. Update the app to open it.');
  }
  data.rooms ||= [];
  for (const p of data.phases) {
    p.byes ||= [];
    p.pools ||= [];
  }
  return data;
}
