# Tool Calling System

NNBot 的工具调用系统，让 LLM 可以调用预定义的工具完成任务。

## 架构

```
用户消息 → ai-chat → ToolLoop → LLM(chatWithTools)
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

### 1. 实现一个工具

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

### 2. 注册工具

在插件的 `onLoad` 中注册：

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

### 3. 工具自动激活

ai-chat 插件会自动：
- 从 `toolRegistry` 获取所有 `active=true` 的工具
- 如果 LLM 服务支持 `chatWithTools`，启用工具调用循环
- 否则退化为普通对话

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

## 内置工具

- `CalculatorTool` — 数学表达式计算

## 文件结构

```
src/services/tools/
├── types.ts              # 类型定义
├── tool-registry.ts      # 工具注册表
├── tool-executor.ts      # 工具执行器（超时、校验、错误处理）
├── tool-loop.ts          # 工具调用循环
├── parameter-validator.ts # JSON Schema 参数校验
├── schema-adapter.ts     # 多 Provider Schema 转换
├── index.ts              # 统一导出
├── README.md             # 本文档
└── builtin/              # 内置工具
    └── calculator.ts     # 计算器示例
```
