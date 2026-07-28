// ── API Client ──
// Centralized API calls with error handling

const REQUEST_TIMEOUT = 10000; // 10 seconds

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

const API = {
  // ── Config ──
  async getConfig() {
    const res = await fetchWithTimeout('/api/config');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async saveConfig(config) {
    const res = await fetchWithTimeout('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  // ── Persona ──
  async getLogs(limit = 100) {
    const cacheBuster = Date.now();
    const res = await fetchWithTimeout(
      `/api/system/logs?limit=${encodeURIComponent(limit)}&_=${cacheBuster}`,
      { cache: 'no-store' },
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async restartService() {
    const res = await fetchWithTimeout('/api/system/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async getPersona() {
    const res = await fetchWithTimeout('/api/persona');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async savePersona(data) {
    const res = await fetchWithTimeout('/api/persona', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  // ── Providers ──
  async fetchModels(baseUrl, apiKey, type = 'openai') {
    const res = await fetchWithTimeout('/api/providers/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey, type }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  // ── Memory ──
  async getUsers() {
    const res = await fetchWithTimeout('/api/memory/users');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async getMemories(userId, type) {
    let url = `/api/memory/all?userId=${encodeURIComponent(userId)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    const res = await fetchWithTimeout(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async getStats(userId) {
    const res = await fetchWithTimeout(`/api/memory/stats?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async deleteMemory(id) {
    const res = await fetchWithTimeout(`/api/memory/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async deleteUserData(userId) {
    const res = await fetchWithTimeout(`/api/memory/user?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async exportUserData(userId) {
    const res = await fetchWithTimeout(`/api/memory/export?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error);
    }
    return res.blob();
  },

  // ── Health ──
  async getHealth() {
    const res = await fetchWithTimeout('/health');
    return res.json();
  },
};

export default API;
