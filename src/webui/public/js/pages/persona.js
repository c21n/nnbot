// ── Persona Page ──
import toast from '../toast.js';
import { esc } from '../utils.js';

export function initPersona(data) {
  renderPersona(data);
}

export function renderPersona(data) {
  const defaultEl = document.getElementById('persona-default');
  if (defaultEl) defaultEl.value = data.default || '';

  const container = document.getElementById('persona-users');
  if (!container) return;

  container.innerHTML = '';
  const users = data.users || {};
  Object.entries(users).forEach(([userId, content]) => {
    container.appendChild(createPersonaRow(userId, content));
  });
}

function createPersonaRow(userId, content) {
  const row = document.createElement('div');
  row.className = 'persona-row';
  row.innerHTML = `
    <div class="persona-row-header">
      <input class="form-input" type="text" value="${esc(userId)}" placeholder="User ID" style="flex:1">
      <button class="btn btn-sm btn-danger" onclick="this.closest('.persona-row').remove()">删除</button>
    </div>
    <textarea class="form-textarea" rows="3" placeholder="人格设定">${esc(content)}</textarea>
  `;
  return row;
}

function addUser() {
  const container = document.getElementById('persona-users');
  if (!container) return;
  container.appendChild(createPersonaRow('', ''));
}

export function collectPersona() {
  const defaultPersona = document.getElementById('persona-default')?.value || '';

  const users = {};
  document.querySelectorAll('#persona-users .persona-row').forEach(row => {
    const userId = row.querySelector('input')?.value?.trim();
    const content = row.querySelector('textarea')?.value?.trim();
    if (userId && content) users[userId] = content;
  });

  return { default: defaultPersona, users };
}

// Expose to window for onclick handlers
window._persona = {
  add: addUser,
};
