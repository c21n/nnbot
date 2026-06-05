/**
 * Marketplace JavaScript
 *
 * Handles marketplace page interactions.
 */

(function() {
  'use strict';

  // Marketplace API configuration
  const MARKETPLACE_API = window.MARKETPLACE_API_URL || 'http://localhost:3001';
  console.log('[Marketplace] API URL:', MARKETPLACE_API);

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

  // API Client
  const api = {
    async request(url, options = {}) {
      console.log('[Marketplace] Requesting:', url);
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
        console.log('[Marketplace] Response status:', response.status);
        const data = await response.json();
        console.log('[Marketplace] Response data:', data);
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
      } catch (err) {
        console.error('[Marketplace] API request failed:', err);
        throw err;
      }
    },

    async searchPlugins(query, filters = {}) {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (filters.category) params.set('category', filters.category);
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.limit) params.set('limit', filters.limit.toString());
      const response = await this.request(`${MARKETPLACE_API}/api/search?${params.toString()}`);
      return response.data || [];
    },

    async getPopularPlugins(limit = 8) {
      const response = await this.request(`${MARKETPLACE_API}/api/plugins/popular?limit=${limit}`);
      return response.data || [];
    },

    async getRecommendedPlugins(limit = 8) {
      const response = await this.request(`${MARKETPLACE_API}/api/plugins/recommended?limit=${limit}`);
      return response.data || [];
    },

    async getPluginDetail(pluginId) {
      try {
        const response = await this.request(`${MARKETPLACE_API}/api/plugins/${encodeURIComponent(pluginId)}`);
        return response.data || null;
      } catch (err) {
        if (err.message.includes('404')) return null;
        throw err;
      }
    },

    async getVersions(pluginId) {
      const response = await this.request(`${MARKETPLACE_API}/api/plugins/${encodeURIComponent(pluginId)}/versions`);
      return response.data || [];
    },

    async getInstalledPlugins() {
      // This would call NNBot's internal API
      // For now, return empty array
      return [];
    },

    async installPlugin(pluginId, version) {
      // This would call NNBot's internal API
      return { success: true, message: `Plugin ${pluginId} installed` };
    },

    async uninstallPlugin(pluginId) {
      // This would call NNBot's internal API
      return { success: true, message: `Plugin ${pluginId} uninstalled` };
    },

    async updatePlugin(pluginId) {
      // This would call NNBot's internal API
      return { success: true, message: `Plugin ${pluginId} updated` };
    },
  };

  // Helper functions
  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function createPluginCard(plugin) {
    return `
      <div class="marketplace-plugin-card" onclick="window._marketplace.showDetail('${plugin.id}')">
        <div class="marketplace-plugin-header">
          <div class="marketplace-plugin-icon">${plugin.icon || '📦'}</div>
          <div class="marketplace-plugin-info">
            <div class="marketplace-plugin-name">${plugin.displayName}</div>
            <div class="marketplace-plugin-author">by ${plugin.author}</div>
          </div>
        </div>
        <div class="marketplace-plugin-description">${plugin.description || '暂无描述'}</div>
        <div class="marketplace-plugin-meta">
          <span>v${plugin.version}</span>
          <div class="marketplace-plugin-stats">
            <span class="marketplace-plugin-stat">⬇️ ${formatNumber(plugin.downloads)}</span>
            <span class="marketplace-plugin-stat">⭐ ${plugin.rating.toFixed(1)}</span>
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

  // Load popular plugins
  async function loadPopular() {
    try {
      const plugins = await api.getPopularPlugins(8);
      renderPlugins(popularContainer, plugins);
    } catch (err) {
      popularContainer.innerHTML = '<div style="text-align:center;padding:var(--space-6);color:var(--text-muted)">加载失败</div>';
    }
  }

  // Load recommended plugins
  async function loadRecommended() {
    try {
      const plugins = await api.getRecommendedPlugins(8);
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
      const plugins = await api.searchPlugins(query, {
        category: currentCategory,
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

      title.textContent = plugin.displayName;
      content.innerHTML = `
        <div class="marketplace-detail-header">
          <div class="marketplace-detail-icon">${plugin.icon || '📦'}</div>
          <div class="marketplace-detail-info">
            <div class="marketplace-detail-name">${plugin.displayName}</div>
            <div class="marketplace-detail-meta">
              <span>by ${plugin.author}</span>
              <span>v${plugin.version}</span>
              <span>⭐ ${plugin.rating.toFixed(1)} (${plugin.ratingCount} 评价)</span>
              <span>⬇️ ${formatNumber(plugin.downloads)} 下载</span>
              <span>${plugin.license || '未知许可证'}</span>
            </div>
            <div class="marketplace-detail-actions">
              <button class="btn btn-primary" onclick="window._marketplace.install('${plugin.id}')">安装</button>
              ${plugin.homepage ? `<button class="btn btn-secondary" onclick="window.open('${plugin.homepage}', '_blank')">主页</button>` : ''}
              ${plugin.repository ? `<button class="btn btn-secondary" onclick="window.open('${plugin.repository}', '_blank')">仓库</button>` : ''}
            </div>
          </div>
        </div>

        <div class="marketplace-tabs">
          <div class="marketplace-tab active" data-tab="description">描述</div>
          <div class="marketplace-tab" data-tab="versions">版本</div>
          <div class="marketplace-tab" data-tab="dependencies">依赖</div>
        </div>

        <div class="marketplace-tab-content active" id="tab-description">
          <p style="color:var(--text-secondary);line-height:1.6">${plugin.description || '暂无描述'}</p>
          ${plugin.readme ? `<div style="margin-top:var(--space-4);white-space:pre-wrap;color:var(--text-secondary)">${plugin.readme}</div>` : ''}
        </div>

        <div class="marketplace-tab-content" id="tab-versions">
          <div class="loading-overlay"><div class="spinner"></div></div>
        </div>

        <div class="marketplace-tab-content" id="tab-dependencies">
          ${plugin.dependencies && plugin.dependencies.length > 0
            ? `<ul style="list-style:none">${plugin.dependencies.map(dep => `
                <li style="padding:var(--space-2) 0;border-bottom:1px solid var(--border)">
                  <a href="#" onclick="window._marketplace.showDetail('${dep.pluginId}');return false">${dep.pluginId}</a>
                  <span style="color:var(--text-muted);margin-left:var(--space-2)">${dep.versionRange}</span>
                  ${dep.optional ? '<span style="color:var(--text-muted);margin-left:var(--space-2)">(可选)</span>' : ''}
                </li>
              `).join('')}</ul>`
            : '<div style="color:var(--text-muted)">无依赖</div>'
          }
        </div>
      `;

      // Load versions
      loadVersions(pluginId);

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

  // Load versions
  async function loadVersions(pluginId) {
    const container = document.getElementById('tab-versions');
    try {
      const versions = await api.getVersions(pluginId);
      if (versions.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted)">暂无版本</div>';
        return;
      }
      container.innerHTML = `
        <ul class="marketplace-versions-list">
          ${versions.map(v => `
            <li class="marketplace-version-item">
              <div>
                <div class="marketplace-version-info">
                  <span class="marketplace-version-tag">${v.version}</span>
                  <span class="marketplace-version-date">${formatDate(v.releasedAt)}</span>
                </div>
                ${v.changelog ? `<div class="marketplace-version-changelog">${v.changelog}</div>` : ''}
              </div>
            </li>
          `).join('')}
        </ul>
      `;
    } catch (err) {
      container.innerHTML = '<div style="color:var(--text-muted)">加载版本失败</div>';
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
          ${plugins.map(p => `
            <div class="marketplace-installed-item">
              <div class="marketplace-installed-info">
                <span class="marketplace-installed-status">${p.enabled ? '✅' : '⏸️'}</span>
                <div>
                  <span class="marketplace-installed-name">${p.name}</span>
                  <span class="marketplace-installed-version">v${p.version}</span>
                  ${p.hasUpdate ? `<span class="marketplace-installed-update">(有更新: v${p.latestVersion})</span>` : ''}
                </div>
              </div>
              <div class="marketplace-installed-actions">
                ${p.hasUpdate ? `<button class="btn btn-sm btn-primary" onclick="window._marketplace.update('${p.pluginId}')">更新</button>` : ''}
                <button class="btn btn-sm btn-secondary" onclick="window._marketplace.toggle('${p.pluginId}', ${p.enabled})">${p.enabled ? '禁用' : '启用'}</button>
                <button class="btn btn-sm btn-danger" onclick="window._marketplace.uninstall('${p.pluginId}')">卸载</button>
              </div>
            </div>
          `).join('')}
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
    // This would call NNBot's internal API
    alert(`插件 ${pluginId} 已${currentlyEnabled ? '禁用' : '启用'}`);
    showInstalled();
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
        // This would call the marketplace API
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
    console.log('[Marketplace] Init called, initialized:', initialized);
    if (initialized) return;
    initialized = true;
    console.log('[Marketplace] Setting up event listeners and loading data...');
    setupEventListeners();
    loadPopular();
    loadRecommended();
  }

  // Don't auto-init - wait for route activation
})();
