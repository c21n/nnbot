/**
 * Logger Module
 *
 * Simple, clear logs for debugging.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private formatTime(): string {
    return new Date().toLocaleTimeString("zh-CN", { hour12: false });
  }

  debug(message: string): void {
    console.log(`\x1b[36m[${this.formatTime()}] ${message}\x1b[0m`);
  }

  info(message: string): void {
    console.log(`\x1b[32m[${this.formatTime()}] ${message}\x1b[0m`);
  }

  warn(message: string): void {
    console.log(`\x1b[33m[${this.formatTime()}] ${message}\x1b[0m`);
  }

  error(message: string): void {
    console.log(`\x1b[31m[${this.formatTime()}] ${message}\x1b[0m`);
  }

  // 收到消息: ← [私聊] 昵称(QQ号): 内容
  messageIn(userId: string, nickname: string, content: string, groupId?: string): void {
    const location = groupId ? `[群:${groupId}]` : "[私聊]";
    const text = content.length > 40 ? content.slice(0, 40) + "..." : content;
    console.log(`\x1b[36m← ${location} ${nickname}(${userId}): ${text}\x1b[0m`);
  }

  // 发送消息: → [QQ号] 内容
  messageOut(userId: string, content: string): void {
    const text = content.length > 40 ? content.slice(0, 40) + "..." : content;
    console.log(`\x1b[32m→ [${userId}] ${text}\x1b[0m`);
  }

  // 触发插件: [插件名] 信息
  plugin(name: string, info?: string): void {
    const msg = info ? ` ${name} (${info})` : ` ${name}`;
    console.log(`\x1b[35m  →${msg}\x1b[0m`);
  }

  // LLM 调用: [LLM] 模型名
  llm(model: string): void {
    console.log(`\x1b[33m  → LLM (${model})\x1b[0m`);
  }
}

export const logger = new Logger();
