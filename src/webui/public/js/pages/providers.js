// ── Providers Page ──
import API from '../api.js';
import toast from '../toast.js';
import { esc } from '../utils.js';

let config = null;
const discoveredModels = new Map();

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
  discoveredModels.clear();
  renderProviders();
}

export function updateProvidersConfig(cfg) {
  config = cfg;
  discoveredModels.clear();
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

  document.querySelectorAll('datalist[data-provider-datalist]').forEach(el => el.remove());

  container.innerHTML = providers.map((p, index) => `
    <div class="provider-card" data-index="${index}">
      <div class="provider-card-header">
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          <h3>${esc(p.id)}</h3>
          <span class="type-badge ${p.type === 'ollama' ? 'event' : 'summary'}">${p.type}</span>
          <span class="provider-model-count">${p.models?.length ?? 0} 个已启用模型</span>
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
          <input class="form-input" type="url" data-provider="${index}" data-field="baseUrl"
                 value="${esc(p.baseUrl ?? '')}" placeholder="https://api.openai.com/v1">
          <div class="form-hint">OpenAI 兼容服务通常以 <code>/v1</code> 结尾；Ollama 填写服务根地址。</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input class="form-input" type="password" autocomplete="new-password" data-provider="${index}" data-field="apiKey"
               value="${esc(p.apiKey ?? '')}" placeholder="sk-... (Ollama 留空)">
        <div class="form-hint" id="apiKey-hint-${index}">${p.type === 'ollama' ? 'Ollama 通常不需要 API Key' : 'OpenAI 兼容接口需要 API Key'}</div>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
          默认模型
          <button class="btn btn-sm btn-ghost" id="fetch-btn-${index}" onclick="window._providers.fetchModels(${index})">
            刷新模型目录
          </button>
          <button class="btn btn-sm btn-secondary" id="test-btn-${index}" onclick="window._providers.testConnection(${index})">
            测试连接
          </button>
          <span id="test-status-${index}" style="font-size:var(--text-xs);color:var(--text-muted)"></span>
          <span id="fetch-status-${index}" style="font-size:var(--text-xs);color:var(--text-muted)"></span>
        </label>
        <input class="form-input" type="text" list="models-${index}" data-provider="${index}" data-field="defaultModel"
               value="${esc(p.defaultModel ?? '')}" placeholder="选择或输入模型名称">
        <datalist id="models-${index}" data-provider-datalist="true">
          ${(p.models ?? []).map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('')}
        </datalist>
      </div>
      <div class="form-group model-section" style="margin-top:var(--space-4)">
        <div class="model-section-header">
          <div>
            <label class="form-label">已启用模型</label>
            <div class="form-hint">只有加入这里的模型，才会出现在默认模型选择中。</div>
          </div>
          <span class="model-section-count">${p.models?.length ?? 0}</span>
        </div>
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
        ${renderDiscoveredModels(p, index)}
      </div>
    </div>
  `).join('');

  // Create datalist elements for model inputs
  providers.forEach((p, index) => {
    const modelsDatalist = document.createElement('datalist');
    modelsDatalist.id = `models-list-datalist-${index}`;
    modelsDatalist.dataset.providerDatalist = 'true';
    (p.models ?? []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      modelsDatalist.appendChild(opt);
    });
    document.body.appendChild(modelsDatalist);
  });

  bindModelDiscovery(container);
}

