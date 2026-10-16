import { h, download, readFile, toast } from '../dom.js';
import { mergeResults, validateTournament } from '../../core/tournament.js';

export function exportTournament(t) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tournament';
  download(`${name}-${stamp}.json`, JSON.stringify(t, null, 2));
}

export function backupView(app) {
  const { t } = app;
  const mergeInput = h('input', {
    type: 'file', accept: '.json,application/json', class: 'visually-hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const incoming = validateTournament(JSON.parse(await readFile(file)));
        let count = 0;
        app.save((t) => (count = mergeResults(t, incoming)));
        toast(count ? `Merged ${count} game${count === 1 ? '' : 's'}.` : 'Nothing new in that file.');
      } catch (err) {
        toast(err.message || 'That file could not be read.', 'error');
      } finally {
        e.target.value = '';
      }
    },
  });
  return h('div', { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Back up this tournament'),
      h('p', {}, 'Saves a file with every team, game and score. Keep a copy on a USB stick or a second laptop. You can open it on any device with this app, even without internet.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { exportTournament(t); app.markBackedUp(); } }, 'Download backup file')),
      app.lastBackup() ? h('p', { class: 'muted small' }, `Last backup from this device: ${new Date(app.lastBackup()).toLocaleTimeString()}`) : null),
    h('section', { class: 'card' },
      h('h2', {}, 'Merge results from another laptop'),
      h('p', {}, 'If scores were entered on two laptops, bring a backup file from the other one here. For each game, the most recently entered score is kept. Teams and phases are not changed.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => mergeInput.click() }, 'Choose a backup file…'), mergeInput)),
  );
}
