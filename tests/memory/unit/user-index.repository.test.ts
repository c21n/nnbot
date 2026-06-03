import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { SqliteUserIndexRepository } from '../../../src/memory/storage/sqlite/user-index.repository'
import { getSqliteConnection } from '../../../src/memory/storage/sqlite/connection'

// Mock the connection module
vi.mock('../../../src/memory/storage/sqlite/connection', () => {
  const mockStmt = {
    run: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn()
  }
  const mockDb = {
    prepare: vi.fn().mockReturnValue(mockStmt)
  }
  return {
    getSqliteConnection: vi.fn().mockReturnValue(mockDb),
    closeSqlite: vi.fn()
  }
})

describe('SqliteUserIndexRepository', () => {
  let repo: SqliteUserIndexRepository

  beforeEach(() => {
    repo = new SqliteUserIndexRepository()
    vi.clearAllMocks()
  })

  describe('upsert()', () => {
    it('should insert or replace user index', async () => {
      // Arrange
      const mockDb = vi.mocked(getSqliteConnection)()
      const mockStmt = { run: vi.fn() }
      mockDb.prepare.mockReturnValue(mockStmt as any)

      // Act
      await repo.upsert('user-1')

      // Assert
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE'))
      expect(mockStmt.run).toHaveBeenCalledWith('user-1', expect.any(Number))
    })
  })

  describe('getAllUserIds()', () => {
    it('should return all user IDs', async () => {
      // Arrange
      const mockDb = vi.mocked(getSqliteConnection)()
      const mockStmt = {
        all: vi.fn().mockReturnValue([
          { user_id: 'user-1' },
          { user_id: 'user-2' },
          { user_id: 'user-3' }
        ])
      }
      mockDb.prepare.mockReturnValue(mockStmt as any)

      // Act
      const result = await repo.getAllUserIds()

      // Assert
      expect(result).toEqual(['user-1', 'user-2', 'user-3'])
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT user_id FROM user_index')
    })

    it('should return empty array when no users', async () => {
      // Arrange
      const mockDb = vi.mocked(getSqliteConnection)()
      const mockStmt = {
        all: vi.fn().mockReturnValue([])
      }
      mockDb.prepare.mockReturnValue(mockStmt as any)

      // Act
      const result = await repo.getAllUserIds()

      // Assert
      expect(result).toEqual([])
    })
  })

  describe('delete()', () => {
    it('should delete user from index', async () => {
      // Arrange
      const mockDb = vi.mocked(getSqliteConnection)()
      const mockStmt = { run: vi.fn() }
      mockDb.prepare.mockReturnValue(mockStmt as any)

      // Act
      await repo.delete('user-1')

      // Assert
      expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM user_index WHERE user_id = ?')
      expect(mockStmt.run).toHaveBeenCalledWith('user-1')
    })
  })
})