function renderDiscoveredModels(provider, index) {
  const models = discoveredModels.get(provider.id) ?? [];
  if (models.length === 0) return '';

  const enabled = new Set((provider.models ?? []).map(model => model.id));
  return `
    <div class="model-discovery" data-discovery="${index}">
      <div class="model-discovery-header">
        <div>
          <strong>服务商模型目录</strong>
          <span class="form-hint">已读取 ${models.length} 个模型，点击“添加”启用</span>
        </div>
        <input class="form-input model-discovery-search" type="search" data-model-search="${index}" placeholder="筛选模型" aria-label="筛选模型">
      </div>
      <div class="model-discovery-list">
        ${models.map(modelId => `
          <div class="model-discovery-row" data-model-row="${esc(modelId.toLowerCase())}">
            <code title="${esc(modelId)}">${esc(modelId)}</code>
            <button class="btn btn-sm ${enabled.has(modelId) ? 'btn-secondary' : 'btn-ghost'}"
                    type="button" data-action="add-discovered-model" data-provider-index="${index}" data-model-id="${esc(modelId)}"
                    ${enabled.has(modelId) ? 'disabled' : ''}>
              ${enabled.has(modelId) ? '已添加' : '添加'}
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function bindModelDiscovery(container) {
  container.querySelectorAll('[data-action="add-discovered-model"]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.providerIndex);
      const modelId = button.dataset.modelId;
      if (Number.isInteger(index) && modelId) addDiscoveredModel(index, modelId);
    });
  });

  container.querySelectorAll('[data-model-search]').forEach(input => {
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      const discovery = input.closest('[data-discovery]');
      discovery?.querySelectorAll('[data-model-row]').forEach(row => {
        row.hidden = query.length > 0 && !row.dataset.modelRow.includes(query);
      });
    });
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
  const models = [...(provider?.models ?? [])];

  // A provider default model is valid even when the user has not fetched its catalog yet.
  if (provider?.defaultModel && !models.some(model => model.id === provider.defaultModel)) {
    models.push({ id: provider.defaultModel, purpose: purpose === 'embedding' ? 'embedding' : 'llm' });
  }

  const seen = new Set();
  models.forEach(model => {
    if (!model.id || seen.has(model.id) || !modelSupportsPurpose(model, purpose)) return;
    seen.add(model.id);
    const suffix = purpose === 'embedding' && model.dimension ? ` (${model.dimension}d)` : '';
    select.innerHTML += `<option value="${esc(model.id)}">${esc(model.id)}${suffix}</option>`;
  });

  if (selectedModel && !seen.has(selectedModel)) {
    select.innerHTML += `<option value="${esc(selectedModel)}">${esc(selectedModel)} (当前配置)</option>`;
  }

  if (selectedModel) select.value = selectedModel;
}

function modelSupportsPurpose(model, purpose) {
  if (purpose === 'embedding') return model.purpose === 'embedding' || model.purpose === 'both';
  if (purpose === 'vision') return model.purpose === 'vision' || model.purpose === 'llm' || model.purpose === 'both';
  if (purpose === 'stt') return model.purpose === 'stt';
  return !model.purpose || model.purpose === 'llm' || model.purpose === 'both';
}

function collectModelsFromCard(card) {
  return Array.from(card.querySelectorAll('.list-row')).map(row => {
    const modelId = row.querySelector('[data-model-index]')?.value?.trim();
    if (!modelId) return null;

    const purpose = row.querySelector('[data-model-purpose]')?.value || 'llm';
    const dimensionValue = row.querySelector('[data-model-dimension]')?.value;
    const dimension = dimensionValue ? Number.parseInt(dimensionValue, 10) : undefined;
    return {
      id: modelId,
      purpose,
      ...(Number.isFinite(dimension) ? { dimension } : {}),
    };
  }).filter(Boolean);
}

function syncProviderCard(index) {
  const provider = config?.providers?.list?.[index];
  const card = document.querySelector(`.provider-card[data-index="${index}"]`);
  if (!provider || !card) return provider;

  provider.type = card.querySelector('[data-field="type"]')?.value || provider.type || 'openai';
  provider.baseUrl = card.querySelector('[data-field="baseUrl"]')?.value?.trim() || '';
  provider.apiKey = card.querySelector('[data-field="apiKey"]')?.value?.trim() || '';
  provider.defaultModel = card.querySelector('[data-field="defaultModel"]')?.value?.trim() || undefined;
  const models = collectModelsFromCard(card);
  provider.models = models.length > 0 ? models : undefined;
  return provider;
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
  syncProviderCard(index);
  if (config.providers.list.length <= 1) {
    toast.error('至少保留一个供应商');
    return;
  }

  const provider = config.providers.list[index];
  if (!confirm(`确认删除供应商 "${provider.id}"？`)) return;

  config.providers.list.splice(index, 1);

  // Clear every default that points to the deleted provider.
  ['llm', 'vision', 'stt', 'embedding'].forEach(purpose => {
    if (config.providers.defaults[purpose]?.providerId === provider.id) {
      config.providers.defaults[purpose] = undefined;
    }
  });

  discoveredModels.delete(provider.id);
  renderProviders();
  toast.success(`已删除供应商 "${provider.id}"`);
}

