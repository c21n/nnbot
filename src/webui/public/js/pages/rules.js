// ── Rules Page ──
import { esc } from '../utils.js';

export function initRules(config) {
  renderRules(config.rules ?? []);
}

export function renderRules(rules) {
  const container = document.getElementById('rules-list');
  if (!container) return;

  container.innerHTML = '';
  rules.forEach((rule, i) => {
    container.appendChild(createRuleRow(i, rule.pattern, rule.reply));
  });
}

function createRuleRow(index, pattern, reply) {
  const row = document.createElement('div');
  row.className = 'rule-row';
  row.innerHTML = `
    <input class="form-input" type="text" placeholder="正则表达式" value="${esc(pattern ?? '')}">
    <input class="form-input" type="text" placeholder="回复内容" value="${esc(reply ?? '')}">
    <button class="btn-remove" onclick="window._rules.remove(${index})">×</button>
  `;
  return row;
}

function addRule() {
  const container = document.getElementById('rules-list');
  if (!container) return;
  const index = container.children.length;
  container.appendChild(createRuleRow(index, '', ''));
}

function removeRule(index) {
  const container = document.getElementById('rules-list');
  if (!container) return;
  container.children[index]?.remove();
  Array.from(container.children).forEach((row, i) => {
    const btn = row.querySelector('.btn-remove');
    if (btn) btn.setAttribute('onclick', `window._rules.remove(${i})`);
  });
}

export function collectRules() {
  const container = document.getElementById('rules-list');
  if (!container) return [];

  const rules = [];
  container.querySelectorAll('.rule-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const pattern = inputs[0]?.value?.trim();
    const reply = inputs[1]?.value?.trim();
    if (pattern && reply) rules.push({ pattern, reply });
  });
  return rules;
}

// Expose to window for onclick handlers
window._rules = {
  add: addRule,
  remove: removeRule,
};
