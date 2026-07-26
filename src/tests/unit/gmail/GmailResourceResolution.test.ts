import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  searchByQuery: {} as Record<string, Array<{ id: string; threadId: string; snippet?: string }>>,
  searchCalls: [] as string[],
  attachmentCalls: [] as Array<{ messageId: string; attachmentId: string }>,
  legacyExecuteCalls: 0,
  legacyData: { messages: [{ id: "legacy-msg", threadId: "th-legacy" }], resultSizeEstimate: 1 },
}));

vi.mock("@/lib/gmail/GmailConnector", () => ({
  searchMessages: vi.fn(async (query: string) => {
    state.searchCalls.push(query);
    const messages = state.searchByQuery[query] ?? [];
    return {
      ok: true,
      data: { messages, query, resultSizeEstimate: messages.length },
      error: null,
    };
  }),
  getAttachment: vi.fn(async (messageId: string, attachmentId: string) => {
    state.attachmentCalls.push({ messageId, attachmentId });
    return {
      ok: true,
      data: { messageId, attachmentId, size: 10, data: "AA==" },
      error: null,
    };
  }),
  listMessages: vi.fn(async () => ({ ok: true, data: { messages: [] }, error: null })),
  getMessage: vi.fn(async () => ({ ok: true, data: {}, error: null })),
  getThread: vi.fn(async () => ({ ok: true, data: {}, error: null })),
  listLabels: vi.fn(async () => ({ ok: true, data: { labels: [] }, error: null })),
}));

vi.mock("@/lib/gmail/SmartQueryBuilder", () => ({
  smartQueryBuilder: {
    build: vi.fn((raw: string) => ({
      entity: raw,
      attempts: [{ attempt: 1, strategy: "literal", query: raw }],
    })),
  },
}));

vi.mock("@/lib/gmail/SmartQueryExecutor", () => ({
  smartQueryExecutor: {
    execute: vi.fn(async () => {
      state.legacyExecuteCalls += 1;
      return {
        data: state.legacyData,
        strategy: { attempts: [] },
      };
    }),
  },
}));

vi.mock("@/lib/google-auth/GoogleAuthSession", () => ({
  isConnected: vi.fn(() => true),
  getConnection: vi.fn(() => ({ state: "CONNECTED", email: "user@example.com" })),
}));

import { GmailConnector } from "@/lib/connector-runtime/connectors/GmailConnector";
import { GmailSearchProvider } from "@/lib/connector-runtime/search-providers/GmailSearchProvider";
import { gmailResolutionAuditStore } from "@/lib/connector-runtime/search-providers/GmailResolutionAuditStore";
import { getResolutionMetricsView } from "@/lib/connector-runtime/search-providers/ResolutionMetricsView";
import { resourceResolutionAuditStore } from "@/lib/resource-resolution-engine";
import { resourceResolutionEngine } from "@/lib/resource-resolution-engine";

const ctx = {
  executionId: "exec-test",
  userId: "u1",
  projectId: "p1",
  sessionId: "s1",
};

function makeCandidates(values: string[]) {
  return values.map((value, idx) => ({
    id: `cand-${idx + 1}`,
    value,
    strategy: idx === 0 ? "literal" : "descriptor_removed",
    priority: idx + 1,
    confidence: 1 - idx * 0.1,
  }));
}

