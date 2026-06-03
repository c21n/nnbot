# Phase 1: createPlugin 工厂函数 规格说明

## 1. 概述

实现插件系统 v2 的核心：`createPlugin` 工厂函数。将 `PluginDefinition` 包装为 `IPlugin` 实例，简化插件开发体验。

### 目标

- 插件开发者只需关注 `name` + `handle`
- 通过 `PluginServices` 注入依赖，无需手动构造
- 保持与现有 `IPlugin` 接口兼容

## 2. 接口规格

### 2.1 PluginServices — 插件可用的服务

```typescript
/**
 * Services available to plugins via handle(event, services)
 * Injected by PluginManager, not manually constructed
 */
export interface PluginServices {
  readonly llm: ILLMService;
  readonly storage: IStorage;
  readonly config: Config;
  readonly pluginManager: IPluginManager;
}
```

**注入时机**：`PluginManager.loadFromDir()` 或 `PluginManager.register()` 时传入。

### 2.2 PluginDefinition — createPlugin 的参数

```typescript
/**
 * Plugin definition passed to createPlugin()
 * Only name and handle are required
 */
export interface PluginDefinition {
  /** Plugin unique name (required) */
  readonly name: string;

  /** Plugin description (optional, default: "") */
  readonly description?: string;

  /** Version string (optional, default: "1.0.0") */
  readonly version?: string;

  /** Execution priority, lower = earlier (optional, default: 100) */
  readonly priority?: number;

  /** Help text (optional, default: "") */
  readonly help?: string;

  /**
   * Event handler (required)
   * @returns Response if handled, null to skip
   */
  handle(event: Event, services: PluginServices): Promise<Response | null>;

  /** Called when plugin is loaded (optional) */
  onLoad?(services: PluginServices): Promise<void>;

  /** Called when plugin is unloaded (optional) */
  onUnload?(): Promise<void>;
}
```

### 2.3 createPlugin — 工厂函数签名

```typescript
/**
 * Create an IPlugin from a PluginDefinition
 * Wraps the definition, defers services injection to runtime
 */
export function createPlugin(def: PluginDefinition): IPlugin;
```

**返回值**：实现了 `IPlugin` 接口的对象。

## 3. 核心行为

### 3.1 createPlugin 行为规格

```
输入: PluginDefinition (name, handle 必填)
输出: IPlugin 实例

处理流程:
1. 验证 name 非空字符串，否则 throw Error
2. 验证 handle 是函数，否则 throw Error
3. 设置默认值:
   - description: def.description ?? ""
   - version: def.version ?? "1.0.0"
   - priority: def.priority ?? 100
   - help: def.help ?? ""
4. 返回 IPlugin 对象:
   - name, version, description, priority: 直接返回
   - help(): 返回 help 字符串
   - onLoad(): 如果 def.onLoad 存在，调用 def.onLoad(services)
   - onUnload(): 如果 def.onUnload 存在，调用 def.onUnload()
   - handle(event): 调用 def.handle(event, services)
```

### 3.2 服务注入机制

```
createPlugin 返回的 IPlugin 对象内部:
- 持有 _services: PluginServices | null = null
- setServices(services): 内部方法，设置 _services
- handle/onLoad 调用时:
  - 如果 _services 为 null，throw Error("Plugin not registered")
  - 否则传入 _services
```

**注意**：`setServices` 不在 `IPlugin` 接口上，由 `PluginManager` 内部调用。

### 3.3 优先级常量

```typescript
/**
 * Plugin priority constants
 * Lower number = higher priority (executed first)
 */
export const PLUGIN_PRIORITY = {
  ADMIN: 10,
  RULE_MATCH: 50,
  AI_CHAT: 100,
  DEFAULT: 100,
} as const;
```

## 4. 边界条件

| 场景 | 处理方式 |
|------|----------|
| `name` 为空字符串 | throw Error("Plugin name is required") |
| `name` 不是字符串 | throw Error("Plugin name is required") |
| `handle` 不是函数 | throw Error("Plugin handle function is required") |
| `handle` 未提供 | throw Error("Plugin handle function is required") |
| `priority` 为负数 | 允许，数字越小越先执行 |
| `priority` 相同 | 按文件名字母序（Phase 2 实现） |
| `onLoad` 未定义 | 跳过，不报错 |
| `onUnload` 未定义 | 跳过，不报错 |
| `help` 未定义 | 返回空字符串 |

## 5. 测试规格

### 5.1 createPlugin 基础测试

```
describe("createPlugin")
├─ "should create plugin with minimal definition"
│  输入: { name: "test", handle: async () => null }
│  验证: 返回对象实现 IPlugin，name="test"，其他默认值
│
├─ "should create plugin with all options"
│  输入: { name, description, version, priority, help, handle, onLoad, onUnload }
│  验证: 所有字段正确传递
│
├─ "should use default values when optional fields omitted"
│  输入: { name: "test", handle: async () => null }
│  验证: description=""，version="1.0.0"，priority=100，help=""
│
├─ "should throw when name is empty"
│  输入: { name: "", handle: async () => null }
│  验证: throw Error("Plugin name is required")
│
├─ "should throw when name is missing"
│  输入: { handle: async () => null }
│  验证: throw Error("Plugin name is required")
│
├─ "should throw when handle is not a function"
│  输入: { name: "test", handle: "not a function" }
│  验证: throw Error("Plugin handle function is required")
│
└─ "should throw when handle is missing"
   输入: { name: "test" }
   验证: throw Error("Plugin handle function is required")
```

### 5.2 服务注入测试

```
describe("createPlugin service injection")
├─ "should throw when handle called before services set"
│  操作: 创建插件，直接调用 handle(event)
│  验证: throw Error("Plugin not registered")
│
├─ "should pass services to handle"
│  操作: setServices(mockServices)，调用 handle(event)
│  验证: handle 收到 (event, mockServices)
│
├─ "should pass services to onLoad"
│  操作: setServices(mockServices)，调用 onLoad()
│  验证: onLoad 收到 (mockServices)
│
└─ "should call onUnload without services"
   操作: 调用 onUnload()
   验证: onUnload 被调用，无参数
```

### 5.3 优先级常量测试

```
describe("PLUGIN_PRIORITY")
├─ "should have correct values"
│  验证: ADMIN=10, RULE_MATCH=50, AI_CHAT=100, DEFAULT=100
│
└─ "should have ADMIN < RULE_MATCH < AI_CHAT"
   验证: 10 < 50 < 100
```

## 6. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/interfaces.ts` | 修改 | 添加 PluginServices, PluginDefinition 接口 |
| `src/core/create-plugin.ts` | 新建 | createPlugin 工厂函数实现 |
| `src/core/__tests__/create-plugin.test.ts` | 新建 | 单元测试 |
| `src/constants.ts` | 新建 | PLUGIN_PRIORITY 常量 |

## 7. 验收标准

- [ ] `PluginServices` 接口定义正确
- [ ] `PluginDefinition` 接口定义正确
- [ ] `createPlugin` 函数实现并通过所有测试
- [ ] 服务注入机制工作正常
- [ ] `PLUGIN_PRIORITY` 常量定义正确
- [ ] 所有边界条件测试通过
- [ ] 现有 13 个 hooks 测试仍通过
- [ ] 代码符合项目规范（<50 行函数，<400 行文件）

## 8. 依赖关系

- 不依赖 Phase 2-5
- Phase 2（目录扫描）依赖本阶段的 `createPlugin` 和 `PluginDefinition`
- 现有 `IPlugin` 接口保持不变，确保向后兼容
