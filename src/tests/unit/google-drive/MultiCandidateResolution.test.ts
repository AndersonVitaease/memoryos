import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  resultsByQuery: {} as Record<string, Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }>>,
  metadataById: {} as Record<string, { id: string; name: string; mimeType: string; modifiedTime: string | null }>,
  downloadOk: true,
}));

vi.mock("@/lib/google-drive/GoogleDriveConnector", () => ({
  searchByName: vi.fn(async (query: string) => {
    state.calls.push(query);
    return state.resultsByQuery[query] ?? [];
  }),
  getFileMetadata: vi.fn(async (fileId: string) => state.metadataById[fileId] ?? null),
  downloadMedia: vi.fn(async (_fileId: string) => ({
    content: "binary",
    encoding: "base64" as const,
    sizeBytes: 10,
    ok: state.downloadOk,
    status: state.downloadOk ? 200 : 404,
    durationMs: 1,
    contentType: "video/mp4",
  })),
  exportFile: vi.fn(async (_fileId: string, _mime: string) => ({
    content: "",
    encoding: "text" as const,
    sizeBytes: 0,
    ok: false,
    status: 501,
    durationMs: 1,
    contentType: "text/plain",
  })),
}));

import { executeDriveDownload } from "@/lib/google-drive/DriveDownloadExecutor";
import { resourceResolutionAuditStore } from "@/lib/resource-resolution-engine";

function makeCandidates(values: string[]) {
  return values.map((value, idx) => ({
    id: `cand-${String(idx + 1).padStart(2, "0")}`,
    value,
    strategy: idx === 0 ? "literal" : "descriptor_removed",
    priority: idx + 1,
    confidence: 1 - idx * 0.1,
    metadata: {},
  }));
}

