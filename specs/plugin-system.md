# Plugin System v2 规格说明

## 1. 概述

重构插件系统，提供对插件开发者友好的 API。核心目标：外部开发者能用最少代码写出一个插件。

### 设计决策

| 决定 | 选择 | 理由 |
|------|------|------|
| API 风格 | 最小化（name + handle） | 降低外部开发者上手门槛 |
| 发现机制 | 目录扫描 `src/plugins/` | 零配置，放文件就生效 |
| 导出方式 | `export default createPlugin({...})` | 一个文件一个插件 |
| 热重载 | 文件监听 + `/reload` 命令 | 开发体验 + 线上可控 |
| 加载失败 | 跳过 + 日志 | 不阻断其他插件 |
| 服务注入 | 通过 handle 第二参数注入 | 插件可访问 LLM、存储等 |
| 执行顺序 | priority 字段 | 数字越小越先执行，默认 100 |
| 旧插件 | 全部迁移为新格式 | 统一体验 |

## 2. 接口规格

### 2.1 PluginServices — 插件可用的服务

```typescript
export interface PluginServices {
  readonly llm: ILLMService;
  readonly storage: IStorage;
  readonly config: Config;
  readonly pluginManager: IPluginManager;
}
```

插件通过 `handle(event, services)` 的第二个参数访问，无需手动注入。

### 2.2 PluginDefinition — createPlugin 的参数

```typescript
export interface PluginDefinition {
  /** 插件唯一名称（必填） */
  readonly name: string;

  /** 插件描述（可选，默认 ""） */
  readonly description?: string;

  /** 版本号（可选，默认 "1.0.0"） */
  readonly version?: string;

  /** 执行优先级，数字越小越先执行（可选，默认 100） */
  readonly priority?: number;

  /** 帮助信息（可选，默认 ""） */
  readonly help?: string;

  /**
   * 事件处理函数（必填）
   * @returns Response 表示已处理，null 表示跳过
   */
  handle(event: Event, services: PluginServices): Promise<Response | null>;

  /** 插件加载时调用（可选） */
  onLoad?(services: PluginServices): Promise<void>;

  /** 插件卸载时调用（可选） */
  onUnload?(): Promise<void>;
}
```

### 2.3 createPlugin — 工厂函数

```typescript
export function createPlugin(def: PluginDefinition): IPlugin;
```

将 `PluginDefinition` 包装为 `IPlugin` 实例。内部持有 `PluginServices` 引用，在 `handle`/`onLoad` 调用时注入。

### 2.4 PluginManager — 扩展接口

```typescript
export interface IPluginManager {
  // 保留已有方法
  register(plugin: IPlugin): Promise<void>;
  unregister(plugin: IPlugin): Promise<void>;
  dispatch(event: Event): Promise<Response | null>;
  getPlugins(): IPlugin[];
  getPlugin(name: string): IPlugin | undefined;

  // 新增
  loadFromDir(dir: string, services: PluginServices): Promise<void>;
  reloadPlugin(name: string): Promise<void>;
  reloadAll(): Promise<void>;
  startWatching(): void;
  stopWatching(): void;
}
```

## 3. 核心行为

### 3.1 目录扫描加载

```
1. 扫描 dir 目录下所有 .ts/.js 文件
2. 动态 import 每个文件的 default export
3. 验证是否为 IPlugin 实例（createPlugin 返回的）
4. 按 priority 升序排序
5. 逐个 register，失败的跳过 + 日志
```

**过滤规则：**
- 忽略 `__tests__/` 目录
- 忽略 `index.ts`（如果存在）
- 忽略以 `_` 开头的文件
- 只处理 `.ts` 和 `.js` 文件

### 3.2 热重载 — 文件监听

```
1. 用 fs.watch 监听 plugins 目录
2. 文件变化时，找到对应的已加载插件
3. unload 旧插件 → import 新模块 → register 新插件
4. 新文件 → 直接加载
5. 文件删除 → unload 对应插件
```

**去抖动：** 500ms 内同一文件的多次变化合并为一次。

### 3.3 热重载 — /reload 命令

```
/reload         → reloadAll()：重新扫描目录，卸载旧的，加载新的
/reload <name>  → reloadPlugin(name)：只重载指定插件
```

由 admin 插件处理，需要 admin 权限。

### 3.4 事件分发

```
1. 按 priority 升序遍历已加载插件
2. 调用 plugin.handle(event, services)
3. 返回 Response → 立即返回，后续插件跳过
4. 返回 null → 继续下一个插件
5. 抛异常 → 日志，继续下一个插件
6. 全部返回 null → 返回 null
```

### 3.5 服务注入

`PluginServices` 在 `loadFromDir` 时由 `bot.ts` 构造并传入。`createPlugin` 内部持有引用，`handle`/`onLoad` 调用时作为第二参数传给开发者函数。

## 4. 边界条件

| 场景 | 处理方式 |
|------|----------|
| 插件文件语法错误 | 跳过 + 日志错误信息 |
| 插件 default export 不是 IPlugin | 跳过 + 日志警告 |
| 插件 name 重复 | 后加载的跳过 + 日志警告 |
| 插件 priority 相同 | 按文件名字母序 |
| 热重载时插件 unload 失败 | 日志错误，继续加载新版本 |
| 目录不存在 | 创建空目录 + 日志警告 |
| 非 .ts/.js 文件 | 忽略 |

## 5. 优先级约定

| 插件 | priority | 理由 |
|------|----------|------|
| admin | 10 | `/` 命令必须最先处理 |
| rule_match | 50 | 规则匹配第二 |
| ai_chat | 100 | LLM 兜底，最后执行 |
| 自定义插件 | 默认 100 | 除非显式指定 |

## 6. 插件开发者体验

### 最小插件

```typescript
export default createPlugin({
  name: "greeting",
  async handle(event) {
    if (event.message === "你好") {
      return { content: "你好！" };
    }
    return null;
  },
});
```

### 使用服务的插件

```typescript
export default createPlugin({
  name: "ai_chat",
  priority: 100,
  async handle(event, { llm, storage }) {
    const reply = await llm.chat([{ role: "user", content: event.message }]);
    await storage.saveMessage(event.userId, "user", event.message);
    await storage.saveMessage(event.userId, "assistant", reply);
    return { content: reply, replyTo: true };
  },
});
```

### 带生命周期的插件

```typescript
export default createPlugin({
  name: "my_plugin",
  async onLoad({ config }) {
    console.log("插件已加载");
  },
  async onUnload() {
    console.log("插件已卸载");
  },
  async handle(event) {
    return null;
  },
});
```

## 7. 验收标准

- [ ] createPlugin 工厂函数实现并通过测试
- [ ] 目录扫描自动加载插件
- [ ] 按 priority 排序执行
- [ ] 文件监听热重载
- [ ] /reload 命令可用
- [ ] 加载失败跳过 + 日志
- [ ] 3 个旧插件迁移为新格式
- [ ] bot.ts 简化为一行加载
- [ ] 现有 13 个 hooks 测试仍通过
- [ ] 新增 createPlugin 和 plugin-loader 测试
