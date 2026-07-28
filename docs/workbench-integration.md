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
| `workbench_knowledge_search` | `GET /api/knowledge/search` | Search internal documents and return evidence |
| `workbench_policy_match` | `POST /api/policy/matches` | Match reviewed policy projects against company information |
| `workbench_performance_ranking` | `GET /api/performance/rankings/teams` or `people` | Read team or individual rankings |

The tools return structured JSON to the main bot model. They do not generate the final user-facing answer themselves.

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
- Use CLI for maintenance and MCP later if other agents or external clients need the same tool catalog.
