import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { checkOutputSafety, checkOutputSafetyDetailed } from '../../../src/memory/security/output-check'

describe('OutputCheck', () => {
  describe('checkOutputSafety', () => {
    it('should return original response when safe', () => {
      const response = '今天天气真好，适合出门散步。'
      expect(checkOutputSafety(response)).toBe(response)
    })

    it('should block response containing API key', () => {
      const response = '你的 api_key 是 sk-1234567890'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing password', () => {
      const response = '密码 password: mySecret123 已设置'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing secret', () => {
      const response = '密钥 secret=abc123xyz'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing token', () => {
      const response = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing Chinese phone number', () => {
      const response = '请联系 13812345678 获取更多信息'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing Chinese ID card', () => {
      const response = '身份证号 110101199001011234 已验证'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing email', () => {
      const response = '请发送邮件到 user@example.com'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should block response containing credit card', () => {
      const response = '信用卡 4111-1111-1111-1111 已保存'
      expect(checkOutputSafety(response)).toBe('抱歉，我无法回答这个问题。')
    })

    it('should not block normal numbers', () => {
      const response = '今天温度是 25 度'
      expect(checkOutputSafety(response)).toBe(response)
    })

    it('should not block normal text with similar patterns', () => {
      const response = '这是一个测试消息'
      expect(checkOutputSafety(response)).toBe(response)
    })
  })

  describe('checkOutputSafetyDetailed', () => {
    it('should return safe=true for safe content', () => {
      const result = checkOutputSafetyDetailed('普通文本内容')
      expect(result.safe).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should return safe=false with reason for sensitive content', () => {
      const result = checkOutputSafetyDetailed('api_key: 12345')
      expect(result.safe).toBe(false)
      expect(result.reason).toBeDefined()
      expect(result.reason).toContain('Sensitive data detected')
    })
  })
})
