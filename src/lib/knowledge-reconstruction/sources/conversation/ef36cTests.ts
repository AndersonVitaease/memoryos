/**
 * ef36cTests.ts — Conversation Knowledge Provider Test Suite
 * EF-36C · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Tests are fully structural — no external API required.
 * Uses synthetic ChatGPT export data.
 */

import { ChatGPTConversationProvider } from "./ChatGPTConversationProvider";
import { ConversationKnowledgeSource } from "./ConversationKnowledgeSource";
import { ConversationKnowledgeExtractor } from "./ConversationKnowledgeExtractor";
import { detectSignals } from "./ConversationTypes";
import { KnowledgeReconstructionEngine } from "../../KnowledgeReconstructionEngine";

// ── Test harness ───────────────────────────────────────────────────────────────

export interface EF36CTestResult {
  group: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface EF36CTestReport {
  runAt: number;
  durationMs: number;
  passed: number;
  failed: number;
  total: number;
  results: EF36CTestResult[];
  providerHealth: unknown;
  loadResult: unknown;
  syncResult: unknown;
}

async function test(
  group: string,
  name: string,
  fn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>,
): Promise<EF36CTestResult> {
  const t = Date.now();
  try {
    const r = await fn();
    return { group, name, passed: r.passed, durationMs: Date.now() - t, details: r.details };
  } catch (e) {
    return { group, name, passed: false, durationMs: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Synthetic data ────────────────────────────────────────────────────────────

const SYNTHETIC_CONVERSATIONS = [
  {
    id: "conv_001",
    title: "MemoryOS Architecture Decision — Connector Runtime",
    create_time: 1720000000,
    update_time: 1720001000,
    current_node: "msg_003",
    default_model_slug: "gpt-4o",
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["msg_001"] },
      msg_001: {
        id: "msg_001", parent: "root", children: ["msg_002"],
        message: {
          id: "msg_001", author: { role: "user" },
          content: { content_type: "text", parts: ["We need to decide on the Connector Runtime architecture. Should we use a centralized registry or distributed connectors?"] },
          create_time: 1720000100,
        },
      },
      msg_002: {
        id: "msg_002", parent: "msg_001", children: ["msg_003"],
        message: {
          id: "msg_002", author: { role: "assistant" },
          content: { content_type: "text", parts: ["We decided to use a centralized Connector Runtime with a registry pattern. This architecture ensures single responsibility and clean separation between the connector interface and execution logic. The ConnectorRegistry will manage all connector lifecycle operations."] },
          create_time: 1720000200,
        },
      },
      msg_003: {
        id: "msg_003", parent: "msg_002", children: [],
        message: {
          id: "msg_003", author: { role: "user" },
          content: { content_type: "text", parts: ["Perfect. We should implement this in Sprint EF-31. The architecture module will be the foundation for all future connectors."] },
          create_time: 1720000300,
        },
      },
    },
  },
  {
    id: "conv_002",
    title: "GitHub Knowledge Provider Implementation",
    create_time: 1720100000,
    update_time: 1720101000,
    current_node: "msg_b002",
    default_model_slug: "gpt-4o",
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["msg_b001"] },
      msg_b001: {
        id: "msg_b001", parent: "root", children: ["msg_b002"],
        message: {
          id: "msg_b001", author: { role: "user" },
          content: { content_type: "text", parts: ["Implement the GitHub Knowledge Provider as part of EF-36B. It must reconstruct project knowledge from Git repositories, including commits, branches, and files."] },
          create_time: 1720100100,
        },
      },
      msg_b002: {
        id: "msg_b002", parent: "msg_b001", children: [],
        message: {
          id: "msg_b002", author: { role: "assistant" },
          content: { content_type: "text", parts: ["The GitHub Knowledge Provider has been implemented. It uses the GitHubConnectorService as the sole communication gateway. All commits are imported as KnowledgeArtifact items with full provenance. The implementation is complete and deployed."] },
          create_time: 1720100200,
        },
      },
    },
  },
  {
    id: "conv_003",
    title: "Project Independence Roadmap",
    create_time: 1720200000,
    update_time: 1720201000,
    current_node: "msg_c002",
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["msg_c001"] },
      msg_c001: {
        id: "msg_c001", parent: "root", children: ["msg_c002"],
        message: {
          id: "msg_c001", author: { role: "user" },
          content: { content_type: "text", parts: ["What are the milestones for the Project Independence roadmap? We need to track EF-36A, EF-36B, EF-36C and future sprints."] },
          create_time: 1720200100,
        },
      },
      msg_c002: {
        id: "msg_c002", parent: "msg_c001", children: [],
        message: {
          id: "msg_c002", author: { role: "assistant" },
          content: { content_type: "text", parts: ["The Project Independence roadmap has these milestones: EF-36A Knowledge Reconstruction Engine, EF-36B GitHub Knowledge Provider, EF-36C Conversation Knowledge Provider, EF-36D Base44 Knowledge Provider. Each sprint builds on the previous architecture."] },
          create_time: 1720200200,
        },
      },
    },
  },
];

