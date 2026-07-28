import { LLMProvider, LLMSummaryResult } from './llm.provider.js'
import { ChatMessage } from '../types/index.js'
import { withRetry } from '../utils/retry.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

export class DeepSeekLLM implements LLMProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model = 'deepseek-chat') {
    this.apiKey = apiKey
    this.model = model
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    return withRetry(async () => {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`DeepSeek API error: ${response.status} - ${error}`)
      }

      const data = await response.json() as { choices: { message: { content: string } }[] }
      const content = data.choices[0]?.message?.content
      if (content === undefined) {
        throw new Error('DeepSeek API returned empty response')
      }
      return content
    })
  }

  async summarize(params: {
    messages: { role: string; content: string }[]
    prompt: string
  }): Promise<LLMSummaryResult> {
    const formattedMessages: ChatMessage[] = [
      {
        role: 'system',
        content: params.prompt
      },
      ...params.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ]

    const response = await this.chat(formattedMessages)

    // 尝试解析 JSON（支持 {} 和 []）
    try {
      // 先尝试提取 ```json ... ``` 代码块
      const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      const raw = codeBlock ? codeBlock[1].trim() : response

      // 匹配第一个完整的 JSON 对象或数组
      const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1])
      }
    } catch {
      // 解析失败，返回纯文本
    }

    return {
      text: response,
      type: 'summary',
      importance: 0.5,
      keywords: []
    }
  }
}
