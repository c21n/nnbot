# NNBot

轻量级 QQ Bot 框架，专注于**极简插件开发**和**智能对话体验**。

```bash
# 5 行代码，一个插件
export default createPlugin({
  name: "hello",
  async handle(event) {
    return { content: `你好 ${event.nickname}!` };
  },
});
```

## ✨ 核心特性

### 🎯 极简插件系统

- **`createPlugin` 工厂函数** - 零样板代码，5 行即可创建插件
- **服务自动注入** - LLM、存储、配置、工具注册表自动注入
- **热重载** - 修改插件文件自动生效，无需重启 Bot
- **优先级控制** - 内置 `PLUGIN_PRIORITY` 常量，精确控制执行顺序

### 🔧 渐进式披露工具系统

- **声明式工厂** - 通过 `IToolFactory` 声明关键词和标签
- **按需实例化** - 工具只在消息匹配时创建，减少启动开销
- **智能缓存** - 首次创建后缓存复用，避免重复实例化
- **全局排除** - 问候语、闲聊等场景自动跳过工具调用
- **向后兼容** - 支持直接注册和工厂注册两种方式

### 🧠 智能记忆系统

- **向量检索** - Vectra 向量数据库 + Embedding 模型
- **全文搜索** - jieba 分词 + SQLite FTS5 + BM25 排序
- **混合检索** - RRF (Reciprocal Rank Fusion) 融合多路召回
- **记忆摘要** - 自动压缩长对话，保留关键信息
- **用户画像** - 自动提取和更新用户偏好

### 💬 智能对话引擎

- **消息合并** - 智能合并连续消息，减少 LLM 调用次数
- **摘要压缩** - 自动压缩长对话历史，节省 token 消耗
- **上下文管理** - 可配置的历史轮数和压缩阈值
- **多 LLM 支持** - OpenAI、Ollama、SiliconFlow、DeepSeek 等

### 🛡️ 安全防护

- **Prompt 注入防护** - 检测并阻止恶意 Prompt 注入
- **输出检查** - 过滤敏感信息和不当内容
- **速率限制** - 防止滥用和 DDoS 攻击
- **权限控制** - 管理员命令白名单机制

### 🖥️ WebUI 管理界面

