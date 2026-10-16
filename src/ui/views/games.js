import { h, field, select, openDialog, toast, confirmDialog } from '../dom.js';
import { teamName, recordResult, clearResult, setGameRoom, nextSwissRound, FORMATS } from '../../core/tournament.js';
import { resolvePhase, BYE, currentRound } from '../../core/resolve.js';
import { validateResult, totalFromStats } from '../../core/scoring.js';
import { ELIMINATION_FORMATS } from '../../core/standings.js';
import { phaseStatus } from './phases.js';

const BRACKET_NAMES = { W: 'Winners bracket', L: 'Losers bracket', GF: 'Grand final', '3P': 'Third place' };

export function phasePicker(app, phase, tab) {
  const { t } = app;
  if (t.phases.length < 2) return null;
  return h('nav', { class: 'subtabs', 'aria-label': 'Phases' }, t.phases.map((p) =>
    h('a', { href: `#/t/${t.id}/${tab}/${p.id}`, class: p.id === phase.id ? 'active' : '', 'aria-current': p.id === phase.id ? 'page' : null }, p.name)));
}

export function gamesView(app, phaseId) {
  const { t } = app;
  if (!t.phases.length) {
    return h('div', { class: 'page' }, h('section', { class: 'card' },
      h('p', {}, 'No games yet.'), h('a', { class: 'btn primary', href: `#/t/${t.id}/phases` }, 'Create a phase')));
  }
  const phase = t.phases.find((p) => p.id === phaseId) || t.phases[t.phases.length - 1];
  const resolved = resolvePhase(phase);
  const status = phaseStatus(phase);
  const groups = groupGames(phase);
  const filter = app.ui.gameFilter || 'all';

  return h('div', { class: 'page' },
    phasePicker(app, phase, 'games'),
    h('section', { class: 'card' },
      h('div', { class: 'row space wrap' },
        h('div', {}, h('h2', {}, phase.name), h('div', { class: 'muted small' }, `${FORMATS[phase.format].label} · ${status.label}`)),
        h('div', { class: 'row tight no-print' },
          select([['all', 'All games'], ['open', 'Needs a score'], ['done', 'Scored']], filter, {
            'aria-label': 'Show',
            onchange: (e) => { app.ui.gameFilter = e.target.value; app.render(); },
          }),
          h('button', { class: 'btn', onclick: () => window.print() }, 'Print'))),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': status.playable, 'aria-valuenow': status.done },
        h('div', { class: 'progress-bar', style: { width: `${status.playable ? (100 * status.done) / status.playable : 0}%` } })),
    ),
    phase.format === 'swiss' ? swissControls(app, phase) : null,
    groups.map((group) => {
      const games = group.games.filter((g) => {
        const s = resolved.get(g.id).status;
        if (s === 'not-needed' || (s === 'bye' && ELIMINATION_FORMATS.has(phase.format))) return false;
        if (filter === 'open') return s === 'ready' || s === 'conflict';
        if (filter === 'done') return s === 'final';
        return true;
      });
      const byes = (phase.byes || []).filter((b) => b.round === group.round && !ELIMINATION_FORMATS.has(phase.format));
      if (!games.length && !(filter === 'all' && byes.length)) return null;
      return h('section', { class: 'card round' },
        h('h3', {}, group.title),
        h('div', { class: 'game-list' }, games.map((g) => gameRow(app, phase, g, resolved.get(g.id)))),
        filter === 'all' && byes.length
          ? h('p', { class: 'muted small' }, 'Bye: ', byes.map((b) => `${teamName(t, b.teamId)}${b.poolId && phase.pools.length > 1 ? ` (${poolName(phase, b.poolId)})` : ''}`).join(', '))
          : null);
    }),
  );
}

function poolName(phase, poolId) {
  return phase.pools.find((p) => p.id === poolId)?.name ?? '';
}

function groupGames(phase) {
  const map = new Map();
  for (const g of phase.games) {
    const key = ELIMINATION_FORMATS.has(phase.format) ? `${g.bracket}-${g.round}` : `${g.round}`;
    if (!map.has(key)) {
      const title = ELIMINATION_FORMATS.has(phase.format)
        ? g.bracket === 'W' && phase.format === 'single-elim'
          ? `Round ${g.round}`
          : g.bracket === 'GF' || g.bracket === '3P'
            ? BRACKET_NAMES[g.bracket]
            : `${BRACKET_NAMES[g.bracket]} round ${g.round}`
        : `Round ${g.round}`;
      map.set(key, { key, round: g.round, title, games: [], sort: ELIMINATION_FORMATS.has(phase.format) ? g.order : g.round });
    }
    map.get(key).games.push(g);
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort);
}

