import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRobinRounds, distributeToPools } from '../src/core/roundrobin.js';

for (const n of [2, 3, 4, 5, 6, 7, 8, 11, 12]) {
  test(`round robin with ${n} teams: everyone meets once, nobody twice in a round`, () => {
    const teams = Array.from({ length: n }, (_, i) => `t${i}`);
    const rounds = roundRobinRounds(teams);
    assert.equal(rounds.length, n % 2 ? n : n - 1);
    const seen = new Set();
    for (const r of rounds) {
      const inRound = new Set();
      for (const [a, b] of r.pairs) {
        for (const x of [a, b]) {
          assert.ok(!inRound.has(x));
          inRound.add(x);
        }
        const key = [a, b].sort().join('|');
        assert.ok(!seen.has(key), `rematch ${key}`);
        seen.add(key);
      }
      if (r.bye) inRound.add(r.bye);
      assert.equal(inRound.size, n);
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
  });
}

test('double round robin plays each pairing twice', () => {
  const rounds = roundRobinRounds(['a', 'b', 'c', 'd'], { double: true });
  assert.equal(rounds.length, 6);
  assert.equal(rounds.flatMap((r) => r.pairs).length, 12);
});

test('snake pools are balanced', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.deepEqual(distributeToPools(seeds, 3), [
    [1, 6, 7, 12],
    [2, 5, 8, 11],
    [3, 4, 9, 10],
  ]);
});

test('tiered pools keep seeds together', () => {
  assert.deepEqual(distributeToPools([1, 2, 3, 4, 5, 6, 7], 2, 'tiered'), [
    [1, 2, 3, 4],
    [5, 6, 7],
  ]);
});
