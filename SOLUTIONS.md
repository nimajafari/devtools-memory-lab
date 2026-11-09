# Solutions

Read this after you have tried the exercises in [README.md](README.md).

The active mode is stored in the `MODE` constant on line 6 of `app.js`. Both leaks and both fixes are inside `renderCategory`, which starts on line 157. Bounded cache mode is covered at the end of this file.

## Leak 1: detached DOM nodes

### What you should have seen

In the Comparison view, the `Detached` filter shows 240 new `<article class="card">` elements after each run of 10 switches. None are deleted.

The Retainers section for one detached card reads like this, from the card up to the root:

1. The card is an element of an `Array`.
2. The array is the `items` property of a `CardCache` object.
3. The `CardCache` object is the `cardCache` variable in the script scope.
4. The script scope belongs to the window.

### The responsible lines

`app.js`, lines 143, 170 and 171. `loadCategory` builds the cards, and `renderCategory` puts them on the page and in the cache:

```js
  const cards = catalog.products.slice(0, CARDS_PER_PAGE).map(createCard);
```

```js
  grid.replaceChildren(...cards);
  if (MODE !== 'bounded') cards.forEach(card => cardCache.add(card));
```

### Why it leaks

`grid.replaceChildren` removes the old cards from the page, but `cardCache.items` still holds a reference to every one of them. The cache is a top level variable, so it is always reachable from a GC root. Everything it references is reachable too, and the garbage collector cannot free the old cards.

### The fix

Before, the cache is only ever added to:

```js
  cards.forEach(card => cardCache.add(card));
```

After, the cache is emptied before each render (line 165), so it only holds the cards that are on the page:

```js
  cardCache.clear();
  // ...
  cards.forEach(card => cardCache.add(card));
```

This fix gives up the cache completely. A real back button cache would keep a small, fixed number of entries and drop the oldest one. Bounded cache mode does that, see [Bounded cache mode](#bounded-cache-mode-not-a-leak).

### Where this appears on real sites

Caches, lookup maps and arrays of elements that have no size limit and no eviction.

## Leak 2: a listener that is never removed

### What you should have seen

In the Comparison view, the `ProductCatalog` filter shows 10 new objects after each run of 10 switches, and none deleted. Each one retains a few megabytes, because it holds 6000 products with long descriptions.

`getEventListeners(window)` shows one `resize` listener for every render.

The Retainers section for one `ProductCatalog` reads like this, from the catalog up to the root:

1. The catalog is the `catalog` variable in a `Context`. A context is where a closure stores the variables it uses.
2. The context belongs to an unnamed function. This is the arrow function passed to `addEventListener`.
3. The function is held by an event listener (`V8EventListener`, then a few browser internal rows).
4. The event listener is registered on the `Window`.

### The responsible lines

`app.js`, lines 142 and 174:

```js
  const catalog = new ProductCatalog(category, PRODUCTS_PER_RENDER);
```

```js
  window.addEventListener('resize', () => layoutGrid(catalog), options);
```

### Why it leaks

The arrow function uses `catalog`, so it closes over it. The window keeps a reference to every listener that was added to it, and the window is a GC root. Each render adds one more listener and never removes the last one, so every old catalog stays reachable through its listener.

### The fix

Before, the listener is added with no way to remove it:

```js
  window.addEventListener('resize', () => layoutGrid(catalog));
```

After, each render creates an `AbortController` (lines 158 to 164) and passes its signal when adding the listener (lines 173 and 174). The next render calls `abort()`, which removes the previous listener:

```js
  if (renderController) renderController.abort();
  renderController = new AbortController();
  // ...
  window.addEventListener('resize', () => layoutGrid(catalog), { signal: renderController.signal });
```

Once the old listener is gone, nothing references the old catalog and it can be freed. Calling `removeEventListener` with the same function works too.

### Where this appears on real sites

Components that add listeners to `window` or `document` when they mount and do not remove them when they unmount.

## Bounded cache mode: not a leak

### What you should have seen

After the first run of 10 switches, the heap is several megabytes above a fresh load. There are 3 `ProductCatalog` objects and 48 detached cards. If you only compared a fresh load with that first checkpoint, it would look like a leak.

After the next runs, nothing changes. Comparing snapshot 3 with snapshot 2 shows 3 new `ProductCatalog` objects and 3 deleted, so the **# Delta** is 0. The detached cards show 48 new, 48 deleted, and a delta of 0. Objects come and go, but the total stays the same.

The Retainers section for a detached card, or for a catalog that is not on screen, reads like this:

1. The object belongs to an entry object: a card is an element of its `cards` array, and a catalog is its `catalog` property.
2. The entry is a value in a `Map`. There can be a few internal rows here.
3. The `Map` is the `entries` property of a `CategoryCache` object.
4. The `CategoryCache` object is the `cardCache` variable in the script scope, which belongs to the window.

The catalog on screen has a second retainer, the `resize` listener of the current render.

### The responsible lines

`app.js`, lines 64 to 90 define `CategoryCache`. The lines that keep it bounded are in `set`:

```js
  set(category, entry) {
    this.entries.set(category, entry);
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }
```

`get` moves the entry it returns to the end of the `Map`, so the first key is always the least recently used category. `CACHE_LIMIT` on line 11 sets the limit.

### Why it is not a leak

The cache holds on to objects on purpose, so you can go back to a category without building it again. It holds at most `CACHE_LIMIT` categories, and it drops the least recently used one when it is full. On a fresh load the cache is empty, so the heap grows while it fills up during warm-up. Once it is full, every new entry pushes an old one out.

To check this, look at the counts, not the heap size alone. A leak adds the same amount every round. A bounded cache stops at its limit.

### A plateau is not enough

The lab has only 5 categories. A cache with no eviction at all would also stop growing, at 5 categories, because it runs out of new keys. A plateau tells you the growth is bounded. It does not tell you the bound is the one you intended. On a real site, the number of keys might be every product or every URL, and that plateau never comes.

That is why the harness tests assert the limit itself. See `npm test` in [harness/README.md](harness/README.md).

## Checklist for your own site

1. Pick a user flow that repeats, such as opening and closing a menu or moving between two views.
2. Run the flow once to warm up any caches. Then take a heap snapshot, run the flow several times, collect garbage, and take another snapshot. Repeat this at least once more.
3. In the Comparison view, sort by the **# Delta** column and look for counts that grow by the same amount every time you repeat the flow. Growth that stops after the first round is more likely a cache than a leak.
4. Filter by `Detached` to find elements that left the page but are still referenced.
5. Click one object and read the Retainers section until you reach a name from your own code.
6. Check `getEventListeners(window)` and `getEventListeners(document)` for listener counts that grow.
7. For each listener, timer, observer and cache that a view creates, find the code that removes it when the view goes away. For a cache, find its limit and the code that evicts entries.
8. Apply the fix, then repeat the snapshots to confirm that the count stays flat.
9. If a cache is meant to have a limit, write a test that asserts the limit, so a later change cannot remove it without anyone noticing.
