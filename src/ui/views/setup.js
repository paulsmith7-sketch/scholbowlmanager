import { h, field, select } from '../dom.js';
import { addTeam, removeTeam, updateTeam, addRoom, removeRoom, teamInUse } from '../../core/tournament.js';
import { SCORING_PRESETS } from '../../core/scoring.js';
import { TIEBREAKERS } from '../../core/standings.js';

export function setupView(app) {
  return h('div', { class: 'page' }, infoCard(app), teamsCard(app), roomsCard(app), scoringCard(app), tiebreakCard(app));
}

function infoCard(app) {
  const { t } = app;
  const name = h('input', { value: t.name, required: true });
  const date = h('input', { type: 'date', value: t.date });
  const location = h('input', { value: t.location });
  return h('section', { class: 'card' },
    h('h2', {}, 'Tournament'),
    h('form', {
      class: 'grid-form',
      onsubmit: (e) => {
        e.preventDefault();
        app.save((t) => {
          t.name = name.value.trim() || t.name;
          t.date = date.value;
          t.location = location.value.trim();
        }, 'Saved.');
      },
    },
      field('Name', name), field('Date', date), field('Location', location),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save'))),
  );
}

function teamsCard(app) {
  const { t } = app;
  const name = h('input', { placeholder: 'Team name', required: true });
  const school = h('input', { placeholder: 'School (optional)' });
  const bulk = h('textarea', { rows: 4, placeholder: 'Paste one team per line. Add a school after a comma: "Lincoln A, Lincoln High"' });

  const addOne = (e) => {
    e.preventDefault();
    app.save((t) => addTeam(t, { name: name.value, school: school.value }));
    setTimeout(() => document.querySelector('[data-focus="team-name"]')?.focus());
  };
  name.dataset.focus = 'team-name';

  const addMany = () => {
    const lines = bulk.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0;
    const skipped = [];
    app.save((t) => {
      for (const line of lines) {
        const [n, s = ''] = line.split(',').map((x) => x.trim());
        try {
          addTeam(t, { name: n, school: s });
          added++;
        } catch {
          skipped.push(n);
        }
      }
    }, `Added ${added} team${added === 1 ? '' : 's'}${skipped.length ? `; skipped duplicates: ${skipped.join(', ')}` : ''}.`);
  };

  return h('section', { class: 'card' },
    h('h2', {}, `Teams (${t.teams.length})`),
    h('form', { class: 'row wrap', onsubmit: addOne }, name, school, h('button', { class: 'btn primary', type: 'submit' }, 'Add team')),
    h('details', {}, h('summary', {}, 'Add many teams at once'),
      h('div', { class: 'stack' }, bulk, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: addMany }, 'Add these teams')))),
    t.teams.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Team'), h('th', {}, 'School'), h('th', {}, ''))),
          h('tbody', {}, t.teams.map((team) =>
            h('tr', {},
              h('td', {}, h('input', { class: 'inline-input', value: team.name, 'aria-label': 'Team name',
                onchange: (e) => app.save((t) => updateTeam(t, team.id, { name: e.target.value })) })),
              h('td', {}, h('input', { class: 'inline-input', value: team.school, 'aria-label': 'School',
                onchange: (e) => app.save((t) => updateTeam(t, team.id, { school: e.target.value })) })),
              h('td', { class: 'right' },
                teamInUse(t, team.id)
                  ? h('span', { class: 'muted small' }, 'Scheduled')
                  : h('button', { class: 'btn small danger-text', onclick: () => app.save((t) => removeTeam(t, team.id)) }, 'Remove')),
            ))))
      : h('p', { class: 'muted' }, 'Add the teams that are registered. You choose seeds when you create a phase.'),
  );
}

function roomsCard(app) {
  const { t } = app;
  const name = h('input', { placeholder: 'Room 101', required: true });
  return h('section', { class: 'card' },
    h('h2', {}, `Rooms (${t.rooms.length})`),
    h('p', { class: 'muted' }, 'Games are assigned to rooms in order each round. Add rooms before creating a phase, or assign them game by game.'),
    h('form', { class: 'row wrap', onsubmit: (e) => { e.preventDefault(); app.save((t) => addRoom(t, name.value)); } },
      name, h('button', { class: 'btn primary', type: 'submit' }, 'Add room')),
    h('ul', { class: 'chips' }, t.rooms.map((r) =>
      h('li', { class: 'chip' }, r.name,
        h('button', { class: 'chip-x', 'aria-label': `Remove ${r.name}`, onclick: () => app.save((t) => removeRoom(t, r.id)) }, '×')))),
  );
}

function scoringCard(app) {
  const { t } = app;
  const s = t.settings.scoring;
  const num = (key, label, hint) =>
    field(label, h('input', { type: 'number', value: s[key], step: 1,
      onchange: (e) => app.save((t) => (t.settings.scoring[key] = Number(e.target.value) || 0)) }), hint);
  return h('section', { class: 'card' },
    h('h2', {}, 'Scoring rules'),
    h('div', { class: 'grid-form' },
      field('Preset', select(Object.entries(SCORING_PRESETS).map(([k, v]) => [k, v.label]), s.preset, {
        onchange: (e) => app.save((t) => (t.settings.scoring = { preset: e.target.value, ...SCORING_PRESETS[e.target.value] }), 'Scoring rules updated.'),
      })),
      num('tossupValue', 'Tossup points'),
      num('powerValue', 'Power points', '0 if your format has no powers.'),
      num('negValue', 'Neg points', 'Use a negative number, or 0 for no negs.'),
      num('bonusMax', 'Most points on one bonus'),
      num('tossupsPerGame', 'Tossups per game'),
      field('Ties in pool play', h('input', { type: 'checkbox', checked: s.allowTies,
        onchange: (e) => app.save((t) => (t.settings.scoring.allowTies = e.target.checked)) }),
        'Bracket games can never end in a tie.'),
    ),
  );
}

function tiebreakCard(app) {
  const { t } = app;
  const order = t.settings.tiebreakers;
  const unused = Object.keys(TIEBREAKERS).filter((k) => !order.includes(k));
  const move = (i, d) => app.save((t) => {
    const list = t.settings.tiebreakers;
    [list[i], list[i + d]] = [list[i + d], list[i]];
  });
  return h('section', { class: 'card' },
    h('h2', {}, 'Tiebreakers'),
    h('p', { class: 'muted' }, 'Applied in this order to rank teams within a pool. Teams still tied after all of them share a place.'),
    h('ol', { class: 'ordered-list' }, order.map((k, i) =>
      h('li', {},
        h('span', {}, TIEBREAKERS[k].label),
        h('span', { class: 'row tight' },
          h('button', { class: 'btn small', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'btn small', disabled: i === order.length - 1, 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓'),
          h('button', { class: 'btn small danger-text', onclick: () => app.save((t) => t.settings.tiebreakers.splice(i, 1)) }, 'Remove'))))),
    unused.length
      ? h('div', { class: 'row' },
          select([['', 'Add a tiebreaker…'], ...unused.map((k) => [k, TIEBREAKERS[k].label])], '', {
            onchange: (e) => e.target.value && app.save((t) => t.settings.tiebreakers.push(e.target.value)),
          }))
      : null,
  );
}
