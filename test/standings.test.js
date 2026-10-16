import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhase, recordResult, advancingTeams, nextSwissRound, mergeResults, clearResult } from '../src/core/tournament.js';
import { poolStandings, finalStandings, rankRows, tallyGames } from '../src/core/standings.js';
import { resolvePhase, phaseComplete } from '../src/core/resolve.js';
import { validateResult, totalFromStats, defaultScoring } from '../src/core/scoring.js';
import { tournamentWithTeams, ids, nameOf, playAll } from './helpers.js';

test('round robin standings count wins, losses and points', () => {
  const t = tournamentWithTeams(4);
  const phase = createPhase(t, { format: 'round-robin', seededTeamIds: ids(t) });
  playAll(t, phase);
  const rows = poolStandings(t, phase, phase.pools[0].id);
  assert.deepEqual(rows.map((r) => nameOf(t, r.teamId)), ['Team 1', 'Team 2', 'Team 3', 'Team 4']);
  assert.equal(rows[0].w, 3);
  assert.equal(rows[0].ppg, 300);
  assert.equal(rows[3].l, 3);
});

test('head-to-head breaks a two-way tie', () => {
  const games = [
    { teamA: 'a', teamB: 'b', result: { scoreA: 200, scoreB: 190 } },
    { teamA: 'a', teamB: 'c', result: { scoreA: 100, scoreB: 300 } },
    { teamA: 'b', teamB: 'c', result: { scoreA: 400, scoreB: 100 } },
  ];
  // All 1-1. Head-to-head is circular, so point differential decides: b +300, c -100... recompute below.
  const rows = [...tallyGames(['a', 'b', 'c'], games).values()];
  const ranked = rankRows(rows, games, ['winPct', 'headToHead', 'pointDiff']);
  assert.deepEqual(ranked.map((r) => r.teamId), ['b', 'c', 'a']);

  const two = games.slice(0, 1);
  const rows2 = [...tallyGames(['a', 'b'], two).values()];
  assert.deepEqual(rankRows(rows2, two, ['headToHead']).map((r) => r.teamId), ['a', 'b']);
});

test('teams tied on every tiebreaker share a rank', () => {
  const games = [{ teamA: 'a', teamB: 'b', result: { scoreA: 100, scoreB: 100 } }];
  const ranked = rankRows([...tallyGames(['a', 'b'], games).values()], games, ['winPct', 'pointDiff']);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 1);
  assert.ok(ranked[0].tied);
});

test('forfeits count in the record but not in points per game', () => {
  const t = tournamentWithTeams(2);
  const phase = createPhase(t, { format: 'round-robin', seededTeamIds: ids(t), config: { double: true } });
  recordResult(t, phase.games[0].id, { forfeit: 'B' });
  recordResult(t, phase.games[1].id, { scoreA: 250, scoreB: 150 });
  const rows = poolStandings(t, phase, phase.pools[0].id);
  const byName = Object.fromEntries(rows.map((r) => [nameOf(t, r.teamId), r]));
  assert.equal(byName['Team 1'].w + byName['Team 1'].l, 2);
  assert.equal(byName['Team 1'].scoredGames, 1);
});

test('pools into a championship bracket', () => {
  const t = tournamentWithTeams(12);
  const pools = createPhase(t, { format: 'pools', seededTeamIds: ids(t), config: { poolCount: 3 } });
  assert.equal(pools.pools.length, 3);
  assert.ok(pools.pools.every((p) => p.teamIds.length === 4));
  playAll(t, pools);
  assert.ok(phaseComplete(pools));
  const seeds = advancingTeams(t, pools.id, { perPool: 2 });
  assert.equal(seeds.length, 6);
  // Pool winners are seeded first.
  assert.deepEqual(seeds.slice(0, 3).map((id) => nameOf(t, id)).sort(), ['Team 1', 'Team 2', 'Team 3']);
  const playoffs = createPhase(t, { format: 'single-elim', seededTeamIds: seeds });
  playAll(t, playoffs);
  const final = finalStandings(t);
  assert.equal(final.length, 12);
  assert.equal(nameOf(t, final[0].teamId), 'Team 1');
  // Teams that did not make the playoffs follow the playoff teams.
  assert.ok(final.slice(6).every((r) => r.phaseId === pools.id));
});

