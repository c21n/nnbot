type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ContextLogger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'
let enabled = true
let customLogger: Logger | null = null
const isStructured = process.env.STRUCTURED_LOG === 'true'

function shouldLog(level: LogLevel): boolean {
  return enabled && LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v
  }
  return result
}

function toJSON(level: LogLevel, msg: string, cid?: string, ctx?: Record<string, unknown>, args?: unknown[]): string {
  const entry: Record<string, unknown> = { level, message: msg, timestamp: new Date().toISOString() }
  if (cid) entry.correlationId = cid
  const merged: Record<string, unknown> = ctx ? { ...ctx } : {}
  if (args?.length) merged._args = args
  const clean = sanitize(merged)
  if (Object.keys(clean).length > 0) entry.context = clean
  return JSON.stringify(entry, (_k, v) =>
    typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint' ? '[Non-serializable]' : v
  )
}

function log(level: LogLevel, msg: string, cid?: string, ctx?: Record<string, unknown>, args?: unknown[]): void {
  if (!shouldLog(level)) return

  // Use custom logger if set (e.g. host application's logger)
  if (customLogger) {
    customLogger[level](msg, ...(args ?? []))
    return
  }

  const out = level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : level === 'debug' ? console.debug
    : console.log
  if (isStructured) {
    out(toJSON(level, msg, cid, ctx, args))
  } else {
    out(`[${level.toUpperCase()}] ${new Date().toISOString()} | ${msg}`, ...(args ?? []))
  }
}

export const logger: Logger = {
  debug: (m, ...a) => log('debug', m, undefined, undefined, a),
  info: (m, ...a) => log('info', m, undefined, undefined, a),
  warn: (m, ...a) => log('warn', m, undefined, undefined, a),
  error: (m, ...a) => log('error', m, undefined, undefined, a),
}

export function createContextLogger(correlationId: string): ContextLogger {
  return {
    debug: (m, c) => log('debug', m, correlationId, c),
    info: (m, c) => log('info', m, correlationId, c),
    warn: (m, c) => log('warn', m, correlationId, c),
    error: (m, c) => log('error', m, correlationId, c),
  }
}

export function setLogLevel(level: LogLevel): void {
  if (!(level in LOG_LEVELS)) return
  currentLevel = level
}
export function setLoggerEnabled(flag: boolean): void { enabled = flag }

/**
 * Set a custom logger to redirect memory module logs through the host application's logger.
 * Pass null to restore the default logger.
 */
export function setCustomLogger(logger: Logger | null): void { customLogger = logger }
