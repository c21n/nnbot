// ── Settings Page (Server, OneBot, Storage, Context) ──
import toast from '../toast.js';
import { setVal, getVal, getNum } from '../utils.js';

export function initSettings(config) {
  renderSettings(config);
}

export function renderSettings(config) {
  setVal('server-host', config.server?.host);
  setVal('server-port', config.server?.port);
  setVal('onebot-url', config.onebot?.url);
  setVal('onebot-accessToken', config.onebot?.accessToken);
  setVal('storage-type', config.storage?.type);
  setVal('storage-path', config.storage?.path);
  setVal('context-historyLimit', config.context?.historyLimit);
}

export function collectSettings() {
  return {
    server: {
      host: getVal('server-host') || '0.0.0.0',
      port: getNum('server-port', 8080),
    },
    onebot: {
      url: getVal('onebot-url') || 'http://127.0.0.1:3000',
      accessToken: getVal('onebot-accessToken') || undefined,
    },
    storage: {
      type: getVal('storage-type') || 'sqlite',
      path: getVal('storage-path') || 'data/bot.db',
    },
    context: {
      historyLimit: getNum('context-historyLimit', 10),
    },
  };
}
