/**
 * Enterprise WeChat smart bot adapter.
 *
 * This adapter implements the API-mode long connection protocol. It keeps
 * transport concerns here so plugins continue to receive the shared Event
 * shape used by the existing OneBot channel.
 */

import { createHash, randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import { logger } from "../../core/logger.js";
import type { Event, EventResponder, Response, WeComBotConfig } from "../../interfaces.js";
import { EventType } from "../../interfaces.js";

const DEFAULT_RECONNECT_DELAY_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
const MESSAGE_DEDUPE_TTL_MS = 10 * 60 * 1_000;
const MAX_DEDUPE_ENTRIES = 2_000;
const MEDIA_CHUNK_SIZE = 512 * 1024;
const MAX_MEDIA_CHUNKS = 100;

export interface WeComEnvelope {
  readonly cmd?: string;
  readonly headers?: {
    readonly req_id?: string;
  };
  readonly body?: Record<string, unknown>;
  readonly errcode?: number;
  readonly errmsg?: string;
}

export interface WeComCommand {
  readonly cmd: string;
  readonly headers: {
    readonly req_id: string;
  };
  readonly body?: Record<string, unknown>;
}

export interface WeComReplyImage {
  readonly base64: string;
  readonly md5: string;
  readonly fileName?: string;
}

export type WeComEventHandler = (event: Event, responder: EventResponder) => Promise<void>;

interface PendingRequest {
  readonly resolve: (envelope: WeComEnvelope) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readResponseImages(response: Response): WeComReplyImage[] {
  const rawAttachments = response.extra?.attachments;
  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments
    .filter((attachment): attachment is { type: "image"; base64: string; md5: string; fileName?: string } => {
      if (!attachment || typeof attachment !== "object") return false;
      const item = attachment as Record<string, unknown>;
      return item.type === "image"
        && typeof item.base64 === "string"
        && item.base64.length > 0
        && typeof item.md5 === "string"
        && item.md5.length > 0;
    })
    .slice(0, 2)
    .map((attachment) => ({
      base64: attachment.base64,
      md5: attachment.md5,
      fileName: typeof attachment.fileName === "string" ? attachment.fileName : undefined,
    }));
}

function stripRobotMention(content: string): string {
  return content.replace(/^@\S+\s*/, "").trim();
}

/** Convert a text callback from Enterprise WeChat to the shared event model. */
export function parseWeComMessage(envelope: WeComEnvelope): Event | null {
  if (envelope.cmd !== "aibot_msg_callback" || !envelope.body) {
    return null;
  }

  const body = envelope.body;
  if (body.msgtype !== "text") {
    return null;
  }

  const sender = asRecord(body.from);
  const userId = readString(sender?.userid);
  const text = asRecord(body.text);
  const content = readString(text?.content);
  if (!userId || !content) {
    return null;
  }

  const chatType = body.chattype === "group" ? "group" : "single";
  const chatId = readString(body.chatid);
  const requestId = readString(envelope.headers?.req_id);
  const messageId = readString(body.msgid);
  const message = stripRobotMention(content);

  return {
    type: chatType === "group" ? EventType.GROUP_MESSAGE : EventType.PRIVATE_MESSAGE,
    userId,
    nickname: userId,
    groupId: chatType === "group" ? chatId : null,
    groupName: null,
    message,
    timestamp: Date.now(),
    raw: {
      ...body,
      channel: "wecom",
      wecom_req_id: requestId ?? "",
      wecom_msgid: messageId ?? "",
      wecom_chatid: chatId ?? "",
      wecom_chat_type: chatType,
    },
  };
}

/** Build a final Markdown reply for a message callback. */
export function createWeComMarkdownReply(
  requestId: string,
  content: string
): WeComCommand {
  return {
    cmd: "aibot_respond_msg",
    headers: { req_id: requestId },
    body: {
      msgtype: "markdown",
      markdown: { content },
    },
  };
}

/** Build a streaming reply. Each update replaces the previous content in WeCom. */
export function createWeComStreamReply(
  requestId: string,
  streamId: string,
  content: string,
  finish: boolean,
  images: readonly WeComReplyImage[] = [],
): WeComCommand {
  const stream: Record<string, unknown> = {
    id: streamId,
    content,
    finish,
  };
  if (finish && images.length > 0) {
    stream.msg_item = images.map((image) => ({
      msgtype: "image",
      image: { base64: image.base64, md5: image.md5 },
    }));
  }

  return {
    cmd: "aibot_respond_msg",
    headers: { req_id: requestId },
    body: {
      msgtype: "stream",
      stream,
    },
  };
}

export function createWeComMixedReply(
  requestId: string,
  content: string,
  images: readonly WeComReplyImage[],
): WeComCommand {
  return {
    cmd: "aibot_respond_msg",
    headers: { req_id: requestId },
    body: {
      msgtype: "mixed",
      mixed: {
        msg_item: [
          { msgtype: "text", text: { content } },
          ...images.map((image) => ({
            msgtype: "image",
            image: { base64: image.base64, md5: image.md5 },
          })),
        ],
      },
    },
  };
}

export function createWeComImageReply(requestId: string, mediaId: string): WeComCommand {
  return {
    cmd: "aibot_respond_msg",
    headers: { req_id: requestId },
    body: {
      msgtype: "image",
      image: { media_id: mediaId },
    },
  };
}

export class WeComBotAdapter {
  private readonly config: WeComBotConfig;
  private socket: WebSocket | null = null;
  private stopped = true;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onEvent: WeComEventHandler | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly seenMessageIds = new Map<string, number>();

  constructor(config: WeComBotConfig) {
    this.config = config;
  }

  start(onEvent: WeComEventHandler): void {
    this.onEvent = onEvent;
    this.stopped = false;

    if (!this.config.botId || !this.config.secret) {
      logger.error("Enterprise WeChat is enabled but WECOM_BOT_ID or WECOM_BOT_SECRET is missing");
      return;
    }

    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.onEvent = null;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.rejectPending(new Error("Enterprise WeChat adapter stopped"));

    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(1000, "shutdown");
    }
  }

  async sendResponse(event: Event, response: Response): Promise<void> {
    const requestId = readString(event.raw.wecom_req_id);
    if (!requestId) {
      throw new Error("Enterprise WeChat response is missing the callback req_id");
    }

    const streamId = readString(event.raw.wecom_stream_id);
    const images = readResponseImages(response);
    logger.info(`[WeCom] Sending response: stream=${streamId ? "yes" : "no"}, images=${images.length}`);
    const result = await this.sendCommand(
      streamId
        ? createWeComStreamReply(requestId, streamId, response.content, true)
        : createWeComMarkdownReply(requestId, response.content),
    );
    this.assertCommandSucceeded(result, "Enterprise WeChat text reply");

    if (images.length > 0) {
      await this.sendMediaImages(requestId, images);
    }
  }

  private async sendMediaImages(requestId: string, images: readonly WeComReplyImage[]): Promise<void> {
    for (const image of images) {
      const mediaId = await this.uploadImage(image);
      const result = await this.sendCommand(createWeComImageReply(requestId, mediaId));
      this.assertCommandSucceeded(result, "Enterprise WeChat image reply");
      logger.info(`[WeCom] Image media reply accepted: mediaId=${mediaId.slice(0, 8)}...`);
    }
  }

  private async uploadImage(image: WeComReplyImage): Promise<string> {
    const buffer = Buffer.from(image.base64, "base64");
    if (buffer.length === 0) {
      throw new Error("Enterprise WeChat image attachment is empty");
    }

    const totalChunks = Math.ceil(buffer.length / MEDIA_CHUNK_SIZE);
    if (totalChunks > MAX_MEDIA_CHUNKS) {
      throw new Error(`Enterprise WeChat image is too large: ${buffer.length} bytes`);
    }

    const md5 = createHash("md5").update(buffer).digest("hex");
    const initResult = await this.sendCommand({
      cmd: "aibot_upload_media_init",
      headers: { req_id: randomUUID() },
      body: {
        type: "image",
        filename: image.fileName || "performance-ranking.png",
        total_size: buffer.length,
        total_chunks: totalChunks,
        md5,
      },
    });
    this.assertCommandSucceeded(initResult, "Enterprise WeChat image upload init");

    const uploadId = asRecord(initResult.body)?.upload_id;
    if (typeof uploadId !== "string" || uploadId.length === 0) {
      throw new Error("Enterprise WeChat image upload did not return upload_id");
    }

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * MEDIA_CHUNK_SIZE;
      const chunk = buffer.subarray(start, Math.min(start + MEDIA_CHUNK_SIZE, buffer.length));
      const chunkResult = await this.sendCommand({
        cmd: "aibot_upload_media_chunk",
        headers: { req_id: randomUUID() },
        body: {
          upload_id: uploadId,
          chunk_index: chunkIndex,
          base64_data: chunk.toString("base64"),
        },
      });
      this.assertCommandSucceeded(chunkResult, `Enterprise WeChat image upload chunk ${chunkIndex + 1}`);
    }

    const finishResult = await this.sendCommand({
      cmd: "aibot_upload_media_finish",
      headers: { req_id: randomUUID() },
      body: { upload_id: uploadId },
    });
    this.assertCommandSucceeded(finishResult, "Enterprise WeChat image upload finish");

    const mediaId = asRecord(finishResult.body)?.media_id;
    if (typeof mediaId !== "string" || mediaId.length === 0) {
      throw new Error("Enterprise WeChat image upload did not return media_id");
    }
    return mediaId;
  }

  private assertCommandSucceeded(result: WeComEnvelope, action: string): void {
    if (result.errcode !== 0) {
      throw new Error(`${action} failed: ${result.errmsg ?? result.errcode ?? "unknown error"}`);
    }
  }

  private connect(): void {
    if (this.stopped || this.socket) {
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.config.websocketUrl);
    } catch (error) {
      logger.error(`Failed to create Enterprise WeChat WebSocket: ${error}`);
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    socket.on("open", () => {
      void this.subscribe(socket);
    });
    socket.on("message", (raw: RawData) => {
      this.handleRawMessage(raw);
    });
    socket.on("error", (error: Error) => {
      logger.warn(`Enterprise WeChat WebSocket error: ${error.message}`);
    });
    socket.on("close", () => {
      this.handleClose(socket);
    });
  }

  private async subscribe(socket: WebSocket): Promise<void> {
    try {
      const result = await this.sendCommand(
        {
          cmd: "aibot_subscribe",
          headers: { req_id: randomUUID() },
          body: {
            bot_id: this.config.botId,
            secret: this.config.secret,
          },
        },
        socket
      );

      if (result.errcode !== 0) {
        throw new Error(`subscription rejected: ${result.errmsg ?? result.errcode}`);
      }

      if (this.socket !== socket || this.stopped) {
        return;
      }

      this.reconnectAttempt = 0;
      this.startHeartbeat(socket);
      logger.info("Enterprise WeChat smart bot connected");
    } catch (error) {
      logger.error(`Enterprise WeChat subscription failed: ${error}`);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
  }

  private handleRawMessage(raw: RawData): void {
    const text = Array.isArray(raw)
      ? Buffer.concat(raw).toString("utf8")
      : raw.toString();

    let envelope: WeComEnvelope;
    try {
      envelope = JSON.parse(text) as WeComEnvelope;
    } catch (error) {
      logger.warn(`Ignoring invalid Enterprise WeChat frame: ${error}`);
      return;
    }

    const requestId = readString(envelope.headers?.req_id);
    const pending = requestId ? this.pending.get(requestId) : undefined;
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(requestId!);
      pending.resolve(envelope);
      return;
    }

    if (envelope.cmd !== "aibot_msg_callback") {
      logger.debug(`Ignoring Enterprise WeChat command: ${envelope.cmd ?? "unknown"}`);
      return;
    }

    const messageId = readString(envelope.body?.msgid);
    if (messageId && this.isDuplicate(messageId)) {
      logger.debug(`Ignoring duplicate Enterprise WeChat message: ${messageId}`);
      return;
    }

    const event = parseWeComMessage(envelope);
    if (!event || !this.onEvent) {
      return;
    }

    const streamId = randomUUID();
    const streamEvent: Event = {
      ...event,
      raw: {
        ...event.raw,
        wecom_stream_id: streamId,
      },
    };
    const responder: EventResponder = async (replyEvent, response) => {
      await this.sendResponse(replyEvent, response);
    };

    // A stream placeholder must be sent before model work starts. Otherwise
    // the callback can expire while the message buffer or LLM is still busy.
    void this.sendCommand(
      createWeComStreamReply(requestId ?? randomUUID(), streamId, "正在处理，请稍候…", false)
    )
      .then((result) => {
        if (result.errcode !== 0) {
          throw new Error(`Enterprise WeChat processing notice failed: ${result.errmsg ?? result.errcode}`);
        }
        return this.onEvent!(streamEvent, responder);
      })
      .catch((error) => {
        logger.error(`Enterprise WeChat message handling failed: ${error}`);
      });
  }

  private async sendCommand(command: WeComCommand, socket = this.socket): Promise<WeComEnvelope> {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Enterprise WeChat WebSocket is not connected");
    }

    const requestId = command.headers.req_id;
    const timeoutMs = this.config.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

    return new Promise<WeComEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Enterprise WeChat command timed out: ${command.cmd}`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify(command), (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  private startHeartbeat(socket: WebSocket): void {
    this.clearHeartbeat();
    const interval = this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      void this.sendCommand({
        cmd: "ping",
        headers: { req_id: randomUUID() },
      }, socket).catch((error: unknown) => {
        logger.warn(`Enterprise WeChat heartbeat failed: ${error}`);
        socket.close();
      });
    }, interval);
  }

  private handleClose(socket: WebSocket): void {
    if (this.socket !== socket) {
      return;
    }

    this.socket = null;
    this.clearHeartbeat();
    this.rejectPending(new Error("Enterprise WeChat WebSocket closed"));

    if (!this.stopped) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const baseDelay = this.config.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    const delay = Math.min(baseDelay * 2 ** this.reconnectAttempt, 60_000);
    this.reconnectAttempt += 1;
    logger.warn(`Enterprise WeChat reconnect scheduled in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private rejectPending(error: Error): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private isDuplicate(messageId: string): boolean {
    const now = Date.now();
    for (const [id, timestamp] of this.seenMessageIds) {
      if (now - timestamp > MESSAGE_DEDUPE_TTL_MS) {
        this.seenMessageIds.delete(id);
      }
    }

    if (this.seenMessageIds.has(messageId)) {
      return true;
    }

    this.seenMessageIds.set(messageId, now);
    if (this.seenMessageIds.size > MAX_DEDUPE_ENTRIES) {
      const firstId = this.seenMessageIds.keys().next().value;
      if (firstId) {
        this.seenMessageIds.delete(firstId);
      }
    }
    return false;
  }
}
