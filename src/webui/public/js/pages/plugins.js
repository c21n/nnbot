// ── Plugins Page ──
import toast from '../toast.js';
import { esc } from '../utils.js';

export function initPlugins(config) {
  renderPlugins(config);
}

export function renderPlugins(config) {
  renderList('plugins-enabled', config.plugins?.enabled ?? []);
  renderList('plugins-disabled', config.plugins?.disabled ?? []);
}

export function collectPlugins() {
  return {
    enabled: getListValues('plugins-enabled'),
    disabled: getListValues('plugins-disabled'),
  };
}

function renderList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  items.forEach((item, i) => {
    container.appendChild(createListRow(containerId, i, item));
  });
}

function createListRow(containerId, index, value) {
  const row = document.createElement('div');
  row.className = 'list-row';
  row.innerHTML = `
    <input class="form-input" type="text" value="${esc(value)}">
    <button class="btn-remove" onclick="window._plugins.remove('${containerId}', ${index})">×</button>
  `;
  return row;
}

function addItem(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const index = container.children.length;
  container.appendChild(createListRow(containerId, index, ''));
}

function removeItem(containerId, index) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.children[index]?.remove();
  // Re-index onclick handlers
  Array.from(container.children).forEach((row, i) => {
    const btn = row.querySelector('.btn-remove');
    if (btn) btn.setAttribute('onclick', `window._plugins.remove('${containerId}', ${i})`);
  });
}

function getListValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input'))
    .map(el => el.value)
    .filter(v => v.trim());
}

// Expose to window for onclick handlers
window._plugins = {
  add: addItem,
  remove: removeItem,
};
