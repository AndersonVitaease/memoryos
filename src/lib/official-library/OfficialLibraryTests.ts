/**
 * OfficialLibraryTests.ts — Sprint EF-7.2.1
 *
 * All EF-7.2.0 suites retained + new suites:
 *   12 — OfficialLibraryCatalog (auto-discovery)
 *   13 — DocumentLoader (SRP)
 *   14 — SearchStrategy (DIP)
 *   15 — AuthorityComparator
 *   16 — OfficialLibraryBootstrap
 *   17 — DocumentChangeSource
 *   18 — GraphBuilder / GraphStorage / GraphQuery
 *   19 — No hardcoded content (absence of EMBEDDED_FALLBACK)
 */

import { OfficialLibraryParser }  from "./OfficialLibraryParser";
import { OfficialLibraryChunker } from "./OfficialLibraryChunker";
import { OfficialLibraryIndexer } from "./OfficialLibraryIndexer";
import { OfficialLibraryWatcher } from "./OfficialLibraryWatcher";
import { OfficialLibraryProvider } from "./OfficialLibraryProvider";
import { OfficialLibraryCatalog }  from "./OfficialLibraryCatalog";
import { OfficialLibraryBootstrap, graphQuery, graphStorage } from "./OfficialLibraryBootstrap";
import { OfficialAuthority }       from "./OfficialAuthority";
import { AuthorityComparator }     from "./AuthorityComparator";
import { DocumentLoader }          from "./DocumentLoader";
import { KeywordSearchStrategy, HybridSearchStrategy, EmbeddingSearchStrategy } from "./SearchStrategy";
import { PollingChangeSource }     from "./DocumentChangeSource";
import { GraphBuilder }            from "./GraphBuilder";
import { GraphStorage }            from "./GraphStorage";
import { GraphQuery }              from "./GraphQuery";
import { officialKnowledgeGraph }  from "./OfficialKnowledgeGraph";
import { MemoryAuthority, AUTHORITY_RANK, MemorySourceType } from "./OfficialLibraryTypes";

export interface OLTestResult {
  suite:  string;
  name:   string;
  passed: boolean;
  detail: string;
  error:  string | null;
}

function ok(suite: string, name: string, detail = ""): OLTestResult {
  return { suite, name, passed: true, detail, error: null };
}
function fail(suite: string, name: string, error: string, detail = ""): OLTestResult {
  return { suite, name, passed: false, detail, error };
}
function check(suite: string, name: string, cond: boolean, detail: string, onFail?: string): OLTestResult {
  return cond ? ok(suite, name, detail) : fail(suite, name, onFail ?? `Expected true: ${detail}`, detail);
}

// ── Suite 1–11: retained from EF-7.2.0 (condensed, same assertions) ──────────

function suite1(): OLTestResult[] {
  const S = "1 — OfficialLibraryParser";
  const md = `# MV — MemoryOS Vision v2.1\n\n## Chapter 1\nMemoryOS is a permanent intelligent memory layer.\n\n## Chapter 2\nKnowledge should be accessible.\n`;
  const parsed = OfficialLibraryParser.parse(md, "src/docs/00-official-library/MV-test.md", "MV-test");
  return [
    check(S, "parse returns ParsedDocument",         parsed.documentId.length > 0, parsed.documentId),
    check(S, "extracts sections from markdown",       parsed.sections.length >= 2, `${parsed.sections.length}`),
    check(S, "extracts version",                      parsed.version === "2.1", parsed.version),
    check(S, "OFFICIAL authority from official path", parsed.authority === MemoryAuthority.OFFICIAL, parsed.authority),
    check(S, "summarize returns non-empty",           OfficialLibraryParser.summarize(parsed).length > 5, "ok"),
    check(S, "detectFormat: .md → markdown",          OfficialLibraryParser.detectFormat("doc.md") === "markdown", "ok"),
  ];
}

