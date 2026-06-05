# Tool Calling System

NNBot 的工具调用系统，让 LLM 可以调用预定义的工具完成任务。

## 架构

```
用户消息 → ai-chat → getToolsForIntent(msg) → ToolLoop → LLM(chatWithTools)
                              │                            │
                    ┌─────────┴─────────┐                  │
                    │                   │                  │
              GLOBAL_EXCLUDE      keywords 匹配            │
              (问候语/闲聊)           │                   │
                    │                   │                  │
                返回 []          factory.create()          │
                              (首次实例化+缓存)            │
                                      │                   │
                                      ▼                   │
                                matched tools ────────────┘
                                                          │
                                              ┌───────────┴───────────┐
                                              │                       │
                                         done=true               toolCalls
                                              │                       │
                                         返回回复               ToolExecutor
                                                                    │
                                                            validate + execute
                                                                    │
                                                            结果追加到 messages
                                                                    │
                                                            循环回到 LLM
```

## 快速开始

### 方式一：工厂注册（推荐）

使用 `IToolFactory` 声明式注册工具，实现按需实例化：

```typescript
import { createPlugin } from "../../core/create-plugin.js";
import { MyTool } from "../tools/my-tool.js";
import type { IToolFactory } from "./types.js";

export default createPlugin({
  name: "my_plugin",
  async onLoad(services) {
    const factory: IToolFactory = {
      name: "my_tool",
      description: "我的工具",
      tags: ["custom"],
      keywords: ["关键词1", "关键词2"],  // 消息包含这些词时触发
      create: () => new MyTool(),
    };
    services.toolRegistry.registerFactory(factory);
  },
});
```

### 方式二：直接注册（兼容）

对于始终需要的工具，可直接注册：

```typescript
import { createPlugin } from "../../core/create-plugin.js";
import { MyTool } from "../tools/my-tool.js";

export default createPlugin({
  name: "my_plugin",
  async onLoad(services) {
    services.toolRegistry.register(new MyTool());
  },
});
```

### 实现工具

```typescript
import type { ITool, ToolParameter, ToolResult, ToolContext } from "./types.js";

export class MyTool implements ITool {
  readonly name = "my_tool";
  readonly description = "工具描述（给 LLM 看）";
  readonly parameters: Record<string, ToolParameter> = {
    query: {
      type: "string",
      description: "查询参数",
    },
  };
  readonly active = true;  // 可由配置动态控制

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = args.query as string;

    // 做一些事情...

    return {
      success: true,
      content: "结果文本（返回给 LLM）",
    };
  }
}
```

### 工具自动激活

ai-chat 插件会自动：
1. 调用 `getToolsForIntent(message)` 按需获取工具
2. 消息匹配 `GLOBAL_EXCLUDE_PATTERNS` 时跳过所有工具
3. 消息包含工厂的 `keywords` 时触发对应工具
4. 工具实例懒创建并缓存，后续调用复用

## 渐进式披露

工具系统采用**声明式目录 + 按需实例化 + 缓存复用**模式：

### 全局排除模式

消息匹配以下模式时，直接返回空数组，不进入工厂匹配：

- 问候语：`你好`, `hi`, `hello`, `早上好`, `good morning`
- 闲聊：`谢谢`, `好的`, `嗯`, `哈哈`
- 创意任务：`写`, `创作`, `画`, `设计`（但包含搜索词时不排除）

### 匹配流程

```
getToolsForIntent(message):
1. 全局排除检查 → 命中则返回 []
2. 遍历 factories
3. keywords 包含匹配（不区分大小写）
4. 命中 → 检查缓存 → 未缓存则 factory.create()
5. 返回匹配的 ITool[]
```

### IToolFactory 接口

```typescript
interface IToolFactory {
  readonly name: string;           // 工具名称
  readonly description: string;    // 工具描述
  readonly tags: string[];         // 能力标签
  readonly keywords: string[];     // 触发关键词
  create(): ITool | Promise<ITool>; // 创建实例
}
```

## ToolResult 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | `boolean` | 是否成功 |
| `content` | `string` | 返回给 LLM 的文本 |
| `directMessage` | `string?` | 直接发送给用户的消息（不经过 LLM） |
| `metadata` | `object?` | 附加数据（日志/调试用） |

## 条件激活

借鉴 AstrBot 的设计，工具的 `active` 属性可以根据配置动态决定：

```typescript
export class WebSearchTool implements ITool {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  get active(): boolean {
    // 只有配置了 API key 才激活
    return !!this.config.webSearch?.apiKey;
  }
}
```

## 内置工具工厂

在 `src/plugins/tools.ts` 中注册：

| 工厂 | 触发关键词 | 说明 |
|------|-----------|------|
| `calculator` | 计算, 多少, 加, 减, 乘, 除 | 数学计算器 |
| `web_search` | 搜, 搜索, 查, 天气, 价格, ... | 网页搜索（需配置） |

## 文件结构

```
src/services/tools/
├── types.ts              # 类型定义 (ITool, IToolFactory, IToolRegistry)
├── tool-registry.ts      # 工具注册表 (register, registerFactory, getToolsForIntent)
├── tool-executor.ts      # 工具执行器（超时、校验、错误处理）
├── tool-loop.ts          # 工具调用循环
├── parameter-validator.ts # JSON Schema 参数校验
├── schema-adapter.ts     # 多 Provider Schema 转换
├── index.ts              # 统一导出
├── README.md             # 本文档
└── builtin/              # 内置工具
    ├── calculator.ts     # 计算器
    └── web-search.ts     # 网页搜索
```
