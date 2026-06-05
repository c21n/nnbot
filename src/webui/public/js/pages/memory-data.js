// ── Memory Data Page ──
import API from '../api.js';
import toast from '../toast.js';
import { esc, confirm } from '../utils.js';

export function initMemoryData() {
  loadUsers();

  // User selector change handler
  const userSelect = document.getElementById('memdata-userId');
  if (userSelect) {
    userSelect.addEventListener('change', onUserChange);
  }

  // Filter change handler
  const filterSelect = document.getElementById('memdata-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', loadMemories);
  }
}

async function loadUsers() {
  try {
    const users = await API.getUsers();
    const select = document.getElementById('memdata-userId');
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="">-- 请选择用户 --</option>';
    users.forEach(u => {
      select.innerHTML += `<option value="${u.userId}">${u.userId} (${u.lastSeenAtStr || '-'})</option>`;
    });
    if (current) select.value = current;
  } catch (e) {
    toast.error('加载用户列表失败: ' + e.message);
  }
}

async function onUserChange() {
  const userId = document.getElementById('memdata-userId')?.value;
  const statsEl = document.getElementById('memdata-stats');
  const actionsEl = document.getElementById('memdata-actions');
  const listEl = document.getElementById('memdata-list');

  if (!userId) {
    if (statsEl) statsEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    return;
  }

  await loadStats(userId);
  if (statsEl) statsEl.style.display = 'flex';
  if (actionsEl) actionsEl.style.display = 'flex';
  await loadMemories();
}

async function loadStats(userId) {
  try {
    const data = await API.getStats(userId);
    const totalEl = document.getElementById('memdata-statTotal');
    const typesEl = document.getElementById('memdata-statTypes');

    if (totalEl) totalEl.textContent = data.total;

    if (typesEl) {
      const labels = { summary: '摘要', preference: '偏好', event: '事件', context: '上下文' };
      typesEl.innerHTML = Object.entries(data.byType).map(([type, count]) => `
        <div class="stat-card" style="padding:var(--space-3)">
          <div class="stat-value" style="font-size:var(--text-xl)">${count}</div>
          <div class="stat-label">${labels[type] ?? type}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    toast.error('加载统计失败: ' + e.message);
  }
}

async function loadMemories() {
  const userId = document.getElementById('memdata-userId')?.value;
  const type = document.getElementById('memdata-filter')?.value;
  if (!userId) return;

  const listEl = document.getElementById('memdata-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> 加载中...</div>';

  try {
    const memories = await API.getMemories(userId, type);

    if (memories.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>暂无数据</p></div>';
      return;
    }

    listEl.innerHTML = memories.map(mem => `
      <div class="mem-card" data-id="${mem.id}">
        <div class="mem-card-header">
          <div class="mem-card-meta">
            <span class="type-badge ${mem.type}">${mem.type}</span>
            <span>创建: ${mem.createdAtStr || '-'}</span>
            <span>重要度: ${mem.importance}</span>
            <span>访问: ${mem.accessCount}次</span>
            ${mem.keywords?.length ? `<span>关键词: ${mem.keywords.join(', ')}</span>` : ''}
          </div>
          <button class="btn btn-sm btn-danger" onclick="window._memdata.delete('${mem.id}', this)">删除</button>
        </div>
        <div class="mem-card-text collapsed" onclick="this.classList.toggle('collapsed')">${esc(mem.text)}</div>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><p>加载失败: ${esc(e.message)}</p></div>`;
  }
}

async function deleteMemory(id, btn) {
  if (!confirm('确认删除这条记忆？')) return;

  try {
    await API.deleteMemory(id);
    const card = btn.closest('.mem-card');
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 200);
    toast.success('已删除');

    // Refresh stats
    const userId = document.getElementById('memdata-userId')?.value;
    if (userId) loadStats(userId);
  } catch (e) {
    toast.error('删除失败: ' + e.message);
  }
}

async function exportData() {
  const userId = document.getElementById('memdata-userId')?.value;
  if (!userId) return;

  try {
    const blob = await API.exportUserData(userId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-export-${userId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  } catch (e) {
    toast.error('导出失败: ' + e.message);
  }
}

async function deleteAllData() {
  const userId = document.getElementById('memdata-userId')?.value;
  if (!userId) return;

  if (!confirm(`⚠️ 确认清空用户 ${userId} 的所有记忆数据？\n此操作不可撤销！`)) return;
  if (!confirm('再次确认：删除后无法恢复，确定继续？')) return;

  try {
    const data = await API.deleteUserData(userId);
    toast.success(`已清空：删除 ${data.memoriesDeleted} 条记忆，${data.messagesDeleted} 条消息`);

    loadStats(userId);
    loadMemories();
    loadUsers();
  } catch (e) {
    toast.error('清空失败: ' + e.message);
  }
}

// Expose to window for onclick handlers
window._memdata = {
  delete: deleteMemory,
  export: exportData,
  deleteAll: deleteAllData,
  refresh: loadUsers,
};
