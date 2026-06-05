# 插件开发指南

本指南介绍如何为 NNBot 插件市场创建、测试和发布插件。

## 快速开始

### 环境要求

- Node.js 18+
- 运行中的 NNBot 实例
- GitHub 账号（用于发布）

### 插件结构

一个基本的插件如下：

```javascript
// my-plugin.js
export default {
  name: 'my-plugin',
  description: '一个简单的插件',
  version: '1.0.0',

  async handle(event, services) {
    // 处理事件
    if (event.message === '/hello') {
      return { content: '你好，世界！' };
    }
    return null; // 让其他插件处理此事件
  }
};
```

### 插件接口

```typescript
interface PluginDefinition {
  // 必需
  name: string;                    // 插件名称（小写，连字符）
  handle(event, services): Response | null;  // 事件处理函数

  // 可选
  description?: string;            // 插件描述
  version?: string;                // 版本号（语义化版本）
  priority?: number;               // 执行优先级（数字越小越先执行）
  help?: string | (() => string);  // 帮助文本
  hooks?: AIChatHooks;             // AI 对话钩子
  onLoad?(services): Promise<void>;    // 生命周期：加载时
  onUnload?(): Promise<void>;          // 生命周期：卸载时
}
```

### 事件对象

```typescript
interface Event {
  readonly type: EventType;        // PRIVATE_MESSAGE 或 GROUP_MESSAGE
  readonly userId: string;         // 用户 ID
  readonly nickname: string;       // 用户昵称
  readonly groupId: string | null; // 群组 ID（私聊为 null）
  readonly groupName: string | null;
  readonly message: string;        // 消息内容
  readonly timestamp: number;      // Unix 时间戳
  readonly raw: Record<string, unknown>; // 原始事件数据
}
```

### 响应对象

```typescript
interface Response {
  readonly content: string;        // 回复内容
  readonly replyTo?: boolean;      // 引用原消息
  readonly atSender?: boolean;     // @ 发送者
  readonly extra?: Record<string, unknown>; // 额外数据
}
```

### 服务对象

```typescript
interface PluginServices {
  readonly llm: ILLMService;           // LLM 服务
  readonly storage: IStorage;          // 存储服务
  readonly config: Config;             // 配置
  readonly pluginManager: IPluginManager; // 插件管理器
  readonly hooks: AIChatHooks;         // AI 对话钩子
  readonly toolRegistry: IToolRegistry; // 工具注册表
  readonly providers: ProviderManager; // 供应商管理器
}
```

## 创建插件

### 第一步：创建插件文件

在你的项目中创建一个新的 `.js` 文件：

```javascript
// weather-plugin.js
export default {
  name: 'weather',
  description: '获取天气信息',
  version: '1.0.0',

  async handle(event, services) {
    if (!event.message.startsWith('/weather')) {
      return null;
    }

    const city = event.message.replace('/weather', '').trim();
    if (!city) {
      return { content: '用法：/weather <城市>' };
    }

    // 获取天气数据
    try {
      const weather = await getWeather(city);
      return {
        content: `🌤️ ${city}天气：${weather.temp}°C，${weather.condition}`
      };
    } catch (err) {
      return { content: `❌ 获取天气失败：${err.message}` };
    }
  }
};

async function getWeather(city) {
  // 实现代码
  return { temp: 20, condition: '晴' };
}
```

### 第二步：测试插件

1. 将插件文件复制到 NNBot 的 `plugins/` 目录
2. 重启 NNBot 或使用 `/admin reload`
3. 在聊天中测试插件

### 第三步：添加帮助文本

```javascript
export default {
  name: 'weather',
  description: '获取天气信息',
  version: '1.0.0',

  help() {
    return `
🌤️ 天气插件

命令：
  /weather <城市>    获取指定城市的天气

示例：
  /weather 北京
  /weather 东京
    `.trim();
  },

  async handle(event, services) {
    // ...
  }
};
```

## 高级功能

### 使用 AI 对话钩子

钩子允许你拦截和修改 AI 对话行为：

```javascript
export default {
  name: 'context-enhancer',
  description: '使用自定义数据增强 AI 上下文',
  version: '1.0.0',

  hooks: {
    async beforeLLM(messages, event) {
      // 在 LLM 调用前添加自定义上下文
      const context = await getCustomContext(event.userId);
      return [
        ...messages,
        { role: 'system', content: `用户上下文：${context}` }
      ];
    },

    async afterLLM(response, event) {
      // 在 LLM 调用后修改响应
      return response.replace(/敏感词/gi, '***');
    }
  }
};
```

### 使用存储服务

```javascript
export default {
  name: 'counter',
  description: '统计用户消息数',
  version: '1.0.0',

  async handle(event, services) {
    if (event.message === '/count') {
      const count = await services.storage.get(`count:${event.userId}`) || 0;
      return { content: `你已发送 ${count} 条消息。` };
    }

    // 增加计数器
    const count = await services.storage.get(`count:${event.userId}`) || 0;
    await services.storage.set(`count:${event.userId}`, count + 1);
    return null;
  }
};
```

### 使用 LLM 服务