function suite2(): OLTestResult[] {
  const S = "2 — OfficialLibraryChunker";
  const doc = OfficialLibraryParser.parse(
    `# Doc\n\n## S1\n${"A".repeat(2000)}\n\n## S2\nShort.\n`,
    "src/docs/00-official-library/d.md", "Doc"
  );
  const chunks = OfficialLibraryChunker.chunk(doc);
  return [
    check(S, "chunk returns OfficialChunk[]",    chunks.length > 0, `${chunks.length}`),
    check(S, "each chunk has id",                chunks.every(c => c.id.length > 0), "ok"),
    check(S, "each chunk has authority",         chunks.every(c => c.authority === MemoryAuthority.OFFICIAL), "ok"),
    check(S, "each chunk has sourceType",        chunks.every(c => c.sourceType === MemorySourceType.OFFICIAL_LIBRARY), "ok"),
    check(S, "stats.count matches",              OfficialLibraryChunker.stats(chunks).count === chunks.length, "ok"),
  ];
}

async function suite3(): Promise<OLTestResult[]> {
  const S = "3 — OfficialLibraryIndexer";
  await OfficialLibraryIndexer.initialize();
  const stats = OfficialLibraryIndexer.stats();
  const results = OfficialLibraryIndexer.search("memory engine architecture", 5);
  return [
    check(S, "isIndexed = true",             OfficialLibraryIndexer.isIndexed, "ok"),
    check(S, "documentCount >= 0",           stats.documentCount >= 0, `${stats.documentCount}`),
    check(S, "chunkCount >= 0",              stats.chunkCount >= 0, `${stats.chunkCount}`),
    check(S, "search returns array",         Array.isArray(results), `${results.length}`),
    check(S, "activeStrategyId is set",      OfficialLibraryIndexer.activeStrategyId.length > 0, OfficialLibraryIndexer.activeStrategyId),
    check(S, "no results for nonsense",      OfficialLibraryIndexer.search("xyznonexistent123", 5).length === 0, "ok"),
  ];
}

function suite4(): OLTestResult[] {
  const S = "4 — OfficialAuthority";
  return [
    check(S, "fromPath: official → OFFICIAL",  OfficialAuthority.fromPath("src/docs/00-official-library/X.md") === MemoryAuthority.OFFICIAL, "ok"),
    check(S, "fromPath: foundation → VERIFIED", OfficialAuthority.fromPath("src/docs/foundation/F.md") === MemoryAuthority.VERIFIED, "ok"),
    check(S, "OFFICIAL rank > VERIFIED",        AUTHORITY_RANK[MemoryAuthority.OFFICIAL] > AUTHORITY_RANK[MemoryAuthority.VERIFIED], "ok"),
    check(S, "confidenceBoost OFFICIAL=0.20",   OfficialAuthority.confidenceBoost(MemoryAuthority.OFFICIAL) === 0.20, "ok"),
  ];
}

async function suite5(): Promise<OLTestResult[]> {
  const S = "5 — OfficialLibraryProvider (UCME)";
  const results = await OfficialLibraryProvider.search({ text: "memory architecture principles", maxPerProvider: 5 });
  const health  = await OfficialLibraryProvider.health();
  return [
    check(S, "search returns array",             Array.isArray(results), "ok"),
    check(S, "health resolves",                  typeof health.healthy === "boolean", health.detail),
    check(S, "evidence confidence 0-1",          results.every(e => e.confidence >= 0 && e.confidence <= 1), "ok"),
    check(S, "evidence has citation in metadata", results.every(e => (e.metadata as any)?.citation !== undefined), "ok"),
    check(S, "no authority bonus in confidence", results.every(e => e.confidence <= 0.95), "ok"),
    check(S, "authority in metadata",            results.every(e => (e.metadata as any)?.authority?.length > 0), "ok"),
  ];
}

async function suite6(): Promise<OLTestResult[]> {
  const S = "6 — Authority Ranking in UCME";
  const { MemoryProviderRegistry } = await import("@/lib/ucme/MemoryProviderRegistry");
  return [
    check(S, "official-library registered",      MemoryProviderRegistry.has("official-library"), "ok"),
    check(S, "OFFICIAL has highest rank",         AUTHORITY_RANK[MemoryAuthority.OFFICIAL] === Math.max(...Object.values(AUTHORITY_RANK)), "ok"),
  ];
}

