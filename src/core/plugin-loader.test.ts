import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PluginServices } from "../interfaces.js";
import { PluginLoader } from "./plugin-loader.js";

function mockServices(enabled: string[], disabled: string[] = []): PluginServices {
  return {
    config: { plugins: { enabled, disabled } },
  } as unknown as PluginServices;
}

describe("PluginLoader", () => {
  it("filters disabled plugins before importing and sorts by priority", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nnbot-plugin-loader-"));

    try {
      await writeFile(
        join(dir, "slow.js"),
        "export default { name: 'slow', priority: 100, handle: async () => null };\n",
        "utf8"
      );
      await writeFile(
        join(dir, "fast.js"),
        "export default { name: 'fast', priority: 10, handle: async () => null };\n",
        "utf8"
      );
      await writeFile(
        join(dir, "disabled.js"),
        "throw new Error('disabled plugin must not be imported');\n",
        "utf8"
      );

      const plugins = await new PluginLoader().loadFromDir(
        dir,
        mockServices(["slow", "fast", "disabled"], ["disabled"])
      );

      expect(plugins.map((plugin) => plugin.name)).toEqual(["fast", "slow"]);
      expect(plugins.map((plugin) => plugin.priority)).toEqual([10, 100]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("matches hyphenated plugin files with underscored config names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nnbot-plugin-loader-"));

    try {
      await writeFile(
        join(dir, "ai-chat.js"),
        "export default { name: 'ai_chat', handle: async () => null };\n",
        "utf8"
      );

      const plugins = await new PluginLoader().loadFromDir(
        dir,
        mockServices(["ai_chat"])
      );

      expect(plugins.map((plugin) => plugin.name)).toEqual(["ai_chat"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads all plugins when the enabled list is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nnbot-plugin-loader-"));

    try {
      await writeFile(
        join(dir, "auto.js"),
        "export default { name: 'auto', handle: async () => null };\n",
        "utf8"
      );
      await writeFile(
        join(dir, "disabled.js"),
        "export default { name: 'disabled', handle: async () => null };\n",
        "utf8"
      );

      const plugins = await new PluginLoader().loadFromDir(
        dir,
        mockServices([], ["disabled"])
      );

      expect(plugins.map((plugin) => plugin.name)).toEqual(["auto"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
