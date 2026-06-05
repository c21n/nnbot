// ── Providers Page ──
import API from '../api.js';
import toast from '../toast.js';
import { esc, setVal } from '../utils.js';

let config = null;

const LLM_PRESETS = {
  'OpenAI': { type: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  'DeepSeek': { type: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  'SiliconFlow': { type: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V2.5'] },
  'Moonshot': { type: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  'Zhipu': { type: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4', 'glm-4-flash', 'glm-3-turbo'] },
  'Ollama': { type: 'ollama', baseUrl: 'http://localhost:11434', models: ['llama3', 'qwen2', 'deepseek-v2'] },
};

export function initProviders(cfg) {
  config = cfg;
  renderProviders();
}

export function updateProvidersConfig(cfg) {
  config = cfg;
  renderProviders();
}

function renderProviders() {
  const providers = config?.providers?.list ?? [];
  const defaults = config?.providers?.defaults ?? {};

  // Update default dropdowns
  updateDefaultDropdowns(providers, defaults);

  // Render provider cards
  const container = document.getElementById('providers-list');
  if (!container) return;

  if (providers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无供应商，点击"新增供应商"添加</p>
      </div>
    `;
    return;
  }

  container.innerHTML = providers.map((p, index) => `
    <div class="provider-card" data-index="${index}">
      <div class="provider-card-header">
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          <h3>${esc(p.id)}</h3>
          <span class="type-badge ${p.type === 'ollama' ? 'event' : 'summary'}">${p.type}</span>
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn-sm btn-ghost" onclick="window._providers.rename(${index})">重命名</button>
          <button class="btn btn-sm btn-danger" onclick="window._providers.delete(${index})">删除</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">类型</label>
          <select class="form-select" data-provider="${index}" data-field="type" onchange="window._providers.onTypeChange(${index}, this.value)">
            <option value="openai" ${p.type === 'openai' ? 'selected' : ''}>OpenAI 兼容</option>
            <option value="ollama" ${p.type === 'ollama' ? 'selected' : ''}>Ollama</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
            Base URL
            <select class="form-select" style="width:auto;padding:2px 8px;font-size:var(--text-xs)" onchange="window._providers.applyPreset(${index}, this.value); this.value=''">
              <option value="">选择预设...</option>
              ${Object.keys(LLM_PRESETS).map(k => `<option value="${k}">${k}</option>`).join('')}
            </select>
          </label>
          <input class="form-input" type="text" data-provider="${index}" data-field="baseUrl"
                 value="${esc(p.baseUrl ?? '')}" placeholder="https://api.openai.com/v1">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input class="form-input" type="password" data-provider="${index}" data-field="apiKey"
               value="${esc(p.apiKey ?? '')}" placeholder="sk-... (Ollama 留空)">
        <div class="form-hint" id="apiKey-hint-${index}">${p.type === 'ollama' ? 'Ollama 通常不需要 API Key' : 'OpenAI 兼容接口需要 API Key'}</div>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
          默认模型
          <button class="btn btn-sm btn-ghost" id="fetch-btn-${index}" onclick="window._providers.fetchModels(${index})">
            获取模型
          </button>
          <span id="fetch-status-${index}" style="font-size:var(--text-xs);color:var(--text-muted)"></span>
        </label>
        <input class="form-input" type="text" list="models-${index}" data-provider="${index}" data-field="defaultModel"
               value="${esc(p.defaultModel ?? '')}" placeholder="选择或输入模型名称">
        <datalist id="models-${index}">
          ${(p.models ?? []).map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('')}
        </datalist>
      </div>
      <div class="form-group" style="margin-top:var(--space-4)">
        <label class="form-label">模型列表 (可选)</label>
        <div class="form-hint" style="margin-bottom:var(--space-2)">配置此供应商可用的模型，用于 WebUI 选择</div>
        <div id="models-list-${index}" class="list-editor">
          ${(p.models ?? []).map((m, mi) => `
            <div class="list-row">
              <input class="form-input" type="text" value="${esc(m.id)}" placeholder="模型 ID" data-model-index="${mi}" list="models-list-datalist-${index}" autocomplete="off">
              <select class="form-select" style="width:120px" data-model-purpose="${mi}">
                <option value="llm" ${m.purpose === 'llm' ? 'selected' : ''}>文本 LLM</option>
                <option value="vision" ${m.purpose === 'vision' ? 'selected' : ''}>视觉 LLM</option>
                <option value="stt" ${m.purpose === 'stt' ? 'selected' : ''}>语音 STT</option>
                <option value="embedding" ${m.purpose === 'embedding' ? 'selected' : ''}>嵌入</option>
                <option value="both" ${m.purpose === 'both' ? 'selected' : ''}>文本+嵌入</option>
              </select>
              <input class="form-input" type="number" style="width:80px" value="${m.dimension ?? ''}" placeholder="维度" data-model-dimension="${mi}">
              <button class="btn-remove" onclick="window._providers.removeModel(${index}, ${mi})">×</button>
            </div>
          `).join('')}
        </div>
        <button class="btn-add" onclick="window._providers.addModel(${index})">+ 添加模型</button>
      </div>
    </div>
  `).join('');

  // Create datalist elements for model inputs
  providers.forEach((p, index) => {
    const modelsDatalist = document.createElement('datalist');
    modelsDatalist.id = `models-list-datalist-${index}`;
    (p.models ?? []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      modelsDatalist.appendChild(opt);
    });
    document.body.appendChild(modelsDatalist);
  });
}

function updateDefaultDropdowns(providers, defaults) {
  const llmProviderSelect = document.getElementById('providers-defaults-llm-provider');
  const llmModelSelect = document.getElementById('providers-defaults-llm-model');
  const visionProviderSelect = document.getElementById('providers-defaults-vision-provider');
  const visionModelSelect = document.getElementById('providers-defaults-vision-model');
  const sttProviderSelect = document.getElementById('providers-defaults-stt-provider');
  const sttModelSelect = document.getElementById('providers-defaults-stt-model');
  const embProviderSelect = document.getElementById('providers-defaults-emb-provider');
  const embModelSelect = document.getElementById('providers-defaults-emb-model');

  if (!llmProviderSelect || !embProviderSelect) return;

  // Save current values
  const currentLlmProvider = llmProviderSelect.value;
  const currentVisionProvider = visionProviderSelect?.value;
  const currentSttProvider = sttProviderSelect?.value;
  const currentEmbProvider = embProviderSelect.value;

  // Rebuild provider dropdowns
  llmProviderSelect.innerHTML = '<option value="">-- 选择供应商 --</option>';
  if (visionProviderSelect) visionProviderSelect.innerHTML = '<option value="">-- 选择供应商 --</option>';
  if (sttProviderSelect) sttProviderSelect.innerHTML = '<option value="">-- 选择供应商 --</option>';
  embProviderSelect.innerHTML = '<option value="">-- 选择供应商 --</option>';

  providers.forEach(p => {
    llmProviderSelect.innerHTML += `<option value="${esc(p.id)}">${esc(p.id)} (${p.type})</option>`;
    if (visionProviderSelect) visionProviderSelect.innerHTML += `<option value="${esc(p.id)}">${esc(p.id)} (${p.type})</option>`;
    if (sttProviderSelect) sttProviderSelect.innerHTML += `<option value="${esc(p.id)}">${esc(p.id)} (${p.type})</option>`;
    embProviderSelect.innerHTML += `<option value="${esc(p.id)}">${esc(p.id)} (${p.type})</option>`;
  });

  llmProviderSelect.value = defaults.llm?.providerId || currentLlmProvider;
  if (visionProviderSelect) visionProviderSelect.value = defaults.vision?.providerId || currentVisionProvider || '';
  if (sttProviderSelect) sttProviderSelect.value = defaults.stt?.providerId || currentSttProvider || '';
  embProviderSelect.value = defaults.embedding?.providerId || currentEmbProvider;

  // Update model dropdowns
  updateModelDropdown('llm', llmProviderSelect.value, providers, defaults.llm?.modelId);
  if (visionProviderSelect) updateModelDropdown('vision', visionProviderSelect.value, providers, defaults.vision?.modelId);
  if (sttProviderSelect) updateModelDropdown('stt', sttProviderSelect.value, providers, defaults.stt?.modelId);
  updateModelDropdown('embedding', embProviderSelect.value, providers, defaults.embedding?.modelId);

  // Set dimension
  const dimensionInput = document.getElementById('providers-defaults-emb-dimension');
  if (dimensionInput) dimensionInput.value = defaults.embedding?.dimension ?? 1024;

  // Add change handlers
  llmProviderSelect.onchange = () => updateModelDropdown('llm', llmProviderSelect.value, providers, '');
  if (visionProviderSelect) visionProviderSelect.onchange = () => updateModelDropdown('vision', visionProviderSelect.value, providers, '');
  if (sttProviderSelect) sttProviderSelect.onchange = () => updateModelDropdown('stt', sttProviderSelect.value, providers, '');
  embProviderSelect.onchange = () => updateModelDropdown('embedding', embProviderSelect.value, providers, '');
}

function updateModelDropdown(purpose, providerId, providers, selectedModel) {
  const selectId = `providers-defaults-${purpose}-model`;
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">-- 选择模型 --</option>';

  const provider = providers.find(p => p.id === providerId);
  if (provider?.models) {
    provider.models.forEach(m => {
      if (purpose === 'llm' && (m.purpose === 'llm' || m.purpose === 'both')) {
        select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}</option>`;
      } else if (purpose === 'vision' && (m.purpose === 'vision' || m.purpose === 'llm')) {
        select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}</option>`;
      } else if (purpose === 'stt' && m.purpose === 'stt') {
        select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}</option>`;
      } else if (purpose === 'embedding' && (m.purpose === 'embedding' || m.purpose === 'both')) {
        select.innerHTML += `<option value="${esc(m.id)}">${esc(m.id)}${m.dimension ? ` (${m.dimension}d)` : ''}</option>`;
      }
    });
  }

  if (selectedModel) select.value = selectedModel;
}

// ── Provider CRUD ──
function addProvider() {
  const name = prompt('供应商名称（英文，如 deepseek、ollama）');
  if (!name?.trim()) return;
  const id = name.trim().toLowerCase().replace(/\s+/g, '_');

  if (!config.providers) config.providers = { list: [], defaults: {} };
  if (!config.providers.list) config.providers.list = [];

  if (config.providers.list.some(p => p.id === id)) {
    toast.error(`供应商 "${id}" 已存在`);
    return;
  }

  config.providers.list.push({ id, type: 'openai', baseUrl: '', apiKey: '', models: [] });
  renderProviders();
  toast.success(`已添加供应商 "${id}"`);
}

function deleteProvider(index) {
  if (!config.providers?.list) return;
  if (config.providers.list.length <= 1) {
    toast.error('至少保留一个供应商');
    return;
  }

  const provider = config.providers.list[index];
  if (!confirm(`确认删除供应商 "${provider.id}"？`)) return;

  config.providers.list.splice(index, 1);

  // Update defaults if needed
  if (config.providers.defaults.llm?.providerId === provider.id) {
    config.providers.defaults.llm = undefined;
  }
  if (config.providers.defaults.embedding?.providerId === provider.id) {
    config.providers.defaults.embedding = undefined;
  }

  renderProviders();
  toast.success(`已删除供应商 "${provider.id}"`);
}

function renameProvider(index) {
  if (!config.providers?.list?.[index]) return;

  const oldId = config.providers.list[index].id;
  const newId = prompt('新名称', oldId);
  if (!newId?.trim() || newId.trim() === oldId) return;
  const id = newId.trim().toLowerCase().replace(/\s+/g, '_');

  if (config.providers.list.some(p => p.id === id && p !== config.providers.list[index])) {
    toast.error(`名称 "${id}" 已存在`);
    return;
  }

  config.providers.list[index].id = id;

  // Update defaults
  if (config.providers.defaults.llm?.providerId === oldId) {
    config.providers.defaults.llm.providerId = id;
  }
  if (config.providers.defaults.embedding?.providerId === oldId) {
    config.providers.defaults.embedding.providerId = id;
  }

  renderProviders();
  toast.success(`已重命名为 "${id}"`);
}

function applyPreset(index, presetName) {
  const preset = LLM_PRESETS[presetName];
  if (!preset) return;

  const card = document.querySelector(`.provider-card[data-index="${index}"]`);
  if (!card) return;

  const typeSelect = card.querySelector('[data-field="type"]');
  if (typeSelect) {
    typeSelect.value = preset.type;
    onTypeChange(index, preset.type);
  }

  const baseUrlInput = card.querySelector('[data-field="baseUrl"]');
  if (baseUrlInput) baseUrlInput.value = preset.baseUrl;

  const datalist = document.getElementById(`models-${index}`);
  if (datalist) {
    datalist.innerHTML = '';
    preset.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      datalist.appendChild(opt);
    });
  }

  toast.success(`已应用 ${presetName} 预设`);
}

