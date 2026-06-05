# WebUI v2 规格说明

## 1. 概述

NNBot WebUI v2 是 QQ 机器人的管理界面，采用 Dark Mode OLED 主题，多文件架构。
提供服务器配置、LLM Provider 管理、插件管理、记忆系统、规则配置等功能。

## 2. 接口规格

### 2.1 API 接口（不变）

```typescript
// Config API
GET  /api/config              // 读取配置
PUT  /api/config              // 保存配置
POST /api/llm/models          // 获取 LLM 模型列表
POST /api/providers/models    // 获取 Provider 模型列表
GET  /api/persona             // 读取人设
PUT  /api/persona             // 保存人设

// Memory API
GET    /api/memory/users      // 用户列表
GET    /api/memory/summaries  // 用户摘要
GET    /api/memory/all        // 用户记忆
GET    /api/memory/stats      // 用户统计
GET    /api/memory/export     // 导出数据
DELETE /api/memory/:id        // 删除单条记忆
DELETE /api/memory/user       // 删除用户数据

// Health
GET  /health                  // 健康检查
```

### 2.2 前端模块接口

```typescript
// 路由系统
interface Router {
  navigate(page: string): void
  getCurrentPage(): string
}

// API 封装
interface ApiClient {
  getConfig(): Promise<ApiResponse<Config>>
  saveConfig(config: Config): Promise<ApiResponse<void>>
  getPersona(): Promise<ApiResponse<PersonaData>>
  savePersona(data: PersonaData): Promise<ApiResponse<void>>
  getUsers(): Promise<ApiResponse<UserSummary[]>>
  getMemories(userId: string, type?: string): Promise<ApiResponse<MemoryRecord[]>>
  getStats(userId: string): Promise<ApiResponse<MemoryStats>>
  deleteMemory(id: string): Promise<ApiResponse<void>>
  deleteUserData(userId: string): Promise<ApiResponse<void>>
  exportUserData(userId: string): Promise<Blob>
  fetchModels(baseUrl: string, apiKey: string): Promise<ApiResponse<string[]>>
}

// Toast 通知
interface Toast {
  success(message: string): void
  error(message: string): void
  info(message: string): void
}
```

## 3. 核心行为

### 3.1 导航
- 左侧固定侧边栏（240px），显示 logo + 导航项
- 移动端（<768px）侧边栏变为抽屉式，点击汉堡菜单展开
- 当前页面高亮显示
- 支持 hash 路由（#dashboard, #providers 等）

### 3.2 页面结构
1. **Dashboard** — 服务器状态、最近活跃用户、快速操作
2. **Providers** — LLM Provider 卡片网格，支持 CRUD
3. **Persona** — 默认人设 + 按用户人设编辑
4. **Memory** — 记忆系统配置（开关、搜索参数、生命周期）
5. **Memory Data** — 用户列表、记忆浏览、统计、删除/导出
6. **Plugins** — 插件启用/禁用
7. **Rules** — 正则规则编辑器
8. **Search** — 搜索工具配置
9. **Admin** — 管理员用户和命令
10. **Settings** — Server、OneBot、Storage、Context 配置

### 3.3 配置管理
- 加载时：GET /api/config → 填充表单
- 保存时：收集表单 → PUT /api/config
- API Key 自动提取到 .env，表单显示实际值
- Provider 预设快速填充（OpenAI、DeepSeek、SiliconFlow 等）

### 3.4 记忆数据浏览
- 用户下拉选择 → 加载该用户的记忆
- 记忆卡片按类型着色（preference/event/context/summary）
- 支持单条删除和批量删除
- 导出为 JSON

## 4. 边界条件

- 空配置时使用默认值
- API 请求失败时显示 Toast 错误提示
- 网络超时 10 秒
- 表单验证：必填字段、URL 格式、端口范围

## 5. 契约

- C-1: API Key 在 .env 中存储，config.yaml 使用 ${VAR} 引用
- C-2: 配置保存后自动重载（不需要重启）
- C-3: 删除操作需要二次确认
- C-4: 所有 API 响应使用 ApiResponse<T> 格式
- C-5: 时间字段提供 number 时间戳和 string 格式化字符串

## 6. 文件结构

```
src/webui/public/
├── index.html              # 入口 HTML（<100 行）
├── css/
│   ├── variables.css       # CSS 变量（颜色、字体、间距、阴影）
│   ├── reset.css           # CSS reset
│   ├── layout.css          # 布局（侧边栏、网格、响应式）
│   ├── components.css      # 通用组件（卡片、按钮、表单、toast）
│   └── pages.css           # 页面特定样式
├── js/
│   ├── app.js              # 主入口，初始化
│   ├── router.js           # Hash 路由系统
│   ├── api.js              # API 调用封装
│   ├── toast.js            # Toast 通知组件
│   ├── pages/
│   │   ├── dashboard.js    # Dashboard 概览
│   │   ├── providers.js    # Provider 管理
│   │   ├── persona.js      # 人设管理
│   │   ├── memory.js       # 记忆配置
│   │   ├── memory-data.js  # 记忆数据浏览
│   │   ├── plugins.js      # 插件管理
│   │   ├── rules.js        # 规则编辑
│   │   ├── search.js       # 搜索配置
│   │   ├── admin.js        # 管理员配置
│   │   └── settings.js     # 服务器配置
│   └── components/
│       ├── sidebar.js      # 侧边栏组件
│       ├── card.js         # 卡片组件
│       ├── form.js         # 表单组件
│       ├── modal.js        # 模态框
│       └── list-editor.js  # 列表编辑器
└── assets/
    └── icons/              # SVG 图标
```

## 7. 验收标准

- [ ] 所有现有功能正常工作
- [ ] 深色主题，对比度 4.5:1
- [ ] 响应式：375px / 768px / 1024px / 1440px
- [ ] 键盘可访问
- [ ] 加载状态显示骨架屏
- [ ] 表单验证即时反馈
- [ ] Toast 通知 3-5 秒自动消失
- [ ] 删除操作需确认
