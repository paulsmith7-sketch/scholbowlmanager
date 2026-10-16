// Scoring rules and per-game totals.
//
// A game result always stores final scores. Detailed stats (tossups and bonus
// points per team) are optional; when present they drive the PPB columns in
// standings and can be used to compute the final score.

export const SCORING_PRESETS = {
  ihsa: {
    label: 'IHSA (10-point tossups, no negs)',
    powerValue: 0,
    tossupValue: 10,
    negValue: 0,
    bonusMax: 20,
    tossupsPerGame: 24,
    allowTies: false,
  },
  naqt: {
    label: 'NAQT (15 power / 10 / -5 neg, 30-point bonuses)',
    powerValue: 15,
    tossupValue: 10,
    negValue: -5,
    bonusMax: 30,
    tossupsPerGame: 20,
    allowTies: false,
  },
  acf: {
    label: 'ACF (10 / -5 neg, 30-point bonuses)',
    powerValue: 0,
    tossupValue: 10,
    negValue: -5,
    bonusMax: 30,
    tossupsPerGame: 20,
    allowTies: false,
  },
  custom: {
    label: 'Custom',
    powerValue: 15,
    tossupValue: 10,
    negValue: -5,
    bonusMax: 30,
    tossupsPerGame: 20,
    allowTies: true,
  },
};

export function defaultScoring(preset = 'ihsa') {
  return { preset, ...SCORING_PRESETS[preset] };
}

// stats: { powers, tens, negs, bonusPoints }
export function totalFromStats(stats, scoring) {
  if (!stats) return null;
  const n = (v) => Number(v) || 0;
  return (
    n(stats.powers) * scoring.powerValue +
    n(stats.tens) * scoring.tossupValue +
    n(stats.negs) * scoring.negValue +
    n(stats.bonusPoints)
  );
}

// Bonuses heard = tossups answered correctly (powers + tens).
export function bonusesHeard(stats) {
  if (!stats) return 0;
  return (Number(stats.powers) || 0) + (Number(stats.tens) || 0);
}

// Errors block saving; warnings are shown but the director can save anyway.
export function validateResult(result, scoring, { allowTies } = {}) {
  const errors = [];
  const warnings = [];
  if (result.forfeit) return { errors, warnings };
  const { scoreA, scoreB } = result;
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
    errors.push('Both scores are required.');
    return { errors, warnings };
  }
  const tiesOk = allowTies ?? scoring.allowTies;
  if (!tiesOk && scoreA === scoreB) {
    errors.push('Ties are not allowed here. Enter the score after the tiebreaker question.');
  }
  for (const side of ['A', 'B']) {
    const stats = result[`stats${side}`];
    if (!stats) continue;
    const heard = bonusesHeard(stats);
    if ((Number(stats.bonusPoints) || 0) > heard * scoring.bonusMax) {
      warnings.push(`Team ${side} has more bonus points than ${heard} bonus(es) allow.`);
    }
    const computed = totalFromStats(stats, scoring);
    const entered = side === 'A' ? scoreA : scoreB;
    if (computed !== entered) {
      warnings.push(`Team ${side} score (${entered}) does not match its stats (${computed}).`);
    }
  }
  if (result.statsA && result.statsB && scoring.tossupsPerGame) {
    const answered = bonusesHeard(result.statsA) + bonusesHeard(result.statsB);
    if (answered > scoring.tossupsPerGame + 3) {
      warnings.push(`${answered} tossups answered is more than a ${scoring.tossupsPerGame}-tossup game allows.`);
    }
  }
  return { errors, warnings };
}
