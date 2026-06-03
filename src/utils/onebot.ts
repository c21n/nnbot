/**
 * OneBot Protocol Adapter
 *
 * Handles communication with OneBot implementations (NapCat, go-cqhttp, etc.)
 */

import axios, { type AxiosInstance } from "axios";
import type { Event, Response, OneBotConfig, EventType } from "../interfaces.js";

export class OneBotAdapter {
  private client: AxiosInstance;

  constructor(config: OneBotConfig) {
    this.client = axios.create({
      baseURL: config.url,
      headers: {
        "Content-Type": "application/json",
        ...(config.accessToken
          ? { Authorization: `Bearer ${config.accessToken}` }
          : {}),
      },
      timeout: 10000,
    });
  }

  /**
   * Parse OneBot event to internal Event format
   */
  parseEvent(data: Record<string, unknown>): Event {
    const postType = data.post_type as string;
    const messageType = data.message_type as string;

    // Determine event type
    let type: EventType;
    if (postType === "message" && messageType === "private") {
      type = "private_message" as EventType;
    } else if (postType === "message" && messageType === "group") {
      type = "group_message" as EventType;
    } else {
      // Default to private message
      type = "private_message" as EventType;
    }

    // Extract message content
    // OneBot can send message as string or array of segments
    let message = "";
    if (typeof data.message === "string") {
      message = data.message;
    } else if (Array.isArray(data.message)) {
      // Extract text from message segments
      message = (data.message as Array<Record<string, unknown>>)
        .filter((seg) => seg.type === "text")
        .map((seg) => ((seg.data as Record<string, unknown>)?.text as string) ?? "")
        .join("");
    }

    // Extract user info
    const sender = data.sender as Record<string, unknown> | undefined;
    const nickname = sender?.nickname as string || sender?.card as string || String(data.user_id ?? "");
    const groupName = data.group_name as string || null;

    return {
      type,
      userId: String(data.user_id ?? ""),
      nickname,
      groupId: data.group_id ? String(data.group_id) : null,
      groupName,
      message: message.trim(),
      timestamp: Date.now(),
      raw: data,
    };
  }

  /**
   * Send response back to OneBot
   */
  async sendResponse(event: Event, response: Response): Promise<void> {
    const action = event.groupId ? "send_group_msg" : "send_private_msg";

    const payload: Record<string, unknown> = {
      message: response.content,
      auto_post_message: true,
    };

    if (event.groupId) {
      payload.group_id = event.groupId;
    } else {
      payload.user_id = event.userId;
    }

    // Add reply reference for private messages
    if (response.replyTo && !event.groupId) {
      payload.message = [
        {
          type: "reply",
          data: { id: event.raw.message_id },
        },
        {
          type: "text",
          data: { text: response.content },
        },
      ];
    }

    try {
      await this.client.post(`/` + action, payload);
    } catch (error) {
      console.error("Failed to send response:", error);
      throw error;
    }
  }

  /**
   * Send a simple text message
   */
  async sendMessage(
    userId: string | null,
    groupId: string | null,
    message: string
  ): Promise<void> {
    const action = groupId ? "send_group_msg" : "send_private_msg";

    const payload: Record<string, unknown> = {
      message,
    };

    if (groupId) {
      payload.group_id = groupId;
    } else {
      payload.user_id = userId;
    }

    await this.client.post(`/${action}`, payload);
  }

  /**
   * Test connection to OneBot
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get("/get_login_info");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get bot's login info
   */
  async getLoginInfo(): Promise<{ userId: string; nickname: string }> {
    const response = await this.client.get("/get_login_info");
    const data = response.data.data ?? response.data;
    return {
      userId: String(data.user_id),
      nickname: data.nickname,
    };
  }
}
