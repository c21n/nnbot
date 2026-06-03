/**
 * Tests for PluginLoader
 *
 * Tests directory scanning, file filtering, and plugin loading.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import type { PluginServices } from "../../interfaces.js";

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
      getHooks: vi.fn().mockReturnValue({}),
      loadFromDir: vi.fn(),
      reloadPlugin: vi.fn(),
      reloadAll: vi.fn(),
    },
    hooks: {},
  };
}

const FIXTURES_DIR = join(import.meta.dirname, "__fixtures__");

// ============ PluginLoader Tests ============

describe("PluginLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "plugin-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("loadFromDir", () => {
    it("should load plugins from directory", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugins = await loader.loadFromDir(FIXTURES_DIR, services);

      // Should load plugin-a, plugin-b, plugin-c (skip invalid-plugin, bad-plugin)
      expect(plugins.length).toBeGreaterThanOrEqual(3);
      const names = plugins.map((p) => p.name);
      expect(names).toContain("plugin-a");
      expect(names).toContain("plugin-b");
      expect(names).toContain("plugin-c");
    });

    it("should sort plugins by priority", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugins = await loader.loadFromDir(FIXTURES_DIR, services);

      const names = plugins.map((p) => p.name);
      const indexA = names.indexOf("plugin-a"); // priority: 10
      const indexB = names.indexOf("plugin-b"); // priority: 50
      const indexC = names.indexOf("plugin-c"); // priority: 100

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });

    it("should sort by name when priority equal", async () => {
      // Create two plugins with same priority using simple structure
      await writeFile(
        join(tempDir, "z-first.ts"),
        `
        export default {
          name: "z-first",
          version: "1.0.0",
          description: "",
          priority: 100,
          async onLoad() {},
          async onUnload() {},
          async handle() { return null; },
          help() { return ""; },
          setServices() {}
        };
        `
      );
      await writeFile(
        join(tempDir, "a-second.ts"),
        `
        export default {
          name: "a-second",
          version: "1.0.0",
          description: "",
          priority: 100,
          async onLoad() {},
          async onUnload() {},
          async handle() { return null; },
          help() { return ""; },
          setServices() {}
        };
        `
      );

      const loader = new PluginLoader();
      const services = createMockServices();

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(2);
      // a-second should come before z-first (alphabetical)
      expect(plugins[0].name).toBe("a-second");
      expect(plugins[1].name).toBe("z-first");
    });

    it("should skip files without default export", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      // Create directory with only invalid-plugin
      await writeFile(
        join(tempDir, "invalid.ts"),
        `export const helper = "not a plugin";`
      );

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(0);
    });

    it("should skip files with invalid plugin", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      await writeFile(
        join(tempDir, "bad.ts"),
        `export default { notAPlugin: true };`
      );

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(0);
    });

    it("should skip __tests__ directory", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      // Create valid plugin using simple structure
      await writeFile(
        join(tempDir, "valid.ts"),
        `
        export default {
          name: "valid",
          version: "1.0.0",
          description: "",
          async onLoad() {},
          async onUnload() {},
          async handle() { return null; },
          help() { return ""; },
          setServices() {}
        };
        `
      );

      // Create __tests__ with a file
      await mkdir(join(tempDir, "__tests__"));
      await writeFile(
        join(tempDir, "__tests__", "test.ts"),
        `export default { name: "should-not-load" };`
      );

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(1);
      expect(plugins[0].name).toBe("valid");
    });

    it("should skip index.ts", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      await writeFile(
        join(tempDir, "index.ts"),
        `export default { name: "should-not-load" };`
      );

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(0);
    });

    it("should skip underscore prefixed files", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      await writeFile(
        join(tempDir, "_utils.ts"),
        `export default { name: "should-not-load" };`
      );

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(0);
    });

    it("should skip non-ts-js files", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      await writeFile(
        join(tempDir, "readme.md"),
        `# Not a plugin`
      );

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins.length).toBe(0);
    });

    it("should return empty array for empty directory", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugins = await loader.loadFromDir(tempDir, services);

      expect(plugins).toEqual([]);
    });

    it("should create directory if not exists", async () => {
      const nonExistent = join(tempDir, "new-plugins");
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugins = await loader.loadFromDir(nonExistent, services);

      expect(plugins).toEqual([]);
      // Directory should now exist
      const { stat } = await import("fs/promises");
      const statResult = await stat(nonExistent);
      expect(statResult.isDirectory()).toBe(true);
    });
  });

  describe("loadPlugin", () => {
    it("should load valid plugin file", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugin = await loader.loadPlugin(
        join(FIXTURES_DIR, "plugin-a.ts"),
        services
      );

      expect(plugin).not.toBeNull();
      expect(plugin!.name).toBe("plugin-a");
    });

    it("should return null for missing default export", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugin = await loader.loadPlugin(
        join(FIXTURES_DIR, "invalid-plugin.ts"),
        services
      );

      expect(plugin).toBeNull();
    });

    it("should return null for invalid plugin", async () => {
      const loader = new PluginLoader();
      const services = createMockServices();

      const plugin = await loader.loadPlugin(
        join(FIXTURES_DIR, "bad-plugin.ts"),
        services
      );

      expect(plugin).toBeNull();
    });

    it("should return plugin even if onLoad would fail (onLoad is PluginManager's responsibility)", async () => {
      // Create a plugin with failing onLoad
      await writeFile(
        join(tempDir, "fail-onload.ts"),
        `
        export default {
          name: "fail-onload",
          version: "1.0.0",
          description: "",
          async onLoad() { throw new Error("load failed"); },
          async onUnload() {},
          async handle() { return null; },
          help() { return ""; }
        };
        `
      );

      const loader = new PluginLoader();
      const services = createMockServices();

      const plugin = await loader.loadPlugin(
        join(tempDir, "fail-onload.ts"),
        services
      );

      // PluginLoader no longer calls onLoad — that's PluginManager.register()'s job
      expect(plugin).not.toBeNull();
      expect(plugin!.name).toBe("fail-onload");
    });
  });
});
