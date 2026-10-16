// Local persistence. Everything stays in this browser; nothing is sent anywhere.
import { validateTournament } from '../core/tournament.js';

const INDEX_KEY = 'sbtm:index';

// Some embedded previews do not allow browser storage at all. Fall back to
// memory so the app still works, and let the UI warn that nothing is saved.
const memory = new Map();
const memoryStore = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

function pickStore() {
  try {
    const probe = '__sbtm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const persistent = pickStore();
export const store = persistent || memoryStore;
export const storageAvailable = !!persistent;
const tKey = (id) => `sbtm:t:${id}`;

function readJson(key, fallback) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function listTournaments() {
  return readJson(INDEX_KEY, []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function loadTournament(id) {
  const data = readJson(tKey(id), null);
  return data ? validateTournament(data) : null;
}

export function saveTournament(t) {
  store.setItem(tKey(t.id), JSON.stringify(t));
  const index = readJson(INDEX_KEY, []).filter((x) => x.id !== t.id);
  index.push({ id: t.id, name: t.name, date: t.date, updatedAt: t.updatedAt, teams: t.teams.length });
  store.setItem(INDEX_KEY, JSON.stringify(index));
}

export function deleteTournament(id) {
  store.removeItem(tKey(id));
  const index = readJson(INDEX_KEY, []).filter((x) => x.id !== id);
  store.setItem(INDEX_KEY, JSON.stringify(index));
}

// Asks the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}
