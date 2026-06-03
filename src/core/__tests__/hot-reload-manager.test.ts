/**
 * Tests for HotReloadManager
 *
 * Tests file watching, debouncing, and plugin reloading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import type { IPlugin, PluginServices } from "../../interfaces.js";
import { EventType } from "../../interfaces.js";

const { HotReloadManager } = await import("../hot-reload-manager.js");
const { PluginManager } = await import("../plugin-manager.js");
const { PluginLoader } = await import("../plugin-loader.js");

// ============ Test Helpers ============

function createMockServices(): PluginServices {
  return {
    llm: {
      chat: vi.fn().mockResolvedValue("response"),
      chatStream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
    },
    storage: {
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      saveMessage: vi.fn(),
      getHistory: vi.fn().mockResolvedValue([]),
      clearHistory: vi.fn(),
    },
    config: {} as any,
    pluginManager: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch: vi.fn(),
      getPlugins: vi.fn().mockReturnValue([]),
      getPlugin: vi.fn(),
    },
  };
}

function createPluginFile(
  dir: string,
  name: string,
  priority: number = 100,
  version: string = "1.0.0"
): Promise<void> {
  return writeFile(
    join(dir, `${name}.ts`),
    `
    export default {
      name: "${name}",
      version: "${version}",
      description: "",
      priority: ${priority},
      async onLoad() {},
      async onUnload() {},
      async handle() { return null; },
      help() { return ""; },
      setServices() {}
    };
    `
  );
}

// ============ HotReloadManager Tests ============

describe("HotReloadManager", () => {
  let tempDir: string;
  let manager: InstanceType<typeof HotReloadManager>;
  let pluginManager: InstanceType<typeof PluginManager>;
  let loader: InstanceType<typeof PluginLoader>;
  let services: PluginServices;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hot-reload-test-"));
    loader = new PluginLoader();
    pluginManager = new PluginManager(loader);
    services = createMockServices();
    manager = new HotReloadManager(pluginManager, loader, services);
  });

  afterEach(async () => {
    manager.stopWatching();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("startWatching", () => {
    it("should start watching directory", async () => {
      await manager.startWatching(tempDir);

      expect(manager.isWatching()).toBe(true);
    });

    it("should not start watching if already watching", async () => {
      await manager.startWatching(tempDir);
      await manager.startWatching(tempDir); // Second call

      expect(manager.isWatching()).toBe(true);
      // Should not throw or create multiple watchers
    });

    it("should throw if directory not exists", async () => {
      const nonExistent = join(tempDir, "nonexistent");

      await expect(manager.startWatching(nonExistent)).rejects.toThrow();
    });
  });

  describe("stopWatching", () => {
    it("should stop watching", async () => {
      await manager.startWatching(tempDir);
      manager.stopWatching();

      expect(manager.isWatching()).toBe(false);
    });

    it("should be safe to call when not watching", () => {
      // Don't start watching
      manager.stopWatching();

      expect(manager.isWatching()).toBe(false);
    });
  });

  describe("file change handling", () => {
    it("should reload plugin when file changes", async () => {
      // Create initial plugin
      await createPluginFile(tempDir, "test-plugin", 100, "1.0.0");

      // Load plugins
      await pluginManager.loadFromDir(tempDir, services);

      // Start watching
      await manager.startWatching(tempDir);

      // Verify initial load
      const pluginsBefore = pluginManager.getPlugins();
      expect(pluginsBefore.length).toBe(1);

      // Delete and recreate with new version (simulates update)
      const { unlink } = await import("fs/promises");
      await unlink(join(tempDir, "test-plugin.ts"));
      await new Promise((resolve) => setTimeout(resolve, 600));
      await createPluginFile(tempDir, "test-plugin", 100, "2.0.0");

      // Wait for debounce + reload
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const plugins = pluginManager.getPlugins();
      expect(plugins.length).toBe(1);
      // Plugin should still be loaded (reloaded)
      expect(plugins[0].name).toBe("test-plugin");
    }, 10000);

    it("should load new plugin when file added", async () => {
      // Start with empty directory
      await pluginManager.loadFromDir(tempDir, services);
      await manager.startWatching(tempDir);

      // Add new plugin
      await createPluginFile(tempDir, "new-plugin");

      // Wait for debounce + load
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const plugins = pluginManager.getPlugins();
      expect(plugins.length).toBe(1);
      expect(plugins[0].name).toBe("new-plugin");
    }, 10000);

    it("should unload plugin when file deleted", async () => {
      // Create plugin
      await createPluginFile(tempDir, "to-delete");
      await pluginManager.loadFromDir(tempDir, services);
      await manager.startWatching(tempDir);

      expect(pluginManager.getPlugins().length).toBe(1);

      // Delete plugin file
      const { unlink } = await import("fs/promises");
      await unlink(join(tempDir, "to-delete.ts"));

      // Wait for debounce + unload
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(pluginManager.getPlugins().length).toBe(0);
    }, 10000);
  });
});
