// Memory regression checks for the lab. Run them with: npm test
//
// Each mode has an intended memory policy, and these tests assert it:
//   leak:    the counts grow by the same amount every round, without end.
//   fixed:   nothing from a previous view stays in memory.
//   bounded: the cache grows during warm-up, then stays at its limit.
// The leak mode test proves the checks can tell a leak from a plateau.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, SWITCHES_PER_ROUND, startServer, runTrial } from './lab.mjs';

const ROUNDS = 4;
// After warm-up, the heap of a mode that does not leak should move by less
// than this between checkpoints. One leaked round adds tens of megabytes.
const PLATEAU_TOLERANCE_MB = 1;
const LEAK_MIN_GROWTH_MB = 10;

let server;
const results = {};

before(async () => {
  server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const mode of MODES) results[mode] = await runTrial(baseUrl, mode, ROUNDS);
});

after(() => server?.close());

// Every checkpoint after the first round, when any cache is already warm.
const afterWarmUp = checkpoints => checkpoints.filter(point => point.round >= 1);

function assertHeapPlateau(checkpoints) {
  const [first, ...rest] = afterWarmUp(checkpoints);
  for (const point of rest) {
    const change = point.heapMB - first.heapMB;
    assert.ok(Math.abs(change) < PLATEAU_TOLERANCE_MB,
      `heap moved ${change.toFixed(2)} MB between round ${first.round} and round ${point.round}`);
  }
}

test('leak mode: every round leaves more objects in memory', () => {
  const { checkpoints, cardsPerPage } = results.leak;
  for (const point of checkpoints) {
    const renders = 1 + point.round * SWITCHES_PER_ROUND;
    assert.equal(point.catalogs, renders, `round ${point.round}: one ProductCatalog per render`);
    assert.equal(point.detachedCards, (renders - 1) * cardsPerPage,
      `round ${point.round}: every card from an earlier render is still in memory`);
  }
  for (let round = 1; round < checkpoints.length; round++) {
    const growth = checkpoints[round].heapMB - checkpoints[round - 1].heapMB;
    assert.ok(growth > LEAK_MIN_GROWTH_MB,
      `round ${round}: heap grew ${growth.toFixed(2)} MB, expected more than ${LEAK_MIN_GROWTH_MB} MB`);
  }
});

test('fixed mode: nothing from an earlier view stays in memory', () => {
  const { checkpoints } = results.fixed;
  for (const point of checkpoints) {
    assert.equal(point.catalogs, 1, `round ${point.round}: only the current ProductCatalog is alive`);
    assert.equal(point.detachedCards, 0, `round ${point.round}: no detached cards`);
  }
  assertHeapPlateau(checkpoints);
});

test('bounded mode: the cache never holds more than its limit', () => {
  const { checkpoints, cacheLimit, cardsPerPage } = results.bounded;
  // The cache includes the category on screen, whose cards are not detached.
  const maxDetached = (cacheLimit - 1) * cardsPerPage;
  for (const point of checkpoints) {
    assert.ok(point.catalogs <= cacheLimit,
      `round ${point.round}: ${point.catalogs} ProductCatalog objects, limit is ${cacheLimit}`);
    assert.ok(point.detachedCards <= maxDetached,
      `round ${point.round}: ${point.detachedCards} detached cards, limit is ${maxDetached}`);
  }
});

test('bounded mode: after warm-up the cache is full and stops growing', () => {
  const { checkpoints, cacheLimit, cardsPerPage } = results.bounded;
  for (const point of afterWarmUp(checkpoints)) {
    assert.equal(point.catalogs, cacheLimit, `round ${point.round}: the cache is full`);
    assert.equal(point.detachedCards, (cacheLimit - 1) * cardsPerPage,
      `round ${point.round}: detached cards stay at the limit`);
  }
  assertHeapPlateau(checkpoints);
});
