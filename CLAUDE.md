# NNBot 项目约定

## 开发流程（SDD）

新建模块必须按以下五步执行，详见 `~/.claude/rules/common/sdd.md`。

```
1. 规格说明  →  2. 类型定义  →  3. 实现代码  →  4. 审查验证  →  5. 提交
```

### 第 1 步：写规格

```bash
cp specs/templates/interface-spec.md specs/<新模块>.md
```

按模板填写六个部分：

| 部分 | 内容 | 表达方式 |
|------|------|----------|
| 概述 | 模块职责、技术约束 | 自然语言 |
| 接口规格 | 类型定义、方法签名 | TypeScript interface |
| 核心行为 | "当...则..." 行为描述 | 自然语言 |
| 边界条件 | 异常场景和处理 | 场景→处理 表格 |
| 契约 | 必须始终为真的约束 | C-N 断言式语句 |
| 验收标准 | 可验证的 checklist | checkbox |

### 第 2 步：写类型

```typescript
// src/<模块>/types/<模块>.types.ts
export interface Foo { ... }
export interface Bar { ... }
```

- 类型是 spec 的代码化表达
- 前后端共享同一份类型定义
- 先写类型，再写实现

### 第 3 步：实现代码

- 后端按 spec 的接口规格写端点
- 前端按 spec 的核心行为写交互
- 实现中发现 spec 不合理 → **先改 spec 再改代码**

### 第 4 步：审查验证

逐项对照 spec：
- [ ] 每个接口端点是否都已实现
- [ ] 每个契约 C-N 是否满足
- [ ] 边界条件是否处理
- [ ] 验收标准 checklist 是否通过
- [ ] `tsc --noEmit` 零新增错误

### 第 5 步：提交

```
<type>(<scope>): <description>

feat(memory): 新增记忆导出 API
fix(webui): 修复用户列表排序
refactor(types): 提取共享类型到 types/
```

## 项目结构

```
src/
├── bot.ts                   # 入口，Fastify 服务器
├── core/                    # 核心框架（plugin-manager, config, logger）
├── plugins/                 # 插件目录（自动扫描加载）
├── memory/                  # 记忆系统模块
│   ├── types/               # 类型定义
│   ├── storage/             # 存储层（SQLite, ChromaDB）
│   ├── services/            # 业务服务
│   └── plugin.ts            # MemoryPlugin 主类
├── webui/                   # WebUI 管理界面
│   ├── config-api.ts        # 配置 API
│   ├── memory-api.ts        # 记忆管理 API
│   ├── types/               # 共享类型
│   ├── utils/               # 工具函数（response 等）
│   └── public/index.html    # 前端单页
├── services/                # 共享服务（LLM, Storage）
└── utils/                   # 工具函数
```

## 约定

- 插件使用 `createPlugin()` 工厂函数创建
- Fastify 插件使用 `async function xxxApi(app: FastifyInstance)` 模式
- API 响应统一使用 `ApiResponse<T>` 格式
- 错误响应用 `fail()` 辅助函数，成功用 `ok()`
- 时间字段同时提供时间戳（number）和格式化字符串（string）
- 跨模块共享类型放在 `types/` 目录
- `specs/` 目录跟踪进 git（规格文档是代码的一部分）
