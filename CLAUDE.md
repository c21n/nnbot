# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**NNBOT** — chatbot application (empty project, initializing).

## Development Environment

- OS: Windows 11
- Shell: Git Bash (primary), PowerShell (fallback)
- Editor: VS Code

## Coding Conventions

- Language for communication: Chinese (中文), technical terms in English
- Code comments: English
- Immutability patterns preferred — never mutate existing objects, always return new copies
- Type annotations everywhere
- Small files (<400 lines), small functions (<50 lines)
- Early returns over deep nesting (>4 levels)
- Explicit error handling — never silently swallow errors
- Named constants over magic numbers
- KISS > DRY > YAGNI

### Naming

- Variables/functions: `camelCase`
- Booleans: `is`, `has`, `should`, `can` prefix
- Types/interfaces/components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

## Workflow

1. **Plan first** — use planning before any non-trivial implementation
2. **TDD** — write tests first (RED → GREEN → REFACTOR), target 80%+ coverage
3. **Code review** — mandatory after every code change
4. **Module log** — record changes to `docs/[module-name].md` after module completion
5. **Commit** — conventional commits format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`

## Agent Orchestration

All work delegated through sub-agents. Main agent: understand intent → decompose → assign → integrate → report.

### Pre-Implementation Research

Before writing new code:
1. GitHub code search for existing implementations
2. Context7 / primary vendor docs for API behavior
3. Package registry search (npm, PyPI, etc.)
4. Web search (Exa) as fallback

### Multi-Perspective Review (by change type)

| Scenario | Agents |
|----------|--------|
| Security-sensitive | security-reviewer + architect + code-reviewer |
| Performance | architect + code-reviewer |
| General feature | code-reviewer |
| Bug fix | code-reviewer + tdd-guide |

## Testing

- Framework: Jest (JS/TS), pytest (Python)
- E2E: Playwright
- Structure: Arrange-Act-Assert
- Test names: descriptive, explaining behavior under test

## Security (pre-commit checklist)

- No hardcoded secrets (env vars / secret manager only)
- All user input validated at boundaries
- Parameterized queries (no string concatenation)
- Error messages must not leak sensitive data

## Git

- Conventional commits
- Never skip hooks (`--no-verify`)
- No direct commit/push from sub-agents

## Module Log

每个模块完成时，记录变更到 `docs/[module-name].md`。模板见 `docs/MODULE_TEMPLATE.md`。

**记录内容：**
- 修改了哪些文件
- 对系统的影响（功能、依赖、行为变化）
- 可选补充信息

## 文档维护规则

### 系统架构文档 (`docs/architecture.md`)

**每次更新时按固定模板重绘，保持整洁：**

模板位置: `docs/templates/architecture.md`

**更新规则：**
- 每次更新按模板重绘，删除过时内容
- 保持简洁，不超过 2 页
- 只写核心架构，不堆砌细节

**模板结构：**
```
1. 分层架构图
2. 数据流图
3. 核心模块表
4. 配置表
5. 扩展点表
```

### 模块日志 (`docs/changelog.md`)

**按插件分类，有修改直接在原基础上修改，保持精简：**

模板位置: `docs/templates/changelog.md`

**更新规则：**
- 按插件/模块分类（ai_chat, admin, core 等）
- 有修改直接在对应插件下更新，不新增条目
- 删除过时内容，保持精简
- 只记录当前状态，历史变更用摘要保留

**日志结构：**
```markdown
## 历史摘要
[简要记录项目重要里程碑]

## ai_chat 插件
- 功能说明

## admin 插件
- 功能说明
```

**历史摘要示例：**
```markdown
## 历史摘要
- 2026-06-02: 项目初始化，实现基础插件系统
- 2026-06-02: 添加人格系统、消息缓冲、摘要压缩
```
