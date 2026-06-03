# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**NNBOT** — lightweight QQ Bot with plugin system.

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
4. **Commit** — conventional commits format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`

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

- Framework: Vitest
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
