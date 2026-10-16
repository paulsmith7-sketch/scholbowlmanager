import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketSeedOrder } from '../src/core/brackets.js';
import { createPhase } from '../src/core/tournament.js';
import { resolvePhase, phaseComplete } from '../src/core/resolve.js';
import { bracketPlacements } from '../src/core/standings.js';
import { tournamentWithTeams, ids, nameOf, playAll } from './helpers.js';

test('seed order puts top seeds on opposite sides', () => {
  assert.deepEqual(bracketSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

for (const n of [2, 3, 5, 6, 8, 13, 16]) {
  test(`single elimination with ${n} teams crowns the top seed`, () => {
    const t = tournamentWithTeams(n);
    const phase = createPhase(t, { format: 'single-elim', seededTeamIds: ids(t), config: { thirdPlaceGame: n >= 4 } });
    playAll(t, phase);
    assert.ok(phaseComplete(phase));
    const places = bracketPlacements(phase);
    assert.equal(nameOf(t, places[0].teamId), 'Team 1');
    assert.equal(places[0].rank, 1);
    if (n >= 2) assert.equal(nameOf(t, places[1].teamId), 'Team 2');
    if (n >= 4) {
      assert.equal(nameOf(t, places[2].teamId), 'Team 3');
      assert.equal(places[3].rank, 4);
    }
  });
}

for (const n of [3, 4, 5, 6, 7, 8, 12, 16]) {
  test(`double elimination with ${n} teams: every team loses at most twice`, () => {
    const t = tournamentWithTeams(n);
    const phase = createPhase(t, { format: 'double-elim', seededTeamIds: ids(t) });
    playAll(t, phase);
    assert.ok(phaseComplete(phase), 'phase complete');
    const losses = new Map();
    for (const r of resolvePhase(phase).values()) {
      if (r.status === 'final') losses.set(r.loser, (losses.get(r.loser) || 0) + 1);
    }
    for (const [team, count] of losses) assert.ok(count <= 2, `${nameOf(t, team)} lost ${count} times`);
    const places = bracketPlacements(phase);
    assert.equal(nameOf(t, places[0].teamId), 'Team 1');
    assert.equal(nameOf(t, places[1].teamId), 'Team 2');
    // Champion was never beaten, so the reset final is not needed.
    const reset = phase.games.find((g) => g.ifNecessary);
    assert.equal(resolvePhase(phase).get(reset.id).status, 'not-needed');
  });
}

test('double elimination plays the reset final when the losers champion wins', () => {
  const t = tournamentWithTeams(4);
  const phase = createPhase(t, { format: 'double-elim', seededTeamIds: ids(t) });
  const [t1, t2] = ids(t);
  // Team 2 wins every game except the winners final, so it comes up through the losers bracket.
  playAll(t, phase, (a, b, g) => {
    if (g.label === 'Winners final') return a === t1 || b === t1 ? t1 : a;
    if ([a, b].includes(t2)) return t2;
    if ([a, b].includes(t1)) return t1;
    return a;
  });
  const resolved = resolvePhase(phase);
  const gf2 = phase.games.find((g) => g.ifNecessary);
  assert.equal(resolved.get(gf2.id).status, 'final');
  assert.ok(phaseComplete(phase));
  assert.equal(bracketPlacements(phase)[0].teamId, t2);
});

test('changing an earlier bracket result flags later games that no longer match', async () => {
  const { recordResult } = await import('../src/core/tournament.js');
  const t = tournamentWithTeams(4);
  const phase = createPhase(t, { format: 'single-elim', seededTeamIds: ids(t) });
  playAll(t, phase);
  const semi = phase.games.find((g) => g.label === 'Semifinal 1');
  recordResult(t, semi.id, { scoreA: 10, scoreB: 200 });
  const final = phase.games.find((g) => g.label === 'Final');
  assert.equal(resolvePhase(phase).get(final.id).status, 'conflict');
});
