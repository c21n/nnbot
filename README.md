# NNBot

轻量级 QQ Bot 框架，专注于**极简插件开发**。

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

- **极简插件 API** - `createPlugin` 工厂函数，零样板代码
- **服务注入** - LLM、存储、配置自动注入，无需手动获取
- **热重载** - 修改插件自动生效，无需重启
- **记忆系统** - Vectra 向量检索 + SQLite 持久化
- **消息合并** - 智能合并连续消息，减少 LLM 调用
- **摘要压缩** - 自动压缩长对话历史，节省 token

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
│   │   └── memory.ts          # 记忆系统插件
│   ├── services/
│   │   └── llm/
│   │       └── openai.ts      # OpenAI 兼容 LLM 服务
│   └── memory/                # 记忆系统模块
│       ├── storage/           # 存储层（SQLite + Vectra）
│       ├── services/          # 业务服务
│       └── providers/         # Embedding/LLM 提供者
├── config.yaml                # 配置文件
├── package.json
└── tsconfig.json
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 提交 Pull Request

## 📄 License

MIT
