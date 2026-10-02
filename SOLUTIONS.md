# Solutions

Read this after you have tried the exercises in [README.md](README.md).

The active mode is stored in the `MODE` constant on line 4 of `app.js`. Both leaks and both fixes are inside `renderCategory`, which starts on line 107.

## Leak 1: detached DOM nodes

### What you should have seen

In the Comparison view, the `Detached` filter shows 240 new `<article class="card">` elements after each run of 10 switches. None are deleted.

The Retainers section for one detached card reads like this, from the card up to the root:

1. The card is an element of an `Array`.
2. The array is the `items` property of a `CardCache` object.
3. The `CardCache` object is the `cardCache` variable in the script scope.
4. The script scope belongs to the window.

### The responsible lines

`app.js`, lines 118 to 120:

```js
  const cards = catalog.products.slice(0, CARDS_PER_PAGE).map(createCard);
  grid.replaceChildren(...cards);
  cards.forEach(card => cardCache.add(card));
```

### Why it leaks

`grid.replaceChildren` removes the old cards from the page, but `cardCache.items` still holds a reference to every one of them. The cache is a top level variable, so it is always reachable from a GC root. Everything it references is reachable too, and the garbage collector cannot free the old cards.

### The fix

Before, the cache is only ever added to:

```js
  cards.forEach(card => cardCache.add(card));
```

After, the cache is emptied before each render (line 114), so it only holds the cards that are on the page:

```js
  cardCache.clear();
  // ...
  cards.forEach(card => cardCache.add(card));
```

A real back button cache would keep a small, fixed number of entries and drop the oldest one.

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

`app.js`, lines 117 and 123:

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

After, each render creates an `AbortController` (lines 109 to 113) and passes its signal when adding the listener (lines 122 and 123). The next render calls `abort()`, which removes the previous listener:

```js
  if (renderController) renderController.abort();
  renderController = new AbortController();
  // ...
  window.addEventListener('resize', () => layoutGrid(catalog), { signal: renderController.signal });
```

Once the old listener is gone, nothing references the old catalog and it can be freed. Calling `removeEventListener` with the same function works too.

### Where this appears on real sites

Components that add listeners to `window` or `document` when they mount and do not remove them when they unmount.

## Checklist for your own site

1. Pick a user flow that repeats, such as opening and closing a menu or moving between two views.
2. Take a heap snapshot, run the flow several times, collect garbage, and take another snapshot.
3. In the Comparison view, sort by the **# Delta** column and look for counts that grow by the number of times you ran the flow.
4. Filter by `Detached` to find elements that left the page but are still referenced.
5. Click one object and read the Retainers section until you reach a name from your own code.
6. Check `getEventListeners(window)` and `getEventListeners(document)` for listener counts that grow.
7. For each listener, timer, observer and cache that a view creates, find the code that removes it when the view goes away.
8. Apply the fix, then repeat the snapshots to confirm that the count stays flat.
