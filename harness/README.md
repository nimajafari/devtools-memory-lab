# Measurement harness

This folder is optional. You do not need it for the exercises. It runs the lab in Chrome through Puppeteer and prints reproducible numbers for both modes.

## Run it

You need Node.js. From this folder:

```
npm install
npm run measure
```

If your package manager blocks install scripts, Chrome is not downloaded during the install. Download it with:

```
npx puppeteer browsers install
```

## What it does

For each mode the script runs 5 trials, each in a fresh browser:

1. Loads the page and waits for the first render.
2. Forces a garbage collection and records the used JS heap size.
3. Clicks **Run 10 switches** and waits for it to finish.
4. Forces a garbage collection and records the used JS heap size again.
5. Counts the live `ProductCatalog` objects.
6. Counts the `card` elements that are no longer in the document.

It prints the median and the range for each value, and writes the full results to `results/measurements.json`. A sample run is committed in that file.

## Reading the numbers

Counts should match on any machine. Sizes will not. See [CAVEATS.md](../CAVEATS.md).