function renameProvider(index) {
  if (!config.providers?.list?.[index]) return;
  syncProviderCard(index);

  const oldId = config.providers.list[index].id;
  const newId = prompt('新名称', oldId);
  if (!newId?.trim() || newId.trim() === oldId) return;
  const id = newId.trim().toLowerCase().replace(/\s+/g, '_');

  if (config.providers.list.some(p => p.id === id && p !== config.providers.list[index])) {
    toast.error(`名称 "${id}" 已存在`);
    return;
  }

  config.providers.list[index].id = id;
  const discovered = discoveredModels.get(oldId);
  if (discovered) {
    discoveredModels.delete(oldId);
    discoveredModels.set(id, discovered);
  }

  // Update defaults
  ['llm', 'vision', 'stt', 'embedding'].forEach(purpose => {
    if (config.providers.defaults[purpose]?.providerId === oldId) {
      config.providers.defaults[purpose].providerId = id;
    }
  });

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

  const provider = syncProviderCard(index);
  if (provider) discoveredModels.set(provider.id, [...preset.models]);
  renderProviders();

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

  const provider = syncProviderCard(index);
  if (!provider) return;

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
    const models = [...new Set((await API.fetchModels(baseUrl, apiKey, type)).filter(Boolean))];
    discoveredModels.set(provider.id, models);
    renderProviders();

    const nextStatus = document.getElementById(`fetch-status-${index}`);
    if (nextStatus) nextStatus.textContent = `✓ 找到 ${models.length} 个，可选择添加`;
    toast.success(`获取到 ${models.length} 个模型，请选择要启用的模型`);
  } catch (e) {
    if (statusEl) statusEl.textContent = '✗ ' + e.message;
    toast.error('获取模型失败: ' + e.message);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function testConnection(index) {
  const card = document.querySelector(`.provider-card[data-index="${index}"]`);
  if (!card) return;

  const baseUrl = card.querySelector('[data-field="baseUrl"]')?.value?.trim();
  const apiKey = card.querySelector('[data-field="apiKey"]')?.value?.trim();
  const type = card.querySelector('[data-field="type"]')?.value || 'openai';
  const model = card.querySelector('[data-field="defaultModel"]')?.value?.trim();
  const provider = config?.providers?.list?.[index];
  const modelConfig = provider?.models?.find(item => item.id === model);
  const purpose = modelConfig?.purpose === 'embedding' ? 'embedding' : 'llm';
  const statusEl = document.getElementById(`test-status-${index}`);
  const btnEl = document.getElementById(`test-btn-${index}`);

  if (!baseUrl) {
    toast.error('请先填写 Base URL');
    return;
  }
  if (!model) {
    toast.error('请先填写要测试的模型 ID');
    return;
  }

  if (statusEl) {
    statusEl.textContent = '测试中...';
    statusEl.style.color = 'var(--text-muted)';
  }
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = '测试中...';
  }

  try {
    const result = await API.testProvider({ baseUrl, apiKey, type, model, purpose });
    if (statusEl) {
      statusEl.textContent = `✓ 连接成功 · ${result.latencyMs} ms · ${result.preview}`;
      statusEl.style.color = 'var(--color-success, #16a34a)';
    }
    toast.success(`模型 ${result.model} 测试成功`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (statusEl) {
      statusEl.textContent = `✕ ${message}`;
      statusEl.style.color = 'var(--color-danger, #dc2626)';
    }
    toast.error(`连接测试失败: ${message}`);
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = '测试连接';
    }
  }
}

function addModel(providerIndex) {
  if (!config.providers?.list?.[providerIndex]) return;
  const provider = config.providers.list[providerIndex];
  syncProviderCard(providerIndex);
  if (!provider.models) provider.models = [];
  provider.models.push({ id: '', purpose: 'llm' });
  renderProviders();

}

function addDiscoveredModel(providerIndex, modelId) {
  const provider = syncProviderCard(providerIndex);
  if (!provider) return;

  if (!provider.models) provider.models = [];
  if (provider.models.some(model => model.id === modelId)) return;

  provider.models.push({ id: modelId, purpose: 'llm' });
  renderProviders();
  toast.success(`已启用模型 ${modelId}`);
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

    toast.success('供应商配置已保存，重启服务后生效');
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
  syncProviderCard(providerIndex);
  config.providers.list[providerIndex].models.splice(modelIndex, 1);
  renderProviders();
}

// ── Collect providers data ──
export function collectProviders() {
  const providers = [];

  document.querySelectorAll('.provider-card').forEach(card => {
    const index = parseInt(card.dataset.index);
    const currentProvider = config?.providers?.list?.[index];
    const id = currentProvider?.id || card.querySelector('h3')?.textContent?.trim() || `provider_${index}`;

    const type = card.querySelector('[data-field="type"]')?.value || 'openai';
    const baseUrl = card.querySelector('[data-field="baseUrl"]')?.value || '';
    const apiKey = card.querySelector('[data-field="apiKey"]')?.value || '';
    const defaultModel = card.querySelector('[data-field="defaultModel"]')?.value || '';

    const models = collectModelsFromCard(card);

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
  testConnection,
  addModel,
  removeModel,
  save: saveProviders,
};
