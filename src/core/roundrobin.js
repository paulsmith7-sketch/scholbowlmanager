// Round robin pairings using the circle method.
//
// Returns one entry per round: { pairs: [[teamA, teamB], ...], bye }.
// With an odd number of teams, one team sits out each round (bye).
// With `double: true`, every pairing is played twice with sides swapped.
export function roundRobinRounds(teamIds, { double = false } = {}) {
  const teams = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const rounds = [];
  let ring = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const order = [teams[0], ...ring];
    const pairs = [];
    let bye = null;
    for (let i = 0; i < n / 2; i++) {
      let a = order[i];
      let b = order[n - 1 - i];
      // Alternate the fixed team's side so nobody is always "Team A".
      if (i === 0 && r % 2 === 1) [a, b] = [b, a];
      if (a === null) bye = b;
      else if (b === null) bye = a;
      else pairs.push([a, b]);
    }
    rounds.push({ pairs, bye });
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }
  if (double) {
    const second = rounds.map((r) => ({ pairs: r.pairs.map(([a, b]) => [b, a]), bye: r.bye }));
    return [...rounds, ...second];
  }
  return rounds;
}

// Splits seeded teams into pools.
//   snake:  1 2 3 4 | 8 7 6 5 | 9 10 11 12 ... (balanced pools)
//   tiered: seeds 1..k in pool 1, k+1..2k in pool 2 ... (championship / consolation)
export function distributeToPools(seededTeamIds, poolCount, method = 'snake') {
  const pools = Array.from({ length: poolCount }, () => []);
  if (method === 'tiered') {
    const base = Math.floor(seededTeamIds.length / poolCount);
    const extra = seededTeamIds.length % poolCount;
    let idx = 0;
    for (let p = 0; p < poolCount; p++) {
      const size = base + (p < extra ? 1 : 0);
      pools[p] = seededTeamIds.slice(idx, idx + size);
      idx += size;
    }
    return pools;
  }
  seededTeamIds.forEach((team, i) => {
    const row = Math.floor(i / poolCount);
    const col = i % poolCount;
    const p = row % 2 === 0 ? col : poolCount - 1 - col;
    pools[p].push(team);
  });
  return pools;
}
