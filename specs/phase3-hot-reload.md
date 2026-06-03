# Phase 3: 热重载 规格说明

## 1. 概述

实现插件热重载功能，支持文件监听自动重载和 `/reload` 命令手动重载。

### 目标

- 文件变化自动重载
- `/reload` 命令可控
- 重载过程不阻断消息处理

## 2. 接口规格

### 2.1 PluginManager 扩展

```typescript
export interface IPluginManager {
  // 保留已有方法
  register(plugin: IPlugin): Promise<void>;
  unregister(plugin: IPlugin): Promise<void>;
  dispatch(event: Event): Promise<Response | null>;
  getPlugins(): IPlugin[];
  getPlugin(name: string): IPlugin | undefined;
  loadFromDir(dir: string, services: PluginServices): Promise<void>;

  // 新增热重载方法
  reloadPlugin(name: string): Promise<void>;
  reloadAll(): Promise<void>;
  startWatching(): void;
  stopWatching(): void;
}
```

### 2.2 HotReloadManager — 热重载管理器

```typescript
/**
 * Manages file watching and plugin reloading
 * Separated from PluginManager for single responsibility
 */
export interface IHotReloadManager {
  /** Start watching directory for changes */
  startWatching(dir: string): void;

  /** Stop watching */
  stopWatching(): void;

  /** Check if currently watching */
  isWatching(): boolean;
}
```

## 3. 核心行为

### 3.1 文件监听流程

```
输入: dir (插件目录)

1. 用 fs.watch 监听目录
2. 文件变化事件触发时:
   a. 过滤: 只处理 .ts/.js 文件
   b. 去抖动: 500ms 内同一文件多次变化合并
   c. 查找对应已加载插件（按文件名匹配）
   d. 如果找到:
      - unload 旧插件
      - import 新模块
      - register 新插件
   e. 如果没找到（新文件）:
      - 直接加载新插件
3. 文件删除事件:
   a. 查找对应已加载插件
   b. 如果找到: unload 插件
```

### 3.2 去抖动机制

```typescript
/**
 * Debounce file change events
 * 500ms window to merge rapid changes
 */
private debounceMap: Map<string, NodeJS.Timeout> = new Map();

private handleFileChange(filename: string): void {
  // Clear existing timeout for this file
  const existing = this.debounceMap.get(filename);
  if (existing) {
    clearTimeout(existing);
  }

  // Set new timeout
  const timeout = setTimeout(() => {
    this.debounceMap.delete(filename);
    this.reloadFile(filename);
  }, 500);

  this.debounceMap.set(filename, timeout);
}
```

### 3.3 reloadPlugin 流程

```
输入: name (插件名)

1. 查找插件: getPlugin(name)
   - 未找到 → throw Error("Plugin not found")
2. 查找插件文件路径（从内部映射）
3. unload 旧插件: unregister(plugin)
4. import 新模块
5. register 新插件
   - 失败 → 日志错误（插件已卸载，不会回滚）
```

### 3.4 reloadAll 流程

```
1. 保存当前插件列表
2. 逐个 unregister 所有插件
3. 重新 loadFromDir（使用保存的 dir 和 services）
4. 日志: 重载了 N 个插件
```

### 3.5 /reload 命令

```
输入: event.message

解析:
- "/reload"       → reloadAll()
- "/reload <name>" → reloadPlugin(name)

处理:
1. 检查 admin 权限
2. 执行重载
3. 返回结果消息
```

**位置**: 在 admin.ts 插件中添加 `/reload` 命令处理。

## 4. 边界条件

| 场景 | 处理方式 |
|------|----------|
| 重载时插件 unload 失败 | 日志错误，继续加载新版本 |
| 重载时新版本加载失败 | 日志错误，插件被移除 |
| 文件快速连续变化 | 去抖动合并为一次重载 |
| 目录下新增文件 | 自动加载新插件 |
| 目录下删除文件 | 自动卸载对应插件 |
| 重载期间收到事件 | 使用旧插件列表（重载完成后更新） |
| stopWatching 时无 watcher | 静默忽略 |
| 重复 startWatching | 静默忽略（只有一个 watcher） |

