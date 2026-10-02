# DevTools Memory Heap Lab

A small demo store with two memory leaks, built so you can practice finding them with the Chrome DevTools Memory panel.

<!-- screenshot: the Oxyplug Demo Store page in leak mode -->

## Why this matters

In a single page app, a leak grows for as long as the visitor keeps the tab open. A larger heap gives the garbage collector more work, and that work can slow down interactions. Slow interactions can show up in Interaction to Next Paint (INP) field data, and on phones with little memory the tab can crash. This lab does not claim that heap size is a ranking factor, or that it affects how Googlebot indexes a page.

## Run it

You need desktop Chrome or Edge. Pick one of these options:

1. Open the hosted copy at https://nimajafari.github.io/devtools-memory-lab/
2. Clone this repo and open `index.html` in the browser. No install and no build step.
3. Serve the folder with any static server, for example `npx serve`.

The page starts in **Leak mode**. The link in the header switches to **Fixed mode**, which adds `?mode=fixed` to the URL.

## Before you start

* Use a Guest or Incognito window with extensions turned off.
* Close your other tabs.
* Keep the Console closed while you take snapshots.
* Do not log objects, and do not select elements in the Elements panel, during the exercises.

DevTools can hold references to objects that you inspect. Those references keep the objects alive and change your results.

## Key terms

* **Heap.** The memory where the page keeps its JavaScript objects and strings.
* **Garbage collection.** The browser process that frees memory used by objects the page can no longer reach.
* **GC root.** A starting point that the garbage collector always treats as alive, such as the window object.
* **Reachable.** An object is reachable when a chain of references leads to it from a GC root. Reachable objects are never freed.
* **Shallow size.** The memory an object uses by itself, without the things it points to.
* **Retained size.** The memory that would be freed if the object were removed, including everything that only it keeps alive.
* **Retainer.** An object that holds a reference to another object and so keeps it alive.
* **Detached DOM node.** An element that was removed from the page but is still referenced by JavaScript, so it cannot be freed.
* **Closure.** A function together with the variables from the scope where it was created. Those variables stay alive as long as the function does.

## Exercises

Work through DevTools before you read `app.js`. The source code shows what fixed mode does differently, and the exercises are more useful if you find the cause yourself.

The stats panel on the page shows the app's own counters. They are hints, not memory measurements. DevTools is the source of truth.

### Exercise 1: See the growth

**Goal:** confirm that memory grows and does not come back.

1. Open the lab in leak mode and open DevTools.
2. Open the **Performance** panel and enable the **Memory** checkbox.
3. Start recording.
4. Click **Run 10 switches** on the page and wait for it to finish.
5. Click the **Collect garbage** button in the Performance panel toolbar.
6. Stop recording.

**What you should see:** the JS heap line climbs in ten steps, one for each switch. The Nodes and Listeners lines climb too. After the garbage collection the lines do not return to where they started.

<!-- screenshot: Performance panel memory chart with JS heap, Nodes and Listeners climbing -->

### Exercise 2: Three snapshot comparison

**Goal:** find out which objects are piling up.

1. Reload the page in leak mode.
2. Open the **Memory** panel, select **Heap snapshot** and take snapshot 1.
3. Click **Run 10 switches**, then click the **Collect garbage** button, then take snapshot 2.
4. Repeat step 3 to take snapshot 3.
5. Select snapshot 3. Change the view from **Summary** to **Comparison** and compare against snapshot 2.
6. Sort by the **# Delta** column.
7. Type `ProductCatalog` into the class filter. Note the count and the sizes.
8. Type `Detached` into the class filter. Note the count and the sizes.

**What you should see:** 10 new `ProductCatalog` objects and none deleted, each retaining a few megabytes. You should also see 240 new detached `<article class="card">` elements, which is 24 cards for each of the 10 switches. The same numbers appear between snapshot 1 and snapshot 2, so the growth repeats with every run.

<!-- screenshot: comparison view filtered by ProductCatalog -->
<!-- screenshot: comparison view filtered by Detached -->

Optional: the Memory panel also has a **Detached elements** profiling type. Select it and take a profile to list the detached elements directly.

### Exercise 3: Follow the retainers

**Goal:** find out what keeps those objects alive.

1. In snapshot 3, switch back to the **Summary** view and filter by `ProductCatalog`.
2. Expand the row and click one `ProductCatalog` instance.
3. Read the **Retainers** section from top to bottom until you reach something the app owns.
4. Filter by `Detached`, click one detached `card` element and do the same.
5. Write down what is holding each one.

**What you should see:** two different chains. Each chain passes through a name that you can find in `app.js` and ends at the window. Some rows in between are browser internals. You can skip those.

<!-- screenshot: Retainers section for one ProductCatalog instance -->
<!-- screenshot: Retainers section for one detached card element -->

### Exercise 4: Check listeners from the Console

**Goal:** count the event listeners on the window.

1. After you have taken your snapshots, open the **Console**.
2. Run `getEventListeners(window)`.
3. Expand the result and count the `resize` entries.

`getEventListeners` is a Chrome DevTools Console utility, not a web API. It only works in the Console.

**What you should see:** one `resize` listener for every render. The count matches the "Renders so far" counter on the page.

<!-- screenshot: Console output of getEventListeners(window) -->

### Exercise 5: Verify the fix

**Goal:** confirm that fixed mode does not leak.

1. Click **Switch to fixed mode** in the page header.
2. Repeat Exercises 1 to 4.
3. Compare your notes with the leak mode results.

**What you should see:** the heap rises and falls but returns to about the same level after garbage collection. The comparison shows no growth in `ProductCatalog` objects, and no detached `card` elements. `getEventListeners(window)` shows one `resize` listener.

<!-- screenshot: comparison view in fixed mode -->

When you are done, read [SOLUTIONS.md](SOLUTIONS.md) for the cause of each leak and its fix. [CAVEATS.md](CAVEATS.md) lists the limits of this lab.

## UI labels note

DevTools labels and icons change between Chrome releases. If a button or column has a different name in your browser, look for the closest match.

Checked against Chrome version: TODO

## Optional: measure it yourself

The `harness` folder contains a script that runs the lab in Chrome and prints the numbers. You do not need it for the exercises. See [harness/README.md](harness/README.md).

## Further reading

* [Fix memory problems](https://developer.chrome.com/docs/devtools/memory-problems)
* [Record heap snapshots](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots)
* [Memory panel overview](https://developer.chrome.com/docs/devtools/memory)
* [Console Utilities API reference](https://developer.chrome.com/docs/devtools/console/utilities)

## License and credits

Built by Nima Jafari for Oxyplug. Released under the [MIT License](LICENSE).

Companion article: [ARTICLE_URL](ARTICLE_URL)
