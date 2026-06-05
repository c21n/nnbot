/**
 * JWT Token Management
 *
 * Generate and verify JWT tokens.
 */

import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types/index.js';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JWT');

/**
 * Generate JWT token
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const config = getConfig();
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as any,
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload {
  const config = getConfig();
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    return decoded;
  } catch (err) {
    logger.warn('Invalid JWT token', err);
    throw new Error('Invalid token');
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}