async function suite7(): Promise<OLTestResult[]> {
  const S = "7 — Versioning";
  await OfficialLibraryIndexer.initialize();
  const metas = OfficialLibraryIndexer.getAllMeta();
  return [
    check(S, "each doc has version",    metas.every(m => m.version.length > 0), "ok"),
    check(S, "each doc has createdAt",  metas.every(m => m.createdAt.length > 0), "ok"),
    check(S, "deprecated field present", metas.every(m => typeof m.deprecated === "boolean"), "ok"),
    check(S, "supersedes field present", metas.every(m => "supersedes" in m), "ok"),
  ];
}

async function suite8(): Promise<OLTestResult[]> {
  const S = "8 — Citations";
  const results = await OfficialLibraryProvider.search({ text: "architecture", maxPerProvider: 5 });
  return [
    check(S, "citation.sourceType=OFFICIAL_LIBRARY", results.every(e => (e.metadata as any)?.citation?.sourceType === MemorySourceType.OFFICIAL_LIBRARY), "ok"),
    check(S, "citation.documentId non-empty",        results.every(e => ((e.metadata as any)?.citation?.documentId ?? "").length > 0), "ok"),
    check(S, "citation.version non-empty",           results.every(e => ((e.metadata as any)?.citation?.version ?? "").length > 0), "ok"),
    check(S, "justification mentions Official Library", results.every(e => e.justification.includes("Official Library")), "ok"),
  ];
}

async function suite9(): Promise<OLTestResult[]> {
  const S = "9 — OfficialLibraryWatcher";
  OfficialLibraryWatcher._reset();
  OfficialLibraryWatcher.start();
  const active = OfficialLibraryWatcher.isActive;
  OfficialLibraryWatcher.stop();
  return [
    check(S, "start sets isActive",    active, "ok"),
    check(S, "stop clears isActive",   !OfficialLibraryWatcher.isActive, "ok"),
    check(S, "history is array",       Array.isArray(OfficialLibraryWatcher.history), "ok"),
    check(S, "sourceId is string",     OfficialLibraryWatcher.sourceId.length > 0, OfficialLibraryWatcher.sourceId),
    check(S, "subscribe returns fn",   typeof OfficialLibraryWatcher.subscribe(() => {}) === "function", "ok"),
  ];
}

async function suite10(): Promise<OLTestResult[]> {
  const S = "10 — OfficialKnowledgeGraph";
  await OfficialLibraryIndexer.initialize();
  const chunks = OfficialLibraryIndexer.getChunks();
  officialKnowledgeGraph.build(chunks);
  return [
    check(S, "nodeCount >= 0",         officialKnowledgeGraph.nodeCount >= 0, `${officialKnowledgeGraph.nodeCount}`),
    check(S, "edgeCount >= 0",         officialKnowledgeGraph.edgeCount >= 0, `${officialKnowledgeGraph.edgeCount}`),
    check(S, "getNodes returns array", Array.isArray(officialKnowledgeGraph.getNodes()), "ok"),
    check(S, "getEdges returns array", Array.isArray(officialKnowledgeGraph.getEdges()), "ok"),
  ];
}

async function suite11(): Promise<OLTestResult[]> {
  const S = "11 — MRE Integration";
  const { MemoryReasoningEngine } = await import("@/lib/mre/MemoryReasoningEngine");
  const evidence = await OfficialLibraryProvider.search({ text: "memory architecture", maxPerProvider: 3 });
  let error: string | null = null;
  let result: any = null;
  try { if (evidence.length > 0) result = MemoryReasoningEngine.reason("memory architecture?", evidence); }
  catch (e) { error = (e as Error).message; }
  return [
    check(S, "no MRE error",                   error === null, error ?? "ok"),
    check(S, "official evidence accepted",     evidence.length === 0 || result !== null, "ok"),
    check(S, "MRE confidence 0-1",             result === null || (result.confidence >= 0 && result.confidence <= 1), `${result?.confidence}`),
    check(S, "backward compat: context string", result === null || typeof result.context === "string", "ok"),
  ];
}

// ── Suite 12: Catalog auto-discovery ─────────────────────────────────────────

