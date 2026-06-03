# 项目初始化

## 2026-06-02 09:30

### Changes

**新建文件：**

- `src/interfaces.ts`: 核心接口定义（Event, Response, IPlugin, IStorage, ILLMService）
- `src/bot.ts`: 主入口，Fastify 服务器
- `src/core/config.ts`: 配置管理器，支持 YAML 和环境变量
- `src/core/plugin-manager.ts`: 插件管理器，负责插件生命周期和事件分发
- `src/services/llm/openai.ts`: OpenAI 兼容 LLM 服务
- `src/services/storage/sqlite.ts`: SQLite 存储实现
- `src/plugins/ai-chat.ts`: AI 对话插件
- `src/plugins/rule-match.ts`: 规则匹配插件
- `src/plugins/admin.ts`: 管理命令插件
- `src/utils/onebot.ts`: OneBot 协议适配器
- `config.yaml`: 配置文件
- `package.json`: 项目依赖
- `tsconfig.json`: TypeScript 配置
- `docs/architecture.md`: 系统架构文档
- `docs/project-init.md`: 本模块日志
- `.gitignore`: Git 忽略规则
- `README.md`: 项目说明

### System Impact

- **影响范围**：项目初始化，创建完整的项目结构
- **依赖关系**：
  - 基于 OneBot 协议（需要 NapCat/go-cqhttp）
  - 依赖 OpenAI 兼容的 LLM API

### Architecture Decisions

1. **核心价值**：功能扩展性
2. **架构原则**：开闭原则、依赖倒置
3. **通信模式**：中心调度器
4. **存储方案**：SQLite（原型阶段）
5. **LLM 服务**：通用兼容层

### Notes

- 项目采用 TypeScript 实现，提供类型安全
- 所有组件都依赖接口，便于后期扩展
- 支持通过配置切换不同 LLM 服务