function onTypeChange(index, type) {
  const hintEl = document.getElementById(`apiKey-hint-${index}`);
  if (hintEl) {
    hintEl.textContent = type === 'ollama' ? 'Ollama 通常不需要 API Key' : 'OpenAI 兼容接口需要 API Key';
  }
}

async function fetchModels(index) {
  const card = document.querySelector(`.provider-card[data-index="${index}"]`);
  if (!card) return;

  const baseUrl = card.querySelector('[data-field="baseUrl"]')?.value?.trim();
  const apiKey = card.querySelector('[data-field="apiKey"]')?.value?.trim();
  const type = card.querySelector('[data-field="type"]')?.value || 'openai';

  if (!baseUrl) {
    toast.error('请先填写 Base URL');
    return;
  }

  const statusEl = document.getElementById(`fetch-status-${index}`);
  const btnEl = document.getElementById(`fetch-btn-${index}`);
  if (statusEl) statusEl.textContent = '获取中...';
  if (btnEl) btnEl.disabled = true;

  try {
    const models = await API.fetchModels(baseUrl, apiKey, type);

    // Update datalist for default model input
    const datalist = document.getElementById(`models-${index}`);
    if (datalist) {
      datalist.innerHTML = '';
      models.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        datalist.appendChild(opt);
      });
    }

    // Add datalist to each model ID input in the list
    const modelsList = document.getElementById(`models-list-${index}`);
    if (modelsList) {
      // Create or update datalist for model inputs
      let modelsDatalist = document.getElementById(`models-list-datalist-${index}`);
      if (!modelsDatalist) {
        modelsDatalist = document.createElement('datalist');
        modelsDatalist.id = `models-list-datalist-${index}`;
        document.body.appendChild(modelsDatalist);
      }
      modelsDatalist.innerHTML = '';
      models.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        modelsDatalist.appendChild(opt);
      });

      // Add datalist attribute to existing model inputs
      modelsList.querySelectorAll('input[data-model-index]').forEach(input => {
        input.setAttribute('list', `models-list-datalist-${index}`);
        input.setAttribute('autocomplete', 'off');
      });
    }

    if (statusEl) statusEl.textContent = `✓ 找到 ${models.length} 个模型`;
    toast.success(`获取到 ${models.length} 个模型`);
  } catch (e) {
    if (statusEl) statusEl.textContent = '✗ ' + e.message;
    toast.error('获取模型失败: ' + e.message);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

function addModel(providerIndex) {
  if (!config.providers?.list?.[providerIndex]) return;
  const provider = config.providers.list[providerIndex];
  if (!provider.models) provider.models = [];
  provider.models.push({ id: '', purpose: 'llm' });
  renderProviders();

  // Add datalist to new model input
  setTimeout(() => {
    const modelsList = document.getElementById(`models-list-${providerIndex}`);
    const modelsDatalist = document.getElementById(`models-list-datalist-${providerIndex}`);
    if (modelsList && modelsDatalist) {
      const lastInput = modelsList.querySelector('.list-row:last-child input[data-model-index]');
      if (lastInput) {
        lastInput.setAttribute('list', `models-list-datalist-${providerIndex}`);
        lastInput.setAttribute('autocomplete', 'off');
      }
    }
  }, 0);
}

// Save providers configuration
async function saveProviders() {
  const btn = document.getElementById('save-providers-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '保存中...';
  }

  try {
    // Collect providers data
    const providers = collectProviders();
    const defaults = collectDefaults();

    // Update config
    config.providers = { list: providers, defaults };

    // Save to server
    await API.saveConfig(config);

    toast.success('供应商配置已保存');
  } catch (e) {
    toast.error('保存失败: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '保存供应商配置';
    }
  }
}

function removeModel(providerIndex, modelIndex) {
  if (!config.providers?.list?.[providerIndex]?.models) return;
  config.providers.list[providerIndex].models.splice(modelIndex, 1);
  renderProviders();
}

// ── Collect providers data ──
export function collectProviders() {
  const providers = [];

  document.querySelectorAll('.provider-card').forEach(card => {
    const index = parseInt(card.dataset.index);
    const id = card.querySelector('h3')?.textContent?.trim() || `provider_${index}`;

    const type = card.querySelector('[data-field="type"]')?.value || 'openai';
    const baseUrl = card.querySelector('[data-field="baseUrl"]')?.value || '';
    const apiKey = card.querySelector('[data-field="apiKey"]')?.value || '';
    const defaultModel = card.querySelector('[data-field="defaultModel"]')?.value || '';

    // Collect models
    const models = [];
    const modelsList = card.querySelector(`#models-list-${index}`);
    if (modelsList) {
      modelsList.querySelectorAll('.list-row').forEach((row, mi) => {
        const modelId = row.querySelector(`[data-model-index="${mi}"]`)?.value?.trim();
        if (modelId) {
          const purpose = row.querySelector(`[data-model-purpose="${mi}"]`)?.value || 'llm';
          const dimension = parseInt(row.querySelector(`[data-model-dimension="${mi}"]`)?.value) || undefined;
          models.push({ id: modelId, purpose, dimension });
        }
      });
    }

    providers.push({
      id, type, baseUrl, apiKey,
      defaultModel: defaultModel || undefined,
      models: models.length > 0 ? models : undefined,
    });
  });

  return providers;
}

export function collectDefaults() {
  return {
    llm: {
      providerId: document.getElementById('providers-defaults-llm-provider')?.value || undefined,
      modelId: document.getElementById('providers-defaults-llm-model')?.value || undefined,
    },
    vision: {
      providerId: document.getElementById('providers-defaults-vision-provider')?.value || undefined,
      modelId: document.getElementById('providers-defaults-vision-model')?.value || undefined,
    },
    stt: {
      providerId: document.getElementById('providers-defaults-stt-provider')?.value || undefined,
      modelId: document.getElementById('providers-defaults-stt-model')?.value || undefined,
    },
    embedding: {
      providerId: document.getElementById('providers-defaults-emb-provider')?.value || undefined,
      modelId: document.getElementById('providers-defaults-emb-model')?.value || undefined,
      dimension: parseInt(document.getElementById('providers-defaults-emb-dimension')?.value) || undefined,
    },
  };
}

// Expose to window for onclick handlers
window._providers = {
  add: addProvider,
  delete: deleteProvider,
  rename: renameProvider,
  applyPreset,
  onTypeChange,
  fetchModels,
  addModel,
  removeModel,
  save: saveProviders,
};
