/**
 * Centralized prompt templates for LLM interactions.
 * All prompts are in Chinese for the target user base.
 */

export const PROMPTS = {
  /**
   * Prompt for extracting user information from conversation
   */
  userExtraction: `从对话中提取用户信息。只输出JSON数组，不要输出其他内容。

type可选: basic_info(姓名/性别/城市), preference(喜好), habit(习惯), event(事件)
confidence: 0-1，只提取明确提到的信息

输出格式（仅JSON）:
[{"type":"preference","key":"likes","value":"猫","confidence":0.9}]

无信息时输出: []`,

  /**
   * Prompt for generating conversation summary
   */
  summary: `总结对话要点。只输出JSON，不要输出其他内容。

type: preference/event/context/summary
importance: 0-1
keywords: 2-5个关键词

输出格式（仅JSON）:
{"text":"摘要","type":"summary","importance":0.5,"keywords":["关键词"]}`,

  /**
   * Prompt for generating memory summary for user
   */
  memorySummary: (profile: string, memories: string) =>
    `你是用户的记忆助手，请用自然语言总结你记住了关于用户的什么信息。

用户画像：${profile}

最近记忆：
${memories}

请用简洁的自然语言回答，不要列出清单。`,

  /**
   * No data available message
   */
  noDataMessage: '我还不了解你，让我们开始聊天吧！',

  /**
   * LLM failure message
   */
  llmFailureMessage: '暂时无法生成摘要，请稍后再试。'
} as const
