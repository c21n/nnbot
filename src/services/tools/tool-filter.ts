/**
 * Tool Filter
 *
 * Smart filtering to prevent LLM from overusing tools.
 * Only enables tools when user intent matches tool capabilities.
 */

// Keywords that indicate search intent
const SEARCH_KEYWORDS = [
  // Explicit search requests
  "搜", "搜索", "查", "查询", "查找", "找一下", "搜一下",
  "search", "look up", "find",

  // News and real-time info
  "最新", "新闻", "消息", "动态", "更新",
  "latest", "news", "update",

  // Questions needing real-time data
  "今天", "昨天", "最近", "现在", "目前",
  "today", "yesterday", "recent", "now", "current",

  // Specific search patterns
  "多少钱", "价格", "股价", "天气", "比分",
  "price", "stock", "weather", "score",
];

// Patterns that should NOT trigger search
const NO_SEARCH_PATTERNS = [
  // Greetings
  /^(你好|hi|hello|hey|嗨|早|晚|下午好|晚上好|早上好)/i,
  /^(good\s*(morning|afternoon|evening|night))/i,

  // Simple questions that don't need search
  /^(什么|怎么|为什么|如何|能不能|可以)/,
  /^(what|how|why|can|could|would)/i,

  // Creative tasks
  /^(写|创作|编|做|画|设计)/,
  /^(write|create|make|draw|design)/i,

  // Emotional expressions
  /^(谢谢|感谢|辛苦|好的|嗯|哦|哈哈)/,
  /^(thanks|thank|ok|okay|haha|lol)/i,
];

export interface ToolFilterResult {
  shouldUseTools: boolean;
  filteredTools: string[];  // Tool names to enable
  reason?: string;
}

/**
 * Determine if tools should be enabled based on user message
 */
export function shouldEnableTools(
  userMessage: string,
  availableToolNames: string[]
): ToolFilterResult {
  const message = userMessage.toLowerCase().trim();

  // Check for explicit search keywords
  const hasSearchKeyword = SEARCH_KEYWORDS.some(keyword =>
    message.includes(keyword)
  );

  // Check for no-search patterns
  const isNoSearch = NO_SEARCH_PATTERNS.some(pattern =>
    pattern.test(message)
  );

  // Decision logic
  if (isNoSearch && !hasSearchKeyword) {
    return {
      shouldUseTools: false,
      filteredTools: [],
      reason: "日常对话，无需工具",
    };
  }

  if (hasSearchKeyword) {
    // Filter to only search-related tools
    const searchTools = availableToolNames.filter(name =>
      name === "web_search" || name === "calculator"
    );

    return {
      shouldUseTools: true,
      filteredTools: searchTools.length > 0 ? searchTools : availableToolNames,
      reason: "检测到搜索意图",
    };
  }

  // Default: enable tools (let LLM decide)
  return {
    shouldUseTools: true,
    filteredTools: availableToolNames,
    reason: "默认启用工具",
  };
}

/**
 * Create a beforeLLM hook that filters tools based on user intent
 */
export function createToolFilterHook(
  getTools: () => Array<{ name: string }>
): (messages: Array<{ role: string; content: string }>, event: { message: string }) => Promise<Array<{ role: string; content: string }>> {
  return async (messages, event) => {
    const availableTools = getTools().map(t => t.name);
    const filter = shouldEnableTools(event.message, availableTools);

    if (!filter.shouldUseTools) {
      // Add a system hint to discourage tool use
      const systemHint = {
        role: "system" as const,
        content: `[系统提示] 当前对话不需要使用工具。请直接回复，不要调用任何工具。`,
      };

      // Insert system hint before the last user message
      const result = [...messages];
      let lastUserIdx = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx > 0) {
        result.splice(lastUserIdx, 0, systemHint);
      }

      return result;
    }

    return messages;
  };
}
