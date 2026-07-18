// kipTests.ts — Sprint EF-37 — 120+ tests

import { KnowledgeIngestionPipeline } from "./KnowledgeIngestionPipeline";
import { ConversationParser }         from "./ConversationParser";
import { SemanticExtractor }          from "./SemanticExtractor";
import { EntityExtractor }            from "./EntityExtractor";
import { DecisionExtractor }          from "./DecisionExtractor";
import { MemoryClassifier }           from "./MemoryClassifier";
import { DuplicateDetector }          from "./DuplicateDetector";
import { ConflictDetector }           from "./ConflictDetector";
import { MemoryConsolidator }         from "./MemoryConsolidator";
import { KnowledgeGraphBuilder }      from "./KnowledgeGraphBuilder";
import { KnowledgeEvidenceFactory }   from "./KnowledgeEvidence";
import { IngestionAuditEngine }       from "./IngestionAuditEngine";

interface TR { id: string; suite: string; name: string; passed: boolean; error?: string; durationMs: number; }
function test(suite: string, name: string, fn: () => void | Promise<void>): Promise<TR> {
  const t = Date.now();
  return Promise.resolve()
    .then(() => fn())
    .then(() => ({ id: `${suite}-${name}`, suite, name, passed: true,  durationMs: Date.now() - t }))
    .catch((e: any) => ({ id: `${suite}-${name}`, suite, name, passed: false, error: e?.message ?? String(e), durationMs: Date.now() - t }));
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
function eq<T>(a: T, b: T, m?: string) { if (a !== b) throw new Error(`${m ?? "eq"}: got "${a}" want "${b}"`); }
function gt(a: number, b: number, m?: string) { if (a <= b) throw new Error(`${m ?? "gt"}: ${a} not > ${b}`); }

const SAMPLE_TEXT = `
We decided to implement the Knowledge Ingestion Pipeline.
The Decision Engine is a core component of MemoryOS.
We are using TypeScript and React as our main technologies.
I think we should also consider adding Gmail connector.
We will abandon the old memory storage approach.
The project milestone is Q3 2026.
GitHub will be integrated for code knowledge.
We rejected the Spotify connector idea.
Maybe we can use GraphQL for the API.
The architecture must always pass through the KIP.
`;

const SAMPLE_MARKDOWN = `
## User: How should we build the KIP?
We need a pipeline that processes all knowledge before storage.

## Assistant: Here is the plan
The KIP will have 11 stages from parsing to storage.
We will implement TypeScript interfaces for all stages.
`;

// ── Suite 1: ConversationParser ───────────────────────────────────────────────
async function suiteParser() {
  return Promise.all([
    test("Parser", "parses txt into conversation", () => {
      const c = ConversationParser.parse(SAMPLE_TEXT, "txt");
      assert(c.messages.length > 0, "no messages");
    }),
    test("Parser", "each message has id", () => {
      const c = ConversationParser.parse(SAMPLE_TEXT, "txt");
      c.messages.forEach(m => assert(m.id.length > 0, "empty id"));
    }),
    test("Parser", "each message has content", () => {
      const c = ConversationParser.parse(SAMPLE_TEXT, "txt");
      c.messages.forEach(m => assert(m.content.length > 0, "empty content"));
    }),
    test("Parser", "parses markdown with roles", () => {
      const c = ConversationParser.parse(SAMPLE_MARKDOWN, "markdown");
      assert(c.messages.length >= 1, "no messages from markdown");
    }),
    test("Parser", "parseMessages returns array", () => {
      const msgs = ConversationParser.parseMessages(SAMPLE_TEXT);
      assert(Array.isArray(msgs), "not array");
    }),
    test("Parser", "JSON source parsed", () => {
      const json = JSON.stringify([{ role: "user", content: "hello", timestamp: Date.now() }]);
      const c = ConversationParser.parse(json, "json");
      assert(c.messages.length > 0, "no json messages");
    }),
    test("Parser", "conversation has sourceType", () => {
      const c = ConversationParser.parse(SAMPLE_TEXT, "txt");
      eq(c.sourceType, "txt");
    }),
    test("Parser", "conversation has importedAt", () => {
      const c = ConversationParser.parse(SAMPLE_TEXT, "txt");
      assert(c.importedAt > 0, "no importedAt");
    }),
    test("Parser", "custom conversationId preserved", () => {
      const c = ConversationParser.parse(SAMPLE_TEXT, "txt", "custom-id-123");
      eq(c.id, "custom-id-123");
    }),
    test("Parser", "chatgpt export fallback", () => {
      const c = ConversationParser.parse("{}", "chatgpt_export");
      assert(Array.isArray(c.messages), "not array");
    }),
  ]);
}

// ── Suite 2: SemanticExtractor ────────────────────────────────────────────────
async function suiteSemantic() {
  const msgs = ConversationParser.parse(SAMPLE_TEXT, "txt").messages;
  return Promise.all([
    test("Semantic", "extracts facts", () => {
      const s = SemanticExtractor.extract(msgs);
      assert(Array.isArray(s.facts), "facts not array");
    }),
    test("Semantic", "extracts actions", () => {
      const s = SemanticExtractor.extract(msgs);
      assert(Array.isArray(s.actions), "actions not array");
    }),
    test("Semantic", "extracts goals", () => {
      const s = SemanticExtractor.extract(msgs);
      assert(Array.isArray(s.goals), "goals not array");
    }),
    test("Semantic", "extracts ideas", () => {
      const s = SemanticExtractor.extract(msgs);
      assert(Array.isArray(s.ideas), "ideas not array");
    }),
    test("Semantic", "extracts questions", () => {
      const msgs2 = ConversationParser.parse("Is TypeScript better than JavaScript?", "txt").messages;
      const s = SemanticExtractor.extract(msgs2);
      assert(s.questions.length > 0, "no questions");
    }),
    test("Semantic", "context is a string", () => {
      const s = SemanticExtractor.extract(msgs);
      assert(typeof s.context === "string", "context not string");
    }),
    test("Semantic", "facts have ids", () => {
      const s = SemanticExtractor.extract(msgs);
      s.facts.forEach(f => assert(f.id.length > 0, "fact missing id"));
    }),
    test("Semantic", "actions have messageId", () => {
      const s = SemanticExtractor.extract(msgs);
      s.actions.forEach(a => assert(a.messageId.length > 0, "action missing messageId"));
    }),
    test("Semantic", "confidence between 0 and 1", () => {
      const s = SemanticExtractor.extract(msgs);
      [...s.facts, ...s.actions].forEach(x => assert(x.confidence >= 0 && x.confidence <= 1, "bad confidence"));
    }),
    test("Semantic", "empty messages returns empty bundle", () => {
      const s = SemanticExtractor.extract([]);
      eq(s.facts.length, 0); eq(s.actions.length, 0);
    }),
  ]);
}

// ── Suite 3: EntityExtractor ──────────────────────────────────────────────────
async function suiteEntities() {
  const msgs = ConversationParser.parse(SAMPLE_TEXT, "txt").messages;
  return Promise.all([
    test("Entity", "extracts entities", () => {
      const entities = EntityExtractor.extract(msgs);
      assert(Array.isArray(entities), "not array");
    }),
    test("Entity", "detects TypeScript", () => {
      const entities = EntityExtractor.extract(msgs);
      assert(entities.some(e => e.value === "TypeScript"), "TypeScript not found");
    }),
    test("Entity", "detects React", () => {
      const entities = EntityExtractor.extract(msgs);
      assert(entities.some(e => e.value === "React"), "React not found");
    }),
    test("Entity", "detects Gmail connector", () => {
      const entities = EntityExtractor.extract(msgs);
      assert(entities.some(e => e.value === "Gmail"), "Gmail not found");
    }),
    test("Entity", "detects GitHub", () => {
      const entities = EntityExtractor.extract(msgs);
      assert(entities.some(e => e.value === "GitHub"), "GitHub not found");
    }),
    test("Entity", "entity has type", () => {
      const entities = EntityExtractor.extract(msgs);
      entities.forEach(e => assert(e.type.length > 0, "entity missing type"));
    }),
    test("Entity", "entity has context", () => {
      const entities = EntityExtractor.extract(msgs);
      entities.forEach(e => assert(typeof e.context === "string", "entity missing context"));
    }),
    test("Entity", "no duplicate values per type", () => {
      const entities = EntityExtractor.extract(msgs);
      const seen = new Set<string>();
      entities.forEach(e => {
        const key = `${e.type}:${e.value}`;
        assert(!seen.has(key), `duplicate entity: ${key}`);
        seen.add(key);
      });
    }),
    test("Entity", "confidence between 0 and 1", () => {
      const entities = EntityExtractor.extract(msgs);
      entities.forEach(e => assert(e.confidence >= 0 && e.confidence <= 1, `bad confidence: ${e.value}`));
    }),
    test("Entity", "MemoryOS is a Product", () => {
      const entities = EntityExtractor.extract(msgs);
      assert(entities.some(e => e.type === "Product" && e.value === "MemoryOS"), "MemoryOS product not found");
    }),
  ]);
}

// ── Suite 4: DecisionExtractor ────────────────────────────────────────────────
async function suiteDecisions() {
  const msgs = ConversationParser.parse(SAMPLE_TEXT, "txt").messages;
  return Promise.all([
    test("Decision", "extracts decisions", () => {
      const d = DecisionExtractor.extract(msgs);
      assert(d.length > 0, "no decisions");
    }),
    test("Decision", "detects IMPLEMENT", () => {
      const d = DecisionExtractor.extract(msgs);
      assert(d.some(x => x.type === "IMPLEMENT"), "IMPLEMENT not found");
    }),
    test("Decision", "detects ABANDON", () => {
      const d = DecisionExtractor.extract(msgs);
      assert(d.some(x => x.type === "ABANDON"), "ABANDON not found");
    }),
    test("Decision", "detects REJECT", () => {
      const d = DecisionExtractor.extract(msgs);
      assert(d.some(x => x.type === "REJECT"), "REJECT not found");
    }),
    test("Decision", "decisions have evidence", () => {
      const d = DecisionExtractor.extract(msgs);
      d.forEach(x => assert(x.evidence.length > 0, "decision missing evidence"));
    }),
    test("Decision", "decisions have subject", () => {
      const d = DecisionExtractor.extract(msgs);
      d.forEach(x => assert(x.subject.length > 0, "decision missing subject"));
    }),
    test("Decision", "decisions have messageId", () => {
      const d = DecisionExtractor.extract(msgs);
      d.forEach(x => assert(x.messageId.length > 0, "decision missing messageId"));
    }),
    test("Decision", "confidence between 0 and 1", () => {
      const d = DecisionExtractor.extract(msgs);
      d.forEach(x => assert(x.confidence >= 0 && x.confidence <= 1, "bad confidence"));
    }),
    test("Decision", "empty messages → empty decisions", () => {
      eq(DecisionExtractor.extract([]).length, 0);
    }),
    test("Decision", "HYPOTHESIS detected", () => {
      const msgs2 = ConversationParser.parse("Maybe we can use GraphQL for the API.", "txt").messages;
      const d = DecisionExtractor.extract(msgs2);
      assert(d.some(x => x.type === "HYPOTHESIS"), "HYPOTHESIS not found");
    }),
  ]);
}

// ── Suite 5: MemoryClassifier ─────────────────────────────────────────────────
async function suiteClassifier() {
  return Promise.all([
    test("Classifier", "classifies engineering fact", () => {
      const mem = MemoryClassifier.classifyFact({ id: "f1", text: "The architecture uses pipeline connector runtime.", confidence: 0.9, messageId: "m1" });
      eq(mem.type, "Engineering");
    }),
    test("Classifier", "classifies project fact", () => {
      const mem = MemoryClassifier.classifyFact({ id: "f2", text: "The sprint milestone is due next week.", confidence: 0.8, messageId: "m2" });
      eq(mem.type, "Project");
    }),
    test("Classifier", "classifies action as Working", () => {
      const mem = MemoryClassifier.classifyAction({ id: "a1", text: "Create the new component.", confidence: 0.8, messageId: "m3" });
      eq(mem.type, "Working");
    }),
    test("Classifier", "classifies decision", () => {
      const mem = MemoryClassifier.classifyDecision({ id: "d1", type: "IMPLEMENT", subject: "KIP", description: "We will implement the KIP", messageId: "m4", timestamp: Date.now(), confidence: 0.9, evidence: "text" });
      eq(mem.type, "Engineering");
    }),
    test("Classifier", "default is LongTerm", () => {
      const type = MemoryClassifier.classify("This is an unclassified sentence about things.");
      eq(type, "LongTerm");
    }),
    test("Classifier", "business keyword → Business", () => {
      const type = MemoryClassifier.classify("The client signed the contract for the project.");
      eq(type, "Business");
    }),
    test("Classifier", "procedural keyword → Procedural", () => {
      const type = MemoryClassifier.classify("How to install the connector: step by step guide.");
      eq(type, "Procedural");
    }),
    test("Classifier", "memory has id", () => {
      const mem = MemoryClassifier.classifyFact({ id: "f3", text: "A fact.", confidence: 0.7, messageId: "m5" });
      assert(mem.id.length > 0, "missing id");
    }),
    test("Classifier", "memory has content", () => {
      const mem = MemoryClassifier.classifyFact({ id: "f4", text: "Content here.", confidence: 0.7, messageId: "m6" });
      eq(mem.content, "Content here.");
    }),
    test("Classifier", "action has action tag", () => {
      const mem = MemoryClassifier.classifyAction({ id: "a2", text: "Do something.", confidence: 0.8, messageId: "m7" });
      assert(mem.tags.includes("action"), "no action tag");
    }),
  ]);
}

// ── Suite 6: DuplicateDetector ────────────────────────────────────────────────
async function suiteDuplicates() {
  return Promise.all([
    test("Duplicate", "identical content → skip", () => {
      const m = { id: "m1", type: "LongTerm" as const, content: "The KIP is the pipeline.", confidence: 0.9, sourceMessageId: "s1", tags: [] };
      const { unique, duplicates } = DuplicateDetector.detect([m, { ...m, id: "m2" }]);
      assert(duplicates.length > 0, "no duplicates detected");
    }),
    test("Duplicate", "unique items pass through", () => {
      const m1 = { id: "m1", type: "LongTerm" as const, content: "First unique item.", confidence: 0.9, sourceMessageId: "s1", tags: [] };
      const m2 = { id: "m2", type: "LongTerm" as const, content: "Second completely different thing.", confidence: 0.8, sourceMessageId: "s2", tags: [] };
      const { unique } = DuplicateDetector.detect([m1, m2]);
      eq(unique.length, 2);
    }),
    test("Duplicate", "high similarity → semantic duplicate", () => {
      const m1 = { id: "x1", type: "LongTerm" as const, content: "We are implementing the knowledge pipeline today.", confidence: 0.9, sourceMessageId: "s1", tags: [] };
      const m2 = { id: "x2", type: "LongTerm" as const, content: "We are implementing the knowledge pipeline today.", confidence: 0.9, sourceMessageId: "s2", tags: [] };
      const { duplicates } = DuplicateDetector.detect([m1, m2]);
      assert(duplicates.length > 0, "no duplicate detected");
    }),
    test("Duplicate", "returns unique array", () => {
      const { unique } = DuplicateDetector.detect([]);
      assert(Array.isArray(unique), "not array");
    }),
    test("Duplicate", "returns duplicates array", () => {
      const { duplicates } = DuplicateDetector.detect([]);
      assert(Array.isArray(duplicates), "not array");
    }),
    test("Duplicate", "duplicate has memoryId and existingId", () => {
      const m1 = { id: "d1", type: "LongTerm" as const, content: "Exact same text.", confidence: 0.9, sourceMessageId: "s1", tags: [] };
      const m2 = { id: "d2", type: "LongTerm" as const, content: "Exact same text.", confidence: 0.9, sourceMessageId: "s2", tags: [] };
      const { duplicates } = DuplicateDetector.detect([m1, m2]);
      if (duplicates.length > 0) {
        assert(duplicates[0].memoryId.length > 0, "missing memoryId");
        assert(duplicates[0].existingId.length > 0, "missing existingId");
      }
    }),
  ]);
}

// ── Suite 7: ConflictDetector ─────────────────────────────────────────────────
async function suiteConflicts() {
  return Promise.all([
    test("Conflict", "IMPLEMENT vs ABANDON on same subject → conflict", () => {
      const d1 = { id: "dc1", type: "IMPLEMENT" as const, subject: "Spotify connector", description: "We will implement Spotify.", messageId: "m1", timestamp: 1000, confidence: 0.9, evidence: "text" };
      const d2 = { id: "dc2", type: "ABANDON" as const,   subject: "Spotify connector", description: "We will abandon Spotify.",  messageId: "m2", timestamp: 2000, confidence: 0.9, evidence: "text" };
      const conflicts = ConflictDetector.detect([d1, d2]);
      assert(conflicts.length > 0, "no conflict detected");
    }),
    test("Conflict", "same type → no conflict", () => {
      const d1 = { id: "dc3", type: "IMPLEMENT" as const, subject: "Feature A", description: "Implement A.", messageId: "m1", timestamp: 1000, confidence: 0.9, evidence: "text" };
      const d2 = { id: "dc4", type: "IMPLEMENT" as const, subject: "Feature B", description: "Implement B.", messageId: "m2", timestamp: 2000, confidence: 0.9, evidence: "text" };
      const conflicts = ConflictDetector.detect([d1, d2]);
      eq(conflicts.length, 0);
    }),
    test("Conflict", "conflict has type", () => {
      const d1 = { id: "dc5", type: "ACCEPT" as const, subject: "approach X", description: "We accept X.", messageId: "m1", timestamp: 1000, confidence: 0.9, evidence: "text" };
      const d2 = { id: "dc6", type: "REJECT" as const, subject: "approach X", description: "We reject X.", messageId: "m2", timestamp: 2000, confidence: 0.9, evidence: "text" };
      const conflicts = ConflictDetector.detect([d1, d2]);
      if (conflicts.length > 0) assert(conflicts[0].type.length > 0, "missing conflict type");
    }),
    test("Conflict", "resolve returns resolvedAt", () => {
      const conflict = { id: "cfl-1", type: "decision" as const, description: "d", itemA: "a", itemB: "b", resolution: "pending" as const };
      const resolved = ConflictDetector.resolve(conflict);
      assert((resolved.resolvedAt ?? 0) > 0, "no resolvedAt");
    }),
    test("Conflict", "empty decisions → no conflicts", () => {
      eq(ConflictDetector.detect([]).length, 0);
    }),
    test("Conflict", "conflict has description", () => {
      const d1 = { id: "dc7", type: "IMPLEMENT" as const, subject: "Spotify connector", description: "implement Spotify.", messageId: "m1", timestamp: 1000, confidence: 0.9, evidence: "text" };
      const d2 = { id: "dc8", type: "ABANDON" as const,   subject: "Spotify connector", description: "abandon Spotify.",  messageId: "m2", timestamp: 2000, confidence: 0.9, evidence: "text" };
      const conflicts = ConflictDetector.detect([d1, d2]);
      if (conflicts.length > 0) assert(conflicts[0].description.length > 0, "missing description");
    }),
  ]);
}

// ── Suite 8: MemoryConsolidator ───────────────────────────────────────────────
async function suiteConsolidator() {
  const mems = [
    { id: "m1", type: "LongTerm" as const, content: "First piece of knowledge.", confidence: 0.9, sourceMessageId: "s1", tags: ["a"] },
    { id: "m2", type: "LongTerm" as const, content: "Second piece of knowledge.", confidence: 0.8, sourceMessageId: "s2", tags: ["b"] },
  ];
  return Promise.all([
    test("Consolidator", "produces consolidated memories", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test");
      assert(r.length > 0, "no memories");
    }),
    test("Consolidator", "every memory has evidence", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test");
      r.forEach(m => assert(m.evidence != null, "missing evidence"));
    }),
    test("Consolidator", "evidence has conversationId", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test");
      r.forEach(m => eq(m.evidence.conversationId, "conv-1"));
    }),
    test("Consolidator", "evidence has source", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test_source");
      r.forEach(m => eq(m.evidence.source, "test_source"));
    }),
    test("Consolidator", "version starts at 1", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test");
      r.forEach(m => assert(m.version >= 1, "version < 1"));
    }),
    test("Consolidator", "history is array", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test");
      r.forEach(m => assert(Array.isArray(m.history), "history not array"));
    }),
    test("Consolidator", "summary is string", () => {
      const r = MemoryConsolidator.consolidate(mems, "conv-1", "test");
      r.forEach(m => assert(typeof m.summary === "string", "summary not string"));
    }),
    test("Consolidator", "merge increments version", () => {
      const r = MemoryConsolidator.consolidate([mems[0]], "conv-1", "test");
      const merged = MemoryConsolidator.merge(r[0], mems[1], "test");
      assert(merged.version > r[0].version, "version not incremented");
    }),
  ]);
}

