/**
 * JWT Tests
 *
 * Unit tests for JWT token management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateToken, verifyToken, extractToken } from '../../auth/jwt.js';

describe('JWT', () => {
  const testPayload = {
    userId: 1,
    username: 'testuser',
    githubId: 12345,
  };

  describe('generateToken', () => {
    it('should generate valid token', () => {
      const token = generateToken(testPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include payload in token', () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.username).toBe(testPayload.username);
      expect(decoded.githubId).toBe(testPayload.githubId);
    });

    it('should set expiration', () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp! > decoded.iat!).toBe(true);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testPayload.userId);
    });

    it('should reject invalid token', () => {
      expect(() => {
        verifyToken('invalid-token');
      }).toThrow('Invalid token');
    });

    it('should reject tampered token', () => {
      const token = generateToken(testPayload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      expect(() => {
        verifyToken(tamperedToken);
      }).toThrow('Invalid token');
    });
  });

  describe('extractToken', () => {
    it('should extract token from Bearer header', () => {
      const token = 'test-token-123';
      const header = `Bearer ${token}`;

      const extracted = extractToken(header);

      expect(extracted).toBe(token);
    });

    it('should return null for missing header', () => {
      const extracted = extractToken(undefined);

      expect(extracted).toBeNull();
    });

    it('should return null for invalid format', () => {
      const extracted = extractToken('InvalidFormat token');

      expect(extracted).toBeNull();
    });

    it('should return null for Basic auth', () => {
      const extracted = extractToken('Basic dXNlcjpwYXNz');

      expect(extracted).toBeNull();
    });
  });
});
