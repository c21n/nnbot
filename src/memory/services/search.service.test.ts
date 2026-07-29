import { describe, expect, it, vi } from "vitest";
import { SearchService } from "./search.service.js";
import type { IMemoryRepository } from "../storage/interfaces.js";
import type { BM25Service } from "../search/bm25.service.js";
import type { IEmbeddingProvider } from "../providers/embedding.provider.js";
import type { Memory } from "../types/index.js";

function createMemory(id = "memory-1"): Memory {
  const now = Date.now();
  return {
    id,
    text: "user prefers concise answers",
    embedding: [1, 0, 0],
    metadata: {
      user_id: "user-1",
      session_id: "session-1",
      platform: "wecom",
      type: "preference",
      importance: 0.8,
      timestamp: now,
    },
    created_at: now,
    last_accessed_at: now,
    access_count: 0,
  };
}

function createSearchService(options: {
  repository?: Partial<IMemoryRepository>;
  bm25?: Partial<BM25Service>;
  embedding?: Partial<IEmbeddingProvider>;
  minScore?: number;
  weights?: { rrf: number; importance: number; time: number };
} = {}) {
  const repository = {
    query: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(createMemory()),
    ...options.repository,
  } as unknown as IMemoryRepository;
  const bm25 = {
    search: vi.fn().mockReturnValue([]),
    ...options.bm25,
  } as unknown as BM25Service;
  const embedding = {
    embed: vi.fn().mockResolvedValue([]),
    getDimension: vi.fn().mockReturnValue(3),
    ...options.embedding,
  } as unknown as IEmbeddingProvider;

  const service = new SearchService(repository, embedding, bm25, 100, {
    maxMemories: 5,
    minScore: options.minScore ?? 0,
    weights: options.weights ?? { rrf: 1, importance: 0, time: 0 },
  });

  return { service, repository, bm25, embedding };
}

describe("SearchService", () => {
  it("hydrates BM25-only hits with the full memory content", async () => {
    const { service, repository } = createSearchService({
      bm25: { search: vi.fn().mockReturnValue([{ id: "memory-1", score: -1 }]) },
    });

    const results = await service.search("concise", "user-1", "session-1");

    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe("user prefers concise answers");
    expect(repository.findById).toHaveBeenCalledWith("memory-1");
  });

  it("filters fused results below minScore", async () => {
    const { service } = createSearchService({
      minScore: 0.3,
      weights: { rrf: 0, importance: 0, time: 0 },
      bm25: { search: vi.fn().mockReturnValue([{ id: "memory-1", score: -1 }]) },
    });

    const results = await service.search("concise", "user-1", "session-1");

    expect(results).toHaveLength(0);
  });

  it("can invalidate cached retrieval results", async () => {
    const embedding = vi.fn().mockResolvedValue([1, 0, 0]);
    const { service } = createSearchService({
      embedding: { embed: embedding },
      repository: { query: vi.fn().mockResolvedValue([{ ...createMemory(), score: 0.9 }]) },
    });

    await service.search("concise", "user-1", "session-1");
    await service.search("concise", "user-1", "session-1");
    expect(embedding).toHaveBeenCalledTimes(1);

    service.clearCache();
    await service.search("concise", "user-1", "session-1");
    expect(embedding).toHaveBeenCalledTimes(2);
  });
});