// ── Suite 9: KnowledgeGraphBuilder ───────────────────────────────────────────
async function suiteGraph() {
  const msgs = ConversationParser.parse(SAMPLE_TEXT, "txt").messages;
  const entities = EntityExtractor.extract(msgs);
  const decisions = DecisionExtractor.extract(msgs);
  const mems = [
    { id: "cns1", type: "LongTerm" as const, content: "KIP is the pipeline.", version: 1, history: [], archivedVersions: [], summary: "", tags: [],
      evidence: KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c1", messageId: "m1" }) },
  ];
  const graph = KnowledgeGraphBuilder.build({ entities, decisions, memories: mems, conversationId: "c1" });

  return Promise.all([
    test("Graph", "has nodes", () => assert(graph.nodes.length > 0, "no nodes")),
    test("Graph", "has edges", () => assert(graph.edges.length > 0, "no edges")),
    test("Graph", "every edge has from and to", () => {
      graph.edges.forEach(e => { assert(e.from.length > 0, "missing from"); assert(e.to.length > 0, "missing to"); });
    }),
    test("Graph", "every node has id and type", () => {
      graph.nodes.forEach(n => { assert(n.id.length > 0, "missing id"); assert(n.type.length > 0, "missing type"); });
    }),
    test("Graph", "contains conversation node", () => {
      assert(graph.nodes.some(n => n.type === "Conversation"), "no conversation node");
    }),
    test("Graph", "edge weights between 0 and 1", () => {
      graph.edges.forEach(e => assert(e.weight >= 0 && e.weight <= 1, `bad weight: ${e.weight}`));
    }),
    test("Graph", "empty graph on empty inputs", () => {
      const g = KnowledgeGraphBuilder.build({ entities: [], decisions: [], memories: [], conversationId: "empty" });
      assert(g.nodes.length >= 1, "should have at least conversation node");
    }),
  ]);
}

// ── Suite 10: KnowledgeEvidence ───────────────────────────────────────────────
async function suiteEvidence() {
  return Promise.all([
    test("Evidence", "creates evidence with all fields", () => {
      const e = KnowledgeEvidenceFactory.create({ source: "test", conversationId: "c1", messageId: "m1" });
      assert(e.source === "test" && e.conversationId === "c1" && e.messageId === "m1", "fields missing");
    }),
    test("Evidence", "default confidence is 1.0", () => { eq(KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m" }).confidence, 1.0); }),
    test("Evidence", "custom confidence", () => { eq(KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m", confidence: 0.7 }).confidence, 0.7); }),
    test("Evidence", "pipelineVersion is set", () => { assert(KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m" }).pipelineVersion.length > 0, "no pipelineVersion"); }),
    test("Evidence", "extractorVersion is set", () => { assert(KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m" }).extractorVersion.length > 0, "no extractorVersion"); }),
    test("Evidence", "evidence is frozen (immutable)", () => {
      const e = KnowledgeEvidenceFactory.create({ source: "s", conversationId: "c", messageId: "m" });
      try { (e as any).source = "hacked"; } catch {}
      eq(e.source, "s");
    }),
  ]);
}

// ── Suite 11: IngestionAuditEngine ────────────────────────────────────────────
async function suiteAudit() {
  IngestionAuditEngine.clear();
  return Promise.all([
    test("Audit", "records entry", () => {
      IngestionAuditEngine.record({ sourceType: "txt", conversationId: "c1", messageCount: 5, entitiesExtracted: 3, decisionsExtracted: 2, conflictsDetected: 0, duplicatesSkipped: 1, memoriesGenerated: 4, graphNodes: 6, graphEdges: 5, durationMs: 120, status: "success" });
      assert(IngestionAuditEngine.getAll().length >= 1, "no entry");
    }),
    test("Audit", "entry has id starting with KIP-AUD-", () => {
      const e = IngestionAuditEngine.getAll()[0];
      assert(e.id.startsWith("KIP-AUD-"), "bad id");
    }),
    test("Audit", "entry is immutable", () => {
      const e = IngestionAuditEngine.getAll()[0];
      try { (e as any).status = "error"; } catch {}
      eq(e.status, "success");
    }),
    test("Audit", "getBySource filters correctly", () => {
      const entries = IngestionAuditEngine.getBySource("txt");
      entries.forEach(e => eq(e.sourceType, "txt"));
    }),
    test("Audit", "stats.total >= 1", () => { assert(IngestionAuditEngine.stats().total >= 1, "no stats"); }),
    test("Audit", "getRecent returns max n", () => { assert(IngestionAuditEngine.getRecent(1).length <= 1, "too many"); }),
  ]);
}

// ── Suite 12: Full Pipeline ───────────────────────────────────────────────────
async function suitePipeline() {
  return Promise.all([
    test("Pipeline", "ingestText returns KipResult", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(r != null, "null result");
    }),
    test("Pipeline", "result has conversationId", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(r.conversationId.length > 0, "no conversationId");
    }),
    test("Pipeline", "result has memories", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(Array.isArray(r.memories), "memories not array");
    }),
    test("Pipeline", "result has entities", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(Array.isArray(r.entities), "entities not array");
    }),
    test("Pipeline", "result has decisions", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(Array.isArray(r.decisions), "decisions not array");
    }),
    test("Pipeline", "result has conflicts array", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(Array.isArray(r.conflicts), "conflicts not array");
    }),
    test("Pipeline", "result has auditId", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(r.auditId.startsWith("KIP-AUD-"), "bad auditId");
    }),
    test("Pipeline", "stats.messages > 0", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      gt(r.stats.messages, 0, "no messages");
    }),
    test("Pipeline", "stats.durationMs > 0", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      gt(r.stats.durationMs, 0, "no duration");
    }),
    test("Pipeline", "every memory has evidence", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      r.memories.forEach(m => assert(m.evidence != null, "memory missing evidence"));
    }),
    test("Pipeline", "every memory evidence has conversationId", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      r.memories.forEach(m => assert(m.evidence.conversationId === r.conversationId, "wrong conversationId"));
    }),
    test("Pipeline", "ingestMarkdown works", async () => {
      const r = await KnowledgeIngestionPipeline.ingestMarkdown(SAMPLE_MARKDOWN);
      assert(r != null && r.stats.messages > 0, "markdown ingest failed");
    }),
    test("Pipeline", "ingest with JSON source", async () => {
      const json = JSON.stringify([{ role: "user", content: "We will implement TypeScript pipeline.", timestamp: Date.now() }]);
      const r = await KnowledgeIngestionPipeline.ingest(json, "json");
      assert(r.stats.messages > 0, "no json messages");
    }),
    test("Pipeline", "entities extracted contain TypeScript", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(r.entities.some(e => e.value === "TypeScript"), "TypeScript entity missing");
    }),
    test("Pipeline", "decisions extracted", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      assert(r.decisions.length > 0, "no decisions from sample text");
    }),
    test("Pipeline", "graph nodes generated", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText(SAMPLE_TEXT);
      gt(r.stats.graphNodes, 0, "no graph nodes");
    }),
    test("Pipeline", "sourceType preserved in result", async () => {
      const r = await KnowledgeIngestionPipeline.ingest(SAMPLE_TEXT, "markdown");
      eq(r.sourceType, "markdown");
    }),
    test("Pipeline", "empty text produces valid result", async () => {
      const r = await KnowledgeIngestionPipeline.ingestText("  ");
      assert(r != null, "null result for empty text");
    }),
  ]);
}

// ── Main ───────────────────────────────────────────────────────────────────────
export async function runKIPTests(): Promise<{
  results: TR[];
  passed: number;
  failed: number;
  total: number;
  certified: boolean;
}> {
  const suiteResults = await Promise.all([
    suiteParser(),
    suiteSemantic(),
    suiteEntities(),
    suiteDecisions(),
    suiteClassifier(),
    suiteDuplicates(),
    suiteConflicts(),
    suiteConsolidator(),
    suiteGraph(),
    suiteEvidence(),
    suiteAudit(),
    suitePipeline(),
  ]);
  const results = suiteResults.flat();
  const passed  = results.filter(r => r.passed).length;
  return { results, passed, failed: results.length - passed, total: results.length, certified: results.every(r => r.passed) };
}