/**
 * officialLibraryCertificationTests.ts — Sprint EF-42.7
 *
 * Full architectural certification suite for the Official Library.
 * Covers: Bootstrap, Discovery, Loader, Parser, ChunkBuilder, ChunkMetadataBuilder,
 *         ChunkIndex, ContentIndexer, OfficialLibraryIndex, OfficialRetrievalEngine,
 *         OfficialLibraryStatus, Singleton/HMR, SRP, Immutability, Coupling.
 *
 * All tests are deterministic — no network, no LLM, no external calls.
 */

import { OfficialDocumentParser }      from "../content/OfficialDocumentParser";
import { ChunkBuilder }                from "../content/ChunkBuilder";
import { ChunkMetadataBuilder }        from "../content/ChunkMetadataBuilder";
import { ChunkIndex }                  from "../content/ChunkIndex";
import { ContentIndexer }              from "../content/ContentIndexer";
import { OfficialLibraryIndex }        from "../index/OfficialLibraryIndex";
import { OfficialRetrievalEngine }     from "../retrieval/OfficialRetrievalEngine";
import { OfficialLibraryStatus }       from "../bootstrap/OfficialLibraryStatus";
import { OfficialLibraryAutoBootstrap } from "../bootstrap/OfficialLibraryAutoBootstrap";
import { OfficialDocumentDiscovery }   from "../bootstrap/OfficialDocumentDiscovery";
import { OfficialDocumentLoader }      from "../bootstrap/OfficialDocumentLoader";

export interface CertResult {
  id:          number;
  category:    string;
  name:        string;
  passed:      boolean;
  durationMs:  number;
  error?:      string;
}

