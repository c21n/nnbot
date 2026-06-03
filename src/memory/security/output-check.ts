// Sensitive data patterns
const SENSITIVE_PATTERNS = [
  // API keys and secrets
  /\bapi[_\s]?key\b/i,
  /\bpassword\s*[:=]\s*\S+/i,
  /\bsecret\s*[:=]\s*\S+/i,
  /\btoken\s*[:=]\s*\S+/i,

  // Chinese phone numbers (1[3-9]X-XXXX-XXXX)
  /1[3-9]\d{9}/,

  // Chinese ID card (18 digits, last may be X)
  /\d{17}[\dXx]/,

  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,

  // Credit card numbers (13-19 digits, may have spaces/dashes)
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/
]

export interface OutputCheckResult {
  safe: boolean
  reason?: string
}

/**
 * Check if the output contains sensitive information
 * @returns The original response if safe, or a replacement message if sensitive data detected
 */
export function checkOutputSafety(response: string): string {
  const result = checkOutputSafetyDetailed(response)
  return result.safe ? response : '抱歉，我无法回答这个问题。'
}

/**
 * Check output safety with detailed result
 */
export function checkOutputSafetyDetailed(response: string): OutputCheckResult {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(response)) {
      return {
        safe: false,
        reason: `Sensitive data detected: ${pattern.source}`
      }
    }
  }
  return { safe: true }
}
