// ── App Entry Point ──
import router from './router.js';
import API from './api.js';
import toast from './toast.js';
import { initDashboard, destroyDashboard } from './pages/dashboard.js';
import { initProviders, updateProvidersConfig, collectProviders, collectDefaults } from './pages/providers.js';
import { initPersona, collectPersona } from './pages/persona.js';
import { initMemory, collectMemory } from './pages/memory.js';
import { initMemoryData } from './pages/memory-data.js';
import { initPlugins, collectPlugins } from './pages/plugins.js';
import { initRules, collectRules } from './pages/rules.js';
import { initSearch, collectSearch } from './pages/search.js';
import { initAdmin, collectAdmin } from './pages/admin.js';
import { initSettings, renderSettings, collectSettings } from './pages/settings.js';

// ── Global State ──
let config = {};
let persona = { default: '', users: {} };

// Make config accessible globally for memory page
window._config = config;

// ── Initialize App ──
async function init() {
  setupMobileMenu();
  setupSaveButton();
  registerRoutes();
  router.init();
  await loadConfig();
}

// ── Mobile Menu ──
function setupMobileMenu() {
  const btn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (btn) {
    btn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  // Sidebar item click handlers
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) {
        router.navigate(page);
      }
    });
  });

  // Close sidebar on navigation (mobile)
  router.onChange = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
  };
}

// ── Save Button ──
function setupSaveButton() {
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.addEventListener('click', saveConfig);
  }

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', loadConfig);
  }
}

// ── Routes ──
function registerRoutes() {
  router.register('dashboard', () => {
    initDashboard();
  });

  router.register('providers', () => {
    initProviders(config);
  });

  router.register('persona', () => {
    initPersona(persona);
  });

  router.register('memory', () => {
    initMemory(config);
  });

  router.register('memory-data', () => {
    initMemoryData();
  });

  router.register('plugins', () => {
    initPlugins(config);
  });

  router.register('rules', () => {
    initRules(config);
  });

  router.register('search', () => {
    initSearch(config);
  });

  router.register('admin', () => {
    initAdmin(config);
  });

  router.register('settings', () => {
    initSettings(config);
  });

  router.register('marketplace', () => {
    // Initialize marketplace when page is activated
    if (window._marketplace && window._marketplace.init) {
      window._marketplace.init();
    }
  });
}

// ── Load Config ──
async function loadConfig() {
  try {
    const [configData, personaData] = await Promise.all([
      API.getConfig(),
      API.getPersona(),
    ]);

    config = configData;
    persona = personaData;
    window._config = config;

    // Render current page
    const page = router.getCurrentPage();
    if (page === 'providers') initProviders(config);
    else if (page === 'persona') initPersona(persona);
    else if (page === 'memory') initMemory(config);
    else if (page === 'plugins') initPlugins(config);
    else if (page === 'rules') initRules(config);
    else if (page === 'search') initSearch(config);
    else if (page === 'admin') initAdmin(config);
    else if (page === 'settings') renderSettings(config);
    else if (page === 'marketplace' && window._marketplace) {
      window._marketplace.init();
    }

    // Update header status
    const statusEl = document.getElementById('header-status');
    if (statusEl) statusEl.textContent = '已连接';

    toast.success('配置加载成功');
  } catch (e) {
    toast.error('加载失败: ' + e.message);
    const statusEl = document.getElementById('header-status');
    if (statusEl) statusEl.textContent = '连接失败';
  }
}

// ── Save Config ──
async function saveConfig() {
  const btn = document.getElementById('save-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '保存中...';
  }

  try {
    const settings = collectSettings();
    const providers = collectProviders();
    const defaults = collectDefaults();
    const plugins = collectPlugins();
    const admin = collectAdmin();
    const rules = collectRules();
    const memory = collectMemory();
    const search = collectSearch();
    const personaData = collectPersona();

    // Only update providers if there are provider cards on the page
    const hasProviderCards = document.querySelectorAll('.provider-card').length > 0;
    const providersConfig = hasProviderCards
      ? { list: providers, defaults }
      : config.providers; // Preserve existing providers if no cards

    const newConfig = {
      ...settings,
      llm: config.llm, // Preserve existing LLM config
      providers: providersConfig,
      plugins,
      admin,
      rules,
      memory,
      tools: { search },
    };

    await Promise.all([
      API.saveConfig(newConfig),
      API.savePersona(personaData),
    ]);

    config = newConfig;
    persona = personaData;
    window._config = config;

    toast.success('配置已保存');
  } catch (e) {
    toast.error('保存失败: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  }
}

// ── Start ──
document.addEventListener('DOMContentLoaded', init);
