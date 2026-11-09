// Measures the lab in every mode and writes the results to
// harness/results/measurements.json. Run it with: npm run measure
//
// Each trial takes a checkpoint after the first load and after every round of
// 10 switches, so you can see the shape of the growth, not just its size:
// a leak grows every round, a bounded cache grows during warm-up and then stops.

import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { MODES, SWITCHES_PER_ROUND, startServer, runTrial } from './lab.mjs';

const TRIALS = 5;
const ROUNDS = 5;
const METRICS = ['catalogs', 'detachedCards', 'heapMB'];

const harnessDir = path.dirname(fileURLToPath(import.meta.url));
const resultsFile = path.join(harnessDir, 'results', 'measurements.json');

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

function formatCount(stat) {
  return stat.min === stat.max ? String(stat.median) : `${stat.median} (${stat.min} to ${stat.max})`;
}

function formatMB(stat) {
  return `${stat.median.toFixed(2)} (${stat.min.toFixed(2)} to ${stat.max.toFixed(2)})`;
}

function printTable(rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)));
  for (const row of rows) {
    console.log('  ' + row.map((cell, column) => cell.padEnd(widths[column])).join('  '));
  }
}

const server = await startServer();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const trials = {};
const summary = {};
let chromeVersion = '';
let lab = {};

try {
  for (const mode of MODES) {
    trials[mode] = [];
    for (let trial = 1; trial <= TRIALS; trial++) {
      const result = await runTrial(baseUrl, mode, ROUNDS);
      chromeVersion = result.chromeVersion;
      lab = { cacheLimit: result.cacheLimit, cardsPerPage: result.cardsPerPage };
      trials[mode].push(result.checkpoints);
      console.log(`${mode} mode, trial ${trial} of ${TRIALS} done`);
    }
    summary[mode] = [];
    for (let round = 0; round <= ROUNDS; round++) {
      const point = { round };
      for (const metric of METRICS) {
        point[metric] = summarize(trials[mode].map(checkpoints => checkpoints[round][metric]));
      }
      summary[mode].push(point);
    }
  }
} finally {
  server.close();
}

const require = createRequire(import.meta.url);
const results = {
  date: new Date().toISOString(),
  environment: {
    chrome: chromeVersion,
    puppeteer: require('puppeteer/package.json').version,
    node: process.version,
    os: `${os.type()} ${os.release()} ${os.arch()}`
  },
  lab: { ...lab, switchesPerRound: SWITCHES_PER_ROUND },
  trialsPerMode: TRIALS,
  rounds: ROUNDS,
  note: 'Round 0 is the fresh load. Each later round is 10 switches. Values are median with min and max. ' +
    'Heap sizes are JSHeapUsedSize after a forced garbage collection.',
  summary,
  trials
};

await mkdir(path.dirname(resultsFile), { recursive: true });
await writeFile(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log(`\nMedian (min to max) over ${TRIALS} trials per mode, after a forced garbage collection`);
for (const mode of MODES) {
  console.log(`\n${mode} mode`);
  printTable([
    ['Checkpoint', 'ProductCatalog', 'Detached cards', 'Heap MB'],
    ...summary[mode].map(point => [
      point.round === 0 ? 'Fresh load' : `Round ${point.round}`,
      formatCount(point.catalogs),
      formatCount(point.detachedCards),
      formatMB(point.heapMB)
    ])
  ]);
}
console.log(`\nChrome ${chromeVersion}, Puppeteer ${results.environment.puppeteer}, Node ${process.version}`);
console.log('Full results: ' + path.relative(process.cwd(), resultsFile));
