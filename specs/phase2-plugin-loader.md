# Phase 2: 插件加载器 规格说明

## 1. 概述

实现插件目录扫描和加载功能。扫描 `src/plugins/` 目录，动态导入插件模块，按优先级排序后注册。

### 目标

- 零配置：放文件就生效
- 按 priority 排序执行
- 加载失败不阻断其他插件

## 2. 接口规格

### 2.1 PluginLoader — 加载器接口

```typescript
/**
 * Plugin loader interface
 * Handles directory scanning and dynamic import
 */
export interface IPluginLoader {
  /**
   * Load all plugins from a directory
   * @param dir - Absolute path to plugins directory
   * @param services - Services to inject into plugins
   * @returns Array of loaded plugins (sorted by priority)
   */
  loadFromDir(dir: string, services: PluginServices): Promise<IPlugin[]>;

  /**
   * Load a single plugin file
   * @param filePath - Absolute path to plugin file
   * @param services - Services to inject
   * @returns Loaded plugin or null if failed
   */
  loadPlugin(filePath: string, services: PluginServices): Promise<IPlugin | null>;
}
```

### 2.2 PluginManager 扩展

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
}
```

## 3. 核心行为

### 3.1 目录扫描流程

```
输入: dir (目录路径), services (PluginServices)
输出: IPlugin[] (按 priority 排序)

1. 检查目录是否存在
   - 不存在 → 创建空目录 + 日志警告 → 返回 []
2. 读取目录内容
3. 过滤文件:
   - 只保留 .ts 和 .js 文件
   - 忽略 __tests__/ 目录
   - 忽略 index.ts
   - 忽略以 _ 开头的文件
4. 逐个调用 loadPlugin()
5. 过滤掉 null（加载失败的）
6. 按 priority 升序排序
   - priority 相同 → 按文件名字母序
7. 返回排序后的插件数组
```

### 3.2 单文件加载流程

```
输入: filePath (文件路径), services (PluginServices)
输出: IPlugin | null

1. 动态 import filePath
2. 获取 default export
   - 无 default export → 日志警告 → return null
3. 验证是否为 IPlugin（有 name, handle 方法）
   - 不是 → 日志警告 → return null
4. 调用 plugin.setServices(services)
5. 调用 plugin.onLoad()
   - 失败 → 日志错误 → return null
6. 返回 plugin
```

### 3.3 优先级排序

```typescript
// 排序比较函数
function comparePlugins(a: IPlugin, b: IPlugin): number {
  const pa = (a as any).priority ?? PLUGIN_PRIORITY.DEFAULT;
  const pb = (b as any).priority ?? PLUGIN_PRIORITY.DEFAULT;

  if (pa !== pb) return pa - pb;  // priority 升序
  return a.name.localeCompare(b.name);  // name 字母序
}
```

**注意**：`priority` 不在 `IPlugin` 接口上，需要从内部访问或扩展接口。

### 3.4 PluginManager.loadFromDir

```
输入: dir (目录路径), services (PluginServices)

1. 调用 loader.loadFromDir(dir, services)
2. 遍历返回的插件数组
3. 逐个调用 this.register(plugin)
   - 注册失败 → 日志错误，继续下一个
```

## 4. 边界条件

| 场景 | 处理方式 |
|------|----------|
| 目录不存在 | 创建空目录 + 日志警告 → 返回 [] |
| 目录为空 | 返回 [] |
| 文件语法错误 | 跳过 + 日志错误信息 |
| 文件无 default export | 跳过 + 日志警告 |
| default export 不是 IPlugin | 跳过 + 日志警告 |
| 插件 name 重复 | 后加载的跳过 + 日志警告 |
| 插件 onLoad 失败 | 跳过 + 日志错误 |
| priority 相同 | 按文件名字母序 |
| __tests__ 目录 | 忽略 |
| index.ts | 忽略 |
| _ 开头的文件 | 忽略 |
| 非 .ts/.js 文件 | 忽略 |

## 5. 测试规格

### 5.1 PluginLoader 测试

```
describe("PluginLoader")
├─ loadFromDir
│  ├─ "should load plugins from directory"
│  │  准备: 目录下有 2 个插件文件
│  │  验证: 返回 2 个插件
│  │
│  ├─ "should sort plugins by priority"
│  │  准备: priority 分别为 100, 10, 50
│  │  验证: 返回顺序为 10, 50, 100
│  │
│  ├─ "should sort by name when priority equal"
│  │  准备: 两个插件 priority 都是 100
│  │  验证: 按名字母序排列
│  │
│  ├─ "should skip files without default export"
│  │  准备: 一个正常插件 + 一个无 default 的文件
│  │  验证: 只返回 1 个插件
│  │
│  ├─ "should skip files with invalid plugin"
│  │  准备: 一个正常插件 + 一个导出普通对象的文件
│  │  验证: 只返回 1 个插件
│  │
│  ├─ "should skip __tests__ directory"
│  │  准备: 目录下有 __tests__/ 和插件文件
│  │  验证: 不加载 __tests__ 中的文件
│  │
│  ├─ "should skip index.ts"
│  │  准备: 目录下有 index.ts 和插件文件
│  │  验证: 不加载 index.ts
│  │
│  ├─ "should skip underscore prefixed files"
│  │  准备: 目录下有 _utils.ts 和插件文件
│  │  验证: 不加载 _utils.ts
│  │
│  ├─ "should skip non-ts-js files"
│  │  准备: 目录下有 .md 文件和插件文件
│  │  验证: 不加载 .md 文件
│  │
│  ├─ "should return empty array for empty directory"
│  │  准备: 空目录
│  │  验证: 返回 []
│  │
│  └─ "should create directory if not exists"
│     准备: 目录不存在
│     验证: 创建目录，返回 []
│
└─ loadPlugin
   ├─ "should load valid plugin file"
   │  准备: 有效的插件文件
   │  验证: 返回 IPlugin 实例
   │
   ├─ "should return null for missing default export"
   │  准备: 无 default export 的文件
   │  验证: 返回 null
   │
   ├─ "should return null for invalid plugin"
   │  准备: 导出普通对象的文件
   │  验证: 返回 null
   │
   └─ "should return null when onLoad fails"
      准备: onLoad 抛异常的插件
      验证: 返回 null
```

### 5.2 PluginManager.loadFromDir 测试

```
describe("PluginManager.loadFromDir")
├─ "should register all loaded plugins"
│  准备: 目录下有 2 个插件
│  验证: getPlugins() 返回 2 个插件
│
└─ "should continue registering if one fails"
   准备: 一个正常插件 + 一个 name 重复的插件
   验证: getPlugins() 返回 1 个插件
```

## 6. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/plugin-loader.ts` | 新建 | PluginLoader 实现 |
| `src/core/__tests__/plugin-loader.test.ts` | 新建 | 单元测试 |
| `src/core/plugin-manager.ts` | 修改 | 添加 loadFromDir 方法 |
| `src/core/__tests__/plugin-manager.test.ts` | 新建 | PluginManager 测试 |
| `src/plugins/__fixtures__/` | 新建 | 测试用插件文件 |

## 7. 验收标准

- [ ] 目录扫描正确过滤文件
- [ ] 按 priority 升序排序
- [ ] priority 相同按名字母序
- [ ] 加载失败跳过 + 日志
- [ ] 目录不存在时创建
- [ ] PluginManager.loadFromDir 工作正常
- [ ] 所有测试通过
- [ ] 现有测试未被破坏

## 8. 依赖关系

- 依赖 Phase 1 的 `createPlugin` 和 `PluginDefinition`
- Phase 3（热重载）依赖本阶段的加载器
