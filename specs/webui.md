# WebUI 规格说明

## 1. 概述

NNBot 的 Web 管理界面，基于 Fastify 提供静态页面和 REST API。用于配置 Bot 参数、管理记忆数据、设置人格等。

**技术栈**：
- 后端：Fastify + YAML 配置文件
- 前端：原生 HTML/CSS/JS（无框架）
- 数据库：better-sqlite3（只读访问记忆库）

## 2. 接口规格

### 2.1 API 模块划分

```typescript
/** WebUI API 模块 */
export interface IWebuiModules {
  /** 配置管理 — config-api.ts */
  config: IConfigApiRoutes

  /** 记忆管理 — memory-api.ts */
  memory: IMemoryApiRoutes
}
```

### 2.2 配置 API（config-api.ts）

```typescript
export interface IConfigApiRoutes {
  /** GET /api/config — 读取 config.yaml */
  getConfig(): Promise<ApiResponse<Config>>

  /** PUT /api/config — 写入 config.yaml */
  saveConfig(config: Config): Promise<ApiResponse<void>>

  /** POST /api/llm/models — 获取 LLM 供应商模型列表 */
  fetchModels(params: { baseUrl: string; apiKey?: string }): Promise<ApiResponse<string[]>>

  /** GET /api/persona — 读取 persona.yaml */
  getPersona(): Promise<ApiResponse<PersonaConfig>>

  /** PUT /api/persona — 写入 persona.yaml */
  savePersona(persona: PersonaConfig): Promise<ApiResponse<void>>
}
```

### 2.3 记忆 API（memory-api.ts）

详见 `specs/memory-api.md`

### 2.4 页面结构

```typescript
/** WebUI 侧边栏页面 */
type WebuiPage =
  | 'server'     // Server 配置
  | 'onebot'     // OneBot 连接
  | 'llm'        // LLM 供应商管理
  | 'storage'    // 存储配置
  | 'plugins'    // 插件开关
  | 'persona'    // 人格设置
  | 'memory'     // 记忆系统配置
  | 'memdata'    // 记忆数据管理
  | 'admin'      // 管理员设置
  | 'context'    // 上下文配置
  | 'rules'      // 正则规则
```

## 3. 核心行为

### 3.1 配置管理

- 当页面加载时，同时请求 `/api/config` 和 `/api/persona`
- 当用户点击保存时，同时 PUT 两个接口
- 当 LLM 供应商切换时，更新 `currentProvider` 字段
- 当选择模型时，自动填充已知模型的 maxTokens

### 3.2 记忆数据管理

- 当选择用户时，加载统计信息和记忆列表
- 当切换类型筛选时，重新请求 `/api/memory/all`
- 当点击导出时，触发浏览器下载 JSON 文件
- 当点击清空时，要求二次确认后调用 DELETE 接口

### 3.3 UI 交互

- 侧边栏切换使用 `data-section` 属性映射到 `#sec-{name}` 区块
- Toast 消息 3 秒后自动消失
- 移动端侧边栏水平滚动

## 4. 边界条件

| 场景 | 处理方式 |
|------|----------|
| config.yaml 不存在 | 返回默认空配置 |
| persona.yaml 不存在 | 返回 `{ default: "", users: {} }` |
| LLM 接口超时 | 显示错误 Toast，不阻塞 UI |
| 记忆数据库不存在 | 显示空状态，不报错 |
| 未选择用户就操作 | 按钮不触发 / 提示选择用户 |

## 5. 契约

### 配置一致性
- **C-1 配置读写对称**：`PUT /api/config` 写入的 YAML 结构必须与 `GET /api/config` 返回的结构一致，不允许读写不对称。
- **C-2 persona 缺省值**：`GET /api/persona` 在文件不存在时返回 `{ default: "", users: {} }`，不允许返回 404 或空响应。

### API 规范
- **C-3 响应统一性**：所有 Config API 端点使用 `ApiResponse<T>` 包装，不允许裸返回。
- **C-4 静态资源隔离**：Fastify 静态文件服务只暴露 `public/` 目录，不允许访问上级目录。
- **C-5 API key 分离存储**：API key 必须存储在 `.env` 文件中，`config.yaml` 只存 `${VAR}` 引用。GET 时解析引用返回实际值，PUT 时提取 key 写入 `.env` 并将引用写入 `config.yaml`。

### 前端交互
- **C-5 保存原子性**：配置保存时，`/api/config` 和 `/api/persona` 必须同时成功或同时失败。前端使用 `Promise.all` 保证。
- **C-6 删除二次确认**：清空用户数据必须经过两次 `confirm()` 确认，单条删除只需一次。

## 6. 文件结构

```
src/webui/
├── config-api.ts           # 配置管理 Fastify 插件
├── memory-api.ts           # 记忆管理 Fastify 插件
├── types/
│   ├── webui.types.ts      # 共享类型定义
│   └── index.ts            # 类型导出
├── utils/
│   └── response.ts         # ok()/fail() 响应构建器
└── public/
    └── index.html          # 单页应用（HTML + CSS + JS）

specs/
├── webui.md                # 本文件
├── memory-api.md           # 记忆 API 规格
└── templates/
    └── interface-spec.md   # 规格模板
```

## 7. 验收标准

- [ ] 所有 API 返回统一 `ApiResponse<T>` 格式
- [ ] 配置保存后立即生效（需重启的字段有提示）
- [ ] 记忆数据页面加载时不阻塞主配置页面
- [ ] 移动端可正常使用
- [ ] 无硬编码密钥（API key 使用 password 输入框）
