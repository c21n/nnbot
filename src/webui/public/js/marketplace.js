/**
 * Marketplace JavaScript
 *
 * Handles marketplace page interactions.
 * Uses /api/marketplace/* endpoints served by the NNBot backend.
 */

(function() {
  'use strict';

  // XSS protection — escape HTML entities before inserting into innerHTML
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // State
  let currentCategory = '';
  let currentPlugins = [];

  // DOM Elements
  const searchInput = document.getElementById('marketplace-search');
  const categoriesContainer = document.getElementById('marketplace-categories');
  const popularContainer = document.getElementById('marketplace-popular');
  const recommendedContainer = document.getElementById('marketplace-recommended');
  const searchResultsContainer = document.getElementById('marketplace-search-results');
  const resultsContainer = document.getElementById('marketplace-results');
  const detailModal = document.getElementById('marketplace-detail-modal');
  const installedModal = document.getElementById('marketplace-installed-modal');
  const publishModal = document.getElementById('marketplace-publish-modal');

  // API Client — uses relative paths (same origin as WebUI)
  const api = {
    async request(url, options = {}) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
      } catch (err) {
        console.error('[Marketplace] API request failed:', err);
        throw err;
      }
    },

    async getPlugins(params = {}) {
      const searchParams = new URLSearchParams();
      if (params.q) searchParams.set('q', params.q);
      if (params.sort) searchParams.set('sort', params.sort);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      const qs = searchParams.toString();
      const response = await this.request(`/api/marketplace/plugins${qs ? '?' + qs : ''}`);
      return response.data || [];
    },

    async getPluginDetail(pluginId) {
      try {
        const response = await this.request(`/api/marketplace/plugins/${encodeURIComponent(pluginId)}`);
        return response.data || null;
      } catch (err) {
        if (err.message.includes('404')) return null;
        throw err;
      }
    },

    async getInstalledPlugins() {
      try {
        const response = await this.request('/api/marketplace/installed');
        return response.data || [];
      } catch {
        return [];
      }
    },

    async installPlugin(pluginId) {
      const response = await this.request('/api/marketplace/install', {
        method: 'POST',
        body: JSON.stringify({ plugin_id: pluginId }),
      });
      return response;
    },

    async uninstallPlugin(pluginId) {
      const response = await this.request('/api/marketplace/uninstall', {
        method: 'POST',
        body: JSON.stringify({ plugin_id: pluginId }),
      });
      return response;
    },

    async updatePlugin(pluginId) {
      const response = await this.request('/api/marketplace/update', {
        method: 'POST',
        body: JSON.stringify({ plugin_id: pluginId }),
      });
      return response;
    },

    async togglePlugin(pluginId, enabled) {
      const response = await this.request('/api/marketplace/toggle', {
        method: 'POST',
        body: JSON.stringify({ plugin_id: pluginId, enabled }),
      });
      return response;
    },
  };

  // Helper functions
  function formatNumber(num) {
    if (num == null) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '未知';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function createPluginCard(plugin) {
    const icon = esc(plugin.logo || '📦');
    const displayName = esc(plugin.display_name || plugin.name);
    const stars = plugin.stars ?? 0;
    const id = esc(plugin.id);
    return `
      <div class="marketplace-plugin-card" data-plugin-id="${id}" onclick="window._marketplace.showDetail('${id}')">
        <div class="marketplace-plugin-header">
          <div class="marketplace-plugin-icon">${icon}</div>
          <div class="marketplace-plugin-info">
            <div class="marketplace-plugin-name">${displayName}</div>
            <div class="marketplace-plugin-author">by ${esc(plugin.author || '未知')}</div>
          </div>
        </div>
        <div class="marketplace-plugin-description">${esc(plugin.description || '暂无描述')}</div>
        <div class="marketplace-plugin-meta">
          <span>v${esc(plugin.version || '?')}</span>
          <div class="marketplace-plugin-stats">
            <span class="marketplace-plugin-stat">⭐ ${formatNumber(stars)}</span>
            ${plugin.category ? `<span class="marketplace-plugin-stat">${esc(plugin.category)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderPlugins(container, plugins) {
    if (plugins.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">暂无插件</div>';
      return;
    }
    container.innerHTML = plugins.map(createPluginCard).join('');
  }

  // Load popular plugins (sorted by stars)
  async function loadPopular() {
    try {
      const plugins = await api.getPlugins({ sort: 'popular', limit: 8 });
      renderPlugins(popularContainer, plugins);
    } catch (err) {
      popularContainer.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">加载失败</div>';
    }
  }

  // Load recommended plugins (pinned first, then by stars)
  async function loadRecommended() {
    try {
      const plugins = await api.getPlugins({ sort: 'recommended', limit: 8 });
      renderPlugins(recommendedContainer, plugins);
    } catch (err) {
      recommendedContainer.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">加载失败</div>';
    }
  }

  // Search plugins
  async function searchPlugins(query) {
    if (!query && !currentCategory) {
      searchResultsContainer.style.display = 'none';
      return;
    }

    searchResultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

    try {
      const plugins = await api.getPlugins({
        q: query || currentCategory,
        limit: 20,
      });
      renderPlugins(resultsContainer, plugins);
    } catch (err) {
      resultsContainer.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">搜索失败</div>';
    }
  }

  // Show plugin detail
  async function showDetail(pluginId) {
    detailModal.style.display = 'flex';
    const title = document.getElementById('marketplace-detail-title');
    const content = document.getElementById('marketplace-detail-content');
    title.textContent = '加载中...';
    content.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

    try {
      const plugin = await api.getPluginDetail(pluginId);
      if (!plugin) {
        title.textContent = '插件未找到';
        content.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">插件不存在</div>';
        return;
      }

      const displayName = esc(plugin.display_name || plugin.name);
      const icon = esc(plugin.logo || '📦');
      const stars = plugin.stars ?? 0;
      const id = esc(plugin.id);

      title.textContent = displayName;
      content.innerHTML = `
        <div class="marketplace-detail-header">
          <div class="marketplace-detail-icon">${icon}</div>
          <div class="marketplace-detail-info">
            <div class="marketplace-detail-name">${displayName}</div>
            <div class="marketplace-detail-meta">
              <span>by ${esc(plugin.author || '未知')}</span>
              <span>v${esc(plugin.version || '?')}</span>
              <span>⭐ ${formatNumber(stars)} stars</span>
              ${plugin.category ? `<span>📂 ${esc(plugin.category)}</span>` : ''}
              <span>📅 ${formatDate(plugin.updated_at)}</span>
            </div>
            <div class="marketplace-detail-actions">
              <button class="btn btn-primary" onclick="window._marketplace.install('${id}')">安装</button>
              ${plugin.repo ? `<button class="btn btn-secondary" onclick="window.open('${esc(plugin.repo)}', '_blank')">仓库</button>` : ''}
            </div>
          </div>
        </div>

        <div class="marketplace-tabs">
          <div class="marketplace-tab active" data-tab="description">描述</div>
          <div class="marketplace-tab" data-tab="info">详情</div>
        </div>

        <div class="marketplace-tab-content active" id="tab-description">
          <p style="color:var(--text-secondary);line-height:1.6">${esc(plugin.description || '暂无描述')}</p>
          ${plugin.tags && plugin.tags.length > 0
            ? `<div style="margin-top:var(--space-4);display:flex;gap:var(--space-2);flex-wrap:wrap">
                ${plugin.tags.map(t => `<span style="background:var(--bg-secondary);padding:2px 8px;border-radius:4px;font-size:0.85em">${esc(t)}</span>`).join('')}
              </div>`
            : ''
          }
        </div>

        <div class="marketplace-tab-content" id="tab-info">
          <table style="width:100%;color:var(--text-secondary)">
            <tr><td style="padding:4px 8px;font-weight:bold">插件 ID</td><td>${id}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">名称</td><td>${esc(plugin.name)}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">版本</td><td>${esc(plugin.version || '未知')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">作者</td><td>${esc(plugin.author || '未知')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">仓库</td><td>${plugin.repo ? `<a href="${esc(plugin.repo)}" target="_blank">${esc(plugin.repo)}</a>` : '未知'}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">分类</td><td>${esc(plugin.category || '未分类')}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">最后更新</td><td>${formatDate(plugin.updated_at)}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold">NNBot 版本</td><td>${esc(plugin.nnbot_version || '未知')}</td></tr>
          </table>
        </div>
      `;

      // Setup tabs
      content.querySelectorAll('.marketplace-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          content.querySelectorAll('.marketplace-tab').forEach(t => t.classList.remove('active'));
          content.querySelectorAll('.marketplace-tab-content').forEach(c => c.classList.remove('active'));
          tab.classList.add('active');
          document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
      });
    } catch (err) {
      title.textContent = '加载失败';
      content.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">加载插件详情失败</div>';
    }
  }

  // Show installed plugins
  async function showInstalled() {
    installedModal.style.display = 'flex';
    const content = document.getElementById('marketplace-installed-content');
    content.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

    try {
      const plugins = await api.getInstalledPlugins();
      if (plugins.length === 0) {
        content.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">暂无已安装插件</div>';
        return;
      }

      content.innerHTML = `
        <div class="marketplace-installed-list">
          ${plugins.map(p => {
            const pid = esc(p.pluginId);
            return `
            <div class="marketplace-installed-item">
              <div class="marketplace-installed-info">
                <span class="marketplace-installed-status">${p.enabled ? '✅' : '⏸️'}</span>
                <div>
                  <span class="marketplace-installed-name">${esc(p.name)}</span>
                  <span class="marketplace-installed-version">v${esc(p.version)}</span>
                </div>
              </div>
              <div class="marketplace-installed-actions">
                <button class="btn btn-sm btn-secondary" onclick="window._marketplace.toggle('${pid}', ${p.enabled})">${p.enabled ? '禁用' : '启用'}</button>
                <button class="btn btn-sm btn-danger" onclick="window._marketplace.uninstall('${pid}')">卸载</button>
              </div>
            </div>
          `}).join('')}
        </div>
      `;
    } catch (err) {
      content.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">加载失败</div>';
    }
  }

  // Install plugin
  async function install(pluginId) {
    try {
      const result = await api.installPlugin(pluginId);
      if (result.success) {
        alert(result.message);
        closeDetail();
      } else {
        alert('安装失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      alert('安装失败: ' + err.message);
    }
  }

  // Uninstall plugin
  async function uninstall(pluginId) {
    if (!confirm(`确定要卸载 ${pluginId} 吗？`)) return;

    try {
      const result = await api.uninstallPlugin(pluginId);
      if (result.success) {
        alert(result.message);
        showInstalled();
      } else {
        alert('卸载失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      alert('卸载失败: ' + err.message);
    }
  }

  // Update plugin
  async function update(pluginId) {
    try {
      const result = await api.updatePlugin(pluginId);
      if (result.success) {
        alert(result.message);
        showInstalled();
      } else {
        alert('更新失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      alert('更新失败: ' + err.message);
    }
  }

  // Toggle plugin
  async function toggle(pluginId, currentlyEnabled) {
    try {
      const result = await api.togglePlugin(pluginId, !currentlyEnabled);
      if (result.success) {
        showInstalled();
      } else {
        alert('操作失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  }

  // Close modals
  function closeDetail() {
    detailModal.style.display = 'none';
  }

  function closeInstalled() {
    installedModal.style.display = 'none';
  }

  function closePublish() {
    publishModal.style.display = 'none';
  }

  function showPublish() {
    publishModal.style.display = 'flex';
  }

  // Setup event listeners
  function setupEventListeners() {
    // Search
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchPlugins(searchInput.value.trim());
      }
    });

    // Categories
    categoriesContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('marketplace-category')) {
        categoriesContainer.querySelectorAll('.marketplace-category').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        currentCategory = e.target.dataset.category;
        searchPlugins(searchInput.value.trim());
      }
    });

    // Publish form
    const publishForm = document.getElementById('marketplace-publish-form');
    if (publishForm) {
      publishForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        alert('发布功能需要配置市场服务器');
        closePublish();
      });
    }

    // Close modals on outside click
    [detailModal, installedModal, publishModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.style.display = 'none';
          }
        });
      }
    });
  }

  // Public API
  window._marketplace = {
    search: () => searchPlugins(searchInput.value.trim()),
    showDetail,
    showInstalled,
    showPublish,
    closeDetail,
    closeInstalled,
    closePublish,
    install,
    uninstall,
    update,
    toggle,
    init,
  };

  // Initialize
  let initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    setupEventListeners();
    loadPopular();
    loadRecommended();
  }

  // Don't auto-init - wait for route activation
})();
