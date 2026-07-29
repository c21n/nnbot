import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { BM25Service } from "../../search/bm25.service.js";
import { closeSqlite, getSqliteConnection } from "../sqlite/connection.js";
import { VectraMemoryRepository } from "./memory.repository.js";
import { closeVectra } from "./connection.js";

const testRoot = join(tmpdir(), `nnbot-memory-${randomUUID()}`);
const sqlitePath = join(testRoot, "memory.db");
const vectraPath = join(testRoot, "vectra");

describe("VectraMemoryRepository", () => {
  afterEach(async () => {
    closeSqlite();
    await closeVectra();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it("mirrors vector memories to SQLite for BM25 and management operations", async () => {
    mkdirSync(testRoot, { recursive: true });
    process.env.SQLITE_PATH = sqlitePath;
    process.env.VECTRA_DATA_PATH = vectraPath;

    const bm25 = new BM25Service();
    const repository = new VectraMemoryRepository(bm25);
    const memory = {
      id: "memory-1",
      text: "\u7528\u6237\u504f\u597d\u4f7f\u7528\u4e2d\u6587\u56de\u7b54",
      embedding: [1, 0, 0],
      metadata: {
        user_id: "user-1",
        session_id: "session-1",
        platform: "wecom",
        type: "preference" as const,
        importance: 0.8,
        timestamp: Date.now(),
        keywords: ["\u4e2d\u6587"],
      },
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      access_count: 0,
    };

    await repository.save(memory);

    const db = getSqliteConnection();
    expect((db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count)
      .toBe(1);

    expect(bm25.search("user-1", "\u4e2d\u6587", 5).map((result) => result.id)).toContain("memory-1");

    await repository.delete("memory-1");
    expect(await repository.findById("memory-1")).toBeNull();
    expect((db.prepare("SELECT COUNT(*) AS count FROM memories").get() as { count: number }).count)
      .toBe(0);
  });
});