- **实时配置** - 通过 WebUI 修改配置，无需重启
- **插件管理** - 启用/禁用插件，查看插件状态
- **LLM 配置** - 一键获取模型列表，自动填充配置
- **调试工具** - 查看日志、测试对话、监控状态

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- [NapCat](https://github.com/NapNeko/NapCatQQ/releases) - QQ 协议实现

### 1. 克隆项目

```bash
git clone https://github.com/your-username/nnbot.git
cd nnbot
```

### 2. 启动 NapCat

下载 [NapCat Shell](https://github.com/NapNeko/NapCatQQ/releases)，运行后扫码登录 QQ。

在 NapCat WebUI (`http://localhost:6099`) 中配置：
- **HTTP 服务器** - 开启并设置端口（如 3000）
- **HTTP 客户端** - 添加 NNBot 地址（如 `http://127.0.0.1:8080/onebot/event`）

### 3. 一键启动 Bot

双击 `start.bat`，或命令行运行：

```bash
start.bat
```

脚本会自动安装依赖并启动 Bot。

### 4. 通过 WebUI 配置

启动后访问 NNBot WebUI：`http://localhost:8080`

在 WebUI 中配置：
- **OneBot** - 填入 NapCat HTTP 地址（如 `http://127.0.0.1:3000`）
- **LLM** - 选择供应商，填入 API Key，点击「获取模型」自动填充
- **其他** - 插件、规则、管理员等

点击「保存」即生效，无需重启。

## 📦 内置插件

| 插件 | 说明 |
|------|------|
| `ai_chat` | AI 对话，支持上下文、人格设定 |
| `rule_match` | 正则匹配自动回复 |
| `admin` | 管理命令（/help, /status, /clear） |
| `memory` | 长期记忆，基于向量检索 |

## 🔧 插件开发

### 最简示例

```typescript
// src/plugins/hello.ts
import { createPlugin } from "../core/create-plugin.js";

export default createPlugin({
  name: "hello",
  description: "打招呼插件",

  async handle(event) {
    if (event.message === "你好") {
      return { content: `你好 ${event.nickname}!` };
    }
    return null; // 不处理，交给下一个插件
  },
});
```

### 使用服务

```typescript
export default createPlugin({
  name: "remember",

  async handle(event, { storage, llm }) {
    // 读取存储
    const lastMsg = await storage.get(`last:${event.userId}`);

    // 调用 LLM
    const reply = await llm.chat([
      { role: "system", content: "你是记忆助手" },
      { role: "user", content: `我上次说了什么？${lastMsg}` },
    ]);

    // 保存到存储
    await storage.set(`last:${event.userId}`, event.message);

    return { content: reply };
  },
});
```

### AI 钩子

拦截 LLM 调用，添加自定义逻辑：

```typescript
export default createPlugin({
  name: "my-hooks",
  hooks: {
    // 在 LLM 调用前修改消息
    async beforeLLM(messages, event) {
      return [
        { role: "system", content: "自定义系统提示" },
        ...messages,
      ];
    },

    // 在 LLM 调用后修改回复
    async afterLLM(response, event) {
      return response.replace(/敏感词/g, "***");
    },
  },
});
```

### 插件优先级

```typescript
import { PLUGIN_PRIORITY } from "../constants.js";

export default createPlugin({
  name: "my-plugin",
  priority: PLUGIN_PRIORITY.AI_CHAT, // 数字越小，越先执行
  // ...
});
```

内置优先级：`RULE_MATCH(10)` > `ADMIN(20)` > `AI_CHAT(100)` > `MEMORY(110)`

## 📖 配置参考

### 完整配置示例

```yaml
# OneBot 连接
onebot:
  url: "ws://127.0.0.1:3000"
  accessToken: ""  # 可选

# LLM 配置（支持多 provider）
llm:
  currentProvider: "openai"
  providers:
    openai:
      baseUrl: "https://api.openai.com/v1"
      apiKey: "sk-xxx"
      model: "gpt-4o-mini"
      temperature: 0.7
      maxTokens: 2000
    ollama:
      baseUrl: "http://localhost:11434/v1"
      apiKey: "ollama"
      model: "llama3"

# 存储配置
storage:
  type: "sqlite"  # sqlite | memory
  path: "./data/bot.db"

# 上下文配置
context:
  historyLimit: 10           # 保留的历史消息轮数
  messageBufferDelay: 3000   # 消息合并等待时间（ms）
  summaryCompressThreshold: 10  # 触发摘要压缩的最小轮数

# 插件配置
plugins:
  enabled: ["ai_chat", "rule_match", "admin", "memory"]
  disabled: []
  ai_chat:
    llm:  # 可选：为 ai_chat 单独配置 LLM
      baseUrl: "https://api.openai.com/v1"
      apiKey: "sk-xxx"
      model: "gpt-4o"

# 规则匹配
rules:
  - pattern: "你好|hi|hello"
    reply: "你好 {user}！现在是 {time}"
  - pattern: "天气"
    reply: "我不会查天气哦~"

# 管理员配置
admin:
  userIds: ["123456789"]  # 管理员 QQ 号
  commands: ["/help", "/status", "/plugins", "/clear", "/reload"]

# 记忆系统配置（可选）
memory:
  enabled: true
  chroma:
    host: "localhost"
    port: 8000
  embedding:
    provider: "siliconflow"
    apiKey: "sk-xxx"
```

### 管理命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/plugins` | 列出所有插件状态 |
| `/status` | 显示 Bot 运行状态 |
| `/clear` | 清除当前对话历史 |
| `/reload [name]` | 重载指定或所有插件 |

## 🐳 部署

### Docker

```bash
# 构建
docker build -t nnbot .

# 运行
docker run -d \
  -v ./config.yaml:/app/config.yaml \
  -v ./data:/app/data \
  nnbot
```

### Docker Compose

```yaml
version: "3.8"
services:
  bot:
    build: .
    volumes:
      - ./config.yaml:/app/config.yaml
      - ./data:/app/data
    depends_on:
      - napcat

  napcat:
    image: mlikiowa/napcat-docker:latest
    environment:
      - ACCOUNT=你的QQ号
    ports:
      - "3000:3000"
```

### PM2

```bash
npm run build
pm2 start dist/bot.js --name nnbot
pm2 save
```

### systemd

```ini
[Unit]
Description=NNBot
After=network.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/nnbot
ExecStart=/usr/bin/node dist/bot.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                         NNBot                               │
├─────────────────────────────────────────────────────────────┤
│  插件层 (Plugin Layer)                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ ai_chat  │ │rule_match│ │  admin   │ │  memory  │       │
│  └────┬─────┘ └──────────┘ └──────────┘ └──────────┘       │
│       │                                                     │
├───────┼─────────────────────────────────────────────────────┤
│  服务层 (Service Layer)                                     │
│  ┌────┴─────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │LLM 服务  │ │工具注册表 │ │记忆系统  │ │安全防护  │       │
│  │(多Provider)│ │(渐进披露)│ │(混合检索)│ │(注入防护)│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  存储层 (Storage Layer)                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ SQLite   │ │  Vectra  │ │  LRU     │                    │
│  │(持久化)  │ │(向量)    │ │  缓存    │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js 18+ | ESM 模块 |
| **语言** | TypeScript | Strict mode |
| **Web 框架** | Fastify | 高性能 HTTP/WebSocket |
| **数据库** | SQLite | 持久化存储 |
| **向量库** | Vectra | 本地向量数据库 |
| **分词** | jieba | 中文分词 |
| **搜索** | FTS5 + BM25 + RRF | 全文检索 + 向量检索融合 |
| **LLM** | OpenAI Compatible | 支持多种 Provider |
| **部署** | Docker / PM2 | 容器化部署 |

## 📁 项目结构

```
nnbot/
├── src/
│   ├── bot.ts                 # 主入口
│   ├── interfaces.ts          # 核心接口定义
│   ├── constants.ts           # 常量
│   ├── core/
│   │   ├── create-plugin.ts   # 插件工厂函数
│   │   ├── plugin-manager.ts  # 插件管理器
│   │   ├── plugin-loader.ts   # 目录扫描 + 动态导入
│   │   └── hot-reload.ts      # 热重载管理
│   ├── plugins/
│   │   ├── ai-chat.ts         # AI 对话插件
│   │   ├── rule-match.ts      # 规则匹配插件
│   │   ├── admin.ts           # 管理命令插件
│   │   ├── memory.ts          # 记忆系统插件
│   │   └── tools.ts           # 工具注册插件
│   ├── services/
│   │   ├── llm/
│   │   │   └── openai.ts      # OpenAI 兼容 LLM 服务
│   │   └── tools/             # 工具调用系统
│   │       ├── types.ts       # ITool, IToolFactory, IToolRegistry
│   │       ├── tool-registry.ts # 渐进式披露注册表
│   │       ├── tool-executor.ts # 工具执行器
│   │       ├── tool-loop.ts   # 工具调用循环
│   │       └── builtin/       # 内置工具
│   ├── memory/                # 记忆系统模块
│   │   ├── storage/           # 存储层（SQLite + Vectra）
│   │   ├── services/          # 业务服务
│   │   ├── providers/         # Embedding/LLM 提供者
│   │   ├── search/            # 混合检索（BM25 + 向量 + RRF）
│   │   ├── security/          # 安全防护
│   │   └── cache/             # LRU 缓存
│   └── webui/                 # WebUI 管理界面
│       ├── config-api.ts      # 配置管理 API
│       ├── memory-api.ts      # 记忆管理 API
│       └── public/            # 前端静态资源
├── config.yaml                # 配置文件
├── package.json
└── tsconfig.json
```

## 📊 性能指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 工具实例化 | <100ms | 冷启动首次调用 |
| 缓存命中 | <10ms | 后续调用 |
| 消息合并 | 3s 窗口 | 智能合并连续消息 |
| 摘要压缩 | 10 轮阈值 | 自动压缩长对话 |
| 向量检索 | <50ms | Top-K 相似度搜索 |
| 混合检索 | <100ms | BM25 + 向量 + RRF |

## 🗺️ 路线图

### v0.1.0 ✅ (当前)
- [x] 极简插件系统
- [x] 渐进式披露工具系统
- [x] 智能记忆系统
- [x] WebUI 管理界面
- [x] 多 LLM Provider 支持

### v0.2.0 (计划中)
- [ ] 插件市场 - 社区插件分享
- [ ] 多模态支持 - 图片、语音处理
- [ ] 搜索结果缓存 - 相同查询不重复调用 API
- [ ] 性能监控 - Prometheus 指标

### v0.3.0 (未来)
- [ ] 分布式部署 - 多实例协同
- [ ] 插件沙箱 - 安全隔离执行
- [ ] AI Agent - 自主任务执行

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 提交 Pull Request

## 📄 License

MIT
