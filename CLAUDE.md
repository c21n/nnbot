# NNBot 项目约定

## 规格驱动开发 (SDD)

本项目遵循 SDD 流程，详见 `~/.claude/rules/common/sdd.md`。

### 目录结构

```
specs/
├── templates/
│   └── interface-spec.md    # 规格模板
├── <module>.md              # 模块规格
```

### 流程

1. **新建模块前**：先在 `specs/` 下创建规格文档
2. **规格内容**：概述 → 接口规格（含类型定义） → 核心行为 → 边界条件 → 验收标准
3. **实现代码**：根据规格实现，代码与规格保持一致
4. **发现偏差**：实现中发现规格不合理时，先更新规格再改代码

### 接口与类型

- 跨模块共享的类型定义在 `specs/<module>.md` 的接口规格部分
- 实现时将类型提取到对应的 `types/` 目录
- API 响应统一使用 `ApiResponse<T>` 格式

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
│   └── public/index.html    # 前端单页
├── services/                # 共享服务（LLM, Storage）
└── utils/                   # 工具函数
```

## 约定

- 插件使用 `createPlugin()` 工厂函数创建
- Fastify 插件使用 `async function xxxApi(app: FastifyInstance)` 模式
- 时间字段同时提供时间戳（number）和格式化字符串（string）
- 错误响应格式：`{ success: false, error: "message" }`
