/**
 * Admin Plugin
 *
 * Handles admin commands for bot management.
 * Uses class format for complex command handling.
 */

import type {
  Event,
  Response,
  IConversationStorage,
  PluginServices,
} from "../interfaces.js";
import { PersonaService } from "../services/persona.js";
import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { logger } from "../core/logger.js";

/**
 * Admin Plugin implementation
 * Uses class for complex command handling
 */
class AdminPluginImpl {
  readonly name = "admin";
  readonly version = "1.0.0";
  readonly description = "管理命令插件";
  readonly priority = PLUGIN_PRIORITY.ADMIN;

  private commands!: Map<string, (event: Event, args: string) => Promise<string>>;
  private personaService!: PersonaService | null;
  private conversationStorage!: IConversationStorage | null;
  private services!: PluginServices;

  /**
   * Initialize plugin with services
   */
  async initialize(services: PluginServices): Promise<void> {
    this.services = services;
    this.personaService = new PersonaService(services.storage);
    this.conversationStorage = services.storage;

    this.commands = new Map([
      ["/help", this.cmdHelp.bind(this)],
      ["/plugins", this.cmdPlugins.bind(this)],
      ["/status", this.cmdStatus.bind(this)],
      ["/clear", this.cmdClear.bind(this)],
      ["/persona", this.cmdPersona.bind(this)],
      ["/persona-set", this.cmdPersonaSet.bind(this)],
      ["/persona-reset", this.cmdPersonaReset.bind(this)],
      ["/reload", this.cmdReload.bind(this)],
    ]);
  }

  async onLoad(): Promise<void> {
    console.log(`  Admin commands: ${Array.from(this.commands.keys()).join(", ")}`);
  }

  async onUnload(): Promise<void> {
    // Nothing to cleanup
  }

  async handle(event: Event): Promise<Response | null> {
    // Only handle commands starting with /
    if (!event.message.startsWith("/")) {
      return null;
    }

    // Check if user is admin
    if (!this.isAdmin(event.userId)) {
      return {
        content: "你没有权限执行此命令。",
        replyTo: true,
      };
    }

    // Parse command and args
    const parts = event.message.split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    logger.plugin("admin");

    const handler = this.commands.get(command);
    if (!handler) {
      return {
        content: `未知命令: ${command}\n发送 /help 查看可用命令`,
        replyTo: true,
      };
    }

    try {
      const reply = await handler(event, args);
      return {
        content: reply,
        replyTo: true,
      };
    } catch (error) {
      return {
        content: `命令执行失败: ${error}`,
        replyTo: true,
      };
    }
  }

  help(): string {
    return `管理命令:
/help - 显示帮助信息
/plugins - 列出所有插件
/status - 显示 Bot 状态
/clear - 清除对话历史
/persona - 查看当前人格设定
/persona-set <内容> - 设置人格（用 "|||" 分隔多条）
/persona-reset - 重置为默认人格
/reload [插件名] - 重载插件（无参数重载全部）`;
  }

  private isAdmin(userId: string): boolean {
    return this.services.config.admin.userIds.includes(userId);
  }

  private async cmdHelp(_event: Event): Promise<string> {
    const plugins = this.services.pluginManager.getPlugins();
    const helpText = plugins
      .map((p) => `【${p.name}】${p.help()}`)
      .join("\n\n");
    return `可用命令:\n${Array.from(this.commands.keys()).join(", ")}\n\n插件帮助:\n${helpText}`;
  }

  private async cmdPlugins(_event: Event): Promise<string> {
    const plugins = this.services.pluginManager.getPlugins();
    if (plugins.length === 0) {
      return "没有已加载的插件";
    }

    const list = plugins
      .map((p) => `• ${p.name} v${p.version} - ${p.description}`)
      .join("\n");
    return `已加载插件 (${plugins.length}):\n${list}`;
  }

  private async cmdStatus(_event: Event): Promise<string> {
    const plugins = this.services.pluginManager.getPlugins();
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    return `Bot 状态:
• 运行时间: ${hours}h ${minutes}m ${seconds}s
• 已加载插件: ${plugins.length}
• 内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
• Node.js: ${process.version}`;
  }

  private async cmdClear(event: Event): Promise<string> {
    if (!this.conversationStorage) {
      return "存储服务未初始化";
    }

    await this.conversationStorage.clearHistory(event.userId);
    return "对话历史已清除";
  }

  private async cmdPersona(event: Event): Promise<string> {
    if (!this.personaService) {
      return "人格服务未初始化";
    }

    const persona = await this.personaService.getPersona(event.userId);
    const source = persona === this.personaService.getDefaultPersona()
      ? "(来自 persona.yaml)"
      : "(用户自定义)";

    return `当前人格设定 ${source}:\n\n${persona}`;
  }

  private async cmdPersonaSet(event: Event, args: string): Promise<string> {
    if (!this.personaService) {
      return "人格服务未初始化";
    }

    if (!args) {
      return "用法: /persona-set <人格内容>\n\n示例:\n/persona-set 你是一个幽默的助手，喜欢开玩笑。|||回答要简洁有趣。";
    }

    // Support multiple lines with ||| separator
    const persona = args.replace(/\|\|\|/g, "\n");

    await this.personaService.setUserPersona(event.userId, persona);
    return `人格设定已更新！\n\n新设定:\n${persona}`;
  }

  private async cmdPersonaReset(event: Event): Promise<string> {
    if (!this.personaService) {
      return "人格服务未初始化";
    }

    await this.personaService.resetUserPersona(event.userId);
    return "人格已重置为默认设定";
  }

  private async cmdReload(_event: Event, args: string): Promise<string> {
    if (!this.services) {
      return "服务未初始化，无法重载插件";
    }

    try {
      if (args) {
        // Reload specific plugin
        const pluginName = args.trim();
        await this.services.pluginManager.reloadPlugin(pluginName, this.services);
        return `插件 "${pluginName}" 重载成功`;
      } else {
        // Reload all plugins
        await this.services.pluginManager.reloadAll(this.services);
        const plugins = this.services.pluginManager.getPlugins();
        return `所有插件已重载，共 ${plugins.length} 个`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `重载失败: ${message}`;
    }
  }
}

// Create plugin wrapper using createPlugin
const adminImpl = new AdminPluginImpl();

export default createPlugin({
  name: "admin",
  description: "管理命令插件",
  priority: PLUGIN_PRIORITY.ADMIN,

  async onLoad(services) {
    await adminImpl.initialize(services);
  },

  async handle(event) {
    return adminImpl.handle(event);
  },

  help() {
    return adminImpl.help();
  },
});

// Export class for backward compatibility
export { AdminPluginImpl as AdminPlugin };