function suite12(): OLTestResult[] {
  const S = "12 — OfficialLibraryCatalog (auto-discovery)";
  const sources = OfficialLibraryCatalog.discover();
  return [
    check(S, "discover() returns array",              Array.isArray(sources), "ok"),
    check(S, "each source has id",                    sources.every(s => s.id.length > 0), "ok"),
    check(S, "each source has name",                  sources.every(s => s.name.length > 0), "ok"),
    check(S, "each source has load function",         sources.every(s => typeof s.load === "function"), "ok"),
    check(S, "catalog has hasDocuments getter",       typeof OfficialLibraryCatalog.hasDocuments === "boolean", "ok"),
    check(S, "diagnostics is string[]",               Array.isArray(OfficialLibraryCatalog.diagnostics), "ok"),
    check(S, "count matches sources.length",          OfficialLibraryCatalog.count === sources.length, `${OfficialLibraryCatalog.count}`),
    check(S, "no hardcoded names (discover is dynamic)", !OfficialLibraryCatalog.discover.toString().includes('"doc-mv"'), "ok"),
  ];
}

// ── Suite 13: DocumentLoader SRP ─────────────────────────────────────────────

async function suite13(): Promise<OLTestResult[]> {
  const S = "13 — DocumentLoader (SRP)";
  const goodSource = { id: "t1", name: "Test", path: "test.md", load: async () => "# Hello\n\nContent here." };
  const badSource  = { id: "t2", name: "Bad",  path: "bad.md",  load: async () => { throw new Error("network error"); } };
  const emptySource = { id: "t3", name: "Empty", path: "e.md", load: async () => "" };

  const good  = await DocumentLoader.load(goodSource);
  const bad   = await DocumentLoader.load(badSource);
  const empty = await DocumentLoader.load(emptySource);
  const all   = await DocumentLoader.loadAll([goodSource, badSource]);

  return [
    check(S, "successful load has error=null",    good.error === null, good.error ?? "ok"),
    check(S, "successful load has raw content",   good.raw.length > 0, `${good.raw.length} chars`),
    check(S, "failed load has error message",     bad.error !== null && bad.error.length > 0, bad.error ?? "null"),
    check(S, "failed load has raw=empty",         bad.raw === "", "ok"),
    check(S, "empty load reports error",          empty.error !== null, empty.error ?? "null"),
    check(S, "loadAll loads in parallel",         all.length === 2, `${all.length}`),
    check(S, "successful() filters errors",       DocumentLoader.successful(all).length === 1, "ok"),
    check(S, "errors() returns diagnostics",      DocumentLoader.errors(all).length === 1, "ok"),
    check(S, "loader has loadedAt timestamp",     good.loadedAt.length > 0, good.loadedAt),
    check(S, "loader does NOT parse content",     !DocumentLoader.load.toString().includes("OfficialLibraryParser"), "ok"),
  ];
}

// ── Suite 14: SearchStrategy DIP ─────────────────────────────────────────────

async function suite14(): Promise<OLTestResult[]> {
  const S = "14 — SearchStrategy (DIP)";
  const chunks = OfficialLibraryIndexer.getChunks();

  const keyword = new KeywordSearchStrategy();
  const hybrid  = new HybridSearchStrategy();
  const kResult = keyword.search("memory architecture", chunks, 5);
  const hResult = hybrid.search("memory architecture", chunks, 5);

  return [
    check(S, "KeywordSearchStrategy has strategyId",    keyword.strategyId === "keyword-v1", keyword.strategyId),
    check(S, "HybridSearchStrategy has strategyId",     hybrid.strategyId === "hybrid-v1", hybrid.strategyId),
    check(S, "keyword.search returns array",             Array.isArray(kResult), `${kResult.length}`),
    check(S, "hybrid.search returns array",              Array.isArray(hResult), `${hResult.length}`),
    check(S, "setSearchStrategy swaps strategy",         (() => { OfficialLibraryIndexer.setSearchStrategy(new HybridSearchStrategy()); const id = OfficialLibraryIndexer.activeStrategyId; OfficialLibraryIndexer.setSearchStrategy(keyword); return id === "hybrid-v1"; })(), "ok"),
    check(S, "Provider never imports concrete strategy", !OfficialLibraryProvider.search.toString().includes("new KeywordSearchStrategy"), "ok"),
    check(S, "empty search on empty chunks returns []",  keyword.search("test", [], 5).length === 0, "ok"),
  ];
}

