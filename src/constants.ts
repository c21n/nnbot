/**
 * Plugin priority constants
 * Lower number = higher priority (executed first)
 */
export const PLUGIN_PRIORITY = {
  ADMIN: 10,
  RULE_MATCH: 50,
  AI_CHAT: 100,
  DEFAULT: 100,
} as const;
