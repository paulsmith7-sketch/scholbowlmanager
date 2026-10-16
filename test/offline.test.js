import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('the service worker caches every app file, so nothing is missing offline', () => {
  const sw = readFileSync('sw.js', 'utf8');
  for (const file of walk('src')) assert.ok(sw.includes(`'${file}'`), `${file} is not in sw.js ASSETS`);
});
