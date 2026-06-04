/**
 * LLM adapter that calls OpenAI-compatible /v1/chat/completions endpoint
 * Implements ILLMProvider from memory module (chat + summarize)
 */

import type { ILLMProvider, LLMSummaryResult } from '../memory/providers/llm.provider.js'
import type { ChatMessage } from '../memory/types/memory.types.js'
import type { MemoryType } from '../memory/types/memory.types.js'

export class OpenAICompatibleLLM implements ILLMProvider {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly model: string

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
    this.model = model
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`LLM API error ${response.status}: ${body}`)
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    return data.choices[0].message.content
  }

  async summarize(params: {
    messages: { role: string; content: string }[]
    prompt: string
  }): Promise<LLMSummaryResult> {
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: params.prompt },
      ...params.messages.map(m => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ]

    const response = await this.chat(chatMessages)

    // Try to parse JSON from response
    const parsed = this.tryParseJson(response)
    if (parsed) {
      return parsed as LLMSummaryResult
    }

    // Fallback: treat entire response as summary text
    return {
      text: response,
      type: 'summary' as MemoryType,
      importance: 0.5,
      keywords: [],
    }
  }

  private tryParseJson(text: string): unknown | null {
    // Try extracting from ```json``` code block
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text

    // Try to find JSON object or array
    const objectMatch = jsonStr.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[1])
      } catch {
        // Not valid JSON
      }
    }

    return null
  }
}
