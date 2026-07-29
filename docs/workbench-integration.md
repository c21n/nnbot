# AI Workbench Integration

## Boundary

`ai-workbench` owns business logic, databases, retrieval, matching and data formatting. `nnbot` only calls its HTTP API and exposes selected read-only operations as model tools.

```text
WeCom / OneBot message
  -> nnbot ai_chat
  -> workbench Tool
  -> WorkbenchApiClient
  -> ai-workbench HTTP API
  -> structured result
  -> nnbot model generates the final reply
```

## Current Tools

| Tool | Workbench API | Purpose |
| --- | --- | --- |
| `workbench_capabilities` | `GET /api/assistant/capabilities` | 查询当前可用的工作台能力和只读边界 |
| `workbench_knowledge_search` | `GET /api/knowledge/search` | Search internal documents and return evidence |
| `workbench_policy_match` | `POST /api/policy/matches` | Match reviewed policy projects against company information |
| `workbench_performance_ranking` | `GET /api/performance/rankings/teams` or `people` | Read team or individual rankings |

The tools return structured JSON to the main bot model. They do not generate the final user-facing answer themselves.

能力问题约束：用户询问机器人“能做什么”“支持哪些功能”或“能否执行某项工作”时，必须先调用
`workbench_capabilities`，再根据接口返回的当前能力回答。能力清单返回失败时，不得凭记忆补充能力。

## Configuration

```yaml
workbench:
  enabled: true
  baseUrl: http://127.0.0.1:4177
  accessToken: ${WORKBENCH_API_TOKEN}
  timeoutMs: 30000
```

`accessToken` is optional while the Workbench API is local-only. When API authentication is added, configure the token through `.env`, never commit it to `config.yaml`.

## Extension Rules

- Add business capabilities to `ai-workbench` first as stable API contracts.
- Add one focused nnbot Tool for each AI-callable use case.
- Group related tools in `src/plugins/workbench.ts`.
- Keep imports, crawls, OCR, reviews, re-indexing, restarts and other write/maintenance operations out of ordinary chat until explicit authorization and confirmation are implemented.
- Keep ordinary chat tools read-only. New write-capable tools require a separate authorization and confirmation path; do not add them by only changing the system prompt.
- Never expose API keys, secrets, tokens, database records, internal file paths or raw provider errors in user-facing replies.
- Use CLI for maintenance and MCP later if other agents or external clients need the same tool catalog.
