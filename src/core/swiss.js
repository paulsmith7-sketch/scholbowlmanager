// Swiss pairing: teams with similar records meet, and nobody plays the
// same opponent twice unless there is no other way.
//
// rankedTeamIds: teams ordered best to worst by current standings.
// played: Set of "a|b" keys (both orders) for games already played.
// hadBye: Set of team ids that already received a bye.
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function swissPairings(rankedTeamIds, played = new Set(), hadBye = new Set()) {
  let teams = [...rankedTeamIds];
  let bye = null;
  if (teams.length % 2 === 1) {
    // Lowest-ranked team that has not had a bye yet sits out.
    const idx = [...teams].reverse().findIndex((t) => !hadBye.has(t));
    const pick = idx === -1 ? teams.length - 1 : teams.length - 1 - idx;
    bye = teams[pick];
    teams = teams.filter((_, i) => i !== pick);
  }

  let budget = 0;
  function search(remaining, allowRematch) {
    if (remaining.length === 0) return [];
    if (!allowRematch && ++budget > 50000) return null;
    const [first, ...rest] = remaining;
    for (let i = 0; i < rest.length; i++) {
      const opp = rest[i];
      if (!allowRematch && played.has(pairKey(first, opp))) continue;
      const sub = search(rest.filter((_, j) => j !== i), allowRematch);
      if (sub) return [[first, opp], ...sub];
    }
    return null;
  }

  // Backtracking is exponential in the worst case, so the no-rematch search
  // gives up after a fixed budget and falls back to allowing rematches.
  const pairs = search(teams, false) || search(teams, true);
  return { pairs, bye };
}
