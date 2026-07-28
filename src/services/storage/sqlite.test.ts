import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SQLiteStorage } from "./sqlite.js";

describe("SQLiteStorage", () => {
  it("persists values and conversation history across reopen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nnbot-storage-"));
    const dbPath = join(dir, "bot.db");

    try {
      const first = await SQLiteStorage.create(dbPath);
      await first.set("answer", { ok: true });
      await first.saveMessage("user-1", "user", "第一条");
      await first.saveMessage("user-1", "assistant", "第二条");
      await first.close();

      const second = await SQLiteStorage.create(dbPath);
      await expect(second.get("answer")).resolves.toEqual({ ok: true });
      await expect(second.exists("answer")).resolves.toBe(true);
      await expect(second.getHistory("user-1", 10)).resolves.toEqual([
        expect.objectContaining({ role: "user", content: "第一条" }),
        expect.objectContaining({ role: "assistant", content: "第二条" }),
      ]);
      await second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