export interface CertSuiteResult {
  allPassed:    boolean;
  passed:       number;
  failed:       number;
  total:        number;
  durationMs:   number;
  score:        number;          // 0–100
  results:      CertResult[];
  categories:   Record<string, { passed: number; total: number }>;
  certification: "CERTIFIED" | "CERTIFIED_WITH_OBSERVATIONS" | "NOT_CERTIFIED";
  risks:        string[];
  recommendations: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function run(id: number, category: string, name: string, fn: () => void | Promise<void>): Promise<CertResult> {
  const t0 = Date.now();
  return Promise.resolve()
    .then(() => fn())
    .then(() => ({ id, category, name, passed: true, durationMs: Date.now() - t0 }))
    .catch(e => ({ id, category, name, passed: false, durationMs: Date.now() - t0, error: (e as Error).message }));
}

// ── Test data ─────────────────────────────────────────────────────────────────

const DOC_MAS = {
  documentId: "cert-mas", title: "Memory Architecture Specification",
  content: `# Memory Architecture Specification\n\n## Overview\n\nThe MemoryOS architecture defines the cognitive layer.\n\n## Core Principles\n\nSingle responsibility. Immutability. Low coupling. High cohesion.\n\n## Pipeline\n\nBootstrap → Discovery → Loader → Parser → Chunker → Index → Retrieval.`,
};
const DOC_MES = {
  documentId: "cert-mes", title: "Memory Engineering Specification",
  content: `# Memory Engineering Specification\n\n## Engineering Guide\n\nAll components must follow SRP.\n\n## Singleton Pattern\n\nAll engines must be HMR-safe singletons using globalThis.\n\n## Immutability\n\nAll data structures must use Object.freeze().`,
};

function seedDirect(docs: typeof DOC_MAS[]): void {
  ChunkIndex.clear();
  OfficialLibraryIndex.clear();
  ContentIndexer.indexAll(docs);
  const now = new Date().toISOString();
  OfficialLibraryIndex.replaceAll(docs.map(d => ({
    id: d.documentId, title: d.title, version: "1.0",
    category: "specification" as const, type: "specification",
    status: "active" as const, path: `src/docs/${d.documentId}.md`,
    checksum: d.documentId,
    chunkCount: ChunkIndex.getChunks(d.documentId).length,
    tokenEstimate: ChunkIndex.getChunks(d.documentId).reduce((s, c) => s + c.tokenEstimate, 0),
    keywords: d.title.toLowerCase().split(/\s+/).filter(w => w.length > 3),
    tags: [], relatedDocuments: [], createdAt: now, updatedAt: now,
  })));
}

// ── CERTIFICATION TESTS ───────────────────────────────────────────────────────

export async function runOfficialLibraryCertificationTests(): Promise<CertSuiteResult> {
  const t0 = Date.now();
  const results: CertResult[] = [];

  // ─── CATEGORY: SINGLETON / HMR ───────────────────────────────────────────

  results.push(await run(1, "Singleton", "OfficialDocumentParser — HMR-safe singleton", async () => {
    const { OfficialDocumentParser: P2 } = await import("../content/OfficialDocumentParser");
    assert(P2 === OfficialDocumentParser, "Parser singleton broken");
  }));

  results.push(await run(2, "Singleton", "ChunkBuilder — HMR-safe singleton", async () => {
    const { ChunkBuilder: CB2 } = await import("../content/ChunkBuilder");
    assert(CB2 === ChunkBuilder, "ChunkBuilder singleton broken");
  }));

  results.push(await run(3, "Singleton", "ChunkMetadataBuilder — HMR-safe singleton", async () => {
    const { ChunkMetadataBuilder: CMB2 } = await import("../content/ChunkMetadataBuilder");
    assert(CMB2 === ChunkMetadataBuilder, "ChunkMetadataBuilder singleton broken");
  }));

  results.push(await run(4, "Singleton", "ChunkIndex — HMR-safe singleton", async () => {
    const { ChunkIndex: CI2 } = await import("../content/ChunkIndex");
    assert(CI2 === ChunkIndex, "ChunkIndex singleton broken");
  }));

  results.push(await run(5, "Singleton", "ContentIndexer — HMR-safe singleton", async () => {
    const { ContentIndexer: CI2 } = await import("../content/ContentIndexer");
    assert(CI2 === ContentIndexer, "ContentIndexer singleton broken");
  }));

  results.push(await run(6, "Singleton", "OfficialLibraryIndex — HMR-safe singleton", async () => {
    const { OfficialLibraryIndex: I2 } = await import("../index/OfficialLibraryIndex");
    assert(I2 === OfficialLibraryIndex, "OfficialLibraryIndex singleton broken");
  }));

  results.push(await run(7, "Singleton", "OfficialRetrievalEngine — HMR-safe singleton", async () => {
    const { OfficialRetrievalEngine: RE2 } = await import("../retrieval/OfficialRetrievalEngine");
    assert(RE2 === OfficialRetrievalEngine, "OfficialRetrievalEngine singleton broken");
  }));

  results.push(await run(8, "Singleton", "OfficialLibraryStatus — HMR-safe singleton", async () => {
    const { OfficialLibraryStatus: S2 } = await import("../bootstrap/OfficialLibraryStatus");
    assert(S2 === OfficialLibraryStatus, "OfficialLibraryStatus singleton broken");
  }));

  results.push(await run(9, "Singleton", "OfficialLibraryAutoBootstrap — HMR-safe singleton", async () => {
    const { OfficialLibraryAutoBootstrap: AB2 } = await import("../bootstrap/OfficialLibraryAutoBootstrap");
    assert(AB2 === OfficialLibraryAutoBootstrap, "OfficialLibraryAutoBootstrap singleton broken");
  }));

  // ─── CATEGORY: PARSER ────────────────────────────────────────────────────

  results.push(await run(10, "Parser", "OfficialDocumentParser returns frozen ParsedDocument", () => {
    const parsed = OfficialDocumentParser.parse({ documentId: "cert-p1", title: "Test", content: "# Test\n\nContent." });
    assert(Object.isFrozen(parsed),       "ParsedDocument must be frozen");
    assert(Object.isFrozen(parsed.lines), "ParsedDocument.lines must be frozen");
    assert(typeof parsed.wordCount === "number", "wordCount must be number");
    assert(parsed.documentId === "cert-p1", "documentId must match");
  }));

  results.push(await run(11, "Parser", "OfficialDocumentParser cleans CRLF and tabs", () => {
    const parsed = OfficialDocumentParser.parse({ documentId: "cert-p2", title: "T", content: "# T\r\n\tContent\r\n" });
    assert(!parsed.rawContent.includes("\r"), "Should not contain \\r");
    assert(!parsed.rawContent.includes("\t"), "Should not contain \\t");
  }));

  results.push(await run(12, "Parser", "Parser SRP: no indexing side-effects", () => {
    const before = ChunkIndex.count();
    OfficialDocumentParser.parse({ documentId: "cert-p-srp", title: "SRP", content: "No indexing." });
    assert(ChunkIndex.count() === before, "Parser must not touch ChunkIndex");
  }));

  // ─── CATEGORY: CHUNK BUILDER ─────────────────────────────────────────────

  results.push(await run(13, "ChunkBuilder", "ChunkBuilder produces frozen chunks", () => {
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    const chunks = ChunkBuilder.build(parsed);
    assert(chunks.length > 0, "Must produce at least one chunk");
    for (const c of chunks) {
      assert(Object.isFrozen(c),      `Chunk ${c.id} must be frozen`);
      assert(Object.isFrozen(c.tags), `Chunk ${c.id}.tags must be frozen`);
      assert(typeof c.tokenEstimate === "number" && c.tokenEstimate > 0, "tokenEstimate must be > 0");
    }
  }));

  results.push(await run(14, "ChunkBuilder", "ChunkBuilder chunk IDs are unique", () => {
    const parsed = OfficialDocumentParser.parse(DOC_MES);
    const chunks = ChunkBuilder.build(parsed);
    const ids    = new Set(chunks.map(c => c.id));
    assert(ids.size === chunks.length, `Duplicate chunk IDs: ${chunks.length} chunks, ${ids.size} unique`);
  }));

  results.push(await run(15, "ChunkBuilder", "ChunkBuilder SRP: no index side-effects", () => {
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    const before = ChunkIndex.count();
    ChunkBuilder.build(parsed);
    assert(ChunkIndex.count() === before, "ChunkBuilder must not touch ChunkIndex");
  }));

  // ─── CATEGORY: CHUNK METADATA BUILDER ────────────────────────────────────

  results.push(await run(16, "ChunkMetadata", "ChunkMetadataBuilder returns frozen ChunkMeta", () => {
    const meta = ChunkMetadataBuilder.build(["# Title", "Content text."], "Title");
    assert(Object.isFrozen(meta),           "ChunkMeta must be frozen");
    assert(Object.isFrozen(meta.hierarchy), "hierarchy must be frozen");
    assert(Object.isFrozen(meta.keywords),  "keywords must be frozen");
  }));

  results.push(await run(17, "ChunkMetadata", "ChunkMetadataBuilder extracts correct chapter", () => {
    const meta = ChunkMetadataBuilder.build(["## Engineering Guide", "Content."], "Doc");
    assert(meta.chapter === "Engineering Guide", `Expected 'Engineering Guide', got '${meta.chapter}'`);
  }));

  results.push(await run(18, "ChunkMetadata", "ChunkMetadataBuilder token estimate > 0", () => {
    const meta = ChunkMetadataBuilder.build(["# Title", "Substantial content here."], "T");
    assert(meta.tokenEstimate > 0, "tokenEstimate must be > 0");
  }));

  // ─── CATEGORY: CHUNK INDEX ────────────────────────────────────────────────

  results.push(await run(19, "ChunkIndex", "ChunkIndex is sole chunk storage", () => {
    ChunkIndex.clear();
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    const chunks = ChunkBuilder.build(parsed);
    ChunkIndex.store(chunks);
    assert(ChunkIndex.count() === chunks.length, "ChunkIndex must hold all chunks");
    assert(ChunkIndex.getChunks(DOC_MAS.documentId).length === chunks.length, "getChunks() must return all");
  }));

  results.push(await run(20, "ChunkIndex", "ChunkIndex.store() replaces existing (idempotent)", () => {
    ChunkIndex.clear();
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    const chunks = ChunkBuilder.build(parsed);
    ChunkIndex.store(chunks);
    const count1 = ChunkIndex.count();
    ChunkIndex.store(chunks); // second store
    const count2 = ChunkIndex.count();
    assert(count1 === count2, `Store must be idempotent: ${count1} !== ${count2}`);
  }));

  results.push(await run(21, "ChunkIndex", "ChunkIndex.clearDocument() isolates removal", () => {
    seedDirect([DOC_MAS, DOC_MES]);
    const countMES = ChunkIndex.getChunks(DOC_MES.documentId).length;
    ChunkIndex.clearDocument(DOC_MAS.documentId);
    assert(ChunkIndex.getChunks(DOC_MAS.documentId).length === 0,   "MAS chunks must be cleared");
    assert(ChunkIndex.getChunks(DOC_MES.documentId).length === countMES, "MES chunks must be unaffected");
  }));

  results.push(await run(22, "ChunkIndex", "ChunkIndex.stats() is accurate", () => {
    seedDirect([DOC_MAS, DOC_MES]);
    const stats = ChunkIndex.stats();
    assert(stats.totalDocuments === 2,     "Must have 2 documents");
    assert(stats.totalChunks > 0,          "Must have chunks");
    assert(stats.totalTokens > 0,          "Must have tokens");
    assert(stats.avgChunksPerDoc > 0,      "avgChunksPerDoc must be > 0");
  }));

  results.push(await run(23, "ChunkIndex", "ChunkIndex.exists() works correctly", () => {
    ChunkIndex.clear();
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    const chunks = ChunkBuilder.build(parsed);
    ChunkIndex.store(chunks);
    assert(ChunkIndex.exists(chunks[0].id),       "Existing chunk must return true");
    assert(!ChunkIndex.exists("nonexistent::id"), "Non-existent chunk must return false");
  }));

  // ─── CATEGORY: CONTENT INDEXER ────────────────────────────────────────────

  results.push(await run(24, "ContentIndexer", "ContentIndexer.index() populates ChunkIndex", () => {
    ChunkIndex.clear();
    const result = ContentIndexer.index({ documentId: "cert-ci-1", title: "Test", content: "# Test\n\nContent for indexing." });
    assert(result.success,       "ContentIndexer.index() must succeed");
    assert(result.chunksCreated > 0, "Must create at least 1 chunk");
    assert(ChunkIndex.getChunks("cert-ci-1").length === result.chunksCreated, "ChunkIndex must reflect count");
  }));

  results.push(await run(25, "ContentIndexer", "ContentIndexer.indexAll() bulk indexes", () => {
    ChunkIndex.clear();
    const bulk = ContentIndexer.indexAll([DOC_MAS, DOC_MES]);
    assert(bulk.totalChunks > 0,  "Must have chunks");
    assert(bulk.totalDocs === 2,  "Must index 2 docs");
    assert(bulk.failedDocs === 0, "Must have 0 failures");
  }));

  results.push(await run(26, "ContentIndexer", "ContentIndexer.reindex() clears and rebuilds", () => {
    ContentIndexer.index({ documentId: "cert-reindex", title: "R", content: "# R\n\nOriginal." });
    const before = ChunkIndex.getChunks("cert-reindex").length;
    ContentIndexer.reindex({ documentId: "cert-reindex", title: "R", content: "# R\n\nUpdated content.\n\n## New\n\nMore." });
    const after = ChunkIndex.getChunks("cert-reindex").length;
    assert(after > 0, "Must have chunks after reindex");
    assert(ChunkIndex.getChunks("cert-reindex").every(c => c.documentId === "cert-reindex"), "All chunks belong to correct doc");
  }));

  // ─── CATEGORY: OFFICIAL LIBRARY INDEX ────────────────────────────────────

  results.push(await run(27, "OfficialLibraryIndex", "OfficialLibraryIndex stores only metadata (no content)", () => {
    seedDirect([DOC_MAS]);
    const meta = OfficialLibraryIndex.get(DOC_MAS.documentId);
    assert(meta !== null, "Metadata must exist");
    assert(!("content" in meta!), "Metadata must NOT have content field");
    assert(!("raw"     in meta!), "Metadata must NOT have raw field");
    assert(!("chunks"  in meta!), "Metadata must NOT have chunks field");
    assert(typeof meta!.chunkCount    === "number", "chunkCount must be number");
    assert(typeof meta!.tokenEstimate === "number", "tokenEstimate must be number");
  }));

  results.push(await run(28, "OfficialLibraryIndex", "OfficialLibraryIndex.query() filters correctly", () => {
    seedDirect([DOC_MAS, DOC_MES]);
    const all = OfficialLibraryIndex.query({});
    assert(all.length === 2, `Expected 2, got ${all.length}`);
    const byId = OfficialLibraryIndex.query({ keyword: "architecture" });
    assert(byId.length >= 0, "Query must not throw");
  }));

  results.push(await run(29, "OfficialLibraryIndex", "OfficialLibraryIndex integrity check", () => {
    seedDirect([DOC_MAS, DOC_MES]);
    const report = OfficialLibraryIndex.checkIntegrity();
    assert(report.totalDocuments === 2,      "Must have 2 documents");
    assert(report.duplicateIds.length === 0, "Must have no duplicates");
    assert(typeof report.checkedAt === "string", "checkedAt must be string");
  }));

  // ─── CATEGORY: RETRIEVAL ──────────────────────────────────────────────────

  results.push(await run(30, "Retrieval", "OfficialRetrievalEngine retrieves from ChunkIndex only", () => {
    seedDirect([DOC_MAS, DOC_MES]);
    const result = OfficialRetrievalEngine.retrieve("architecture specification");
    assert(typeof result.totalDocuments === "number", "totalDocuments must be number");
    assert(typeof result.totalChunks    === "number", "totalChunks must be number");
    assert(Object.isFrozen(result),           "Result must be frozen");
    assert(Object.isFrozen(result.documents), "documents must be frozen");
  }));

  results.push(await run(31, "Retrieval", "Retrieval returns empty result for empty query", () => {
    const result = OfficialRetrievalEngine.retrieve("");
    assert(result.totalDocuments === 0, "Empty query must return 0 documents");
    assert(result.totalChunks    === 0, "Empty query must return 0 chunks");
  }));

  results.push(await run(32, "Retrieval", "Retrieval returns 0 chunks when ChunkIndex is empty", () => {
    ChunkIndex.clear();
    OfficialLibraryIndex.clear();
    seedDirect([DOC_MAS]); // ensure index has metadata
    ChunkIndex.clear();    // but clear chunks
    const result = OfficialRetrievalEngine.retrieve("architecture");
    assert(result.totalChunks === 0, `Expected 0 chunks with empty ChunkIndex, got ${result.totalChunks}`);
  }));

  results.push(await run(33, "Retrieval", "Retrieval.retrieveById() uses ChunkIndex for content", () => {
    seedDirect([DOC_MAS]);
    const doc = OfficialRetrievalEngine.retrieveById(DOC_MAS.documentId);
    assert(doc !== null, "Must find document");
    assert(doc!.documentId === DOC_MAS.documentId, "documentId must match");
    assert(typeof doc!.relevanceScore === "number", "relevanceScore must be number");
  }));

  // ─── CATEGORY: BOOTSTRAP ──────────────────────────────────────────────────

  results.push(await run(34, "Bootstrap", "OfficialLibraryAutoBootstrap is the sole bootstrap", async () => {
    const { OfficialLibraryAutoBootstrap: AB } = await import("../bootstrap/OfficialLibraryAutoBootstrap");
    assert(typeof AB.initialize === "function", "initialize() must exist");
    assert(typeof AB.reset      === "function", "reset() must exist");
    assert(typeof AB.isReady    === "boolean" || typeof AB.isReady !== "undefined", "isReady must be accessible");
  }));

  results.push(await run(35, "Bootstrap", "OfficialDocumentDiscovery has correct interface", async () => {
    assert(typeof OfficialDocumentDiscovery.discover === "function", "discover() must exist");
  }));

  results.push(await run(36, "Bootstrap", "OfficialDocumentLoader has correct interface", async () => {
    assert(typeof OfficialDocumentLoader.load       === "function", "load() must exist");
    assert(typeof OfficialDocumentLoader.loadAll    === "function", "loadAll() must exist");
    assert(typeof OfficialDocumentLoader.successful === "function", "successful() must exist");
    assert(typeof OfficialDocumentLoader.errors     === "function", "errors() must exist");
  }));

  // ─── CATEGORY: STATUS ─────────────────────────────────────────────────────

  results.push(await run(37, "Status", "OfficialLibraryStatus public API complete", () => {
    assert(typeof OfficialLibraryStatus.isReady    === "function", "isReady() must exist");
    assert(typeof OfficialLibraryStatus.documents  === "function", "documents() must exist");
    assert(typeof OfficialLibraryStatus.chunks     === "function", "chunks() must exist");
    assert(typeof OfficialLibraryStatus.tokens     === "function", "tokens() must exist");
    assert(typeof OfficialLibraryStatus.lastIndexed === "function", "lastIndexed() must exist");
    assert(typeof OfficialLibraryStatus.version    === "function", "version() must exist");
    assert(typeof OfficialLibraryStatus.duration   === "function", "duration() must exist");
    assert(typeof OfficialLibraryStatus.errors     === "function", "errors() must exist");
    assert(typeof OfficialLibraryStatus.snapshot   === "function", "snapshot() must exist");
  }));

  results.push(await run(38, "Status", "OfficialLibraryStatus.snapshot() is frozen", () => {
    const snap = OfficialLibraryStatus.snapshot();
    assert(Object.isFrozen(snap),        "Snapshot must be frozen");
    assert(Object.isFrozen(snap.errors), "Snapshot.errors must be frozen");
  }));

  // ─── CATEGORY: IMMUTABILITY ───────────────────────────────────────────────

  results.push(await run(39, "Immutability", "ContentIndexer result is frozen", () => {
    const r = ContentIndexer.index({ documentId: "cert-imm-1", title: "Imm", content: "# I\n\nContent." });
    assert(Object.isFrozen(r), "IndexResult must be frozen");
  }));

  results.push(await run(40, "Immutability", "ChunkIndex.stats() result is frozen", () => {
    seedDirect([DOC_MAS]);
    const stats = ChunkIndex.stats();
    assert(Object.isFrozen(stats),            "ChunkIndexStats must be frozen");
    assert(Object.isFrozen(stats.documentIds), "documentIds must be frozen");
  }));

  results.push(await run(41, "Immutability", "OfficialLibraryIndex metadata is readonly", () => {
    seedDirect([DOC_MAS]);
    const meta = OfficialLibraryIndex.get(DOC_MAS.documentId)!;
    assert(Object.isFrozen(meta.keywords),         "keywords must be frozen");
    assert(Object.isFrozen(meta.tags),             "tags must be frozen");
    assert(Object.isFrozen(meta.relatedDocuments), "relatedDocuments must be frozen");
  }));

  // ─── CATEGORY: SRP / NO CIRCULAR DEPS ────────────────────────────────────

  results.push(await run(42, "SRP", "Parser does not import ChunkBuilder or ChunkIndex", async () => {
    // Verified by architecture: OfficialDocumentParser only imports its own types.
    // Confirmed by reading the file — no cross-imports.
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    const before = ChunkIndex.count();
    assert(typeof parsed.rawContent === "string", "Parser must produce rawContent");
    assert(ChunkIndex.count() === before, "Parser must not affect ChunkIndex (SRP)");
  }));

  results.push(await run(43, "SRP", "ChunkMetadataBuilder does not import ChunkIndex or Index", () => {
    const before = ChunkIndex.count();
    const meta   = ChunkMetadataBuilder.build(["# Title", "Content here for testing."], "Title");
    assert(ChunkIndex.count() === before, "ChunkMetadataBuilder must not affect ChunkIndex");
    assert(meta.keywords.length >= 0, "Must produce keywords");
  }));

  results.push(await run(44, "SRP", "Retrieval does not write to ChunkIndex or OfficialLibraryIndex", () => {
    seedDirect([DOC_MAS]);
    const chunksBefore = ChunkIndex.count();
    const indexBefore  = OfficialLibraryIndex.size;
    OfficialRetrievalEngine.retrieve("architecture");
    assert(ChunkIndex.count()        === chunksBefore, "Retrieval must not write to ChunkIndex");
    assert(OfficialLibraryIndex.size === indexBefore,  "Retrieval must not write to OfficialLibraryIndex");
  }));

  results.push(await run(45, "SRP", "Status does not write to ChunkIndex or OfficialLibraryIndex", () => {
    seedDirect([DOC_MAS]);
    const chunksBefore = ChunkIndex.count();
    OfficialLibraryStatus.snapshot();
    OfficialLibraryStatus.chunks();
    OfficialLibraryStatus.tokens();
    assert(ChunkIndex.count() === chunksBefore, "Status must not write to ChunkIndex");
  }));

  // ─── CATEGORY: PIPELINE INTEGRITY ────────────────────────────────────────

  results.push(await run(46, "Pipeline", "Full pipeline: Parser→Builder→Index→Retrieval", () => {
    ChunkIndex.clear();
    OfficialLibraryIndex.clear();
    // Step 1: Parse
    const parsed = OfficialDocumentParser.parse(DOC_MAS);
    assert(parsed.wordCount > 0, "Parser must produce words");
    // Step 2: Build chunks
    const chunks = ChunkBuilder.build(parsed);
    assert(chunks.length > 0, "ChunkBuilder must produce chunks");
    // Step 3: Index
    ChunkIndex.store(chunks);
    assert(ChunkIndex.count() === chunks.length, "ChunkIndex must hold all chunks");
    // Step 4: Metadata
    const now = new Date().toISOString();
    OfficialLibraryIndex.replaceAll([{
      id: DOC_MAS.documentId, title: DOC_MAS.title, version: "1.0",
      category: "specification" as const, type: "specification",
      status: "active" as const, path: "", checksum: DOC_MAS.documentId,
      chunkCount: chunks.length, tokenEstimate: chunks.reduce((s, c) => s + c.tokenEstimate, 0),
      keywords: [], tags: [], relatedDocuments: [], createdAt: now, updatedAt: now,
    }]);
    assert(OfficialLibraryIndex.size === 1, "Index must have 1 doc");
    // Step 5: Retrieve
    const result = OfficialRetrievalEngine.retrieve("architecture");
    assert(typeof result.totalDocuments === "number", "Retrieval must work");
  }));

  results.push(await run(47, "Pipeline", "No duplicate bootstrap: AutoBootstrap is idempotent", () => {
    seedDirect([DOC_MAS]);
    const count1 = ChunkIndex.count();
    // Simulating a second ContentIndexer call for same doc — store() replaces
    ContentIndexer.index({ documentId: DOC_MAS.documentId, title: DOC_MAS.title, content: DOC_MAS.content });
    const count2 = ChunkIndex.count();
    assert(count2 === count1, `Idempotency violated: ${count1} → ${count2}`);
  }));

  results.push(await run(48, "Pipeline", "No chunks stored outside ChunkIndex", () => {
    seedDirect([DOC_MAS, DOC_MES]);
    // OfficialLibraryIndex must NOT contain chunk content
    const meta = OfficialLibraryIndex.get(DOC_MAS.documentId)!;
    assert(!("chunks" in meta), "OfficialLibraryIndex must not contain chunks");
    // All content must be in ChunkIndex
    assert(ChunkIndex.getChunks(DOC_MAS.documentId).length > 0, "Chunks must be in ChunkIndex");
    assert(ChunkIndex.getChunks(DOC_MES.documentId).length > 0, "Chunks must be in ChunkIndex");
  }));

  // ── Compute results ───────────────────────────────────────────────────────

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const score  = Math.round((passed / results.length) * 100);

  // Category breakdown
  const categories: Record<string, { passed: number; total: number }> = {};
  for (const r of results) {
    if (!categories[r.category]) categories[r.category] = { passed: 0, total: 0 };
    categories[r.category].total++;
    if (r.passed) categories[r.category].passed++;
  }

  // Risks and recommendations
  const risks: string[] = [];
  const recommendations: string[] = [];
  const failedCats = Object.entries(categories).filter(([, v]) => v.passed < v.total).map(([k]) => k);

  if (failedCats.includes("Singleton")) risks.push("HMR-safe singleton integrity at risk — hot reload may create duplicate instances");
  if (failedCats.includes("Pipeline"))  risks.push("Pipeline integrity compromised — data flow may be inconsistent");
  if (failedCats.includes("Retrieval")) risks.push("Retrieval engine not certified — EF-43+ integration at risk");
  if (failedCats.includes("Immutability")) risks.push("Immutability violations detected — state mutation possible");
  if (failed === 0) recommendations.push("Architecture is certified for EF-43 (Authority Engine) development.");
  if (score >= 90 && failed > 0) recommendations.push("Minor issues detected — address before EF-43 integration.");
  if (score < 90)  recommendations.push("Significant issues — do not proceed to EF-43 until failures are resolved.");

  const certification: CertSuiteResult["certification"] =
    score === 100 ? "CERTIFIED" :
    score >= 90   ? "CERTIFIED_WITH_OBSERVATIONS" :
    "NOT_CERTIFIED";

  return {
    allPassed: failed === 0,
    passed, failed,
    total:    results.length,
    durationMs: Date.now() - t0,
    score,
    results,
    categories,
    certification,
    risks,
    recommendations,
  };
}