function gameRow(app, phase, g, r) {
  const { t } = app;
  const [a, b] = r.teams;
  const res = g.result;
  const winner = r.status === 'final' ? r.winner : null;
  const teamCell = (team, score, side) =>
    h('div', { class: `team ${winner && winner === team ? 'winner' : ''}` },
      h('span', { class: 'team-name' }, teamName(t, team)),
      res && r.status !== 'conflict'
        ? h('span', { class: 'score' }, res.forfeit ? (res.forfeit === side || res.forfeit === 'both' ? 'Forfeit' : 'W') : score)
        : null);
  const roomSelect = t.rooms.length
    ? select([['', 'No room'], ...t.rooms.map((x) => [x.id, x.name])], g.roomId || '', {
        class: 'room-select', 'aria-label': 'Room',
        onchange: (e) => app.save((t) => setGameRoom(t, g.id, e.target.value)),
      })
    : null;
  const label = g.label || (phase.pools.length > 1 ? poolName(phase, g.poolId) : null);
  let action = null;
  if (r.status === 'ready') action = h('button', { class: 'btn primary small', onclick: () => scoreDialog(app, phase, g, r) }, 'Enter score');
  else if (r.status === 'final' || r.status === 'conflict') action = h('button', { class: 'btn small', onclick: () => scoreDialog(app, phase, g, r) }, 'Edit');
  else if (r.status === 'pending') action = h('span', { class: 'muted small' }, 'Waiting on earlier games');
  else if (r.status === 'bye') action = h('span', { class: 'muted small' }, 'Bye');

  return h('div', { class: `game ${r.status}` },
    h('div', { class: 'game-meta' },
      label ? h('span', { class: 'tag' }, label) : h('span'),
      roomSelect,
      g.roomId ? h('span', { class: 'print-only' }, t.rooms.find((x) => x.id === g.roomId)?.name ?? '') : null),
    h('div', { class: 'teams' }, teamCell(a, res?.scoreA, 'A'), teamCell(b, res?.scoreB, 'B')),
    r.status === 'conflict'
      ? h('p', { class: 'warning small' }, 'An earlier result changed, so the teams in this game are different now. Re-enter or clear this score.')
      : null,
    h('div', { class: 'game-action no-print' }, action),
  );
}

function swissControls(app, phase) {
  const round = currentRound(phase);
  const done = round >= phase.config.rounds;
  return h('section', { class: 'card row space wrap no-print' },
    h('span', {}, `Round ${round} of ${phase.config.rounds}`),
    done
      ? h('span', { class: 'muted' }, 'All rounds paired.')
      : h('button', { class: 'btn primary', onclick: () => app.save((t) => nextSwissRound(t, phase.id), `Round ${round + 1} paired.`) }, `Pair round ${round + 1}`));
}

