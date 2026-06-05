// ── Memory Config Page ──
import toast from '../toast.js';
import { setVal, getVal, getNum, getFloat, getChecked, esc } from '../utils.js';

export function initMemory(config) {
  renderMemory(config);
}

export function renderMemory(config) {
  const mem = config.memory;
  const providers = config.providers?.list ?? [];
  const defaults = config.providers?.defaults ?? {};
  const enabled = mem?.enabled ?? false;

  // Toggle checkbox
  const checkbox = document.getElementById('memory-enabled');
  if (checkbox) {
    checkbox.checked = enabled;
    toggleFields(enabled);
    checkbox.onchange = () => toggleFields(checkbox.checked);
  }

  // Populate embedding provider dropdown
  const embProviderSelect = document.getElementById('memory-emb-provider');
  if (embProviderSelect) {
    embProviderSelect.innerHTML = '<option value="">-- 使用默认供应商 --</option>';
    providers.forEach(p => {
      const hasEmbedding = p.models?.some(m => m.purpose === 'embedding' || m.purpose === 'both');
      if (hasEmbedding || p.type === 'openai') {
        embProviderSelect.innerHTML += `<option value="${esc(p.id)}">${esc(p.id)} (${p.type})</option>`;
      }
    });

    const currentEmbProvider = mem?.embedding?.providerId || defaults.embedding?.providerId || '';
    embProviderSelect.value = currentEmbProvider;
    updateModelDropdown('emb', currentEmbProvider, providers, mem?.embedding?.model);
    embProviderSelect.onchange = () => updateModelDropdown('emb', embProviderSelect.value, providers, '');
  }

  // Populate LLM provider dropdown
  const llmProviderSelect = document.getElementById('memory-llm-provider');
  if (llmProviderSelect) {
    llmProviderSelect.innerHTML = '<option value="">-- 使用默认供应商 --</option>';
    providers.forEach(p => {
      const hasLLM = p.models?.some(m => m.purpose === 'llm' || m.purpose === 'both');
      if (hasLLM || p.type === 'openai') {
        llmProviderSelect.innerHTML += `<option value="${esc(p.id)}">${esc(p.id)} (${p.type})</option>`;
      }
    });

    const currentLlmProvider = mem?.llm?.providerId || defaults.llm?.providerId || '';
    llmProviderSelect.value = currentLlmProvider;
    updateModelDropdown('llm', currentLlmProvider, providers, mem?.llm?.model);
    llmProviderSelect.onchange = () => updateModelDropdown('llm', llmProviderSelect.value, providers, '');
  }

  // Set other fields
  setVal('memory-sqlite-path', mem?.sqlite?.path);
  setVal('memory-search-maxMemories', mem?.search?.maxMemories);
  setVal('memory-search-minScore', mem?.search?.minScore);
  setVal('memory-lifecycle-maxMemoriesPerUser', mem?.lifecycle?.maxMemoriesPerUser);
  setVal('memory-lifecycle-summaryTriggerRounds', mem?.lifecycle?.summaryTriggerRounds);
}

function updateModelDropdown(purpose, providerId, providers, selectedModel) {
  const selectId = purpose === 'emb' ? 'memory-emb-model' : 'memory-llm-model';
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">-- 使用默认模型 --</option>';

  const provider = providers.find(p => p.id === providerId);
  const defaults = window._config?.providers?.defaults ?? {};

  if (!providerId) {
    // Use defaults
    const defaultProvider = providers.find(p => p.id === defaults[purpose === 'emb' ? 'embedding' : 'llm']?.providerId);
    if (defaultProvider?.models) {
      defaultProvider.models.forEach(m => {
        if (purpose === 'emb' && (m.purpose === 'embedding' || m.purpose === 'both')) {
          select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}${m.dimension ? ` (${m.dimension}d)` : ''}</option>`;
        } else if (purpose === 'llm' && (m.purpose === 'llm' || m.purpose === 'both')) {
          select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}</option>`;
        }
      });
    }
    select.value = defaults[purpose === 'emb' ? 'embedding' : 'llm']?.modelId || '';
  } else {
    if (provider?.models) {
      provider.models.forEach(m => {
        if (purpose === 'emb' && (m.purpose === 'embedding' || m.purpose === 'both')) {
          select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}${m.dimension ? ` (${m.dimension}d)` : ''}</option>`;
        } else if (purpose === 'llm' && (m.purpose === 'llm' || m.purpose === 'both')) {
          select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}</option>`;
        }
      });
    }
    if (selectedModel) select.value = selectedModel;
  }
}

function toggleFields(enabled) {
  const fields = document.getElementById('memory-config-fields');
  if (fields) {
    fields.style.opacity = enabled ? '1' : '0.5';
    fields.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

export function collectMemory() {
  const enabled = getChecked('memory-enabled');
  if (!enabled) return { enabled: false };

  const embeddingProviderId = getVal('memory-emb-provider') || undefined;
  const embeddingModel = getVal('memory-emb-model') || undefined;
  const llmProviderId = getVal('memory-llm-provider') || undefined;
  const llmModel = getVal('memory-llm-model') || undefined;

  return {
    enabled: true,
    embedding: { providerId: embeddingProviderId, model: embeddingModel },
    llm: llmProviderId ? { providerId: llmProviderId, model: llmModel } : undefined,
    sqlite: { path: getVal('memory-sqlite-path') || './data/memory.db' },
    search: {
      maxMemories: getNum('memory-search-maxMemories', 5),
      minScore: getFloat('memory-search-minScore', 0.3),
    },
    lifecycle: {
      maxMemoriesPerUser: getNum('memory-lifecycle-maxMemoriesPerUser', 500),
      summaryTriggerRounds: getNum('memory-lifecycle-summaryTriggerRounds', 15),
    },
  };
}
