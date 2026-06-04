# <模块名> 规格说明

## 1. 概述

<!-- 用一两句话描述模块职责、解决什么问题 -->

## 2. 接口规格

<!-- 定义模块对外暴露的接口，必须包含完整的类型定义 -->

```typescript
// 命名规范：I 前缀 + PascalCase
export interface IModuleService {
  // 方法命名：动词 + 名词
  getData(id: string): Promise<Data>
  saveData(data: Data): Promise<void>

  // 复杂查询用对象参数
  query(params: QueryParams): Promise<Result[]>
}
```

**接口检查清单**：
- [ ] 接口名有 `I` 前缀
- [ ] 方法名遵循命名规范（save/find/delete/update）
- [ ] 参数风格一致
- [ ] 返回值类型一致
- [ ] 与现有接口风格一致

### 2.1 数据类型

```typescript
/** 核心数据结构 */
export interface Data {
  id: string
  name: string
}
```

### 2.2 响应格式

```typescript
/** 统一 API 响应 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

## 3. 核心行为

<!-- 用自然语言描述关键行为，使用 "当...则..." 格式 -->

- 当调用 `getData(id)` 且 id 存在时，返回数据对象
- 当调用 `getData(id)` 且 id 不存在时，返回 null
- 当调用 `delete(id)` 时，同时清理关联数据

## 4. 边界条件

- **空值处理**：userId 为空时返回 400 错误
- **错误情况**：数据库不可用时返回 500，附带错误信息
- **极端值**：大量数据时使用分页，避免单次返回超过 1000 条

## 5. 契约

<!-- 断言式语句，描述模块必须保证的不变量 -->

### 数据完整性
- **C-N** 描述必须始终为真的约束

### 安全约束
- **C-N** 描述安全相关的约束

### 排序与筛选
- **C-N** 描述数据处理规则

### 响应格式
- **C-N** 描述输出格式约束

## 6. 验收标准

- [ ] 所有接口方法有对应测试
- [ ] 错误响应格式统一
- [ ] 无硬编码值
- [ ] 类型定义完整，无 `any`
