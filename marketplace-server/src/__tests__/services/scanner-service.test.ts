/**
 * Scanner Service Tests
 *
 * Unit tests for the plugin security scanner.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScannerService } from '../../services/scanner-service.js';

describe('ScannerService', () => {
  let scanner: ScannerService;

  beforeEach(() => {
    scanner = new ScannerService();
  });

  describe('scanPlugin', () => {
    it('should pass safe code', async () => {
      const safeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            return { content: 'Hello' };
          }
        };
      `;

      const result = await scanner.scanPlugin(safeCode);

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect eval() usage', async () => {
      const unsafeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            const result = eval('1 + 1');
            return { content: result };
          }
        };
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('no-eval');
    });

    it('should detect Function constructor', async () => {
      const unsafeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            const fn = new Function('return 1 + 1');
            return { content: fn() };
          }
        };
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('no-new-function');
    });

    it('should detect require() usage as warning', async () => {
      const codeWithRequire = `
        export default {
          name: 'test-plugin',
          handle(event) {
            const fs = require('fs');
            return { content: 'Hello' };
          }
        };
      `;

      const result = await scanner.scanPlugin(codeWithRequire);

      // require is a warning, not an error
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].rule).toBe('no-require');
    });

    it('should detect fs operations', async () => {
      const unsafeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            fs.readFileSync('/etc/passwd');
            return { content: 'Hello' };
          }
        };
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('no-fs');
    });

    it('should detect child_process usage', async () => {
      const unsafeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            const { exec } = require('child_process');
            exec('rm -rf /');
            return { content: 'Hello' };
          }
        };
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect process.env access as warning', async () => {
      const codeWithEnv = `
        export default {
          name: 'test-plugin',
          handle(event) {
            const key = process.env.API_KEY;
            return { content: key };
          }
        };
      `;

      const result = await scanner.scanPlugin(codeWithEnv);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].rule).toBe('no-process-env');
    });

    it('should detect process.exit', async () => {
      const unsafeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            process.exit(0);
            return { content: 'Hello' };
          }
        };
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('no-process-exit');
    });

    it('should detect __proto__ access', async () => {
      const unsafeCode = `
        export default {
          name: 'test-plugin',
          handle(event) {
            const obj = {};
            obj.__proto__.polluted = true;
            return { content: 'Hello' };
          }
        };
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('no-proto');
    });

    it('should report line numbers correctly', async () => {
      const unsafeCode = `line 1
line 2
eval('test')
line 4`;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.errors[0].line).toBe(3);
    });

    it('should handle multiple issues', async () => {
      const unsafeCode = `
        eval('test');
        const fs = require('fs');
        process.exit(0);
      `;

      const result = await scanner.scanPlugin(unsafeCode);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