describe("Drive multi-candidate resolution (Sprint 6)", () => {
  beforeEach(() => {
    state.calls = [];
    state.resultsByQuery = {};
    state.metadataById = {};
    state.downloadOk = true;
    resourceResolutionAuditStore.clear();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__;
  });

  it("resolves on first candidate and stops further attempts", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["video creatina.mp4"] = [{ id: "file-1", name: "video creatina.mp4", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["file-1"] = { id: "file-1", name: "video creatina.mp4", mimeType: "video/mp4", modifiedTime: null };

    const result = await executeDriveDownload({
      rawText: "abrir video creatina.mp4",
      candidateSelectors: makeCandidates(["video creatina.mp4", "creatina.mp4", "\"creatina.mp4\""]),
    }, "token");

    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["video creatina.mp4"]);

    const audit = resourceResolutionAuditStore.getAll()[0].record;
    expect(audit.totalAttempts).toBe(1);
    expect(audit.winnerCandidateId).toBe("cand-01");
    expect(audit.connector).toBe("google-drive");
  });

  it("resolves on second candidate when first fails", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["video creatina.mp4"] = [];
    state.resultsByQuery["creatina.mp4"] = [{ id: "file-2", name: "creatina.mp4", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["file-2"] = { id: "file-2", name: "creatina.mp4", mimeType: "video/mp4", modifiedTime: null };

    const result = await executeDriveDownload({
      rawText: "abrir video creatina.mp4",
      candidateSelectors: makeCandidates(["video creatina.mp4", "creatina.mp4", "\"creatina.mp4\""]),
    }, "token");

    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["video creatina.mp4", "creatina.mp4"]);

    const audit = resourceResolutionAuditStore.getAll()[0].record;
    expect(audit.totalAttempts).toBe(2);
    expect(audit.winnerCandidateId).toBe("cand-02");
  });

  it("resolves on third candidate", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["primeiro.mp4"] = [];
    state.resultsByQuery["segundo.mp4"] = [];
    state.resultsByQuery["terceiro.mp4"] = [{ id: "file-3", name: "terceiro.mp4", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["file-3"] = { id: "file-3", name: "terceiro.mp4", mimeType: "video/mp4", modifiedTime: null };

    const result = await executeDriveDownload({
      rawText: "abrir video creatina.mp4",
      candidateSelectors: makeCandidates(["primeiro.mp4", "segundo.mp4", "terceiro.mp4"]),
    }, "token");

    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["primeiro.mp4", "segundo.mp4", "terceiro.mp4"]);

    const audit = resourceResolutionAuditStore.getAll()[0].record;
    expect(audit.totalAttempts).toBe(3);
    expect(audit.winnerCandidateId).toBe("cand-03");
  });

  it("fails after exhausting all candidates", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["video creatina.mp4"] = [];
    state.resultsByQuery["creatina.mp4"] = [];
    state.resultsByQuery["\"creatina.mp4\""] = [];

    const result = await executeDriveDownload({
      rawText: "abrir video creatina.mp4",
      candidateSelectors: makeCandidates(["video creatina.mp4", "creatina.mp4", "\"creatina.mp4\""]),
    }, "token");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
      expect(result.message).toContain("CandidateSelectors");
    }

    const audit = resourceResolutionAuditStore.getAll()[0].record;
    expect(audit.exhausted).toBe(true);
    expect(audit.totalAttempts).toBe(3);
  });

  it("falls back to legacy behavior when feature flag is disabled", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = false;

    state.resultsByQuery["relatorio.pdf"] = [{ id: "legacy-1", name: "relatorio.pdf", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["legacy-1"] = { id: "legacy-1", name: "relatorio.pdf", mimeType: "video/mp4", modifiedTime: null };

    const result = await executeDriveDownload({
      fileName: "relatorio.pdf",
      candidateSelectors: makeCandidates(["video creatina.mp4"]),
    }, "token");

    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["relatorio.pdf"]);

    const audit = resourceResolutionAuditStore.getAll()[0].record;
    expect(audit.usedFallback).toBe(true);
    expect(audit.totalAttempts).toBe(0);
  });

  it("falls back to legacy behavior when candidate list is missing", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["relatorio.pdf"] = [{ id: "legacy-2", name: "relatorio.pdf", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["legacy-2"] = { id: "legacy-2", name: "relatorio.pdf", mimeType: "video/mp4", modifiedTime: null };

    const result = await executeDriveDownload({ fileName: "relatorio.pdf" }, "token");

    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["relatorio.pdf"]);

    const audit = resourceResolutionAuditStore.getAll()[0].record;
    expect(audit.usedFallback).toBe(true);
  });

  it("preserves candidate order by priority from input list", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["first"] = [];
    state.resultsByQuery["second"] = [{ id: "ordered-1", name: "ordered", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["ordered-1"] = { id: "ordered-1", name: "ordered", mimeType: "video/mp4", modifiedTime: null };

    const result = await executeDriveDownload({
      rawText: "abrir ordered",
      candidateSelectors: [
        { id: "cand-10", value: "first", strategy: "literal", priority: 10, confidence: 1, metadata: {} },
        { id: "cand-20", value: "second", strategy: "literal", priority: 20, confidence: 0.9, metadata: {} },
      ],
    }, "token");

    expect(result.ok).toBe(true);
    expect(state.calls).toEqual(["first", "second"]);

    const attempts = resourceResolutionAuditStore.getAll()[0].record.attempts;
    expect(attempts[0].priority).toBe(10);
    expect(attempts[1].priority).toBe(20);
  });

  it("collects aggregate resolution metrics", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;

    state.resultsByQuery["video creatina.mp4"] = [{ id: "m-1", name: "video", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["m-1"] = { id: "m-1", name: "video", mimeType: "video/mp4", modifiedTime: null };
    await executeDriveDownload({ rawText: "abrir video", candidateSelectors: makeCandidates(["video creatina.mp4", "creatina.mp4"]) }, "token");

    state.calls = [];
    state.resultsByQuery["video creatina.mp4"] = [];
    state.resultsByQuery["creatina.mp4"] = [{ id: "m-2", name: "creatina", mimeType: "video/mp4", modifiedTime: null }];
    state.metadataById["m-2"] = { id: "m-2", name: "creatina", mimeType: "video/mp4", modifiedTime: null };
    await executeDriveDownload({ rawText: "abrir video", candidateSelectors: makeCandidates(["video creatina.mp4", "creatina.mp4"]) }, "token");

    const metrics = resourceResolutionAuditStore.getMetrics();
    expect(metrics.totalResolutions).toBe(2);
    expect(metrics.successRate).toBe(1);
    expect(metrics.averageAttempts).toBeGreaterThanOrEqual(1);
    expect(metrics.winnerStrategy.literal).toBeGreaterThanOrEqual(1);
    expect(metrics.winnerStrategy.descriptor_removed).toBeGreaterThanOrEqual(1);
    expect(metrics.connectorBreakdown["google-drive"]?.total).toBe(2);
  });
});