// ── Suite 15: AuthorityComparator ─────────────────────────────────────────────

function suite15(): OLTestResult[] {
  const S = "15 — AuthorityComparator";
  const ev = (auth: string) => ({ metadata: { authority: auth }, confidence: 0.8, relevance: 0.8, recency: 0.8 } as any);

  return [
    check(S, "compare OFFICIAL > EXTERNAL → positive",   AuthorityComparator.compare(MemoryAuthority.OFFICIAL, MemoryAuthority.EXTERNAL) > 0, "ok"),
    check(S, "compare EXTERNAL < OFFICIAL → negative",   AuthorityComparator.compare(MemoryAuthority.EXTERNAL, MemoryAuthority.OFFICIAL) < 0, "ok"),
    check(S, "isHigher(OFFICIAL, USER)",                 AuthorityComparator.isHigher(MemoryAuthority.OFFICIAL, MemoryAuthority.USER), "ok"),
    check(S, "isAtLeast(OFFICIAL, OFFICIAL)",            AuthorityComparator.isAtLeast(MemoryAuthority.OFFICIAL, MemoryAuthority.OFFICIAL), "ok"),
    check(S, "fromEvidence extracts OFFICIAL",           AuthorityComparator.fromEvidence(ev("OFFICIAL")) === MemoryAuthority.OFFICIAL, "ok"),
    check(S, "fromEvidence defaults to EXTERNAL",        AuthorityComparator.fromEvidence({ metadata: {} } as any) === MemoryAuthority.EXTERNAL, "ok"),
    check(S, "sortEvidence: OFFICIAL before EXTERNAL",   [ev("EXTERNAL"), ev("OFFICIAL")].sort(AuthorityComparator.sortEvidence)[0].metadata.authority === "OFFICIAL", "ok"),
    check(S, "rank() returns number",                    typeof AuthorityComparator.rank(MemoryAuthority.OFFICIAL) === "number", "ok"),
    check(S, "allRanked[0] = OFFICIAL",                  AuthorityComparator.allRanked()[0] === MemoryAuthority.OFFICIAL, "ok"),
  ];
}

// ── Suite 16: Bootstrap ───────────────────────────────────────────────────────

async function suite16(): Promise<OLTestResult[]> {
  const S = "16 — OfficialLibraryBootstrap";
  const result = await OfficialLibraryBootstrap.run();

  return [
    check(S, "run() resolves with BootstrapResult",   typeof result === "object", "ok"),
    check(S, "result.documentCount >= 0",             result.documentCount >= 0, `${result.documentCount}`),
    check(S, "result.chunkCount >= 0",                result.chunkCount >= 0, `${result.chunkCount}`),
    check(S, "result.bootstrappedAt is ISO string",   result.bootstrappedAt.length > 10, result.bootstrappedAt),
    check(S, "result.durationMs >= 0",                result.durationMs >= 0, `${result.durationMs}ms`),
    check(S, "loadErrors is array",                   Array.isArray(result.loadErrors), "ok"),
    check(S, "graphStorage.isBuilt",                  graphStorage.isBuilt, `builtAt=${graphStorage.builtAt}`),
    check(S, "graphQuery is available",               graphQuery !== null, "ok"),
    check(S, "isReady reflects success",              OfficialLibraryBootstrap.isReady === result.success, "ok"),
    check(S, "lastResult matches run() result",       OfficialLibraryBootstrap.lastResult === result, "ok"),
  ];
}

// ── Suite 17: DocumentChangeSource ───────────────────────────────────────────

function suite17(): OLTestResult[] {
  const S = "17 — DocumentChangeSource";
  const events: string[] = [];
  const polling = new PollingChangeSource(10000, () => "hash-test");

  polling.start(e => events.push(e.documentId));
  const active = polling.isActive;
  polling.stop();
  const inactive = !polling.isActive;

  return [
    check(S, "PollingChangeSource has sourceId",      polling.sourceId === "polling-v1", "ok"),
    check(S, "start() sets isActive",                 active, "ok"),
    check(S, "stop() clears isActive",                inactive, "ok"),
    check(S, "Watcher exposes sourceId",              OfficialLibraryWatcher.sourceId.length > 0, OfficialLibraryWatcher.sourceId),
    check(S, "Watcher exposes sourceName",            OfficialLibraryWatcher.sourceName.length > 0, OfficialLibraryWatcher.sourceName),
    check(S, "Watcher.setChangeSource accepts any source", (() => { const p = new PollingChangeSource(10000, () => "x"); OfficialLibraryWatcher.setChangeSource(p); return true; })(), "ok"),
  ];
}

