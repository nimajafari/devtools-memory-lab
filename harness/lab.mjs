// Shared code for the harness: a static server for the lab, and a trial that
// runs several rounds of category switches with a checkpoint after each one.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

export const MODES = ['leak', 'fixed', 'bounded'];
export const SWITCHES_PER_ROUND = 10;
const MB = 1024 * 1024;

const harnessDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(harnessDir, '..');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

// A tiny static server for the repo root, so the harness needs no extra dependency.
export function startServer() {
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

async function checkpoint(page, client, round) {
  const heapBytes = await collectAndMeasure(page, client);
  return {
    round,
    heapMB: heapBytes / MB,
    catalogs: await countCatalogs(page),
    detachedCards: await countDetachedCards(page)
  };
}

// Loads the lab in one mode, takes a checkpoint, then runs `rounds` rounds of
// 10 switches with a checkpoint after each round. Round 0 is the fresh load.
export async function runTrial(baseUrl, mode, rounds) {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();

    await page.goto(`${baseUrl}/index.html?mode=${mode}`);
    // Wait without keeping a handle to a card, which would hold it in memory.
    await page.waitForFunction(() => document.querySelector('.card') !== null);

    const lab = await page.evaluate(() => ({
      mode: MODE,
      cacheLimit: CACHE_LIMIT,
      cardsPerPage: CARDS_PER_PAGE
    }));
    if (lab.mode !== mode) throw new Error(`Expected ${mode} mode, the page is in ${lab.mode} mode`);

    const checkpoints = [await checkpoint(page, client, 0)];
    for (let round = 1; round <= rounds; round++) {
      await page.click('#run-switches');
      await page.waitForFunction(
        renders => document.getElementById('stat-renders').textContent === String(renders) &&
          !document.getElementById('run-switches').disabled,
        {},
        1 + round * SWITCHES_PER_ROUND
      );
      checkpoints.push(await checkpoint(page, client, round));
    }

    return {
      chromeVersion: await browser.version(),
      cacheLimit: lab.cacheLimit,
      cardsPerPage: lab.cardsPerPage,
      checkpoints
    };
  } finally {
    await browser.close();
  }
}
