/**
 * OneBot Protocol Adapter
 *
 * Handles communication with OneBot implementations (NapCat, go-cqhttp, etc.)
 */

import axios, { type AxiosInstance } from "axios";
import type { Event, Response, OneBotConfig, EventType } from "../interfaces.js";
import type { IMultimodalMessage, IMultimodalContent } from "../multimodal/types/multimodal.types.js";

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
    let multimodal: IMultimodalMessage | undefined;

    if (typeof data.message === "string") {
      message = data.message;
    } else if (Array.isArray(data.message)) {
      const segments = data.message as Array<Record<string, unknown>>;
      const textParts: string[] = [];
      const multimodalContents: IMultimodalContent[] = [];

      for (const seg of segments) {
        const segType = seg.type as string;
        const segData = seg.data as Record<string, unknown>;

        if (segType === "text") {
          // Text segment
          const text = segData?.text as string ?? "";
          if (text) {
            textParts.push(text);
          }
        } else if (segType === "image") {
          // Image segment
          const imageUrl = segData?.url as string;
          const imageFile = segData?.file as string;
          const imageData = segData?.file_base64 as string;

          // Build image content
          const imageContent: IMultimodalContent = {
            type: "image",
            data: imageData || "", // Will be populated later if needed
            mimeType: "image/jpeg", // Default, will be detected
            metadata: {
              url: imageUrl,
              file: imageFile,
              file_id: segData?.file_id,
            },
          };

          multimodalContents.push(imageContent);
          textParts.push("[图片]");
        } else if (segType === "record") {
          // Voice segment
          const voiceFile = segData?.file as string;
          const voiceUrl = segData?.url as string;
          const voiceData = segData?.file_base64 as string;

          // Build voice content
          const voiceContent: IMultimodalContent = {
            type: "voice",
            data: voiceData || "", // Will be populated later if needed
            mimeType: "audio/wav", // Default, will be detected
            metadata: {
              file: voiceFile,
              url: voiceUrl,
              file_id: segData?.file_id,
            },
          };

          multimodalContents.push(voiceContent);
          textParts.push("[语音]");
        }
      }

      message = textParts.join("");

      // Build multimodal message if there are media contents
      if (multimodalContents.length > 0) {
        multimodal = {
          contents: multimodalContents,
          text: message,
        };
      }
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
      multimodal,
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
      await this.client.post("/get_login_info", {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download media file from OneBot
   * @param fileUrl - URL of the file to download
   * @returns Buffer containing the file data
   */
  async downloadMedia(fileUrl: string): Promise<Buffer> {
    try {
      const response = await this.client.get(fileUrl, {
        responseType: "arraybuffer",
        timeout: 30000, // 30 second timeout for media downloads
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error("Failed to download media file:", error);
      throw error;
    }
  }

  /**
   * Get file from OneBot by file_id
   * @param fileId - OneBot file ID
   * @returns Buffer containing the file data
   */
  async getFile(fileId: string): Promise<Buffer> {
    try {
      const response = await this.client.get("/get_file", {
        params: { file_id: fileId },
        responseType: "arraybuffer",
        timeout: 30000,
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error("Failed to get file:", error);
      throw error;
    }
  }

  /**
   * Get bot's login info
   */
  async getLoginInfo(): Promise<{ userId: string; nickname: string }> {
    const response = await this.client.post("/get_login_info", {});
    const data = response.data.data ?? response.data;
    return {
      userId: String(data.user_id),
      nickname: data.nickname,
    };
  }
}