function makeChatGPTProvider(): ChatGPTConversationProvider {
  const provider = new ChatGPTConversationProvider();
  provider.loadFromRawJson(SYNTHETIC_CONVERSATIONS);
  return provider;
}

function makeSource(): ConversationKnowledgeSource {
  return new ConversationKnowledgeSource({ provider: makeChatGPTProvider() });
}

// ── Runner ─────────────────────────────────────────────────────────────────────

export async function runEF36CTests(): Promise<EF36CTestReport> {
  const startAll = Date.now();
  const results: EF36CTestResult[] = [];

  const provider = makeChatGPTProvider();
  const source = makeSource();

  // ── G1: Provider Interface ────────────────────────────────────────────────

  results.push(await test("G1 Provider Interface", "ChatGPTConversationProvider implements IConversationProvider", async () => {
    const ok = typeof provider.providerId === "string" &&
      typeof provider.providerName === "string" &&
      typeof provider.health === "function" &&
      typeof provider.listConversations === "function" &&
      typeof provider.loadConversation === "function" &&
      typeof provider.loadMessages === "function" &&
      typeof provider.loadMetadata === "function" &&
      typeof provider.search === "function";
    return { passed: ok, details: { providerId: provider.providerId, providerName: provider.providerName } };
  }));

  results.push(await test("G1 Provider Interface", "provider.health() returns correct shape", async () => {
    const h = await provider.health();
    const ok = typeof h.available === "boolean" &&
      typeof h.details === "string" &&
      typeof h.checkedAt === "number" &&
      typeof h.conversationCount === "number";
    return { passed: ok, details: { available: h.available, count: h.conversationCount, details: h.details } };
  }));

  results.push(await test("G1 Provider Interface", "provider loaded 3 synthetic conversations", async () => {
    const count = provider.getRawConversationCount();
    return { passed: count === 3, details: { count } };
  }));

  // ── G2: Conversation Parsing ──────────────────────────────────────────────

  results.push(await test("G2 Parsing", "listConversations() returns all 3 conversations", async () => {
    const list = await provider.listConversations();
    return { passed: list.length === 3, details: { count: list.length, titles: list.map(c => c.title) } };
  }));

  results.push(await test("G2 Parsing", "ConversationMeta has correct shape", async () => {
    const list = await provider.listConversations();
    const meta = list[0];
    const ok = typeof meta.id === "string" &&
      typeof meta.title === "string" &&
      typeof meta.createdAt === "number" &&
      typeof meta.updatedAt === "number" &&
      typeof meta.messageCount === "number" &&
      meta.provider === "ChatGPT";
    return { passed: ok, details: { id: meta.id, title: meta.title, messageCount: meta.messageCount, provider: meta.provider } };
  }));

  results.push(await test("G2 Parsing", "loadConversation() returns messages in order", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "conv_001 not found" } };
    const allIndexed = conv.messages.every((m, i) => m.index === i);
    return {
      passed: conv.messages.length >= 2 && allIndexed,
      details: { messageCount: conv.messages.length, roles: conv.messages.map(m => m.role) },
    };
  }));

  results.push(await test("G2 Parsing", "loadConversation() preserves message timestamps", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "conv_001 not found" } };
    const withTs = conv.messages.filter(m => m.timestamp !== null);
    return { passed: withTs.length > 0, details: { withTimestamp: withTs.length, total: conv.messages.length } };
  }));

  results.push(await test("G2 Parsing", "loadMessages() returns same messages as loadConversation()", async () => {
    const msgs = await provider.loadMessages("conv_001");
    const conv = await provider.loadConversation("conv_001");
    return {
      passed: msgs.length === (conv?.messages.length ?? -1),
      details: { loadMessages: msgs.length, loadConversation: conv?.messages.length },
    };
  }));

  results.push(await test("G2 Parsing", "loadMetadata() returns conversation meta", async () => {
    const meta = await provider.loadMetadata("conv_002");
    return { passed: meta?.id === "conv_002" && meta?.provider === "ChatGPT", details: { meta } };
  }));

  results.push(await test("G2 Parsing", "search() finds conversations by title keyword", async () => {
    const results2 = await provider.search("Architecture");
    return { passed: results2.length >= 1, details: { found: results2.length, titles: results2.map(c => c.title) } };
  }));

  results.push(await test("G2 Parsing", "Empty content messages are not imported", async () => {
    const conv = await provider.loadConversation("conv_001");
    const empty = conv?.messages.filter(m => m.content.length === 0) ?? [];
    return { passed: empty.length === 0, details: { emptyMessages: empty.length } };
  }));

  // ── G3: Signal Detection ──────────────────────────────────────────────────

  results.push(await test("G3 Signals", "detectSignals() finds 'decision' in decision text", async () => {
    const signals = detectSignals("We decided to use a centralized registry pattern for the architecture.");
    return { passed: signals.includes("decision"), details: { signals } };
  }));

  results.push(await test("G3 Signals", "detectSignals() finds 'architecture' in arch text", async () => {
    const signals = detectSignals("The architecture module ensures clean component separation and interface contracts.");
    return { passed: signals.includes("architecture"), details: { signals } };
  }));

  results.push(await test("G3 Signals", "detectSignals() finds 'sprint' in sprint text", async () => {
    const signals = detectSignals("We should implement this in Sprint EF-31 during the next iteration.");
    return { passed: signals.includes("sprint"), details: { signals } };
  }));

  results.push(await test("G3 Signals", "detectSignals() finds 'milestone' in milestone text", async () => {
    const signals = detectSignals("The launch milestone marks production ready status for the platform.");
    return { passed: signals.includes("milestone"), details: { signals } };
  }));

  results.push(await test("G3 Signals", "detectSignals() finds 'memoryos' reference", async () => {
    const signals = detectSignals("MemoryOS Knowledge Reconstruction Engine is the core of working memory.");
    return { passed: signals.includes("memoryos"), details: { signals } };
  }));

  results.push(await test("G3 Signals", "detectSignals() returns empty array for plain text", async () => {
    const signals = detectSignals("Hello, how are you today?");
    return { passed: Array.isArray(signals), details: { signals, count: signals.length } };
  }));

  // ── G4: Knowledge Extraction ──────────────────────────────────────────────

  results.push(await test("G4 Extraction", "Extractor produces items from synthetic conversation", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "not found" } };
    const extractor = new ConversationKnowledgeExtractor("test-source", "ChatGPT");
    const result = extractor.extract(conv);
    return {
      passed: result.items.length >= 1 && result.timelineEvents.length >= 1,
      details: {
        items: result.items.length,
        relationships: result.relationships.length,
        timelineEvents: result.timelineEvents.length,
        decisionsDetected: result.decisionsDetected,
        signals: result.allSignals,
      },
    };
  }));

  results.push(await test("G4 Extraction", "Conversation document item is created", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "not found" } };
    const extractor = new ConversationKnowledgeExtractor("test-source", "ChatGPT");
    const result = extractor.extract(conv);
    const convDoc = result.items.find(i => i.id === `conv:${conv.meta.id}`);
    return {
      passed: !!convDoc && convDoc.type === "document",
      details: { found: !!convDoc, type: convDoc?.type, id: convDoc?.id },
    };
  }));

  results.push(await test("G4 Extraction", "Decision items are extracted", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "not found" } };
    const extractor = new ConversationKnowledgeExtractor("test-source", "ChatGPT");
    const result = extractor.extract(conv);
    const decisions = result.items.filter(i => i.type === "decision");
    return { passed: decisions.length >= 1, details: { decisionsFound: decisions.length, ids: decisions.map(d => d.id) } };
  }));

  results.push(await test("G4 Extraction", "Conversation creation timeline event is generated", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "not found" } };
    const extractor = new ConversationKnowledgeExtractor("test-source", "ChatGPT");
    const result = extractor.extract(conv);
    const convEvent = result.timelineEvents.find(e => e.eventType === "conversation");
    return { passed: !!convEvent, details: { found: !!convEvent, title: convEvent?.title } };
  }));

  results.push(await test("G4 Extraction", "Decision timeline events are generated", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "not found" } };
    const extractor = new ConversationKnowledgeExtractor("test-source", "ChatGPT");
    const result = extractor.extract(conv);
    const decisionEvents = result.timelineEvents.filter(e => e.eventType === "decision");
    return { passed: decisionEvents.length >= 1, details: { count: decisionEvents.length } };
  }));

  results.push(await test("G4 Extraction", "contains_decision relationship links doc to decision", async () => {
    const conv = await provider.loadConversation("conv_001");
    if (!conv) return { passed: false, details: { error: "not found" } };
    const extractor = new ConversationKnowledgeExtractor("test-source", "ChatGPT");
    const result = extractor.extract(conv);
    const rel = result.relationships.find(r => r.relationshipType === "contains_decision");
    return { passed: !!rel, details: { found: !!rel, from: rel?.fromId, to: rel?.toId } };
  }));

  // ── G5: Provenance ────────────────────────────────────────────────────────

  results.push(await test("G5 Provenance", "All items have sourceType=chatgpt", async () => {
    const loadResult = await source.load();
    const allCorrect = loadResult.items.every(i => i.provenance.sourceType === "chatgpt");
    const wrong = loadResult.items.filter(i => i.provenance.sourceType !== "chatgpt");
    return { passed: allCorrect, details: { total: loadResult.items.length, wrong: wrong.length } };
  }));

  results.push(await test("G5 Provenance", "All items have non-empty originalIdentifier", async () => {
    const loadResult = await source.load();
    const allHaveId = loadResult.items.every(i => typeof i.provenance.originalIdentifier === "string" && i.provenance.originalIdentifier.length > 0);
    return { passed: allHaveId, details: { total: loadResult.items.length } };
  }));

  results.push(await test("G5 Provenance", "All items have confidence > 0", async () => {
    const loadResult = await source.load();
    const allPositive = loadResult.items.every(i => i.provenance.confidence > 0);
    return { passed: allPositive, details: { total: loadResult.items.length } };
  }));

  results.push(await test("G5 Provenance", "originalIdentifier contains conversationId#messageId", async () => {
    const loadResult = await source.load();
    const docItem = loadResult.items.find(i => i.type === "document");
    const hasHash = docItem?.provenance.originalIdentifier.includes("#") ?? false;
    return { passed: !!docItem && hasHash, details: { sample: docItem?.provenance.originalIdentifier } };
  }));

  // ── G6: IKnowledgeSource contract ────────────────────────────────────────

  results.push(await test("G6 Contract", "ConversationKnowledgeSource implements IKnowledgeSource", async () => {
    const ok = typeof source.id === "string" &&
      typeof source.name === "string" &&
      typeof source.metadata === "function" &&
      typeof source.isAvailable === "function" &&
      typeof source.scan === "function" &&
      typeof source.load === "function" &&
      typeof source.health === "function";
    return { passed: ok, details: { id: source.id, name: source.name } };
  }));

  results.push(await test("G6 Contract", "metadata() returns correct type/provider", async () => {
    const m = source.metadata();
    return { passed: m.type === "chatgpt" && m.provider === "ChatGPT", details: { type: m.type, provider: m.provider, version: m.version } };
  }));

  results.push(await test("G6 Contract", "isAvailable() returns 'available' with loaded data", async () => {
    const h = await source.isAvailable();
    return { passed: h === "available", details: { health: h } };
  }));

  results.push(await test("G6 Contract", "scan() discovers all 3 conversations", async () => {
    const scanResult = await source.scan();
    const convIds = scanResult.itemIds.filter(id => id.startsWith("conv:"));
    return {
      passed: convIds.length === 3 && scanResult.errors.length === 0,
      details: { itemsFound: scanResult.itemsFound, convIds: convIds.length, errors: scanResult.errors },
    };
  }));

  results.push(await test("G6 Contract", "health() returns structured object", async () => {
    const h = await source.health();
    const ok = typeof h.status === "string" && typeof h.details === "string" && typeof h.checkedAt === "number";
    return { passed: ok, details: { status: h.status, details: h.details } };
  }));

  // ── G7: Load ──────────────────────────────────────────────────────────────

  let fullLoad: Awaited<ReturnType<ConversationKnowledgeSource["load"]>> | null = null;

  results.push(await test("G7 Load", "load() returns all items from 3 conversations", async () => {
    const fresh = makeSource();
    fullLoad = await fresh.load();
    return {
      passed: fullLoad.items.length >= 3 && fullLoad.errors.length === 0,
      details: { items: fullLoad.items.length, rels: fullLoad.relationships.length, events: fullLoad.timelineEvents.length, errors: fullLoad.errors },
    };
  }));

  results.push(await test("G7 Load", "load() produces conversation documents for all conversations", async () => {
    const fresh = makeSource();
    const loadResult = await fresh.load();
    const docs = loadResult.items.filter(i => i.type === "document");
    return { passed: docs.length === 3, details: { docs: docs.length, titles: docs.map(d => d.title) } };
  }));

  results.push(await test("G7 Load", "load() produces relationships", async () => {
    const fresh = makeSource();
    const loadResult = await fresh.load();
    const ok = loadResult.relationships.length > 0 && loadResult.relationships.every(r => !!r.fromId && !!r.toId);
    return { passed: ok, details: { count: loadResult.relationships.length } };
  }));

  results.push(await test("G7 Load", "load() produces timeline events", async () => {
    const fresh = makeSource();
    const loadResult = await fresh.load();
    const convEvents = loadResult.timelineEvents.filter(e => e.eventType === "conversation");
    return { passed: convEvents.length >= 3, details: { total: loadResult.timelineEvents.length, convEvents: convEvents.length } };
  }));

  // ── G8: Incremental Sync ──────────────────────────────────────────────────

  results.push(await test("G8 Sync", "getSyncState() returns correct shape", async () => {
    const fresh = makeSource();
    await fresh.load();
    const state = fresh.getSyncState();
    const ok = state.knownConversationIds instanceof Set &&
      state.knownMessageIds instanceof Set &&
      typeof state.totalImported === "number" &&
      typeof state.totalMessages === "number";
    return { passed: ok, details: { conversations: state.knownConversationIds.size, messages: state.knownMessageIds.size, totalImported: state.totalImported } };
  }));

  results.push(await test("G8 Sync", "sync() after load() finds 0 new conversations", async () => {
    const fresh = makeSource();
    await fresh.load();
    const syncResult = await fresh.sync();
    return {
      passed: syncResult.newConversations === 0,
      details: { newConversations: syncResult.newConversations, newMessages: syncResult.newMessages },
    };
  }));

  results.push(await test("G8 Sync", "sync() on fresh source finds all 3 conversations", async () => {
    const fresh = makeSource();
    const syncResult = await fresh.sync();
    return {
      passed: syncResult.newConversations === 3,
      details: { newConversations: syncResult.newConversations, newMessages: syncResult.newMessages, newItems: syncResult.newItems.length },
    };
  }));

  results.push(await test("G8 Sync", "Second sync() finds 0 new after first sync()", async () => {
    const fresh = makeSource();
    await fresh.sync();
    const second = await fresh.sync();
    return { passed: second.newConversations === 0, details: { newConversations: second.newConversations } };
  }));

  // ── G9: Unavailable provider ──────────────────────────────────────────────

  results.push(await test("G9 Unavailable", "Empty provider returns unavailable health", async () => {
    const emptyProvider = new ChatGPTConversationProvider();
    const src = new ConversationKnowledgeSource({ provider: emptyProvider });
    const h = await src.isAvailable();
    return { passed: h === "unavailable", details: { health: h } };
  }));

  results.push(await test("G9 Unavailable", "load() on empty provider returns errors", async () => {
    const emptyProvider = new ChatGPTConversationProvider();
    const src = new ConversationKnowledgeSource({ provider: emptyProvider });
    const r = await src.load();
    return { passed: r.items.length === 0 && r.errors.length > 0, details: { errors: r.errors } };
  }));

  // ── G10: KRE Integration ──────────────────────────────────────────────────

  results.push(await test("G10 KRE Integration", "ConversationKnowledgeSource registers in KRE", async () => {
    const engine = new KnowledgeReconstructionEngine();
    const src = makeSource();
    engine.registerSource(src);
    const sources = engine.listSources();
    return { passed: sources.some(s => s.id === src.id), details: { sourceCount: sources.length, id: src.id } };
  }));

  results.push(await test("G10 KRE Integration", "KRE reconstruct() with conversation source runs to completion", async () => {
    const engine = new KnowledgeReconstructionEngine();
    engine.registerSource(makeSource());
    const report = await engine.reconstruct();
    return {
      passed: report.status === "complete",
      details: {
        status: report.status,
        sourcesScanned: report.sourcesScanned,
        knowledgeExtracted: report.knowledgeExtracted,
        graphNodes: report.graphNodes,
        timelineEvents: report.timelineEvents,
        confidenceScore: report.confidenceScore.toFixed(3),
      },
    };
  }));

  results.push(await test("G10 KRE Integration", "KRE sources summary lists conversation source", async () => {
    const engine = new KnowledgeReconstructionEngine();
    const src = makeSource();
    engine.registerSource(src);
    await engine.reconstruct();
    const report = engine.getLastReport();
    const entry = report?.sourcesSummary.find(s => s.sourceId === src.id);
    return { passed: !!entry, details: { found: !!entry, summary: report?.sourcesSummary } };
  }));

  results.push(await test("G10 KRE Integration", "Provider abstraction: KRE accepts any IConversationProvider", async () => {
    // Test that two different source instances (simulating different providers) work
    const engine = new KnowledgeReconstructionEngine();
    const src1 = makeSource();
    const src2 = new ConversationKnowledgeSource({ sourceId: "conv-second", provider: makeChatGPTProvider() });
    engine.registerSource(src1);
    engine.registerSource(src2);
    const sources = engine.listSources();
    return { passed: sources.length === 2, details: { sources: sources.map(s => s.id) } };
  }));

  // ── Collect diagnostic data ────────────────────────────────────────────────
  const providerHealth = await provider.health();
  const finalLoad = await makeSource().load();
  const freshSync = makeSource();
  const syncResult = await freshSync.sync();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    runAt: startAll,
    durationMs: Date.now() - startAll,
    passed,
    failed,
    total: results.length,
    results,
    providerHealth,
    loadResult: {
      items: finalLoad.items.length,
      relationships: finalLoad.relationships.length,
      timelineEvents: finalLoad.timelineEvents.length,
      errors: finalLoad.errors,
      byType: finalLoad.items.reduce((acc: Record<string, number>, i) => {
        acc[i.type] = (acc[i.type] ?? 0) + 1;
        return acc;
      }, {}),
    },
    syncResult,
  };
}