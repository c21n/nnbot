# Web Search Tool

Web 搜索工具，支持多个搜索源，返回标题、摘要和链接。

## 支持的搜索源

| Provider | API Key | 免费额度 | 特点 |
|----------|---------|----------|------|
| `serpapi` | 必需 | 100/月 | Google 搜索，结果全面 |
| `bing` | 必需 | 1000/月 | 微软搜索，性价比高 |
| `google` | 必需 | 100/天 | Google 官方 API |
| `tavily` | 必需 | 1000/月 | AI 优化搜索 |
| `duckduckgo` | 无需 | 无限 | 免费，隐私友好 |
| `brave` | 必需 | 2000/月 | 隐私搜索 |

## 快速开始

### 1. 最简配置（免费，无需 API key）

```yaml
# config.yaml
tools:
  search:
    provider: duckduckgo
```

### 2. 使用 SerpAPI（推荐）

1. 访问 https://serpapi.com/ 注册，获取 API Key
2. 配置：

```yaml
tools:
  search:
    provider: serpapi
    apiKey: ${SERPAPI_API_KEY}
    region: cn  # 搜索区域
```

```env
# .env
SERPAPI_API_KEY=your_api_key_here
```

### 3. 使用 Bing Search

1. 访问 https://portal.azure.com 创建 Bing Search 资源
2. 配置：

```yaml
tools:
  search:
    provider: bing
```

```env
BING_API_KEY=your_api_key_here
```

### 4. 使用 Google Custom Search

1. 访问 https://console.cloud.google.com 创建 API Key
2. 访问 https://programmablesearchengine.google.com 创建搜索引擎，获取 CX
3. 配置：

```yaml
tools:
  search:
    provider: google
```

```env
GOOGLE_API_KEY=your_api_key_here
GOOGLE_CX=your_search_engine_id
```

### 5. 使用 Tavily（AI 优化）

1. 访问 https://tavily.com 注册，获取 API Key
2. 配置：

```yaml
tools:
  search:
    provider: tavily
```

```env
TAVILY_API_KEY=your_api_key_here
```

### 6. 使用 Brave Search

1. 访问 https://brave.com/search/api 注册，获取 API Key
2. 配置：

```yaml
tools:
  search:
    provider: brave
```

```env
BRAVE_API_KEY=your_api_key_here
```

## 高级配置

### 备用搜索源

当主搜索源失败时，自动尝试备用搜索源：

```yaml
tools:
  search:
    provider: serpapi
    apiKey: ${SERPAPI_API_KEY}
    fallback: duckduckgo  # SerpAPI 失败时使用 DuckDuckGo
```

### 搜索区域

```yaml
tools:
  search:
    provider: bing
    region: cn  # 中国区域结果
    # region: us  # 美国区域结果
```

### 多搜索源配置

```yaml
# .env 配置多个 API key
SERPAPI_API_KEY=xxx
BING_API_KEY=xxx
TAVILY_API_KEY=xxx
```

然后在对话中指定搜索源：
- "用 Bing 搜索 TypeScript 教程"
- "用 Tavily 搜索 AI 新闻"

## 使用方式

在对话中，LLM 会自动调用搜索工具：

- "帮我搜索 TypeScript 泛型教程"
- "最近有什么 AI 新闻？"
- "搜索 Node.js 最佳实践"

也可以指定搜索源：
- "用 DuckDuckGo 搜索隐私保护"
- "用 Bing 搜索微软文档"

## 工具参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词 |
| `limit` | number | 否 | 返回结果数量（默认 5，最大 10） |
| `language` | string | 否 | 搜索语言：`zh` 中文、`en` 英文、`ja` 日文、`ko` 韩文、`auto` 自动 |
| `provider` | string | 否 | 指定搜索源（覆盖默认配置） |

## 返回格式

```markdown
搜索 "TypeScript 泛型" 的结果（来源: serpapi）：

1. **TypeScript 泛型入门教程**
   介绍 TypeScript 泛型的基本概念和使用方法...
   https://example.com/ts-generics

2. **深入理解 TypeScript 泛型**
   泛型是 TypeScript 中最强大的特性之一...
   https://example.com/ts-generics-advanced
```

## 故障排除

### API Key 无效

```
搜索失败: Invalid API key
```

**解决**：检查 `.env` 文件中的 API Key 是否正确。

### 搜索源不可用

```
搜索源 "xxx" 不可用
```

**解决**：检查 API Key 是否配置，或切换到其他搜索源。

### 网络超时

```
搜索失败: The operation was aborted
```

**解决**：检查网络连接，或增加超时时间。

## 注意事项

1. **DuckDuckGo 限制**：Instant Answer API 结果有限，复杂查询可能无结果
2. **API 限制**：各搜索源有不同的免费额度
3. **超时设置**：默认使用工具系统的超时配置
4. **结果缓存**：相同查询短期内不会重复调用 API
5. **语言偏好**：建议设置 `language` 参数以获得更准确的结果
