/**
 * Message Buffer
 *
 * Buffers messages from the same channel and conversation, then dispatches
 * the combined event through the responder that belongs to that channel.
 */

import type { Event, EventResponder } from "../interfaces.js";
import type { IMultimodalMessage, IMultimodalContent } from "../multimodal/types/multimodal.types.js";
import { logger } from "./logger.js";

interface BufferedMessage {
  event: Event;
  messages: string[];
  multimodalContents: IMultimodalContent[];
  responder: EventResponder;
  timer: ReturnType<typeof setTimeout>;
}

export class MessageBuffer {
  private readonly buffers = new Map<string, BufferedMessage>();
  private readonly delay: number;
  private readonly onFlush: (event: Event, responder: EventResponder) => Promise<void>;

  constructor(
    delay: number = 1000,
    onFlush: (event: Event, responder: EventResponder) => Promise<void>
  ) {
    this.delay = delay;
    this.onFlush = onFlush;
  }

  /** Add an event to the buffer for its channel and conversation. */
  add(event: Event, responder: EventResponder): void {
    const channel = typeof event.raw.channel === "string" ? event.raw.channel : "default";
    const key = event.groupId
      ? `${channel}:group:${event.groupId}:${event.userId}`
      : `${channel}:private:${event.userId}`;

    const existing = this.buffers.get(key);
    if (existing) {
      existing.messages.push(event.message);
      if (event.multimodal?.contents) {
        existing.multimodalContents.push(...event.multimodal.contents);
      }
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => void this.flush(key), this.delay);
      logger.debug(`[Buffer] appended message for ${event.userId}; total=${existing.messages.length}`);
      return;
    }

    const timer = setTimeout(() => void this.flush(key), this.delay);
    this.buffers.set(key, {
      event,
      messages: [event.message],
      multimodalContents: event.multimodal?.contents ? [...event.multimodal.contents] : [],
      responder,
      timer,
    });
    logger.debug(`[Buffer] created buffer for ${event.userId}`);
  }

  private async flush(key: string): Promise<void> {
    const buffer = this.buffers.get(key);
    if (!buffer) {
      return;
    }

    this.buffers.delete(key);
    const combinedMessage = buffer.messages.join("\n");
    const multimodal: IMultimodalMessage | undefined = buffer.multimodalContents.length > 0
      ? { contents: buffer.multimodalContents, text: combinedMessage }
      : undefined;

    const event: Event = {
      ...buffer.event,
      message: combinedMessage,
      timestamp: Date.now(),
      multimodal,
    };

    logger.info(`[Buffer] flushed ${buffer.messages.length} messages for ${event.userId}`);
    await this.onFlush(event, buffer.responder);
  }

  getStatus(): { pending: number; buffers: string[] } {
    return {
      pending: this.buffers.size,
      buffers: Array.from(this.buffers.keys()),
    };
  }
}
