# NNBot

轻量级 QQ Bot，支持插件系统。

## 功能特性

- 🤖 AI 对话 - 支持多种 LLM 服务
- 📝 规则匹配 - 基于正则的自动回复
- 🔧 管理命令 - Bot 管理和监控
- 🧩 插件系统 - 易于扩展

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置

复制 `config.yaml` 并修改配置：

```yaml
llm:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "your-api-key"
  model: "gpt-3.5-turbo"

onebot:
  url: "http://127.0.0.1:3000"
```

### 3. 启动 OneBot

确保 NapCat 或 go-cqhttp 正在运行。

### 4. 启动 Bot

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 配置说明

### LLM 服务

支持所有兼容 OpenAI 格式的 API：

| 服务 | baseUrl |
|------|---------|
| OpenAI | `https://api.openai.com/v1` |
| Ollama | `http://localhost:11434/v1` |
| Azure OpenAI | `https://xxx.openai.azure.com/v1` |
| 第三方代理 | 自定义 URL |

### 插件

- `ai_chat` - AI 对话插件
- `rule_match` - 规则匹配插件
- `admin` - 管理命令插件

### 管理命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/plugins` | 列出所有插件 |
| `/status` | 显示 Bot 状态 |
| `/clear` | 清除对话历史 |

## 项目结构

```
nnbot/
├── src/
│   ├── bot.ts              # 主入口
│   ├── interfaces.ts       # 接口定义
│   ├── core/
│   │   ├── config.ts       # 配置管理
│   │   └── plugin-manager.ts
│   ├── services/
│   │   ├── llm/
│   │   │   └── openai.ts   # LLM 服务
│   │   └── storage/
│   │       └── sqlite.ts   # SQLite 存储
│   ├── plugins/
│   │   ├── ai-chat.ts      # AI 对话
│   │   ├── rule-match.ts   # 规则匹配
│   │   └── admin.ts        # 管理命令
│   └── utils/
│       └── onebot.ts       # OneBot 适配器
├── config.yaml             # 配置文件
├── package.json
└── tsconfig.json
```

## 开发指南

### 添加新插件

1. 在 `src/plugins/` 创建新文件
2. 实现 `IPlugin` 接口
3. 在 `config.yaml` 中启用插件

### 添加新 LLM 服务

1. 在 `src/services/llm/` 创建新文件
2. 实现 `ILLMService` 接口
3. 在 `config.yaml` 中配置

## License

MIT
