/**
 * Logger module with console output and a bounded in-memory history for WebUI monitoring.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  readonly id: number;
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
}

const MAX_LOG_ENTRIES = 500;

class Logger {
  private readonly entries: LogEntry[] = [];
  private nextId = 1;

  private formatTime(): string {
    return new Date().toLocaleTimeString("zh-CN", { hour12: false });
  }

  private write(level: LogEntry["level"], message: string, color: string): void {
    this.entries.push({
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level,
      message,
    });
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_LOG_ENTRIES);
    }

    console.log(`${color}[${this.formatTime()}] ${message}\x1b[0m`);
  }

  getRecentLogs(limit = 100): LogEntry[] {
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), MAX_LOG_ENTRIES));
    return this.entries.slice(-safeLimit).reverse();
  }

  debug(message: string): void {
    this.write("debug", message, "\x1b[36m");
  }

  info(message: string): void {
    this.write("info", message, "\x1b[32m");
  }

  warn(message: string): void {
    this.write("warn", message, "\x1b[33m");
  }

  error(message: string): void {
    this.write("error", message, "\x1b[31m");
  }

  messageIn(userId: string, nickname: string, content: string, groupId?: string): void {
    const location = groupId ? `[group:${groupId}]` : "[private]";
    const text = content.length > 40 ? `${content.slice(0, 40)}...` : content;
    this.write("info", `IN ${location} ${nickname}(${userId}): ${text}`, "\x1b[36m");
  }

  messageOut(userId: string, content: string): void {
    const text = content.length > 40 ? `${content.slice(0, 40)}...` : content;
    this.write("info", `OUT [${userId}] ${text}`, "\x1b[32m");
  }

  plugin(name: string, info?: string): void {
    const suffix = info ? ` (${info})` : "";
    this.write("info", `PLUGIN ${name}${suffix}`, "\x1b[35m");
  }

  llm(model: string): void {
    this.write("debug", `LLM (${model})`, "\x1b[33m");
  }
}

export const logger = new Logger();
