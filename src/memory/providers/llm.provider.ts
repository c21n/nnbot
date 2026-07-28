import { ChatMessage, MemoryType } from '../types/index.js'

export interface LLMSummaryResult {
  text: string
  type: MemoryType
  importance: number
  keywords: string[]
}

export interface ILLMProvider {
  chat(messages: ChatMessage[]): Promise<string>
  summarize(params: {
    messages: { role: string; content: string }[]
    prompt: string
  }): Promise<LLMSummaryResult>
}

/** @deprecated Use ILLMProvider instead */
export type LLMProvider = ILLMProvider
