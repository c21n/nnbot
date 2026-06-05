/**
 * Scanner Service
 *
 * Static code analysis for plugin security scanning.
 * Detects dangerous patterns like eval, require, fs operations, etc.
 */

import type { IScannerService, ScanResult, ScanWarning, ScanError } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Scanner');

/**
 * Dangerous patterns to detect
 */
interface DangerousPattern {
  readonly pattern: RegExp;
  readonly rule: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // eval and Function constructor
  {
    pattern: /\beval\s*\(/g,
    rule: 'no-eval',
    message: 'eval() is not allowed for security reasons',
    severity: 'error',
  },
  {
    pattern: /\bnew\s+Function\s*\(/g,
    rule: 'no-new-function',
    message: 'Function constructor is not allowed for security reasons',
    severity: 'error',
  },
  // Dynamic require
  {
    pattern: /\brequire\s*\(/g,
    rule: 'no-require',
    message: 'require() is not allowed, use ES modules instead',
    severity: 'warning',
  },
  // File system operations
  {
    pattern: /\bfs\.(read|write|unlink|rmdir|mkdir|chmod|chown|stat|access)/g,
    rule: 'no-fs',
    message: 'File system operations are not allowed',
    severity: 'error',
  },
  {
    pattern: /\brequire\s*\(\s*['"]fs['"]\s*\)/g,
    rule: 'no-fs-require',
    message: 'Requiring fs module is not allowed',
    severity: 'error',
  },
  // Child process
  {
    pattern: /\bchild_process\b/g,
    rule: 'no-child-process',
    message: 'child_process module is not allowed',
    severity: 'error',
  },
  {
    pattern: /\bexec\s*\(|\bspawn\s*\(|\bexecSync\s*\(|\bspawnSync\s*\(/g,
    rule: 'no-exec',
    message: 'Process execution is not allowed',
    severity: 'error',
  },
  // Process environment
  {
    pattern: /\bprocess\.env\b/g,
    rule: 'no-process-env',
    message: 'Accessing process.env is not allowed',
    severity: 'warning',
  },
  {
    pattern: /\bprocess\.exit\s*\(/g,
    rule: 'no-process-exit',
    message: 'process.exit() is not allowed',
    severity: 'error',
  },
  // Network operations (except fetch/axios for legitimate use)
  {
    pattern: /\bhttp\.createServer\s*\(/g,
    rule: 'no-http-server',
    message: 'Creating HTTP servers is not allowed',
    severity: 'error',
  },
  {
    pattern: /\bnet\.createServer\s*\(/g,
    rule: 'no-net-server',
    message: 'Creating network servers is not allowed',
    severity: 'error',
  },
  // Dangerous globals
  {
    pattern: /\bglobal\b/g,
    rule: 'no-global',
    message: 'Accessing global object is not allowed',
    severity: 'warning',
  },
  {
    pattern: /\bglobalThis\b/g,
    rule: 'no-global-this',
    message: 'Accessing globalThis is not allowed',
    severity: 'warning',
  },
  // Prototype pollution
  {
    pattern: /\b__proto__\b/g,
    rule: 'no-proto',
    message: 'Accessing __proto__ is not allowed',
    severity: 'error',
  },
  {
    pattern: /\bprototype\s*\[/g,
    rule: 'no-prototype',
    message: 'Dynamic prototype access is not allowed',
    severity: 'error',
  },
];

/**
 * Scanner service implementation
 */
export class ScannerService implements IScannerService {
  /**
   * Scan plugin file content
   */
  async scanPlugin(content: string): Promise<ScanResult> {
    const warnings: ScanWarning[] = [];
    const errors: ScanError[] = [];

    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      for (const pattern of DANGEROUS_PATTERNS) {
        // Reset regex lastIndex
        pattern.pattern.lastIndex = 0;

        let match;
        while ((match = pattern.pattern.exec(line)) !== null) {
          const column = match.index + 1;

          if (pattern.severity === 'error') {
            errors.push({
              line: lineNumber,
              column,
              message: pattern.message,
              rule: pattern.rule,
            });
          } else {
            warnings.push({
              line: lineNumber,
              column,
              message: pattern.message,
              rule: pattern.rule,
            });
          }
        }
      }
    }

    const passed = errors.length === 0;

    if (!passed) {
      logger.warn(`Plugin scan failed with ${errors.length} errors and ${warnings.length} warnings`);
    } else if (warnings.length > 0) {
      logger.info(`Plugin scan passed with ${warnings.length} warnings`);
    } else {
      logger.info('Plugin scan passed');
    }

    return {
      passed,
      warnings,
      errors,
    };
  }
}

/**
 * Singleton scanner service instance
 */
let scannerInstance: ScannerService | null = null;

/**
 * Get scanner service instance
 */
export function getScannerService(): ScannerService {
  if (!scannerInstance) {
    scannerInstance = new ScannerService();
  }
  return scannerInstance;
}
