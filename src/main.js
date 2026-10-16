import { start } from './ui/app.js';

start(document.getElementById('app'));

// The service worker caches the app so it opens with no internet at the venue.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline cache unavailable:', err));
}
