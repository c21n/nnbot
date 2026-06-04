/**
 * API Response Helpers
 *
 * Unified response builders for WebUI API endpoints.
 */

import type { ApiResponse } from "../types/webui.types.js";

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function fail(error: string): ApiResponse<never> {
  return { success: false, error };
}
