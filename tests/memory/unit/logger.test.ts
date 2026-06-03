import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest'
import { logger, createContextLogger, setLogLevel, setLoggerEnabled } from '../../../src/memory/utils/logger'

describe('logger', () => {
  let logSpy: MockInstance
  let errorSpy: MockInstance
  let warnSpy: MockInstance
  let debugSpy: MockInstance

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation()
    errorSpy = vi.spyOn(console, 'error').mockImplementation()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation()
    debugSpy = vi.spyOn(console, 'debug').mockImplementation()
    setLoggerEnabled(true)
    setLogLevel('info')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('default mode', () => {
    test('includes ISO timestamp and level prefix', () => {
      // Arrange & Act
      logger.info('test message')

      // Assert
      expect(logSpy).toHaveBeenCalledTimes(1)
      const output = logSpy.mock.calls[0][0] as string
      expect(output).toMatch(/^\[INFO\] \d{4}-\d{2}-\d{2}T.*Z \| test message$/)
    })

    test('backward compatibility: logger.info(msg, obj) still works', () => {
      // Arrange
      const obj = { key: 'val' }

      // Act
      logger.info('msg', obj)

      // Assert
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('msg'), obj)
    })

    test('debug calls console.debug with level prefix', () => {
      // Arrange
      setLogLevel('debug')

      // Act
      logger.debug('debug msg')

      // Assert
      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(debugSpy.mock.calls[0][0]).toMatch(/^\[DEBUG\]/)
    })

    test('error uses console.error', () => {
      // Act
      logger.error('err msg')

      // Assert
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy.mock.calls[0][0]).toMatch(/^\[ERROR\].*err msg$/)
    })

    test('warn uses console.warn', () => {
      // Act
      logger.warn('warn msg')

      // Assert
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toMatch(/^\[WARN\].*warn msg$/)
    })
  })

  describe('setLogLevel / setLoggerEnabled', () => {
    test('setLoggerEnabled(false) suppresses all output', () => {
      // Arrange
      setLoggerEnabled(false)

      // Act
      logger.info('suppressed')
      logger.error('also suppressed')

      // Assert
      expect(logSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    test('setLogLevel filters by level', () => {
      // Arrange
      setLogLevel('warn')

      // Act
      logger.debug('hidden')
      logger.info('hidden')
      logger.warn('visible')
      logger.error('visible')

      // Assert
      expect(logSpy).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('structured mode (STRUCTURED_LOG=true)', () => {
    async function loadStructuredLogger() {
      process.env.STRUCTURED_LOG = 'true'
      vi.resetModules()
      const mod = await import('../../../src/memory/utils/logger')
      delete process.env.STRUCTURED_LOG
      return mod
    }

    test('produces valid JSON with all required fields', async () => {
      // Arrange
      const { logger: sLogger, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)

      // Act
      sLogger.info('structured test')

      // Assert
      expect(logSpy).toHaveBeenCalledTimes(1)
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      expect(parsed.level).toBe('info')
      expect(parsed.message).toBe('structured test')
      expect(typeof parsed.timestamp).toBe('string')
      expect(new Date(parsed.timestamp as string).toISOString()).toBe(parsed.timestamp)
    })

    test('createContextLogger binds correlationId', async () => {
      // Arrange
      const { createContextLogger: sCreate, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)
      const ctxLogger = sCreate('abc-123')

      // Act
      ctxLogger.info('with correlation')

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      expect(parsed.correlationId).toBe('abc-123')
    })

    test('context with undefined values omits those keys', async () => {
      // Arrange
      const { createContextLogger: sCreate, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)
      const ctxLogger = sCreate('test-id')

      // Act
      ctxLogger.info('msg', { valid: 'yes', missing: undefined, also: 'ok' })

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      const ctx = parsed.context as Record<string, unknown>
      expect(ctx.valid).toBe('yes')
      expect(ctx.also).toBe('ok')
      expect(ctx).not.toHaveProperty('missing')
    })

    test('backward compat: logger.info(msg, obj) merges args into context._args', async () => {
      // Arrange
      const { logger: sLogger, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)

      // Act
      sLogger.info('msg', { foo: 'bar' })

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      const ctx = parsed.context as Record<string, unknown>
      expect(ctx._args).toEqual([{ foo: 'bar' }])
    })

    test('contextLogger with empty context omits context field', async () => {
      // Arrange
      const { createContextLogger: sCreate, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)
      const ctxLogger = sCreate('id')

      // Act
      ctxLogger.info('no context')

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      expect(parsed).not.toHaveProperty('context')
    })
  })

  describe('non-serializable values', () => {
    async function loadStructuredLogger() {
      process.env.STRUCTURED_LOG = 'true'
      vi.resetModules()
      const mod = await import('../../../src/memory/utils/logger')
      delete process.env.STRUCTURED_LOG
      return mod
    }

    test('function value replaced with [Non-serializable]', async () => {
      // Arrange
      const { createContextLogger: sCreate, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)
      const ctxLogger = sCreate('test')

      // Act
      ctxLogger.info('msg', { fn: () => 'noop' })

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      expect((parsed.context as Record<string, unknown>).fn).toBe('[Non-serializable]')
    })

    test('symbol value replaced with [Non-serializable]', async () => {
      // Arrange
      const { createContextLogger: sCreate, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)
      const ctxLogger = sCreate('test')

      // Act
      ctxLogger.info('msg', { sym: Symbol('test') })

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      expect((parsed.context as Record<string, unknown>).sym).toBe('[Non-serializable]')
    })

    test('bigint value replaced with [Non-serializable]', async () => {
      // Arrange
      const { createContextLogger: sCreate, setLoggerEnabled: sSetEnabled } = await loadStructuredLogger()
      sSetEnabled(true)
      const ctxLogger = sCreate('test')

      // Act
      ctxLogger.info('msg', { big: BigInt(9007199254740993) })

      // Assert
      const output = logSpy.mock.calls[0][0] as string
      const parsed = JSON.parse(output) as Record<string, unknown>
      expect((parsed.context as Record<string, unknown>).big).toBe('[Non-serializable]')
    })
  })

  describe('LOG_LEVEL env var', () => {
    test('reads LOG_LEVEL from environment', async () => {
      // Arrange
      process.env.LOG_LEVEL = 'warn'
      vi.resetModules()
      const { logger: wLogger } = await import('../../../src/memory/utils/logger')
      delete process.env.LOG_LEVEL

      // Act
      wLogger.info('filtered')
      wLogger.warn('visible')

      // Assert
      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('setLogLevel validation', () => {
    test('ignores invalid level and keeps current level', () => {
      // Arrange
      setLogLevel('warn')

      // Act - try to set invalid level (cast to bypass TS)
      setLogLevel('trace' as unknown as Parameters<typeof setLogLevel>[0])

      // Assert - warn level still active, info is filtered
      logger.info('hidden')
      logger.warn('visible')
      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('createContextLogger', () => {
    test('returns logger with all level methods', () => {
      // Arrange & Act
      const ctxLogger = createContextLogger('test')

      // Assert
      expect(typeof ctxLogger.debug).toBe('function')
      expect(typeof ctxLogger.info).toBe('function')
      expect(typeof ctxLogger.warn).toBe('function')
      expect(typeof ctxLogger.error).toBe('function')
    })
  })
})