describe("Gmail ResourceResolutionEngine migration (Sprint 8)", () => {
  beforeEach(() => {
    state.searchByQuery = {};
    state.searchCalls = [];
    state.attachmentCalls = [];
    state.legacyExecuteCalls = 0;
    state.legacyData = { messages: [{ id: "legacy-msg", threadId: "th-legacy" }], resultSizeEstimate: 1 };
    resourceResolutionAuditStore.clear();
    gmailResolutionAuditStore.clear();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__;
  });

  it("GmailSearchProvider executes candidate search and returns SearchResult", async () => {
    const provider = new GmailSearchProvider();
    state.searchByQuery["invoice"] = [{ id: "m1", threadId: "t1" }];

    const result = await provider.searchCandidate({
      id: "c1",
      value: "invoice",
      strategy: "literal",
      priority: 1,
      confidence: 1,
    });

    expect(result.success).toBe(true);
    expect(result.value?.messages[0]?.id).toBe("m1");
    expect(state.searchCalls).toEqual(["invoice"]);
  });

  it("resolves Gmail search on first candidate", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;
    state.searchByQuery.first = [{ id: "m-first", threadId: "t1" }];

    const connector = new GmailConnector();
    const result = await connector.execute("searchEmails", {
      query: "ignored",
      candidateSelectors: makeCandidates(["first", "second"]),
    }, ctx);

    expect(result.success).toBe(true);
    expect(state.searchCalls).toEqual(["first"]);
    expect((result.data as any).messages[0].id).toBe("m-first");

    const audit = gmailResolutionAuditStore.getAll()[0].record;
    expect(audit.provider).toBe("gmail-search-provider");
    expect(audit.winnerCandidate).toBe("cand-1");
    expect(audit.fallback).toBe(false);
  });

  it("resolves Gmail search on second candidate", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;
    state.searchByQuery.first = [];
    state.searchByQuery.second = [{ id: "m-second", threadId: "t2" }];

    const connector = new GmailConnector();
    const result = await connector.execute("searchEmails", {
      query: "ignored",
      candidateSelectors: makeCandidates(["first", "second"]),
    }, ctx);

    expect(result.success).toBe(true);
    expect(state.searchCalls).toEqual(["first", "second"]);
    expect((result.data as any).messages[0].id).toBe("m-second");

    const audit = gmailResolutionAuditStore.getAll()[0].record;
    expect(audit.totalAttempts).toBe(2);
    expect(audit.winnerCandidate).toBe("cand-2");
  });

  it("uses legacy fallback when feature flag is disabled", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = false;

    const connector = new GmailConnector();
    const result = await connector.execute("searchEmails", {
      query: "from:billing",
      candidateSelectors: makeCandidates(["first"]),
    }, ctx);

    expect(result.success).toBe(true);
    expect(state.legacyExecuteCalls).toBe(1);

    const audit = gmailResolutionAuditStore.getAll()[0].record;
    expect(audit.fallback).toBe(true);
  });

  it("resolves messageId for attachment via shared engine when messageId is missing", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;
    state.searchByQuery.invoice = [{ id: "msg-invoice", threadId: "th-1" }];

    const connector = new GmailConnector();
    const result = await connector.execute("getAttachment", {
      attachmentId: "att-1",
      query: "invoice",
      candidateSelectors: makeCandidates(["invoice"]),
    }, ctx);

    expect(result.success).toBe(true);
    expect(state.attachmentCalls[0]).toEqual({ messageId: "msg-invoice", attachmentId: "att-1" });
  });

  it("updates global metrics view with gmail breakdown and strategy distribution", async () => {
    (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__ = true;
    state.searchByQuery.literal = [{ id: "m-literal", threadId: "t-literal" }];

    const connector = new GmailConnector();
    await connector.execute("searchEmails", {
      query: "invoice",
      candidateSelectors: makeCandidates(["literal"]),
    }, ctx);

    const metrics = getResolutionMetricsView();
    expect(metrics.totalResolutions).toBeGreaterThanOrEqual(1);
    expect(metrics.connectorBreakdown.gmail?.total).toBeGreaterThanOrEqual(1);
    expect(metrics.strategyDistribution.literal).toBeGreaterThanOrEqual(1);
  });

  it("keeps connectorBreakdown reusable across google-drive and gmail", async () => {
    resourceResolutionAuditStore.clear();

    await resourceResolutionEngine.resolve<{ id: string }>({
      connector: "google-drive",
      featureEnabled: true,
      candidateSelectors: [{ id: "d1", value: "drive-file", strategy: "literal", priority: 1, confidence: 1 }],
      searchCallback: async () => ({ success: true, reason: "resolved", value: { id: "d1" }, failure: null }),
      fallbackCallback: async () => ({ success: false, reason: "unused", value: null, failure: null }),
    });

    await resourceResolutionEngine.resolve<{ id: string }>({
      connector: "gmail",
      featureEnabled: true,
      candidateSelectors: [{ id: "g1", value: "gmail-mail", strategy: "literal", priority: 1, confidence: 1 }],
      searchCallback: async () => ({ success: true, reason: "resolved", value: { id: "g1" }, failure: null }),
      fallbackCallback: async () => ({ success: false, reason: "unused", value: null, failure: null }),
    });

    const metrics = getResolutionMetricsView();
    expect(metrics.connectorBreakdown["google-drive"]?.total).toBe(1);
    expect(metrics.connectorBreakdown.gmail?.total).toBe(1);
  });
});
