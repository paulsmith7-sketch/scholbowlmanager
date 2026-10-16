import { h, field, select, clear, confirmDialog } from '../dom.js';
import { FORMATS, createPhase, deletePhase, advancingTeams, teamName } from '../../core/tournament.js';
import { phaseComplete, resolvePhase } from '../../core/resolve.js';

export function phaseStatus(phase) {
  const resolved = resolvePhase(phase);
  const values = [...resolved.values()];
  const done = values.filter((r) => r.status === 'final').length;
  const playable = values.filter((r) => !['bye', 'not-needed'].includes(r.status)).length;
  if (phaseComplete(phase, resolved)) return { label: 'Complete', done, playable, complete: true };
  return { label: `${done} of ${playable} games played`, done, playable, complete: false };
}

export function phasesView(app) {
  const { t } = app;
  return h('div', { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Phases'),
      h('p', { class: 'muted' }, 'A tournament is one or more phases played in order, for example preliminary pools, then a championship bracket.'),
      t.phases.length
        ? h('ol', { class: 'phase-list' }, t.phases.map((p, i) => {
            const status = phaseStatus(p);
            return h('li', { class: 'phase-item' },
              h('div', {},
                h('strong', {}, p.name),
                h('div', { class: 'muted small' }, `${FORMATS[p.format].label} · ${p.teamIds.length} teams${p.pools.length > 1 ? ` · ${p.pools.length} pools` : ''} · ${status.label}`)),
              h('div', { class: 'row tight' },
                h('a', { class: 'btn small', href: `#/t/${t.id}/games/${p.id}` }, 'Games'),
                i === t.phases.length - 1
                  ? h('button', { class: 'btn small danger-text', onclick: async () => {
                      if (await confirmDialog(`Delete "${p.name}" and all of its results?`, { confirmLabel: 'Delete phase', danger: true })) {
                        app.save((t) => deletePhase(t, p.id), 'Phase deleted.');
                      }
                    } }, 'Delete')
                  : null));
          }))
        : h('p', {}, t.teams.length < 2 ? 'Add at least two teams in Setup first.' : 'No phases yet. Create the first one below.'),
    ),
    t.teams.length >= 2 ? newPhaseCard(app) : null,
  );
}

function defaultsFor(format, teamCount) {
  switch (format) {
    case 'pools': return { poolCount: Math.max(2, Math.round(teamCount / 5)), assignment: 'snake', double: false, carryover: false };
    case 'round-robin': return { double: false };
    case 'single-elim': return { thirdPlaceGame: false };
    case 'double-elim': return { grandFinalReset: true };
    case 'swiss': return { rounds: Math.ceil(Math.log2(Math.max(2, teamCount))) + 1 };
    default: return {};
  }
}

