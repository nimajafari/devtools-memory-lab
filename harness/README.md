# Measurement harness

This folder is optional. You do not need it for the exercises. It runs the lab in Chrome through Puppeteer, prints reproducible numbers for every mode, and checks that each mode keeps to its memory policy.

## Run it

You need Node.js. From this folder:

```
npm install
npm run measure
npm test
```

If your package manager blocks install scripts, Chrome is not downloaded during the install. Download it with:

```
npx puppeteer browsers install
```

## What `npm run measure` does

For each mode, the script runs 5 trials, each in a fresh browser:

1. Loads the page and waits for the first render.
2. Takes a checkpoint: forces a garbage collection, records the used JS heap size, counts the live `ProductCatalog` objects, and counts the `card` elements that are no longer in the document.
3. Clicks **Run 10 switches**, waits for it to finish, and takes another checkpoint.
4. Repeats step 3 until it has run 5 rounds.

It prints the median and the range at each checkpoint, and writes the full results to `results/measurements.json`. A sample run is committed in that file.

The checkpoints show the shape of the growth, not just its size. Leak mode grows by the same amount every round. Fixed mode stays flat. Bounded cache mode grows in the first round while its cache fills, then stays flat. A single comparison between a fresh load and round 1 cannot tell bounded cache mode from leak mode, because both have grown.

## What `npm test` does

The tests run each mode once for 4 rounds and assert its memory policy:

* **Leak mode:** every round adds one `ProductCatalog` per render and keeps every old card, and the heap grows by more than 10 MB per round. This test proves that the checks can detect a leak.
* **Fixed mode:** there is only one `ProductCatalog` and no detached cards at every checkpoint, and the heap stays flat.
* **Bounded cache mode:** the counts never go over the cache limit. After warm-up, the cache is exactly full, and the counts and the heap stay flat.

The tests read `CACHE_LIMIT` and `CARDS_PER_PAGE` from the page, so they follow the app if those values change. If someone removes the eviction from the cache, the bounded cache tests fail. The counts do level off without eviction, but at 5 categories instead of 3, and the test checks the limit, not only the plateau.

The same pattern works on a real site. Pick a flow, repeat it, collect garbage between checkpoints, and assert the counts that your design promises.

The `.github/workflows/memory-check.yml` workflow runs `npm test` on every push and pull request.

## Reading the numbers

Counts should match on any machine. Sizes will not. The heap checks compare checkpoints within one run, not against fixed sizes, so they do not depend on the machine. See [CAVEATS.md](../CAVEATS.md).