## 5. 测试规格

### 5.1 HotReloadManager 测试

```
describe("HotReloadManager")
├─ startWatching
│  ├─ "should start watching directory"
│  │  操作: startWatching(dir)
│  │  验证: isWatching() === true
│  │
│  ├─ "should not start watching if already watching"
│  │  操作: startWatching(dir) x2
│  │  验证: 只创建一个 watcher
│  │
│  └─ "should throw if directory not exists"
│     操作: startWatching(nonExistentDir)
│     验证: throw Error
│
├─ stopWatching
│  ├─ "should stop watching"
│  │  操作: startWatching → stopWatching
│  │  验证: isWatching() === false
│  │
│  └─ "should be safe to call when not watching"
│     操作: stopWatching (未 start)
│     验证: 不抛异常
│
└─ file change handling
   ├─ "should reload plugin when file changes"
   │  操作: 修改插件文件
   │  验证: 插件被重新加载
   │
   ├─ "should load new plugin when file added"
   │  操作: 添加新插件文件
   │  验证: 新插件被加载
   │
   ├─ "should unload plugin when file deleted"
   │  操作: 删除插件文件
   │  验证: 插件被卸载
   │
   └─ "should debounce rapid changes"
      操作: 快速多次修改同一文件
      验证: 只触发一次重载
```

### 5.2 PluginManager.reload 测试

```
describe("PluginManager reload")
├─ reloadPlugin
│  ├─ "should reload specific plugin"
│  │  操作: 加载插件 → reloadPlugin(name)
│  │  验证: 插件版本更新
│  │
│  ├─ "should throw if plugin not found"
│  │  操作: reloadPlugin("nonexistent")
│  │  验证: throw Error
│  │
│  └─ "should handle reload failure gracefully"
│     操作: 加载插件 → 修改为无效 → reloadPlugin
│     验证: 插件被移除，不阻断
│
└─ reloadAll
   ├─ "should reload all plugins"
   │  操作: 加载多个插件 → reloadAll
   │  验证: 所有插件重新加载
   │
   └─ "should handle empty plugin list"
      操作: reloadAll (无插件)
      验证: 不抛异常
```

### 5.3 /reload 命令测试

```
describe("/reload command")
├─ "should reload all plugins"
│  操作: 发送 "/reload"
│  验证: reloadAll 被调用
│
├─ "should reload specific plugin"
│  操作: 发送 "/reload plugin-name"
│  验证: reloadPlugin("plugin-name") 被调用
│
├─ "should require admin permission"
│  操作: 非 admin 用户发送 "/reload"
│  验证: 返回权限错误
│
└─ "should report reload result"
   操作: 发送 "/reload"
   验证: 返回包含重载结果的消息
```

## 6. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/hot-reload-manager.ts` | 新建 | HotReloadManager 实现 |
| `src/core/__tests__/hot-reload-manager.test.ts` | 新建 | 单元测试 |
| `src/core/plugin-manager.ts` | 修改 | 添加 reload 方法 |
| `src/core/__tests__/plugin-manager.test.ts` | 新建 | PluginManager 测试 |
| `src/plugins/admin.ts` | 修改 | 添加 /reload 命令 |

## 7. 验收标准

- [ ] 文件监听正确启动/停止
- [ ] 文件变化触发重载
- [ ] 去抖动 500ms 工作正常
- [ ] 新文件自动加载
- [ ] 删除文件自动卸载
- [ ] reloadPlugin 工作正常
- [ ] reloadAll 工作正常
- [ ] /reload 命令可用
- [ ] /reload 需要 admin 权限
- [ ] 所有测试通过
- [ ] 现有测试未被破坏

## 8. 依赖关系

- 依赖 Phase 2 的 PluginLoader 和 loadFromDir
- Phase 4（迁移旧插件）依赖本阶段的热重载
