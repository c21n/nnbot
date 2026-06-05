// ── Utility Functions ──

/**
 * Escape HTML to prevent XSS
 */
export function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Set input value safely
 */
export function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

/**
 * Get input value
 */
export function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

/**
 * Get number input value
 */
export function getNum(id, fallback = 0) {
  const val = getVal(id);
  return val ? (parseInt(val) || fallback) : fallback;
}

/**
 * Get float input value
 */
export function getFloat(id, fallback = 0) {
  const val = getVal(id);
  return val ? (parseFloat(val) || fallback) : fallback;
}

/**
 * Get checkbox value
 */
export function getChecked(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

/**
 * Create element with attributes
 */
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === 'className') {
      el.className = val;
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (key.startsWith('on')) {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'innerHTML') {
      el.innerHTML = val;
    } else if (key === 'textContent') {
      el.textContent = val;
    } else {
      el.setAttribute(key, val);
    }
  });
  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  });
  return el;
}

/**
 * Confirm dialog (returns Promise)
 */
export function confirm(message) {
  return window.confirm(message);
}

/**
 * Format date
 */
export function formatDate(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return d.toLocaleString('zh-CN');
}

/**
 * Debounce function
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
