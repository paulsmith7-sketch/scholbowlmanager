// Single and double elimination bracket generation.
//
// Games reference earlier games through slots, so a bracket is generated
// once and filled in as results arrive:
//   { teamId }                      a known team
//   { bye: true }                   an empty position (seed beyond team count)
//   { from: gameId, take: 'winner' | 'loser' }
//
// `order` on each game ranks how deep into the bracket it is; final
// placements are derived from the deepest game each team played.
import { uid } from './ids.js';

export function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standard bracket order: for 8 seeds -> 1 8 4 5 2 7 3 6, so the top seeds
// meet as late as possible.
export function bracketSeedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

function seedSlot(seededTeamIds, seed) {
  const teamId = seededTeamIds[seed - 1];
  return teamId ? { teamId } : { bye: true };
}

function game(fields) {
  return { id: uid('g'), ...fields };
}

const from = (g, take) => ({ from: g.id, take });

function winnersBracket(seededTeamIds, { bracket, orderOf, labelPrefix }) {
  const size = nextPowerOfTwo(Math.max(2, seededTeamIds.length));
  const k = Math.log2(size);
  const order = bracketSeedOrder(size);
  const rounds = [];
  const first = [];
  for (let i = 0; i < size / 2; i++) {
    first.push(
      game({
        round: 1,
        bracket,
        order: orderOf(1),
        label: `${labelPrefix}1-${i + 1}`,
        slots: [seedSlot(seededTeamIds, order[2 * i]), seedSlot(seededTeamIds, order[2 * i + 1])],
      }),
    );
  }
  rounds.push(first);
  for (let r = 2; r <= k; r++) {
    const prev = rounds[r - 2];
    const games = [];
    for (let i = 0; i < prev.length / 2; i++) {
      games.push(
        game({
          round: r,
          bracket,
          order: orderOf(r),
          label: `${labelPrefix}${r}-${i + 1}`,
          slots: [from(prev[2 * i], 'winner'), from(prev[2 * i + 1], 'winner')],
        }),
      );
    }
    rounds.push(games);
  }
  return { rounds, k };
}

export function singleElimination(seededTeamIds, { thirdPlaceGame = false } = {}) {
  const { rounds, k } = winnersBracket(seededTeamIds, {
    bracket: 'W',
    orderOf: (r) => r,
    labelPrefix: 'R',
  });
  const games = rounds.flat();
  const final = rounds[k - 1][0];
  final.label = 'Final';
  if (k >= 2) {
    const semis = rounds[k - 2];
    semis.forEach((g, i) => (g.label = `Semifinal ${i + 1}`));
    if (thirdPlaceGame) {
      games.push(
        game({
          round: k,
          bracket: '3P',
          order: k - 0.5,
          label: 'Third place',
          slots: [from(semis[0], 'loser'), from(semis[1], 'loser')],
        }),
      );
    }
  }
  return games;
}

export function doubleElimination(seededTeamIds, { grandFinalReset = true } = {}) {
  const { rounds: wRounds, k } = winnersBracket(seededTeamIds, {
    bracket: 'W',
    orderOf: (r) => r / 100,
    labelPrefix: 'W',
  });
  const lRounds = [];
  for (let j = 1; j <= k - 1; j++) {
    // Odd losers round: survivors (or W1 losers) play each other.
    const odd = [];
    const oddCount = 2 ** (k - j - 1);
    for (let i = 0; i < oddCount; i++) {
      const slots =
        j === 1
          ? [from(wRounds[0][2 * i], 'loser'), from(wRounds[0][2 * i + 1], 'loser')]
          : [from(lRounds[lRounds.length - 1][2 * i], 'winner'), from(lRounds[lRounds.length - 1][2 * i + 1], 'winner')];
      odd.push(game({ round: 2 * j - 1, bracket: 'L', order: 2 * j - 1, label: `L${2 * j - 1}-${i + 1}`, slots }));
    }
    lRounds.push(odd);
    // Even losers round: survivors meet the teams dropping from winners round j+1.
    // Alternating the drop order keeps early rematches rare.
    const drops = wRounds[j];
    const even = odd.map((g, i) => {
      const dropIndex = j % 2 === 1 ? drops.length - 1 - i : i;
      return game({
        round: 2 * j,
        bracket: 'L',
        order: 2 * j,
        label: `L${2 * j}-${i + 1}`,
        slots: [from(g, 'winner'), from(drops[dropIndex], 'loser')],
      });
    });
    lRounds.push(even);
  }
  const wFinal = wRounds[k - 1][0];
  wFinal.label = 'Winners final';
  const lChampionSlot = k > 1 ? from(lRounds[lRounds.length - 1][0], 'winner') : from(wFinal, 'loser');
  if (k > 1) lRounds[lRounds.length - 1][0].label = 'Losers final';
  const gf1 = game({
    round: 1,
    bracket: 'GF',
    order: 2 * k - 1,
    label: 'Grand final',
    slots: [from(wFinal, 'winner'), lChampionSlot],
  });
  const games = [...wRounds.flat(), ...lRounds.flat(), gf1];
  if (grandFinalReset) {
    games.push(
      game({
        round: 2,
        bracket: 'GF',
        order: 2 * k,
        label: 'Grand final (if necessary)',
        slots: [from(gf1, 'winner'), from(gf1, 'loser')],
        // Only played when the losers-bracket champion wins the first final.
        ifNecessary: { gameId: gf1.id, unlessWinnerSlot: 0 },
      }),
    );
  }
  return games;
}
