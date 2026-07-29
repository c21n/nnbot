import { randomUUID } from "node:crypto";
import type { Event, IStorage, ProductManagerNotificationConfig } from "../interfaces.js";
import { logger } from "../core/logger.js";

const WECOM_API_BASE_URL = "https://qyapi.weixin.qq.com/cgi-bin";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_NOTIFICATION_LENGTH = 4_000;

interface WeComApiResponse {
  errcode: number;
  errmsg?: string;
  access_token?: string;
}

export class ProductManagerNotifier {
  constructor(
    private readonly config: ProductManagerNotificationConfig | undefined,
    private readonly storage: IStorage,
  ) {}

  async record(event: Event, reply: string): Promise<void> {
    const id = randomUUID();
    const record = {
      id,
      createdAt: new Date().toISOString(),
      userId: event.userId,
      nickname: event.nickname,
      groupId: event.groupId,
      groupName: event.groupName,
      request: event.message,
      response: reply,
    };

    await this.storage.set(`product-manager:request:${id}`, record);

    if (!this.config?.enabled) {
      return;
    }

    if (!this.isConfigured()) {
      logger.warn("[ProductManager] Private notification is enabled but WeCom app settings are incomplete");
      return;
    }

    try {
      const accessToken = await this.getAccessToken();
      await this.sendText(accessToken, this.formatNotification(record));
      logger.info(`[ProductManager] Request ${id} recorded and privately notified`);
    } catch (error) {
      logger.error(`[ProductManager] Request ${id} was recorded but private notification failed: ${error}`);
    }
  }

  private isConfigured(): boolean {
    return Boolean(
      this.config?.ownerUserId
      && this.config.corpId
      && this.config.agentId
      && this.config.secret,
    );
  }

  private async getAccessToken(): Promise<string> {
    const query = new URLSearchParams({
      corpid: this.config!.corpId,
      corpsecret: this.config!.secret,
    });
    const response = await fetch(`${WECOM_API_BASE_URL}/gettoken?${query}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const result = await parseWeComResponse(response);
    if (result.errcode !== 0 || !result.access_token) {
      throw new Error(`gettoken failed: ${result.errmsg ?? result.errcode}`);
    }
    return result.access_token;
  }

  private async sendText(accessToken: string, content: string): Promise<void> {
    const agentId = Number.parseInt(this.config!.agentId, 10);
    if (!Number.isSafeInteger(agentId) || agentId <= 0) {
      throw new Error("invalid WeCom agent id");
    }

    const response = await fetch(
      `${WECOM_API_BASE_URL}/message/send?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser: this.config!.ownerUserId,
          msgtype: "text",
          agentid: agentId,
          text: { content },
          safe: 0,
          enable_duplicate_check: 1,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const result = await parseWeComResponse(response);
    if (result.errcode !== 0) {
      throw new Error(`message/send failed: ${result.errmsg ?? result.errcode}`);
    }
  }

  private formatNotification(record: {
    createdAt: string;
    nickname: string;
    userId: string;
    groupId: string | null;
    groupName: string | null;
    request: string;
    response: string;
  }): string {
    const source = record.groupId
      ? `群聊${record.groupName ? `「${record.groupName}」` : ""}`
      : "私聊";
    return truncate([
      "【产品经理需求记录】",
      `时间：${record.createdAt}`,
      `提出人：${record.nickname}（${record.userId}）`,
      `来源：${source}`,
      "",
      "原始需求：",
      record.request,
      "",
      "机器人分析：",
      record.response,
    ].join("\n"), MAX_NOTIFICATION_LENGTH);
  }
}

async function parseWeComResponse(response: Response): Promise<WeComApiResponse> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json() as WeComApiResponse;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 20)}\n…（内容过长，完整记录已保存）`;
}
