/**
 * Message Buffer
 *
 * Buffers messages from the same user and processes them together
 * after a delay, to handle users who send multiple messages in quick succession.
 */

import { logger } from "./logger.js";

interface BufferedMessage {
  userId: string;
  nickname: string;
  groupId: string | null;
  groupName: string | null;
  messages: string[];
  timer: ReturnType<typeof setTimeout>;
}

export class MessageBuffer {
  private buffers: Map<string, BufferedMessage> = new Map();
  private delay: number;
  private onFlush: (
    userId: string,
    nickname: string,
    groupId: string | null,
    groupName: string | null,
    combinedMessage: string
  ) => Promise<void>;

  constructor(
    delay: number = 1000,
    onFlush: (
      userId: string,
      nickname: string,
      groupId: string | null,
      groupName: string | null,
      combinedMessage: string
    ) => Promise<void>
  ) {
    this.delay = delay;
    this.onFlush = onFlush;
  }

  /**
   * Add message to buffer
   */
  add(
    userId: string,
    nickname: string,
    groupId: string | null,
    groupName: string | null,
    message: string
  ): void {
    const key = groupId ? `group:${groupId}:${userId}` : `private:${userId}`;

    // If there's an existing buffer, append message and reset timer
    if (this.buffers.has(key)) {
      const buffer = this.buffers.get(key)!;
      buffer.messages.push(message);
      clearTimeout(buffer.timer);
      buffer.timer = setTimeout(() => this.flush(key), this.delay);
      logger.debug(`[Buffer] ${userId} 追加消息，当前 ${buffer.messages.length} 条`);
      return;
    }

    // Create new buffer
    const timer = setTimeout(() => this.flush(key), this.delay);
    this.buffers.set(key, {
      userId,
      nickname,
      groupId,
      groupName,
      messages: [message],
      timer,
    });
    logger.debug(`[Buffer] ${userId} 新建缓冲`);
  }

  /**
   * Flush buffer and process messages
   */
  private async flush(key: string): Promise<void> {
    const buffer = this.buffers.get(key);
    if (!buffer) {
      return;
    }

    // Remove from map
    this.buffers.delete(key);

    // Combine messages
    const combinedMessage = buffer.messages.join("\n");

    logger.info(
      `[Buffer] ${buffer.nickname}(${buffer.userId}) 合并 ${buffer.messages.length} 条消息`
    );

    // Process
    await this.onFlush(
      buffer.userId,
      buffer.nickname,
      buffer.groupId,
      buffer.groupName,
      combinedMessage
    );
  }

  /**
   * Get current buffer status
   */
  getStatus(): { pending: number; buffers: string[] } {
    return {
      pending: this.buffers.size,
      buffers: Array.from(this.buffers.keys()),
    };
  }
}
