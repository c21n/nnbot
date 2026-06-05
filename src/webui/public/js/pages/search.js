// ── Search Page ──
import toast from '../toast.js';
import { setVal, getVal, getNum, getChecked } from '../utils.js';

const SEARCH_PROVIDERS = [
  { id: 'duckduckgo', name: 'DuckDuckGo', desc: '免费搜索', needsKey: false, free: '无限', registerUrl: null },
  { id: 'you', name: 'You.com', desc: 'AI 搜索', needsKey: false, free: '100/天', registerUrl: 'https://you.com/platform' },
  { id: 'brave', name: 'Brave', desc: '隐私搜索', needsKey: true, free: '1000/月', registerUrl: 'https://api.search.brave.com/' },
  { id: 'tavily', name: 'Tavily', desc: 'AI 优化搜索', needsKey: true, free: '1000/月', registerUrl: 'https://tavily.com' },
  { id: 'exa', name: 'Exa.ai', desc: '语义搜索', needsKey: true, free: '1000/月', registerUrl: 'https://exa.ai' },
  { id: 'serpapi', name: 'SerpAPI', desc: 'Google 搜索', needsKey: true, free: '100/月', registerUrl: 'https://serpapi.com' },
  { id: 'bing', name: 'Bing', desc: '微软搜索（已退役）', needsKey: true, free: '已退役', registerUrl: null },
  { id: 'google', name: 'Google', desc: 'Custom Search（已关闭）', needsKey: true, free: '已关闭注册', registerUrl: null },
];

export function initSearch(config) {
  renderSearch(config);
}

export function renderSearch(config) {
  const search = config.tools?.search;
  const enabled = search?.enabled ?? false;

  const checkbox = document.getElementById('search-enabled');
  if (checkbox) {
    checkbox.checked = enabled;
    toggleFields(enabled);
    checkbox.onchange = () => toggleFields(checkbox.checked);
  }

  setVal('search-provider', search?.provider || 'duckduckgo');
  setVal('search-fallback', search?.fallback || '');
  setVal('search-apiKey', search?.apiKey);
  setVal('search-defaultLimit', search?.defaultLimit);
  setVal('search-region', search?.region);

  renderProviders(config);
}

function toggleFields(enabled) {
  const fields = document.getElementById('search-config-fields');
  if (fields) {
    fields.style.opacity = enabled ? '1' : '0.5';
    fields.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

function renderProviders(config) {
  const container = document.getElementById('search-providers-list');
  if (!container) return;

  const envKeys = Object.keys(config._env || {});

  container.innerHTML = SEARCH_PROVIDERS.map(p => {
    const hasKey = !p.needsKey || envKeys.some(k => p.envKey?.includes(k));
    const status = p.needsKey ? (hasKey ? '✅' : '⚠️') : '✅';
    const statusColor = p.needsKey
      ? (hasKey ? 'var(--color-success)' : 'var(--color-warning)')
      : 'var(--color-success)';

    const registerLink = p.registerUrl
      ? `<a href="${p.registerUrl}" target="_blank" style="color:var(--color-accent);font-size:var(--text-xs);margin-left:var(--space-2)">注册</a>`
      : '';

    return `
      <div class="search-provider-row">
        <span>${status}</span>
        <span class="search-provider-name">${p.name}</span>
        <span class="search-provider-desc">${p.desc}</span>
        <span style="color:var(--text-muted);font-size:var(--text-xs)">${p.needsKey ? '需要 Key' : '无需 Key'}</span>
        <span class="search-provider-status" style="color:${statusColor}">${p.free}</span>
        ${registerLink}
      </div>
    `;
  }).join('');
}

export function collectSearch() {
  const enabled = getChecked('search-enabled');
  if (!enabled) return { enabled: false, provider: 'duckduckgo' };

  const provider = getVal('search-provider') || 'duckduckgo';
  const fallback = getVal('search-fallback') || undefined;
  const apiKey = getVal('search-apiKey') || undefined;
  const defaultLimit = getNum('search-defaultLimit') || undefined;
  const region = getVal('search-region') || undefined;

  return {
    enabled: true,
    provider,
    ...(fallback ? { fallback } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(defaultLimit ? { defaultLimit } : {}),
    ...(region ? { region } : {}),
  };
}
