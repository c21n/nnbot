# Web Search Tool

Web 搜索工具，使用 SerpAPI 进行 Google 搜索，返回标题、摘要和链接。

## 配置

### 1. 获取 SerpAPI Key

1. 访问 [SerpAPI](https://serpapi.com/) 注册账号
2. 获取 API Key（免费额度：每月 100 次搜索）

### 2. 配置环境变量

在 `.env` 文件中添加：

```env
SERPAPI_API_KEY=your_api_key_here
```

### 3. 配置 config.yaml（可选）

```yaml
tools:
  search:
    provider: serpapi
    apiKey: ${SERPAPI_API_KEY}
    defaultLimit: 5
```

## 使用方式

在对话中，LLM 会自动调用搜索工具。例如：

- "帮我搜索 TypeScript 泛型教程"
- "最近有什么 AI 新闻？"
- "搜索 Node.js 最佳实践"

## 工具参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 搜索关键词 |
| `limit` | number | 否 | 返回结果数量（默认 5，最大 10） |
| `language` | string | 否 | 搜索语言：`zh` 中文、`en` 英文、`ja` 日文、`ko` 韩文、`auto` 自动 |

## 返回格式

```markdown
搜索 "TypeScript 泛型" 的结果：

1. **TypeScript 泛型入门教程**
   介绍 TypeScript 泛型的基本概念和使用方法...
   https://example.com/ts-generics

2. **深入理解 TypeScript 泛型**
   泛型是 TypeScript 中最强大的特性之一...
   https://example.com/ts-generics-advanced
```

## 替代方案

如果不想使用 SerpAPI，可以替换为其他搜索 API：

### Bing Search API

```typescript
// 使用 Microsoft Bing Search API
const response = await fetch(
  `https://api.bing.microsoft.com/v7.0/search?q=${query}`,
  { headers: { "Ocp-Apim-Subscription-Key": apiKey } }
);
```

### Google Custom Search API

```typescript
// 使用 Google Custom Search API
const response = await fetch(
  `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${query}`
);
```

## 注意事项

1. **API 限制**：SerpAPI 免费版每月 100 次搜索
2. **超时设置**：默认 5 秒超时，可在工具配置中调整
3. **结果缓存**：相同查询短期内不会重复调用 API
4. **语言偏好**：建议设置 `language` 参数以获得更准确的结果
