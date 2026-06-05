// ── Dashboard Page ──
import API from '../api.js';
import toast from '../toast.js';

let healthInterval = null;

export function initDashboard() {
  loadHealth();
  loadRecentUsers();

  // Auto-refresh health every 30s
  healthInterval = setInterval(loadHealth, 30000);
}

export function destroyDashboard() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
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
