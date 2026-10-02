// Oxyplug Demo Store: a mock category page for the DevTools memory lab.

// The active mode comes from the URL: "?mode=fixed" or the default, "leak".
const MODE = new URLSearchParams(location.search).get('mode') === 'fixed' ? 'fixed' : 'leak';

const CATEGORIES = ['Shoes', 'Bags', 'Watches', 'Hats', 'Jackets'];
const PRODUCTS_PER_RENDER = 6000;
const CARDS_PER_PAGE = 24;
const DESCRIPTION_WORDS = 58;
const CARD_MIN_WIDTH = 220;

const WORDS = [
  'durable', 'lightweight', 'classic', 'modern', 'comfortable', 'waterproof',
  'handmade', 'breathable', 'compact', 'premium', 'everyday', 'seasonal',
  'recycled', 'adjustable', 'padded', 'stitched', 'leather', 'canvas',
  'cotton', 'travel', 'office', 'weekend', 'outdoor', 'limited', 'popular',
  'reliable', 'soft', 'sturdy', 'slim'
];

// Each description is built word by word, so every product has its own text.
function buildDescription(category, index) {
  const parts = [category, 'item', index + 1, 'is'];
  const offset = CATEGORIES.indexOf(category);
  for (let i = 0; i < DESCRIPTION_WORDS; i++) {
    parts.push(WORDS[(index * 7 + i * i + offset) % WORDS.length]);
  }
  return parts.join(' ') + '.';
}

function buildProducts(category, size) {
  const products = [];
  for (let index = 0; index < size; index++) {
    products.push({
      id: category.toLowerCase() + '-' + (index + 1),
      name: category + ' No. ' + (index + 1),
      price: 19 + ((index * 7) % 180) + 0.99,
      hue: (index * 37) % 360,
      description: buildDescription(category, index)
    });
  }
  return products;
}

class ProductCatalog {
  constructor(category, size) {
    this.category = category;
    this.products = buildProducts(category, size);
  }
}

// Keeps rendered cards so the back button can restore them quickly.
class CardCache {
  constructor() { this.items = []; }
  add(element) { this.items.push(element); }
  clear() { this.items.length = 0; }
}

const grid = document.getElementById('grid');
const gridTitle = document.getElementById('grid-title');
const categoryNav = document.getElementById('categories');
const runButton = document.getElementById('run-switches');

const cardCache = new CardCache();
let renderController = null;
let currentCategory = null;
let renderCount = 0;
let listenerCount = 0;

function addText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
}

// A card only stores the product id, in a data attribute.
function createCard(product) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.productId = product.id;

  const swatch = document.createElement('div');
  swatch.className = 'card-swatch';
  swatch.style.backgroundColor = 'hsl(' + product.hue + ' 60% 70%)';
  card.append(swatch);

  const shortDescription = product.description.split(' ').slice(0, 9).join(' ') + '.';
  addText(card, 'h3', 'card-name', product.name);
  addText(card, 'p', 'card-price', '$' + product.price.toFixed(2));
  addText(card, 'p', 'card-description', shortDescription);
  return card;
}

// Picks how many columns fit the current window width.
function layoutGrid(catalog) {
  const fit = Math.max(1, Math.floor(grid.clientWidth / CARD_MIN_WIDTH));
  const columns = Math.min(fit, catalog.products.length);
  grid.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';
}

function updateStats() {
  document.getElementById('stat-renders').textContent = renderCount;
  document.getElementById('stat-cached').textContent = cardCache.items.length;
  document.getElementById('stat-listeners').textContent = listenerCount;
}

function renderCategory(category) {
  if (MODE === 'fixed') {
    if (renderController) {
      renderController.abort();
      listenerCount--;
    }
    renderController = new AbortController();
    cardCache.clear();
  }

  const catalog = new ProductCatalog(category, PRODUCTS_PER_RENDER);
  const cards = catalog.products.slice(0, CARDS_PER_PAGE).map(createCard);
  grid.replaceChildren(...cards);
  cards.forEach(card => cardCache.add(card));

  const options = MODE === 'fixed' ? { signal: renderController.signal } : {};
  window.addEventListener('resize', () => layoutGrid(catalog), options);
  listenerCount++;
  layoutGrid(catalog);

  currentCategory = category;
  renderCount++;
  gridTitle.textContent = category;
  for (const button of categoryNav.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', button.dataset.category === category);
  }
  updateStats();
}

// Switches category ten times, letting the browser paint between switches.
async function runSwitches() {
  runButton.disabled = true;
  for (let i = 0; i < 10; i++) {
    const next = (CATEGORIES.indexOf(currentCategory) + 1) % CATEGORIES.length;
    renderCategory(CATEGORIES[next]);
    await new Promise(requestAnimationFrame);
  }
  runButton.disabled = false;
}

function showMode() {
  const fixed = MODE === 'fixed';
  document.body.dataset.mode = MODE;
  document.getElementById('mode-label').textContent = fixed ? 'Fixed mode' : 'Leak mode';
  const link = document.getElementById('mode-link');
  link.textContent = fixed ? 'Switch to leak mode' : 'Switch to fixed mode';
  link.href = fixed ? '?mode=leak' : '?mode=fixed';
}

categoryNav.addEventListener('click', event => {
  const category = event.target.dataset.category;
  if (category) renderCategory(category);
});
runButton.addEventListener('click', runSwitches);

showMode();
renderCategory(CATEGORIES[0]);