function scoreDialog(app, phase, g, r) {
  const { t } = app;
  const scoring = t.settings.scoring;
  const allowTies = ELIMINATION_FORMATS.has(phase.format) ? false : scoring.allowTies;
  const [a, b] = r.teams;
  const existing = r.status === 'final' ? g.result : null;
  const hasStats = !!(existing?.statsA || existing?.statsB);
  const statKeys = [
    scoring.powerValue ? ['powers', `Powers (${scoring.powerValue})`] : null,
    ['tens', `Tossups (${scoring.tossupValue})`],
    scoring.negValue ? ['negs', `Negs (${scoring.negValue})`] : null,
    ['bonusPoints', 'Bonus points'],
  ].filter(Boolean);

  return openDialog((close) => {
    const score = {
      A: h('input', { type: 'number', inputmode: 'numeric', step: 5, value: existing?.scoreA ?? '', 'aria-label': `${teamName(t, a)} score` }),
      B: h('input', { type: 'number', inputmode: 'numeric', step: 5, value: existing?.scoreB ?? '', 'aria-label': `${teamName(t, b)} score` }),
    };
    const forfeit = select([['', 'Played'], ['A', `${teamName(t, a)} forfeited`], ['B', `${teamName(t, b)} forfeited`], ['both', 'Both forfeited']], existing?.forfeit || '');
    const useStats = h('input', { type: 'checkbox', checked: hasStats });
    const stats = { A: {}, B: {} };
    const statsTable = h('table', { class: 'table stats-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), statKeys.map(([, label]) => h('th', {}, label)))),
      h('tbody', {}, ['A', 'B'].map((side) =>
        h('tr', {}, h('th', {}, teamName(t, side === 'A' ? a : b)), statKeys.map(([key]) => {
          const input = h('input', { type: 'number', min: 0, step: key === 'bonusPoints' ? 10 : 1, inputmode: 'numeric',
            value: existing?.[`stats${side}`]?.[key] ?? '', 'aria-label': key, oninput: syncScores });
          stats[side][key] = input;
          return h('td', {}, input);
        })))));
    const statsBox = h('div', { class: 'stack', hidden: !hasStats }, statsTable,
      h('p', { class: 'muted small' }, 'Scores fill in from these numbers. Bonus points are the total earned on bonuses.'));
    const notes = h('input', { value: existing?.notes || '', placeholder: 'Optional, for example "won on tiebreaker question"' });
    const messages = h('div', { class: 'messages', 'aria-live': 'polite' });
    let warnedOnce = false;

    function readStats(side) {
      const out = {};
      for (const [key] of statKeys) out[key] = Number(stats[side][key].value) || 0;
      return out;
    }
    function syncScores() {
      if (!useStats.checked) return;
      score.A.value = totalFromStats(readStats('A'), scoring);
      score.B.value = totalFromStats(readStats('B'), scoring);
      warnedOnce = false;
    }
    useStats.addEventListener('change', () => {
      statsBox.hidden = !useStats.checked;
      syncScores();
    });
    forfeit.addEventListener('change', () => {
      for (const s of Object.values(score)) s.disabled = !!forfeit.value;
    });
    for (const s of Object.values(score)) {
      s.disabled = !!forfeit.value;
      s.addEventListener('input', () => (warnedOnce = false));
    }

    const submit = (e) => {
      e.preventDefault();
      const result = {
        scoreA: score.A.value === '' ? NaN : Number(score.A.value),
        scoreB: score.B.value === '' ? NaN : Number(score.B.value),
        forfeit: forfeit.value || null,
        statsA: useStats.checked && !forfeit.value ? readStats('A') : null,
        statsB: useStats.checked && !forfeit.value ? readStats('B') : null,
        notes: notes.value.trim(),
      };
      if (ELIMINATION_FORMATS.has(phase.format) && result.forfeit === 'both') {
        messages.replaceChildren(h('p', { class: 'error' }, 'In a bracket one team has to advance. Pick the team that forfeited.'));
        return;
      }
      const { errors, warnings } = validateResult(result, scoring, { allowTies });
      if (errors.length) {
        messages.replaceChildren(...errors.map((m) => h('p', { class: 'error' }, m)));
        return;
      }
      if (warnings.length && !warnedOnce) {
        warnedOnce = true;
        messages.replaceChildren(...warnings.map((m) => h('p', { class: 'warning' }, m)), h('p', { class: 'small' }, 'Check the numbers, or press Save again to keep them.'));
        return;
      }
      close(true);
      app.save((t) => recordResult(t, g.id, result), 'Score saved.');
    };

    return h('form', { class: 'stack score-form', onsubmit: submit },
      h('h2', {}, g.label || `Round ${g.round}`),
      h('div', { class: 'score-grid' },
        h('label', {}, h('span', { class: 'team-name' }, teamName(t, a)), score.A),
        h('span', { class: 'vs' }, 'vs'),
        h('label', {}, h('span', { class: 'team-name' }, teamName(t, b)), score.B)),
      field('Result', forfeit),
      h('label', { class: 'row tight' }, useStats, 'Enter tossup and bonus stats'),
      statsBox,
      field('Notes', notes),
      messages,
      h('div', { class: 'row space' },
        existing
          ? h('button', { type: 'button', class: 'btn danger-text', onclick: async () => {
              close(false);
              if (await confirmDialog('Clear this score? Later bracket games that depend on it will need new scores.', { confirmLabel: 'Clear score', danger: true })) {
                app.save((t) => clearResult(t, g.id), 'Score cleared.');
              }
            } }, 'Clear score')
          : h('span'),
        h('div', { class: 'row tight' },
          h('button', { type: 'button', class: 'btn', onclick: () => close(false) }, 'Cancel'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Save'))),
    );
  });
}
