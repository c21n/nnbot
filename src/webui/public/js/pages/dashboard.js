// ── Dashboard Page ──
import API from '../api.js';
import { esc } from '../utils.js';

let healthInterval = null;
let logInterval = null;

export function initDashboard() {
  destroyDashboard();
  loadHealth();
  loadRecentUsers();
  loadLogs();

  healthInterval = setInterval(loadHealth, 30000);
  logInterval = setInterval(loadLogs, 5000);

  const refreshButton = document.getElementById('logs-refresh');
  if (refreshButton) {
    refreshButton.onclick = () => {
      void loadLogs();
    };
  }
}

export function destroyDashboard() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
  if (logInterval) {
    clearInterval(logInterval);
    logInterval = null;
  }
}

async function loadHealth() {
  try {
    const data = await API.getHealth();
    const statusEl = document.getElementById('health-status');
    const uptimeEl = document.getElementById('health-uptime');

    if (statusEl) {
      statusEl.innerHTML = `
        <span class="status-dot"></span>
        <span>运行中</span>
      `;
    }
    if (uptimeEl) {
      uptimeEl.textContent = formatUptime(data.uptime);
    }
  } catch {
    const statusEl = document.getElementById('health-status');
    if (statusEl) {
      statusEl.innerHTML = `
        <span class="status-dot offline"></span>
        <span>离线</span>
      `;
    }
  }
}

async function loadRecentUsers() {
  try {
    const users = await API.getUsers();
    const container = document.getElementById('recent-users');
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无活跃用户</p></div>';
      return;
    }

    container.innerHTML = users.slice(0, 5).map(u => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)">
        <span style="font-family:var(--font-mono);font-size:var(--text-sm)">${u.userId}</span>
        <span style="font-size:var(--text-xs);color:var(--text-muted)">${u.lastSeenAtStr || '-'}</span>
      </div>
    `).join('');
  } catch {
    // Silently fail - dashboard is best-effort
  }
}

async function loadLogs() {
  const container = document.getElementById('system-logs');
  if (!container) return;

  try {
    const logs = await API.getLogs(100);
    if (logs.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无运行日志</p></div>';
      return;
    }

    container.innerHTML = logs.map(log => `
      <div class="log-row log-${esc(log.level)}">
        <span class="log-time">${esc(formatLogTime(log.timestamp))}</span>
        <span class="log-level">${esc(log.level.toUpperCase())}</span>
        <span class="log-message">${esc(log.message)}</span>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="empty-state"><p>日志暂时无法加载</p></div>';
  }
}

function formatLogTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatUptime(seconds) {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (d > 0) parts.push(`${d}天`);
  if (h > 0) parts.push(`${h}小时`);
  if (m > 0) parts.push(`${m}分钟`);
  return parts.join(' ') || '刚刚启动';
}