function newPhaseCard(app) {
  const { t } = app;
  const prev = t.phases[t.phases.length - 1];
  const draft = {
    name: '',
    format: prev ? 'single-elim' : 'pools',
    source: prev ? 'perPool' : 'all',
    perPool: 2,
    count: 8,
    seeds: [],
    config: {},
  };
  const container = h('div', {});

  function computeSeeds() {
    if (!prev) return draft.seeds.length ? draft.seeds : t.teams.map((x) => x.id);
    if (draft.source === 'perPool') return advancingTeams(t, prev.id, { perPool: draft.perPool });
    if (draft.source === 'count') return advancingTeams(t, prev.id, { count: draft.count });
    return advancingTeams(t, prev.id);
  }
  draft.seeds = computeSeeds();
  draft.config = defaultsFor(draft.format, draft.seeds.length);

  function setFormat(format) {
    draft.format = format;
    draft.config = defaultsFor(format, draft.seeds.length);
    render();
  }

  function configFields() {
    const c = draft.config;
    const check = (key, label, hint) =>
      field(label, h('input', { type: 'checkbox', checked: c[key], onchange: (e) => (c[key] = e.target.checked) }), hint);
    const number = (key, label, min, hint) =>
      field(label, h('input', { type: 'number', min, value: c[key], onchange: (e) => { c[key] = Number(e.target.value); render(); } }), hint);
    switch (draft.format) {
      case 'round-robin':
        return [check('double', 'Double round robin', 'Every pair of teams plays twice.')];
      case 'pools': {
        const per = (draft.seeds.length / (c.poolCount || 1)).toFixed(1).replace(/\.0$/, '');
        return [
          number('poolCount', 'Number of pools', 1, `About ${per} teams per pool.`),
          field('Fill pools by', select([['snake', 'Snake seeding (balanced pools)'], ['tiered', 'Seed order (top seeds together, for playoff tiers)']], c.assignment, {
            onchange: (e) => { c.assignment = e.target.value; render(); },
          })),
          c.assignment === 'tiered'
            ? field('Pool names', h('input', { placeholder: 'Championship, Consolation', value: (c.poolNames || []).join(', '),
                onchange: (e) => (c.poolNames = e.target.value.split(',').map((x) => x.trim()).filter(Boolean)) }), 'Optional, separated by commas.')
            : null,
          check('double', 'Double round robin in each pool'),
          prev ? check('carryover', 'Carry over games', 'Games teams already played against each other in the previous phase count here.') : null,
        ];
      }
      case 'single-elim':
        return [check('thirdPlaceGame', 'Play a third-place game')];
      case 'double-elim':
        return [check('grandFinalReset', 'Second final if the losers-bracket team wins the first', 'Standard double elimination. Turn off for a single final.')];
      case 'swiss':
        return [number('rounds', 'Rounds', 1, 'Each round is paired after the previous one finishes.')];
      default:
        return [];
    }
  }

  function seedList() {
    const move = (i, d) => {
      [draft.seeds[i], draft.seeds[i + d]] = [draft.seeds[i + d], draft.seeds[i]];
      render();
    };
    const excluded = prev ? [] : t.teams.filter((x) => !draft.seeds.includes(x.id));
    return h('div', { class: 'stack' },
      h('div', { class: 'row wrap' },
        h('strong', {}, `Seeds (${draft.seeds.length} teams)`),
        h('button', { class: 'btn small', type: 'button', onclick: () => { draft.seeds = shuffle(draft.seeds); render(); } }, 'Shuffle'),
        !prev ? h('button', { class: 'btn small', type: 'button', onclick: () => { draft.seeds = t.teams.map((x) => x.id); render(); } }, 'Reset') : null),
      h('ol', { class: 'seed-list' }, draft.seeds.map((id, i) =>
        h('li', {},
          h('span', { class: 'seed-num' }, i + 1),
          h('span', { class: 'grow' }, teamName(t, id)),
          h('button', { class: 'btn small', type: 'button', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'btn small', type: 'button', disabled: i === draft.seeds.length - 1, 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓'),
          h('button', { class: 'btn small danger-text', type: 'button', onclick: () => { draft.seeds.splice(i, 1); render(); } }, 'Leave out')))),
      excluded.length
        ? h('div', { class: 'row wrap' }, h('span', { class: 'muted small' }, 'Left out:'),
            excluded.map((x) => h('button', { class: 'btn small', type: 'button', onclick: () => { draft.seeds.push(x.id); render(); } }, `+ ${x.name}`)))
        : null,
    );
  }

  function sourceFields() {
    if (!prev) return null;
    const multiPool = prev.pools.length > 1;
    const options = [
      ...(multiPool ? [['perPool', 'Top teams from each pool']] : []),
      ['count', 'Top teams overall'],
      ['all', 'All teams'],
    ];
    if (!multiPool && draft.source === 'perPool') draft.source = 'count';
    const reseed = () => { draft.seeds = computeSeeds(); render(); };
    return h('div', { class: 'grid-form' },
      field(`Teams from ${prev.name}`, select(options, draft.source, { onchange: (e) => { draft.source = e.target.value; reseed(); } }),
        phaseComplete(prev) ? null : 'That phase is not finished, so these seeds use the standings so far.'),
      draft.source === 'perPool'
        ? field('Teams per pool', h('input', { type: 'number', min: 1, value: draft.perPool, onchange: (e) => { draft.perPool = Number(e.target.value) || 1; reseed(); } }))
        : null,
      draft.source === 'count'
        ? field('Number of teams', h('input', { type: 'number', min: 2, value: draft.count, onchange: (e) => { draft.count = Number(e.target.value) || 2; reseed(); } }))
        : null,
    );
  }

  function render() {
    const name = h('input', { value: draft.name, placeholder: prev ? 'Playoffs' : 'Preliminary rounds', onchange: (e) => (draft.name = e.target.value) });
    clear(container).append(
      h('section', { class: 'card' },
        h('h2', {}, prev ? 'Add the next phase' : 'Create the first phase'),
        h('div', { class: 'grid-form' },
          field('Name', name),
          field('Format', select(Object.entries(FORMATS).map(([k, v]) => [k, v.label]), draft.format, { onchange: (e) => setFormat(e.target.value) }),
            FORMATS[draft.format].description)),
        sourceFields(),
        h('div', { class: 'grid-form' }, configFields()),
        seedList(),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: () => {
            app.save((t) => {
              const phase = createPhase(t, { name: draft.name.trim(), format: draft.format, seededTeamIds: draft.seeds, config: draft.config });
              app.navigate(`#/t/${t.id}/games/${phase.id}`, { replace: true });
            }, 'Phase created.');
          } }, 'Create phase')),
      ),
    );
  }
  render();
  return container;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
