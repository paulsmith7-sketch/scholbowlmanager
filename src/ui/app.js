// App shell: routing, saving, and the top-level layout.
import { h, clear, toast } from './dom.js';
import { loadTournament, saveTournament, requestPersistence, store, storageAvailable } from './storage.js';
import { homeView } from './views/home.js';
import { setupView } from './views/setup.js';
import { phasesView } from './views/phases.js';
import { gamesView } from './views/games.js';
import { standingsView } from './views/standings.js';
import { backupView, exportTournament } from './views/backup.js';

const TABS = [
  ['setup', 'Setup'],
  ['phases', 'Phases'],
  ['games', 'Games'],
  ['standings', 'Standings'],
  ['backup', 'Backup'],
];

const BACKUP_KEY = (id) => `sbtm:backup:${id}`;
const BACKUP_NUDGE_MS = 30 * 60 * 1000;

const app = {
  t: null,
  ui: {},
  root: null,

  navigate(hash, { replace = false } = {}) {
    // History calls can throw inside sandboxed previews; the hash still works.
    try {
      if (replace) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
    } catch {
      this.route = hash;
    }
    this.render();
  },

  currentHash() {
    return this.route ?? location.hash;
  },

  // Applies a change to the open tournament, saves it, and redraws.
  save(mutate, message) {
    try {
      const result = mutate(this.t);
      saveTournament(this.t);
      if (message) toast(message);
      this.render();
      return result;
    } catch (err) {
      console.error(err);
      toast(err.message || 'Something went wrong.', 'error');
      this.render();
      return undefined;
    }
  },

  lastBackup() {
    try {
      return Number(store.getItem(BACKUP_KEY(this.t.id))) || 0;
    } catch {
      return 0;
    }
  },

  markBackedUp() {
    try {
      store.setItem(BACKUP_KEY(this.t.id), String(Date.now()));
    } catch {
      /* ignore */
    }
    this.render();
  },

  render() {
    const [, route, id, tab = 'games', sub] = this.currentHash().split('/');
    const main = clear(this.root);
    if (!storageAvailable) main.append(storageWarning());
    document.body.classList.remove('projector');
    if (route !== 't' || !id) {
      this.t = null;
      document.title = 'Scholastic Bowl Tournament Manager';
      main.append(header(null), homeView(this));
      return;
    }
    if (!this.t || this.t.id !== id) this.t = loadTournament(id);
    if (!this.t) {
      main.append(header(null), h('div', { class: 'page' }, h('section', { class: 'card' },
        h('p', {}, 'That tournament is not on this device.'), h('a', { class: 'btn', href: '#/' }, 'Back to tournaments'))));
      return;
    }
    document.title = `${this.t.name} · Scholastic Bowl`;
    const views = { setup: setupView, phases: phasesView, games: gamesView, standings: standingsView, backup: backupView };
    const view = views[tab] || gamesView;
    main.append(header(this.t, tab), backupNudge(this, tab), view(this, sub));
  },
};

function header(t, active) {
  return h('header', { class: 'app-header no-print' },
    h('div', { class: 'header-row' },
      h('a', { href: '#/', class: 'brand' }, h('img', { src: window.__SBTM_ICON__ || 'icon.svg', alt: '', width: 28, height: 28 }), h('span', {}, t ? t.name : 'Scholastic Bowl')),
      h('span', { class: `net-status ${navigator.onLine ? 'online' : 'offline'}`, title: 'Everything works offline' }, navigator.onLine ? 'Online' : 'Offline · all data is on this device')),
    t
      ? h('nav', { class: 'tabs', 'aria-label': 'Tournament' }, TABS.map(([key, label]) =>
          h('a', { href: `#/t/${t.id}/${key}`, class: key === active ? 'active' : '', 'aria-current': key === active ? 'page' : null }, label)))
      : null);
}

function storageWarning() {
  return h('div', { class: 'banner no-print', role: 'alert' },
    h('span', {}, 'This window cannot save anything, so your work is lost when it closes. Download the file and open it in Chrome, Edge, Firefox or Safari instead.'));
}

function backupNudge(app, tab) {
  const t = app.t;
  if (tab === 'backup') return null;
  const scored = t.phases.some((p) => p.games.some((g) => g.result));
  if (!scored || Date.now() - app.lastBackup() < BACKUP_NUDGE_MS) return null;
  return h('div', { class: 'banner no-print' },
    h('span', {}, app.lastBackup() ? 'It has been a while since your last backup file.' : 'No backup file has been downloaded for this tournament yet.'),
    h('button', { class: 'btn small', onclick: () => { exportTournament(t); app.markBackedUp(); } }, 'Download backup'));
}

export function start(root) {
  app.root = root;
  const onRouteChange = () => {
    app.route = null;
    app.render();
  };
  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('hashchange', onRouteChange);
  // Links are handled here too, so they work where hash navigation is blocked.
  root.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#/"]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    app.navigate(link.getAttribute('href'));
  });
  window.addEventListener('online', () => app.render());
  window.addEventListener('offline', () => app.render());
  requestPersistence();
  app.render();
}
