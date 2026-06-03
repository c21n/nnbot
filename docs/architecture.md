# 系统架构

## 分层架构

```
应用层: bot.ts, config.yaml, persona.yaml
    ↓
插件层: ai_chat, rule_match, admin
    ↓
核心层: PluginManager, MessageBuffer, Logger
    ↓
服务层: LLM, Storage, Persona
    ↓
基础层: OpenAI, SQLite, OneBot
```

## 数据流

```
用户消息 → OneBot → Bot(8080) → MessageBuffer(5s) → Plugin → LLM → 回复
```

## 记忆系统

| 类型 | 说明 | 存储 |
|------|------|------|
| 短期 | 当前上下文窗口 | 内存 |
| 中期 | 最近对话历史 | SQLite |
| 长期 | 压缩后的摘要 | SQLite |

## 配置文件

| 文件 | 用途 | 热更新 |
|------|------|--------|
| config.yaml | 核心配置 | ❌ |
| persona.yaml | 人格配置 | ✅ |
| .env | 密钥 | ❌ |

## 扩展点

- 新插件: 实现 `IPlugin` → `src/plugins/`
- 新 LLM: 实现 `ILLMService` → `src/services/llm/`
- 新存储: 实现 `IStorage` → `src/services/storage/`
