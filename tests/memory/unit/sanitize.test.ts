import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { sanitizeProfile } from '../../../src/memory/security/sanitize'
import { UserProfile } from '../../../src/memory/types'

function createProfile(overrides?: Record<string, unknown>): UserProfile {
  return {
    user_id: 'u1',
    basic_info: { name: 'Test', gender: 'male', city: 'Beijing' },
    preferences: { likes: ['music'], dislikes: ['sports'] },
    habits: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides
  } as UserProfile
}

describe('sanitizeProfile', () => {
  test('returns safe fields unchanged', () => {
    // Arrange
    const profile = createProfile()

    // Act
    const result = sanitizeProfile(profile)

    // Assert
    expect(result.basic_info).toEqual({ name: 'Test', gender: 'male', city: 'Beijing' })
    expect(result.preferences).toEqual({ likes: ['music'], dislikes: ['sports'] })
  })

  test('strips api_key field', () => {
    // Arrange
    const profile = createProfile({
      preferences: { likes: [], dislikes: [], api_key: 'sk-12345' }
    })

    // Act
    const result = sanitizeProfile(profile as unknown as UserProfile)

    // Assert
    const prefs = result.preferences as Record<string, unknown>
    expect(prefs).not.toHaveProperty('api_key')
    expect(prefs.likes).toEqual([])
  })

  test('strips password field', () => {
    // Arrange
    const profile = createProfile({
      habits: { password: 'secret123', morning: 'coffee' }
    })

    // Act
    const result = sanitizeProfile(profile as unknown as UserProfile)

    // Assert
    const habits = result.habits as Record<string, unknown>
    expect(habits).not.toHaveProperty('password')
    expect(habits.morning).toBe('coffee')
  })

  test('strips token, phone, email, birthday fields', () => {
    // Arrange
    const profile = createProfile({
      habits: { token: 'abc', phone: '123', email: 'a@b.com', birthday: '2000-01-01', hobby: 'reading' }
    })

    // Act
    const result = sanitizeProfile(profile as unknown as UserProfile)

    // Assert
    const habits = result.habits as Record<string, unknown>
    expect(habits).not.toHaveProperty('token')
    expect(habits).not.toHaveProperty('phone')
    expect(habits).not.toHaveProperty('email')
    expect(habits).not.toHaveProperty('birthday')
    expect(habits.hobby).toBe('reading')
  })

  test('truncates long strings to 200 chars', () => {
    // Arrange
    const longStr = 'a'.repeat(300)
    const profile = createProfile({
      basic_info: { name: longStr, city: 'Beijing' }
    })

    // Act
    const result = sanitizeProfile(profile)

    // Assert
    const info = result.basic_info as Record<string, unknown>
    expect((info.name as string).length).toBe(203) // 200 + '...'
    expect(info.name).toBe('a'.repeat(200) + '...')
  })

  test('does not modify original profile (immutable)', () => {
    // Arrange
    const profile = createProfile({
      preferences: { likes: ['music'], dislikes: [], api_key: 'sk-secret' }
    })
    const originalKeys = Object.keys(profile.preferences)

    // Act
    sanitizeProfile(profile as unknown as UserProfile)

    // Assert
    expect(Object.keys(profile.preferences)).toEqual(originalKeys)
    expect((profile.preferences as Record<string, unknown>).api_key).toBe('sk-secret')
  })

  test('handles empty profile gracefully', () => {
    // Arrange
    const profile = createProfile({
      basic_info: {},
      preferences: { likes: [], dislikes: [] },
      habits: {}
    })

    // Act
    const result = sanitizeProfile(profile)

    // Assert
    expect(result.basic_info).toEqual({})
    expect(result.preferences).toEqual({ likes: [], dislikes: [] })
  })

  test('handles nested sensitive keys', () => {
    // Arrange
    const profile = createProfile({
      habits: {
        nested: {
          api_key: 'should-be-removed',
          safe: 'keep'
        }
      }
    })

    // Act
    const result = sanitizeProfile(profile as unknown as UserProfile)

    // Assert
    const habits = result.habits as Record<string, unknown>
    const nested = habits.nested as Record<string, unknown>
    expect(nested).not.toHaveProperty('api_key')
    expect(nested.safe).toBe('keep')
  })
})
