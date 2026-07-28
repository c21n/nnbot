import { logger } from './logger.js'

export interface RetryOptions {
  maxAttempts?: number        // default 3
  baseDelayMs?: number        // default 1000
  maxDelayMs?: number         // default 10000
  backoffMultiplier?: number  // default 2
  retryOn?: (error: unknown) => boolean
  retryOnStatus?: number[]    // default [429, 500, 502, 503, 504]
}

const DEFAULT_RETRY_STATUS = [429, 500, 502, 503, 504]

function isRetryableStatus(error: unknown, statusCodes: number[]): boolean {
  if (!(error instanceof Error)) return false
  const match = error.message.match(/(\d{3})/)
  if (!match || match[1] === undefined) return false
  return statusCodes.includes(parseInt(match[1]))
}

function getDelay(attempt: number, base: number, multiplier: number, max: number): number {
  const exponential = base * Math.pow(multiplier, attempt - 1)
  const jitter = exponential * (0.75 + Math.random() * 0.5) // ±25%
  return Math.min(jitter, max)
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3
  const baseDelayMs = options?.baseDelayMs ?? 1000
  const maxDelayMs = options?.maxDelayMs ?? 10000
  const backoffMultiplier = options?.backoffMultiplier ?? 2
  const retryOnStatus = options?.retryOnStatus ?? DEFAULT_RETRY_STATUS

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const shouldRetry = options?.retryOn
        ? options.retryOn(error)
        : isRetryableStatus(error, retryOnStatus)

      if (!shouldRetry || attempt === maxAttempts) throw error

      const delay = getDelay(attempt, baseDelayMs, backoffMultiplier, maxDelayMs)
      logger.warn(`[Retry] attempt ${attempt}/${maxAttempts}, retrying in ${Math.round(delay)}ms: ${error}`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