```javascript
export default {
  name: 'summarizer',
  description: '使用 AI 总结文本',
  version: '1.0.0',

  async handle(event, services) {
    if (!event.message.startsWith('/summarize')) {
      return null;
    }

    const text = event.message.replace('/summarize', '').trim();
    if (!text) {
      return { content: '用法：/summarize <文本>' };
    }

    const summary = await services.llm.chat([
      { role: 'system', content: '用一句话总结以下文本。' },
      { role: 'user', content: text }
    ]);

    return { content: `📝 摘要：${summary}` };
  }
};
```

## 最佳实践

### 1. 优雅地处理错误

```javascript
async handle(event, services) {
  try {
    // 你的代码
  } catch (err) {
    console.error('插件错误：', err);
    return { content: '❌ 发生错误，请重试。' };
  }
}
```

### 2. 验证输入

```javascript
async handle(event, services) {
  if (!event.message.startsWith('/mycommand')) {
    return null;
  }

  const args = event.message.split(/\s+/).slice(1);
  if (args.length === 0) {
    return { content: '用法：/mycommand <参数>' };
  }

  // 处理有效输入
}
```

### 3. 使用提前返回

```javascript
async handle(event, services) {
  // 提前跳过不匹配的事件
  if (!event.message.startsWith('/mycommand')) {
    return null;
  }

  // 主逻辑
}
```

### 4. 保持简单

- 一个插件 = 一个功能
- 避免复杂的状态管理
- 使用存储服务进行持久化

### 5. 文档化你的插件

```javascript
export default {
  name: 'my-plugin',
  description: '清晰描述插件的功能',
  version: '1.0.0',

  help() {
    return `
我的插件

命令：
  /mycommand <参数>    命令描述

示例：
  /mycommand hello
    `.trim();
  }
};
```

## 发布到市场

### 第一步：准备你的插件

- [ ] 插件有唯一的名称
- [ ] 插件有描述
- [ ] 插件有版本号（语义化版本）
- [ ] 插件有帮助文本
- [ ] 插件优雅地处理错误
- [ ] 插件已测试

### 第二步：创建 GitHub 仓库

1. 在 GitHub 上创建新仓库
2. 添加插件文件
3. 添加 README.md 说明用法
4. 创建包含插件文件的 Release

### 第三步：通过 WebUI 发布

1. 访问市场 WebUI
2. 点击「发布插件」
3. 填写插件信息
4. 上传插件文件
5. 点击「发布」

### 第四步：通过 API 发布

```bash
# 创建插件
curl -X POST http://localhost:3001/api/plugins \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-plugin",
    "displayName": "我的插件",
    "description": "一个很棒的插件",
    "category": "tools"
  }'

# 发布版本
curl -X POST http://localhost:3001/api/plugins/myuser/my-plugin/versions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "version=1.0.0" \
  -F "file=@my-plugin.js" \
  -F "changelog=首次发布"
```

## 安全考虑

### 允许的操作

- ✅ 使用 LLM 服务
- ✅ 使用存储服务
- ✅ 发起 HTTP 请求（fetch/axios）
- ✅ 使用 npm 包（如果已打包）

### 禁止的操作

- ❌ `eval()` 或 `new Function()`
- ❌ 文件系统访问（`fs` 模块）
- ❌ 子进程执行
- ❌ 访问 `process.env`
- ❌ 修改全局状态

### 安全扫描

发布前，你的插件会自动进行安全扫描。扫描器会检查：

- 危险代码模式
- 恶意行为
- 权限违规

如果扫描失败，你需要修复问题后才能发布。

## 示例插件

### 简单命令插件

```javascript
export default {
  name: 'hello',
  description: '打招呼',
  version: '1.0.0',

  async handle(event) {
    if (event.message === '/hello') {
      return { content: `你好，${event.nickname}！👋` };
    }
    return null;
  }
};
```

### API 集成插件

```javascript
export default {
  name: 'joke',
  description: '获取随机笑话',
  version: '1.0.0',

  async handle(event) {
    if (event.message !== '/joke') {
      return null;
    }

    try {
      const response = await fetch('https://official-joke-api.appspot.com/random_joke');
      const joke = await response.json();
      return { content: `${joke.setup}\n\n${joke.punchline}` };
    } catch (err) {
      return { content: '❌ 获取笑话失败' };
    }
  }
};
```

### AI 驱动的插件

```javascript
export default {
  name: 'translator',
  description: '使用 AI 翻译文本',
  version: '1.0.0',

  async handle(event, services) {
    if (!event.message.startsWith('/translate')) {
      return null;
    }

    const text = event.message.replace('/translate', '').trim();
    if (!text) {
      return { content: '用法：/translate <文本>' };
    }

    const translation = await services.llm.chat([
      { role: 'system', content: '将以下文本翻译成英文。' },
      { role: 'user', content: text }
    ]);

    return { content: `🌐 翻译：${translation}` };
  }
};
```

## 获取帮助

- **文档**：查阅本指南和 API 文档
- **示例**：查看市场中的现有插件
- **社区**：在 NNBot 社区寻求帮助
- **问题**：在 GitHub 上报告 Bug
