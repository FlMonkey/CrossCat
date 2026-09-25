const state = { products: [], lastSearch: null };
const $ = (selector) => document.querySelector(selector);
const label = (value) => value.split('.').pop().replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

function node(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = content;
  return el;
}

function showView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${name}-view`));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === name));
  $('#breadcrumb').textContent = name === 'add' ? 'ADD A PIECE' : name.toUpperCase();
  if (name === 'inventory') renderInventory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function message(selector, text, success = false) {
  const el = $(selector);
  el.textContent = text;
  el.classList.toggle('success', success);
  el.hidden = !text;
}

async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, options); }
  catch { throw new Error('Cannot reach the local CrossCat server.'); }
  let body;
  try { body = await response.json(); }
  catch { throw new Error('The server returned an unreadable response.'); }
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function appendChips(container, items, negative = false, max = 4) {
  items.slice(0, max).forEach(item => container.append(node('span', `chip${negative ? ' negative' : ''}`, label(item.attribute || item))));
}

function productCard(product, searchResult = false) {
  const card = node('article', 'product-card');
  const image = node('div', 'product-image');
  const img = document.createElement('img');
  img.src = product.image_url;
  img.alt = product.name;
  img.loading = 'lazy';
  image.append(img);
  if (searchResult) image.append(node('span', 'match-badge', `${Math.round(product.match_score * 100)}% match`));
  card.append(image);
  const info = node('div', 'product-info');
  info.append(node('div', 'product-type', product.taxonomy.split('.').map(label).join(' / ')));
  info.append(node('h3', '', product.name));
  info.append(node('p', '', product.description));
  const tags = node('div', 'tags');
  if (searchResult) {
    appendChips(tags, product.matched);
    appendChips(tags, product.avoided.map(item => ({ attribute: `No ${label(item.attribute)}` })), false, 2);
    appendChips(tags, product.conflicts.map(item => ({ attribute: `Has ${label(item.attribute)}` })), true, 2);
  } else {
    appendChips(tags, Object.entries(product.scores).sort((a, b) => b[1] - a[1]).map(([attribute]) => attribute));
  }
  info.append(tags);
  card.append(info);
  const details = node('details', 'product-details');
  details.append(node('summary', '', `View ${Object.keys(product.scores).length} classified attributes`));
  const allTags = node('div', 'all-tags');
  Object.entries(product.scores).sort((a, b) => b[1] - a[1]).forEach(([key, value]) => allTags.append(node('span', '', `${label(key)} ${value.toFixed(2)}`)));
  details.append(allTags);
  card.append(details);
  return card;
}

function emptyState(title, detail) {
  const box = node('div', 'empty-state');
  box.append(node('span', 'empty-symbol', '✳'), node('h3', '', title), node('p', '', detail));
  return box;
}

function renderInventory() {
  const container = $('#inventory');
  container.replaceChildren();
  state.products.forEach(product => container.append(productCard(product)));
  if (!state.products.length) container.append(emptyState('Your collection starts here', 'Add a product image and description to begin building your searchable inventory.'));
  $('#inventory-count').textContent = `${state.products.length} piece${state.products.length === 1 ? '' : 's'}`;
  $('#nav-count').textContent = state.products.length;
}

function renderSearch(data) {
  const summary = $('#search-summary');
  summary.replaceChildren(node('span', 'summary-label', 'SEARCH UNDERSTOOD'));
  if (data.garment_type) summary.append(node('span', 'chip', data.garment_type.split('.').map(label).join(' / ')));
  Object.entries(data.preferences).forEach(([attribute, score]) => {
    summary.append(node('span', `chip${score < 0 ? ' negative' : ''}`, `${score < 0 ? 'Avoid ' : ''}${label(attribute)} ${Math.abs(score).toFixed(2)}`));
  });
  if (!data.garment_type && !Object.keys(data.preferences).length) summary.append(node('span', '', 'No specific attributes identified.'));
  summary.hidden = false;
  const container = $('#results');
  container.replaceChildren();
  data.results.forEach(item => container.append(productCard(item, true)));
  if (!data.results.length) {
    container.append(emptyState(state.products.length ? 'No pieces match this garment type' : 'Your inventory is empty', state.products.length ? 'Try a broader garment description or add a matching piece.' : 'Add your first piece, then run this search again.'));
  }
  $('#result-count').textContent = `${data.results.length} piece${data.results.length === 1 ? '' : 's'} found`;
}

async function loadProducts() {
  const data = await api('/api/products');
  state.products = data.products;
  renderInventory();
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('#inventory-add').addEventListener('click', () => showView('add'));
document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => {
  $('#query').value = button.dataset.query;
  $('#query').focus();
}));

$('#search-form').addEventListener('submit', async event => {
  event.preventDefault();
  const query = $('#query').value.trim();
  if (!query) return;
  const button = $('#search-form button[type=submit]');
  button.disabled = true;
  button.firstChild.textContent = 'Finding pieces… ';
  message('#search-message', '');
  try {
    const data = await api('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    state.lastSearch = data;
    renderSearch(data);
  } catch (error) { message('#search-message', error.message); }
  finally { button.disabled = false; button.firstChild.textContent = 'Find pieces '; }
});

$('#image').addEventListener('change', () => {
  const file = $('#image').files[0];
  const preview = $('#upload-preview');
  preview.replaceChildren();
  if (!file) return;
  const image = document.createElement('img');
  image.src = URL.createObjectURL(file);
  image.alt = 'Selected product preview';
  image.onload = () => URL.revokeObjectURL(image.src);
  preview.append(image, node('small', '', file.name));
});

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

$('#add-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('#image').files[0];
  if (!file) return message('#add-message', 'Choose a product image.');
  if (file.size > 8 * 1024 * 1024) return message('#add-message', 'The image must be 8 MB or smaller.');
  const button = $('#add-submit');
  button.disabled = true;
  button.firstChild.textContent = 'Analyzing image… ';
  message('#add-message', '');
  try {
    const image = await readDataUrl(file);
    const result = await api('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#product-name').value, description: $('#description').value, image }) });
    state.products.unshift(result.product);
    renderInventory();
    $('#add-form').reset();
    $('#upload-preview').replaceChildren(node('span', 'upload-glyph', '↥'), node('strong', '', 'Choose an image'), node('small', '', 'JPEG, PNG or WebP · up to 8 MB'));
    message('#add-message', `“${result.product.name}” added and classified.`, true);
  } catch (error) { message('#add-message', error.message); }
  finally { button.disabled = false; button.firstChild.textContent = 'Analyze & add to inventory '; }
});

async function initialize() {
  try {
    const health = await api('/api/health');
    const status = $('#api-status');
    status.classList.add(health.api_key_configured ? 'ready' : 'missing');
    status.lastChild.textContent = health.api_key_configured ? ` API connected · ${health.attribute_count} attributes` : ' Set OPENAI_API_KEY to begin';
    await loadProducts();
  } catch (error) {
    message('#search-message', error.message);
    message('#add-message', error.message);
  }
}
initialize();
