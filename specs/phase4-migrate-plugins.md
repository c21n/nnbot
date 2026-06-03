# Phase 4: 迁移旧插件 规格说明

## 1. 概述

将现有的 3 个旧插件（rule-match、ai-chat、admin）迁移为新的 `createPlugin` 格式，使用 `PluginServices` 注入依赖。

### 目标

- 统一插件格式
- 消除手动依赖注入
- 保持功能不变

## 2. 迁移策略

### 2.1 迁移顺序

1. **rule-match** — 最简单，无外部依赖
2. **ai-chat** — 有 LLM 和存储依赖
3. **admin** — 有 pluginManager 依赖，需要特殊处理

### 2.2 迁移规则

```typescript
// 旧格式
export class RuleMatchPlugin implements IPlugin {
  readonly name = "rule_match";
  constructor(private rules: Rule[]) {}
  async handle(event: Event): Promise<Response | null> { ... }
}

// 新格式
export default createPlugin({
  name: "rule_match",
  priority: PLUGIN_PRIORITY.RULE_MATCH,
  async handle(event, { config }) {
    const rules = config.rules;
    // ...
  },
});
```

### 2.3 依赖注入映射

| 旧依赖 | 新注入方式 |
|--------|-----------|
| `config: Config` | `services.config` |
| `llm: ILLMService` | `services.llm` |
| `storage: IConversationStorage` | `services.storage` |
| `pluginManager: IPluginManager` | `services.pluginManager` |
| `rules: Rule[]` | `services.config.rules` |

## 3. 各插件迁移规格

### 3.1 rule-match.ts

**当前问题**：
- 构造函数接收 `rules: Rule[]`
- 需要手动注入配置

**迁移方案**：
```typescript
import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";

export default createPlugin({
  name: "rule_match",
  description: "规则匹配插件 - 基于正则的自动回复",
  priority: PLUGIN_PRIORITY.RULE_MATCH,

  async handle(event, { config }) {
    // Skip commands
    if (event.message.startsWith("/")) {
      return null;
    }

    // Compile and match rules
    for (const rule of config.rules) {
      const pattern = new RegExp(rule.pattern, "i");
      if (pattern.test(event.message)) {
        const reply = rule.reply
          .replace("{time}", new Date().toLocaleTimeString("zh-CN"))
          .replace("{date}", new Date().toLocaleDateString("zh-CN"))
          .replace("{user}", event.userId);

        return { content: reply, replyTo: false };
      }
    }

    return null;
  },

  help() {
    return "规则匹配插件\n基于正则表达式的自动回复";
  },
});
```

### 3.2 ai-chat.ts

**当前问题**：
- 构造函数接收多个依赖
- 有 PersonaService 和 hooks
- 需要 LLM 和存储

**迁移方案**：
```typescript
import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { PersonaService } from "../services/persona.js";

export default createPlugin({
  name: "ai_chat",
  description: "AI 对话插件 - 支持上下文、人格设定和摘要压缩",
  priority: PLUGIN_PRIORITY.AI_CHAT,

  async onLoad({ storage, config }) {
    // Initialize persona service
    this.persona = new PersonaService(storage);
    this.historyLimit = config.context?.historyLimit ?? 10;
  },

  async handle(event, { llm, storage, config }) {
    // Skip commands and non-@ group messages
    if (event.message.startsWith("/")) return null;
    if (event.type === "group_message" && !event.message.includes("@")) return null;

    // Get persona
    const persona = await this.persona.getPersona(event.userId);

    // Get history
    const history = await storage.getHistory(event.userId, this.historyLimit);

    // Build messages
    const messages = [
      { role: "system", content: persona },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: event.message },
    ];

    // Call LLM
    const response = await llm.chat(messages);

    // Save to history
    await storage.saveMessage(event.userId, "user", event.message);
    await storage.saveMessage(event.userId, "assistant", response);

    return { content: response, replyTo: true };
  },
});
```

**问题**：`this` 不能在 `createPlugin` 中使用。需要用闭包或模块级变量。

**解决方案**：在 `onLoad` 中初始化状态，存储在闭包中。

### 3.3 admin.ts

**当前问题**：
- 需要 `pluginManager` 和 `config`
- 已经在 Phase 3 中添加了 `/reload` 命令
- 是 class 格式，不是 `createPlugin`

**迁移方案**：

由于 admin 插件比较复杂，且需要在其他插件之前加载，有两种选择：

**选项 A：保持 class 格式**
- 保持现有 `AdminPlugin` class
- 只更新构造函数接收 `PluginServices`
- 不迁移到 `createPlugin`

**选项 B：完全迁移**
- 使用 `createPlugin` 包装
- 用闭包管理状态
- 代码更简洁

**建议**：选择 A，保持 class 格式。原因：
1. admin 插件逻辑复杂，class 更清晰
2. 需要访问 pluginManager 内部方法
3. 已经在 Phase 3 中更新了 `/reload` 命令

## 4. 测试规格

### 4.1 rule-match 测试

```
describe("rule-match plugin")
├─ "should match simple pattern"
│  输入: message = "你好"
│  规则: pattern = "你好", reply = "你好！"
│  验证: 返回 { content: "你好！" }
│
├─ "should not match unrelated message"
│  输入: message = "天气"
│  规则: pattern = "你好"
│  验证: 返回 null
│
├─ "should skip commands"
│  输入: message = "/help"
│  验证: 返回 null
│
├─ "should replace variables"
│  输入: message = "test"
│  规则: pattern = "test", reply = "用户: {user}"
│  验证: 返回包含 userId 的内容
│
└─ "should use config.rules"
   验证: 从 config.rules 读取规则
```

### 4.2 ai-chat 测试

```
describe("ai-chat plugin")
├─ "should respond to direct message"
│  输入: private message
│  验证: 调用 llm.chat，返回响应
│
├─ "should respond to @message in group"
│  输入: group message with @
│  验证: 调用 llm.chat
│
├─ "should skip non-@ group message"
│  输入: group message without @
│  验证: 返回 null
│
├─ "should skip commands"
│  输入: "/help"
│  验证: 返回 null
│
├─ "should save history"
│  操作: 发送消息
│  验证: storage.saveMessage 被调用 2 次
│
└─ "should use persona"
   操作: 发送消息
   验证: system message 包含 persona
```

## 5. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/plugins/rule-match.ts` | 重写 | 迁移为 createPlugin 格式 |
| `src/plugins/ai-chat.ts` | 重写 | 迁移为 createPlugin 格式 |
| `src/plugins/admin.ts` | 修改 | 更新构造函数接收 PluginServices |
| `src/bot.ts` | 修改 | 使用 loadFromDir 加载插件 |
| `src/plugins/__tests__/rule-match.test.ts` | 新建 | 规则匹配测试 |
| `src/plugins/__tests__/ai-chat.test.ts` | 新建 | AI 对话测试 |

## 6. 验收标准

- [ ] rule-match 使用 createPlugin 格式
- [ ] ai-chat 使用 createPlugin 格式
- [ ] admin 保持 class 格式，但接收 PluginServices
- [ ] 所有功能保持不变
- [ ] bot.ts 使用 loadFromDir 加载插件
- [ ] 新增测试通过
- [ ] 现有测试未被破坏
- [ ] 插件按正确优先级执行

## 7. 依赖关系

- 依赖 Phase 1-3 的 createPlugin、PluginLoader、HotReloadManager
- Phase 5（bot.ts 简化）依赖本阶段的插件迁移
