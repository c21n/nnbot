/**
 * Memory Management API — Fastify plugin
 *
 * Provides REST endpoints for managing memory data:
 * listing users, viewing summaries, exporting and deleting data.
 *
 * Spec: specs/memory-api.md
 */

import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { existsSync, readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import type {
  UserSummary,
  SummaryMemory,
  MemoryRecord,
  MemoryStats,
  DeletionResult,
  ExportData,
  MemoryRow,
} from "./types/webui.types.js";
import { ok, fail } from "./utils/response.js";

// ── Helpers ──

function resolveDbPath(): string {
  try {
    if (existsSync("config.yaml")) {
      const config = parseYaml(readFileSync("config.yaml", "utf-8")) as Record<string, unknown>;
      const memory = config.memory as Record<string, unknown> | undefined;
      const sqlite = memory?.sqlite as Record<string, unknown> | undefined;
      if (sqlite?.path && typeof sqlite.path === "string") {
        return sqlite.path;
      }
    }
  } catch {
    // ignore
  }
  return process.env.SQLITE_PATH ?? "./data/memory.db";
}

function openDb(): Database.Database | null {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) return null;

  const db = new Database(dbPath, { readonly: true });
  db.pragma("journal_mode=WAL");
  return db;
}

function toDate(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

// ── Routes ──

export async function memoryApi(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/memory/users — List all users with memory data
   */
  app.get("/api/memory/users", async (_request, reply) => {
    const db = openDb();
    if (!db) {
      return reply.send(ok<UserSummary[]>([]));
    }

    try {
      const rows = db
        .prepare(
          `SELECT user_id, last_seen_at FROM user_index ORDER BY last_seen_at DESC`
        )
        .all() as Array<{ user_id: string; last_seen_at: number }>;

      const users: UserSummary[] = rows.map((r) => ({
        userId: r.user_id,
        lastSeenAt: r.last_seen_at,
        lastSeenAtStr: toDate(r.last_seen_at),
      }));

      return reply.send(ok(users));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });

  /**
   * GET /api/memory/summaries?userId=xxx — Get summary-type memories
   */
  app.get("/api/memory/summaries", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) {
      return reply.status(400).send(fail("userId is required"));
    }

    const db = openDb();
    if (!db) {
      return reply.send(ok<SummaryMemory[]>([]));
    }

    try {
      const rows = db
        .prepare(
          `SELECT id, text, session_id, created_at, keywords, importance
           FROM memories
           WHERE user_id = ? AND type = 'summary'
           ORDER BY created_at DESC`
        )
        .all(userId) as Array<{
        id: string;
        text: string;
        session_id: string;
        created_at: number;
        keywords: string;
        importance: number;
      }>;

      const summaries: SummaryMemory[] = rows.map((r) => ({
        id: r.id,
        text: r.text,
        sessionId: r.session_id,
        createdAt: r.created_at,
        createdAtStr: toDate(r.created_at),
        keywords: r.keywords ? r.keywords.split(",").map((k) => k.trim()) : [],
        importance: r.importance,
      }));

      return reply.send(ok(summaries));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });

  /**
   * GET /api/memory/all?userId=xxx&type=xxx — Get all memories for a user
   */
  app.get("/api/memory/all", async (request, reply) => {
    const { userId, type } = request.query as { userId?: string; type?: string };
    if (!userId) {
      return reply.status(400).send(fail("userId is required"));
    }

    const db = openDb();
    if (!db) {
      return reply.send(ok<MemoryRecord[]>([]));
    }

    try {
      let sql = `SELECT id, user_id, session_id, platform, type, importance, timestamp, text, keywords, created_at, last_accessed_at, access_count, is_latest, key, group_id FROM memories WHERE user_id = ?`;
      const params: unknown[] = [userId];

      if (type) {
        sql += ` AND type = ?`;
        params.push(type);
      }

      sql += ` ORDER BY created_at DESC`;

      const rows = db.prepare(sql).all(...params) as MemoryRow[];

      const memories: MemoryRecord[] = rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        sessionId: r.session_id,
        platform: r.platform,
        type: r.type as MemoryRecord["type"],
        importance: r.importance,
        text: r.text,
        keywords: r.keywords ? r.keywords.split(",").map((k) => k.trim()) : [],
        createdAt: r.created_at,
        createdAtStr: toDate(r.created_at),
        lastAccessedAt: r.last_accessed_at,
        lastAccessedAtStr: toDate(r.last_accessed_at),
        accessCount: r.access_count,
      }));

      return reply.send(ok(memories));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });

  /**
   * GET /api/memory/stats?userId=xxx — Get memory stats for a user
   */
  app.get("/api/memory/stats", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) {
      return reply.status(400).send(fail("userId is required"));
    }

    const db = openDb();
    if (!db) {
      return reply.send(ok<MemoryStats>({ total: 0, byType: {} }));
    }

    try {
      const total = (
        db
          .prepare(`SELECT COUNT(*) as count FROM memories WHERE user_id = ?`)
          .get(userId) as { count: number }
      ).count;

      const byType = db
        .prepare(
          `SELECT type, COUNT(*) as count FROM memories WHERE user_id = ? GROUP BY type`
        )
        .all(userId) as Array<{ type: string; count: number }>;

      return reply.send(ok<MemoryStats>({
        total,
        byType: Object.fromEntries(byType.map((r) => [r.type, r.count])),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });

  /**
   * GET /api/memory/export?userId=xxx — Export all user data as JSON
   */
  app.get("/api/memory/export", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) {
      return reply.status(400).send(fail("userId is required"));
    }

    const db = openDb();
    if (!db) {
      return reply.status(404).send(fail("Memory database not found"));
    }

    try {
      const memories = db
        .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC`)
        .all(userId) as MemoryRow[];

      const profile = db
        .prepare(`SELECT * FROM user_profiles WHERE user_id = ?`)
        .get(userId) as Record<string, unknown> | undefined;

      const messages = db
        .prepare(`SELECT * FROM messages WHERE user_id = ? ORDER BY timestamp DESC`)
        .all(userId) as Array<Record<string, unknown>>;

      const exportData: ExportData = {
        userId,
        exportedAt: new Date().toISOString(),
        profile: profile ?? null,
        memories: memories.map((m) => ({
          id: m.id,
          type: m.type,
          text: m.text,
          importance: m.importance,
          keywords: m.keywords,
          sessionId: m.session_id,
          createdAt: m.created_at,
          createdAtStr: toDate(m.created_at),
        })),
        messages: messages.map((m) => ({
          id: m.id as string,
          sessionId: m.session_id as string,
          role: m.role as string,
          content: m.content as string,
          timestamp: m.timestamp as number,
        })),
      };

      return reply
        .header("Content-Type", "application/json")
        .header(
          "Content-Disposition",
          `attachment; filename="memory-export-${userId}-${Date.now()}.json"`
        )
        .send(exportData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });

  /**
   * DELETE /api/memory/:id — Delete a single memory
   */
  app.delete("/api/memory/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const db = openDb();
    if (!db) {
      return reply.status(404).send(fail("Memory database not found"));
    }

    try {
      const result = db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
      if (result.changes === 0) {
        return reply.status(404).send(fail("Memory not found"));
      }
      return reply.send(ok<void>(undefined));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });

  /**
   * DELETE /api/memory/user?userId=xxx — Delete all data for a user
   */
  app.delete("/api/memory/user", async (request, reply) => {
    const { userId } = request.query as { userId?: string };
    if (!userId) {
      return reply.status(400).send(fail("userId is required"));
    }

    const db = openDb();
    if (!db) {
      return reply.status(404).send(fail("Memory database not found"));
    }

    try {
      const memoriesDeleted = db
        .prepare(`DELETE FROM memories WHERE user_id = ?`)
        .run(userId).changes;
      const messagesDeleted = db
        .prepare(`DELETE FROM messages WHERE user_id = ?`)
        .run(userId).changes;
      db.prepare(`DELETE FROM user_profiles WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM user_index WHERE user_id = ?`).run(userId);

      return reply.send(ok<DeletionResult>({ memoriesDeleted, messagesDeleted }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    } finally {
      db.close();
    }
  });
}
