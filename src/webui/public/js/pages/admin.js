// ── Admin Page ──
import { esc } from '../utils.js';

export function initAdmin(config) {
  renderList('admin-userIds', config.admin?.userIds ?? []);
  renderList('admin-commands', config.admin?.commands ?? []);
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
    <button class="btn-remove" onclick="window._admin.remove('${containerId}', ${index})">×</button>
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
  Array.from(container.children).forEach((row, i) => {
    const btn = row.querySelector('.btn-remove');
    if (btn) btn.setAttribute('onclick', `window._admin.remove('${containerId}', ${i})`);
  });
}

export function collectAdmin() {
  return {
    userIds: getListValues('admin-userIds'),
    commands: getListValues('admin-commands'),
  };
}

function getListValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input'))
    .map(el => el.value)
    .filter(v => v.trim());
}

// Expose to window for onclick handlers
window._admin = {
  add: addItem,
  remove: removeItem,
};
