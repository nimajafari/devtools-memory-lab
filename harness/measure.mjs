// Measures the lab in leak mode and fixed mode and writes the results to
// harness/results/measurements.json. Run it with: npm run measure

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';

const MODES = ['leak', 'fixed'];
const TRIALS = 5;
const MB = 1024 * 1024;

const harnessDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(harnessDir, '..');
const resultsFile = path.join(harnessDir, 'results', 'measurements.json');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

// A tiny static server for the repo root, so the harness needs no extra dependency.
function startServer() {
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(repoRoot, relative);
    if (!file.startsWith(repoRoot + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream'
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Forces garbage collection, then reads the used JS heap size in bytes.
async function collectAndMeasure(page, client) {
  await client.send('HeapProfiler.collectGarbage');
  const metrics = await page.metrics();
  return metrics.JSHeapUsedSize;
}

async function countCatalogs(page) {
  const prototype = await page.evaluateHandle(() => ProductCatalog.prototype);
  const instances = await page.queryObjects(prototype);
  const count = await page.evaluate(list => list.length, instances);
  await instances.dispose();
  await prototype.dispose();
  return count;
}

async function countDetachedCards(page) {
  const prototype = await page.evaluateHandle(() => HTMLElement.prototype);
  const elements = await page.queryObjects(prototype);
  // The query also returns prototype objects such as HTMLDivElement.prototype.
  // They own a "constructor" property, real elements do not, so skip them.
  const count = await page.evaluate(
    list => list.filter(el => !Object.hasOwn(el, 'constructor') &&
      el.classList.contains('card') && !el.isConnected).length,
    elements
  );
  await elements.dispose();
  await prototype.dispose();
  return count;
}

async function runTrial(baseUrl, mode) {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();

    await page.goto(`${baseUrl}/index.html?mode=${mode}`);
    // Wait without keeping a handle to a card, which would hold it in memory.
    await page.waitForFunction(() => document.querySelector('.card') !== null);
    const baselineBytes = await collectAndMeasure(page, client);

    await page.click('#run-switches');
    await page.waitForFunction(
      () => document.getElementById('stat-renders').textContent === '11' &&
        !document.getElementById('run-switches').disabled
    );
    const afterBytes = await collectAndMeasure(page, client);

    return {
      baselineMB: baselineBytes / MB,
      afterMB: afterBytes / MB,
      growthMB: (afterBytes - baselineBytes) / MB,
      catalogs: await countCatalogs(page),
      detachedCards: await countDetachedCards(page),
      chromeVersion: await browser.version()
    };
  } finally {
    await browser.close();
  }
}

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

function printTable(summary) {
  const rows = [
    ['Mode', 'ProductCatalog', 'Detached cards', 'Baseline MB', 'After MB', 'Growth MB'],
    ...MODES.map(mode => [
      mode,
      formatCount(summary[mode].catalogs),
      formatCount(summary[mode].detachedCards),
      formatMB(summary[mode].baselineMB),
      formatMB(summary[mode].afterMB),
      formatMB(summary[mode].growthMB)
    ])
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)));
  for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('  '));
  }
}

const server = await startServer();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const trials = {};
const summary = {};
let chromeVersion = '';

try {
  for (const mode of MODES) {
    trials[mode] = [];
    for (let trial = 1; trial <= TRIALS; trial++) {
      const result = await runTrial(baseUrl, mode);
      chromeVersion = result.chromeVersion;
      delete result.chromeVersion;
      trials[mode].push(result);
      console.log(`${mode} mode, trial ${trial} of ${TRIALS} done`);
    }
    summary[mode] = {};
    for (const key of Object.keys(trials[mode][0])) {
      summary[mode][key] = summarize(trials[mode].map(result => result[key]));
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
  trialsPerMode: TRIALS,
  note: 'Values are median with min and max. Heap sizes are JSHeapUsedSize after a forced garbage collection.',
  summary,
  trials
};

await mkdir(path.dirname(resultsFile), { recursive: true });
await writeFile(resultsFile, JSON.stringify(results, null, 2) + '\n');

console.log('\nMedian (min to max) over ' + TRIALS + ' trials per mode');
printTable(summary);
console.log(`\nChrome ${chromeVersion}, Puppeteer ${results.environment.puppeteer}, Node ${process.version}`);
console.log('Full results: ' + path.relative(process.cwd(), resultsFile));
