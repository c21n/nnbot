# 模块日志

> 最后更新: 2026-06-02

## 历史摘要

- 2026-06-02: 项目初始化，实现基础插件系统
- 2026-06-02: 添加人格系统、消息缓冲、摘要压缩、独立 LLM 配置
- 2026-06-02: 规范文档维护规则（模板化架构文档、插件分类日志）

## ai_chat 插件

- 支持上下文记忆（可配置轮数）
- 摘要压缩（超出限制自动生成）
- 独立 LLM 配置（插件级别）
- 人格设定（persona.yaml 热更新）
- 消息缓冲（5秒等待合并）

## admin 插件

- 管理命令：/help /plugins /status /clear
- 人格管理：/persona /persona-set /persona-reset

## rule_match 插件

- 正则规则匹配

## core

- 插件管理器
- 配置管理（config.yaml + .env）
- 日志模块（简化格式）
- 消息缓冲

## services

- LLM 服务（OpenAI 兼容，自动获取模型）
- 存储服务（SQLite）
- 人格服务（persona.yaml）
