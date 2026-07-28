// ── Settings Page (Server, OneBot, Storage, Context) ──
import toast from '../toast.js';
import { setVal, getVal, getNum, getChecked } from '../utils.js';

export function initSettings(config) {
  renderSettings(config);
}

export function renderSettings(config) {
  setVal('server-host', config.server?.host);
  setVal('server-port', config.server?.port);
  setVal('onebot-url', config.onebot?.url);
  setVal('onebot-accessToken', config.onebot?.accessToken);
  const wecomEnabled = document.getElementById('wecom-enabled');
  if (wecomEnabled) wecomEnabled.checked = config.wecom?.enabled ?? false;
  setVal('wecom-websocketUrl', config.wecom?.websocketUrl || 'wss://openws.work.weixin.qq.com');
  setVal('wecom-botId', config.wecom?.botId);
  const wecomSecret = document.getElementById('wecom-secret');
  if (wecomSecret) {
    wecomSecret.value = '';
    wecomSecret.placeholder = config.wecom?.secretConfigured
      ? '已配置，留空保持不变'
      : '填写企微机器人 Secret';
  }
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
    wecom: {
      enabled: getChecked('wecom-enabled'),
      websocketUrl: getVal('wecom-websocketUrl') || 'wss://openws.work.weixin.qq.com',
      botId: getVal('wecom-botId').trim(),
      secret: getVal('wecom-secret').trim(),
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
