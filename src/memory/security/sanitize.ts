import { UserProfile } from '../types/index.js'

const SENSITIVE_KEYS = /api[_\s]?key|password|secret|token|phone|email|birthday/i
const MAX_STRING_LENGTH = 200

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) + '...' : value
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item))
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>)
  }
  return value
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(key)) continue
    result[key] = sanitizeValue(value)
  }
  return result
}

/**
 * Sanitize user profile before injecting into LLM prompt.
 * - Strips sensitive fields (api_key, password, secret, token, phone, email, birthday)
 * - Truncates strings > 200 chars
 * - Returns a new object (immutable)
 */
export function sanitizeProfile(profile: UserProfile): Record<string, unknown> {
  return sanitizeObject(profile as unknown as Record<string, unknown>)
}
