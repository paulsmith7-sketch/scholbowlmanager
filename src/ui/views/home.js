import { h, field, select, toast, readFile, confirmDialog } from '../dom.js';
import { createTournament, validateTournament } from '../../core/tournament.js';
import { SCORING_PRESETS } from '../../core/scoring.js';
import { listTournaments, loadTournament, saveTournament, deleteTournament } from '../storage.js';

export function homeView(app) {
  const list = listTournaments();
  const name = h('input', { placeholder: 'Spring Invitational' });
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const location = h('input', { placeholder: 'Central High School' });
  const preset = select(
    Object.entries(SCORING_PRESETS).map(([k, v]) => [k, v.label]),
    'ihsa',
  );

  const create = (e) => {
    e.preventDefault();
    const t = createTournament({ name: name.value.trim() || 'Untitled tournament', date: date.value, location: location.value.trim(), scoringPreset: preset.value });
    saveTournament(t);
    app.navigate(`#/t/${t.id}/setup`);
  };

  const importInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'visually-hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = validateTournament(JSON.parse(await readFile(file)));
        if (loadTournament(data.id)) {
          const ok = await confirmDialog(`"${data.name}" is already on this device. Replace it with the file? To combine results from two laptops instead, open the tournament and use Backup > Merge results.`, { confirmLabel: 'Replace', danger: true });
          if (!ok) return;
        }
        saveTournament(data);
        toast(`Imported ${data.name}.`);
        app.navigate(`#/t/${data.id}/games`);
      } catch (err) {
        toast(err.message || 'That file could not be read.', 'error');
      } finally {
        e.target.value = '';
      }
    },
  });

  return h(
    'div',
    { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Your tournaments'),
      list.length
        ? h('ul', { class: 'tournament-list' },
            list.map((x) =>
              h('li', {},
                h('a', { href: `#/t/${x.id}/games`, class: 'tournament-link' },
                  h('strong', {}, x.name),
                  h('span', { class: 'muted' }, [x.date, `${x.teams} teams`].filter(Boolean).join(' · '))),
                h('button', {
                  class: 'btn small danger-text',
                  'aria-label': `Delete ${x.name}`,
                  onclick: async () => {
                    if (await confirmDialog(`Delete "${x.name}" from this device? Export a backup first if you might need it.`, { confirmLabel: 'Delete', danger: true })) {
                      deleteTournament(x.id);
                      app.render();
                    }
                  },
                }, 'Delete'),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No tournaments on this device yet.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => importInput.click() }, 'Open a backup file…'),
        importInput),
    ),
    h('section', { class: 'card' },
      h('h2', {}, 'New tournament'),
      h('form', { class: 'grid-form', onsubmit: create },
        field('Name', name),
        field('Date', date),
        field('Location', location),
        field('Scoring rules', preset, 'You can change point values later in Setup.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Create tournament')),
      ),
    ),
    h('section', { class: 'card muted-card' },
      h('h2', {}, 'Works without internet'),
      h('p', {}, 'Everything is saved in this browser on this device. Nothing is uploaded. Export a backup file after each round so you can recover from a dead laptop or move to another computer.'),
    ),
  );
}