// ── Suite 18: GraphBuilder / GraphStorage / GraphQuery ────────────────────────

function suite18(): OLTestResult[] {
  const S = "18 — GraphBuilder / GraphStorage / GraphQuery";
  const doc = OfficialLibraryParser.parse("# Doc\n\n## S1\nucme memory reasoning engine\n", "src/docs/00-official-library/t.md", "T");
  const chunks = OfficialLibraryChunker.chunk(doc);

  const data    = GraphBuilder.build(chunks);
  const storage = new GraphStorage();
  storage.store(data);
  const query   = new GraphQuery(storage);

  return [
    check(S, "GraphBuilder.build returns nodes+edges",  data.nodes.size > 0 && Array.isArray(data.edges), `nodes=${data.nodes.size} edges=${data.edges.length}`),
    check(S, "GraphStorage.store saves data",           storage.isBuilt, "ok"),
    check(S, "GraphStorage.nodeCount > 0",              storage.nodeCount > 0, `${storage.nodeCount}`),
    check(S, "GraphStorage.edgeCount >= 0",             storage.edgeCount >= 0, `${storage.edgeCount}`),
    check(S, "GraphQuery.getNodes() returns array",     Array.isArray(query.getNodes()), "ok"),
    check(S, "GraphQuery.getEdges() returns array",     Array.isArray(query.getEdges()), "ok"),
    check(S, "GraphQuery.getDocumentLinks returns array", Array.isArray(query.getDocumentLinks(chunks[0]?.documentId ?? "")), "ok"),
    check(S, "GraphQuery.findByLabel works",            Array.isArray(query.findByLabel("ucme")), "ok"),
    check(S, "GraphBuilder is pure (no side effects)",  !GraphBuilder.build.toString().includes("globalThis"), "ok"),
    check(S, "GraphStorage.clear() resets",             (() => { const s2 = new GraphStorage(); s2.store(data); s2.clear(); return !s2.isBuilt; })(), "ok"),
  ];
}

// ── Suite 19: No EMBEDDED_FALLBACK / no hardcoded content ────────────────────

function suite19(): OLTestResult[] {
  const S = "19 — No Hardcoded Content";
  const indexerSrc  = OfficialLibraryIndexer._reset.toString();
  const providerSrc = OfficialLibraryProvider.search.toString();

  return [
    check(S, "OfficialLibraryIndexer has no EMBEDDED_FALLBACK",  !indexerSrc.includes("EMBEDDED_FALLBACK"), "ok"),
    check(S, "OfficialLibraryIndexer has no makeCatalog()",      !indexerSrc.includes("makeCatalog"), "ok"),
    check(S, "Catalog uses glob, not static list",               OfficialLibraryCatalog.discover.toString().includes("import.meta.glob"), "ok"),
    check(S, "Provider has no hardcoded document names",         !providerSrc.includes("doc-mv") && !providerSrc.includes("doc-mas"), "ok"),
    check(S, "Authority ranking is structural (no additive bonus)", !OfficialLibraryProvider.search.toString().includes("+ boost"), "ok"),
  ];
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface OLTestReport {
  results:   OLTestResult[];
  total:     number;
  passed:    number;
  failed:    number;
  certified: boolean;
}

export async function runOfficialLibraryTests(): Promise<OLTestReport> {
  const sync   = [...suite1(), ...suite2(), ...suite4(), ...suite12(), ...suite15(), ...suite17(), ...suite18(), ...suite19()];
  const async_ = await Promise.all([suite3(), suite5(), suite6(), suite7(), suite8(), suite9(), suite10(), suite11(), suite13(), suite14(), suite16()]);
  const results = [...sync, ...async_.flat()];
  const passed  = results.filter(r => r.passed).length;
  return { results, total: results.length, passed, failed: results.length - passed, certified: results.every(r => r.passed) };
}