test('tiered playoff pools with carryover games', () => {
  const t = tournamentWithTeams(8);
  const prelim = createPhase(t, { format: 'pools', seededTeamIds: ids(t), config: { poolCount: 2 } });
  playAll(t, prelim);
  const seeds = advancingTeams(t, prelim.id);
  const playoff = createPhase(t, {
    format: 'pools',
    seededTeamIds: seeds,
    config: { poolCount: 2, assignment: 'tiered', carryover: true, poolNames: ['Championship', 'Consolation'] },
  });
  assert.equal(playoff.pools[0].name, 'Championship');
  const champ = playoff.pools[0];
  // Before any playoff game, carried-over games already count.
  const rows = poolStandings(t, playoff, champ.id);
  assert.ok(rows.some((r) => r.gp > 0));
  playAll(t, playoff);
  const final = finalStandings(t);
  assert.deepEqual(final.slice(0, 4).map((r) => nameOf(t, r.teamId)), ['Team 1', 'Team 2', 'Team 3', 'Team 4']);
});

test('swiss rounds avoid rematches and finish after the set number of rounds', () => {
  const t = tournamentWithTeams(9);
  const phase = createPhase(t, { format: 'swiss', seededTeamIds: ids(t), config: { rounds: 4 } });
  for (let r = 1; r <= 4; r++) {
    if (r > 1) nextSwissRound(t, phase.id);
    playAll(t, phase);
  }
  assert.ok(phaseComplete(phase));
  assert.throws(() => nextSwissRound(t, phase.id));
  const keys = phase.games.map((g) => [g.slots[0].teamId, g.slots[1].teamId].sort().join('|'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(phase.byes.map((b) => b.teamId)).size, 4);
  assert.equal(nameOf(t, poolStandings(t, phase, null)[0].teamId), 'Team 1');
});

test('swiss will not pair a round before the previous one is finished', () => {
  const t = tournamentWithTeams(6);
  const phase = createPhase(t, { format: 'swiss', seededTeamIds: ids(t), config: { rounds: 3 } });
  assert.throws(() => nextSwissRound(t, phase.id), /Finish round 1/);
});

test('merging results from a second laptop keeps the newest result per game', async () => {
  const t = tournamentWithTeams(4);
  const phase = createPhase(t, { format: 'round-robin', seededTeamIds: ids(t) });
  const copy = structuredClone(t);
  recordResult(copy, phase.games[0].id, { scoreA: 200, scoreB: 100 });
  await new Promise((r) => setTimeout(r, 5));
  recordResult(t, phase.games[1].id, { scoreA: 150, scoreB: 160 });
  assert.equal(mergeResults(t, copy), 1);
  assert.equal(t.phases[0].games[0].result.scoreA, 200);
  assert.equal(t.phases[0].games[1].result.scoreB, 160);
  // A later clear on the other copy wins too.
  await new Promise((r) => setTimeout(r, 5));
  clearResult(copy, phase.games[0].id);
  mergeResults(t, copy);
  assert.equal(t.phases[0].games[0].result, undefined);
});

test('scoring: totals from stats and validation', () => {
  const naqt = defaultScoring('naqt');
  const stats = { powers: 2, tens: 5, negs: 1, bonusPoints: 120 };
  assert.equal(totalFromStats(stats, naqt), 2 * 15 + 50 - 5 + 120);
  const ok = validateResult({ scoreA: 195, scoreB: 100, statsA: stats }, naqt);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  const tie = validateResult({ scoreA: 100, scoreB: 100 }, naqt);
  assert.equal(tie.errors.length, 1);
  const tooMuchBonus = validateResult({ scoreA: 300, scoreB: 0, statsA: { tens: 1, bonusPoints: 290 } }, naqt);
  assert.ok(tooMuchBonus.warnings.length >= 1);
});

test('bracket games cannot be scored before both teams are known', () => {
  const t = tournamentWithTeams(4);
  const phase = createPhase(t, { format: 'single-elim', seededTeamIds: ids(t) });
  const final = phase.games.find((g) => g.label === 'Final');
  assert.throws(() => recordResult(t, final.id, { scoreA: 1, scoreB: 0 }));
  assert.equal(resolvePhase(phase).get(final.id).status, 'pending');
});
