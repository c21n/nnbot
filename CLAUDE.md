# NNBot 项目约定

## SDD 流程

新建模块必须先写规格再写代码。五步流程：

```
规格说明 → 类型定义 → 实现代码 → 审查验证 → 提交
```

1. 复制模板 `cp specs/templates/interface-spec.md specs/<模块>.md`，按六个部分填写（概述、接口规格、核心行为、边界条件、契约 C-N、验收标准）
2. 在 `src/<模块>/types/` 写 TypeScript 类型，前后端共享
3. 按 spec 实现，发现 spec 不合理时先改 spec 再改代码
4. 逐项对照 spec 审查：接口是否齐全、契约是否满足、边界条件是否处理、`tsc --noEmit` 零新增错误
5. 提交格式：`<type>(<scope>): <description>`

## 模块分类

新模块先判断放哪里：

- **处理 QQ 消息 / 需要热重载** → 插件，放 `src/plugins/`，用 `createPlugin()` 创建
- **HTTP API / 框架能力** → 基础设施，放 `src/core/`、`src/webui/`、`src/services/`，在 `bot.ts` 中注册

## 项目结构

```
src/
├── bot.ts              # 入口，Fastify 服务器
├── core/               # 框架（plugin-manager, config, logger, hot-reload）
├── plugins/            # 插件（自动扫描加载，可热重载）
├── memory/             # 记忆系统（types/ storage/ services/ plugin.ts）
├── webui/              # 管理界面（config-api, memory-api, types/, utils/, public/）
├── services/           # 共享服务（LLM, Storage）
└── utils/              # 工具函数
```

## 约定

- API 响应统一 `ApiResponse<T>`，用 `ok()` / `fail()` 构建
- 时间字段同时提供 `number` 时间戳和 `string` 格式化字符串
- 共享类型放 `types/` 目录
- `specs/` 跟踪进 git（规格是代码的一部分）
