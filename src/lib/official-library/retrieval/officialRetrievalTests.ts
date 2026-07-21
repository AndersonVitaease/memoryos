/**
 * officialRetrievalTests.ts — Sprint EF-42
 *
 * Test suite for the Official Library Retrieval Engine.
 *
 * Tests:
 *   T1  — retrieve by title keyword
 *   T2  — retrieve by category
 *   T3  — retrieve by keyword from metadata
 *   T4  — chunks are returned for matching docs
 *   T5  — non-existent query returns empty result
 *   T6  — score consistency (same query → same score)
 *   T7  — result is deterministic (repeat calls produce identical output)
 *   T8  — result objects are frozen (immutability)
 *   T9  — diagnostics trace recorded
 *   T10 — retrieve by explicit ID
 */

import { OfficialLibraryIndex }     from "../index/OfficialLibraryIndex";
import { OfficialRetrievalEngine }  from "./OfficialRetrievalEngine";
import { RetrievalDiagnostics }     from "./RetrievalDiagnostics";
import { normalizeText, tokenize, scoreAgainstKeywords } from "./KeywordMatcher";
import type { OfficialDocumentMetadata } from "../index/OfficialDocumentMetadata";

// ── Test infrastructure ───────────────────────────────────────────────────────

interface TestResult {
  id:          number;
  name:        string;
  passed:      boolean;
  durationMs:  number;
  error?:      string;
  detail?:     string;
}

interface TestSuiteResult {
  allPassed:  boolean;
  passed:     number;
  failed:     number;
  total:      number;
  durationMs: number;
  results:    TestResult[];
}

function run(id: number, name: string, fn: () => void): TestResult {
  const t0 = Date.now();
  try {
    fn();
    return { id, name, passed: true, durationMs: Date.now() - t0 };
  } catch (e) {
    return { id, name, passed: false, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

// ── Seed documents ────────────────────────────────────────────────────────────

function seedIndex(): void {
  const now = new Date().toISOString();

  const docs: OfficialDocumentMetadata[] = [
    {
      id: "doc-mas-001", title: "MAS MemoryOS Architecture Specification",
      version: "2.0", category: "architecture", type: "specification", status: "active",
      path: "src/docs/00-official-library/MAS.md",
      checksum: "aabbccdd", chunkCount: 3, tokenEstimate: 600,
      keywords: ["architecture", "specification", "memory", "pipeline", "cognitive"],
      tags: ["mas", "architecture"], relatedDocuments: [],
      createdAt: now, updatedAt: now,
    },
    {
      id: "doc-mes-001", title: "MES MemoryOS Engineering Specification",
      version: "1.0", category: "engineering", type: "specification", status: "active",
      path: "src/docs/00-official-library/MES.md",
      checksum: "11223344", chunkCount: 2, tokenEstimate: 400,
      keywords: ["engineering", "specification", "sprint", "srp", "immutability"],
      tags: ["mes", "engineering"], relatedDocuments: [],
      createdAt: now, updatedAt: now,
    },
    {
      id: "doc-mps-001", title: "MPS MemoryOS Product Specification",
      version: "1.0", category: "product", type: "specification", status: "active",
      path: "src/docs/00-official-library/MPS.md",
      checksum: "55667788", chunkCount: 2, tokenEstimate: 350,
      keywords: ["product", "vision", "roadmap", "user", "features"],
      tags: ["mps", "product"], relatedDocuments: [],
      createdAt: now, updatedAt: now,
    },
    {
      id: "doc-adr-001", title: "ADR-001 Architecture Decision Record",
      version: "1.0", category: "adr", type: "decision", status: "active",
      path: "src/docs/foundation/adr/ADR-001.md",
      checksum: "99aabbcc", chunkCount: 1, tokenEstimate: 200,
      keywords: ["adr", "decision", "record", "foundation"],
      tags: ["adr", "decision"], relatedDocuments: [],
      createdAt: now, updatedAt: now,
    },
  ];

  OfficialLibraryIndex.replaceAll(docs);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export async function runOfficialRetrievalTests(): Promise<TestSuiteResult> {
  const t0 = Date.now();
  RetrievalDiagnostics.clear();
  seedIndex();

  const results: TestResult[] = [];

  // T1 — retrieve by title keyword
  results.push(run(1, "Retrieve by title keyword (architecture)", () => {
    const r = OfficialRetrievalEngine.retrieve("architecture specification");
    assert(r.totalDocuments > 0, `Expected documents, got 0`);
    assert(r.documents[0].title.toLowerCase().includes("architecture") ||
           r.documents[0].category === "architecture",
      `Top result should be architecture-related, got: ${r.documents[0]?.title}`);
  }));

  // T2 — retrieve by category
  results.push(run(2, "Retrieve by category (engineering)", () => {
    const r = OfficialRetrievalEngine.retrieve("engineering");
    assert(r.totalDocuments > 0, "Expected at least 1 doc for 'engineering'");
    const found = r.documents.find(d => d.category === "engineering");
    assert(!!found, `No engineering-category doc found. Docs: ${r.documents.map(d=>d.category).join(", ")}`);
  }));

  // T3 — retrieve by keyword from metadata
  results.push(run(3, "Retrieve by metadata keyword (sprint)", () => {
    const r = OfficialRetrievalEngine.retrieve("sprint immutability");
    assert(r.totalDocuments > 0, "Expected docs matching 'sprint immutability'");
    const hasMES = r.documents.some(d => d.documentId === "doc-mes-001");
    assert(hasMES, `MES doc not found. Docs returned: ${r.documents.map(d=>d.documentId).join(", ")}`);
  }));

  // T4 — chunks returned for matching docs
  results.push(run(4, "Chunks returned for matching documents", () => {
    const r = OfficialRetrievalEngine.retrieve("memory pipeline cognitive");
    assert(r.totalDocuments > 0, "Expected docs");
    assert(r.totalChunks > 0, `Expected chunks but got 0. Docs: ${r.totalDocuments}`);
    const docWithChunks = r.documents.find(d => d.matchedChunks.length > 0);
    assert(!!docWithChunks, "No document returned any chunks");
  }));

  // T5 — non-existent query returns empty
  results.push(run(5, "Non-existent query returns empty result", () => {
    const r = OfficialRetrievalEngine.retrieve("xyzzy quantum banana teleportation");
    assert(r.totalDocuments === 0, `Expected 0 docs, got ${r.totalDocuments}`);
    assert(r.totalChunks === 0, `Expected 0 chunks, got ${r.totalChunks}`);
    assert(r.topScore === 0, `Expected topScore=0, got ${r.topScore}`);
  }));

  // T6 — score consistency (same query same result)
  results.push(run(6, "Score consistency (same query → same score)", () => {
    const q = "architecture specification memory";
    const r1 = OfficialRetrievalEngine.retrieve(q);
    const r2 = OfficialRetrievalEngine.retrieve(q);
    assert(r1.totalDocuments === r2.totalDocuments,
      `Doc count differs: ${r1.totalDocuments} vs ${r2.totalDocuments}`);
    assert(r1.topScore === r2.topScore,
      `Top score differs: ${r1.topScore} vs ${r2.topScore}`);
    if (r1.documents.length > 0 && r2.documents.length > 0) {
      assert(r1.documents[0].relevanceScore === r2.documents[0].relevanceScore,
        `First doc score differs: ${r1.documents[0].relevanceScore} vs ${r2.documents[0].relevanceScore}`);
    }
  }));

  // T7 — deterministic (identical results)
  results.push(run(7, "Result is deterministic (repeat calls identical)", () => {
    const q = "product vision roadmap";
    const r1 = OfficialRetrievalEngine.retrieve(q);
    const r2 = OfficialRetrievalEngine.retrieve(q);
    const ids1 = r1.documents.map(d => d.documentId).join(",");
    const ids2 = r2.documents.map(d => d.documentId).join(",");
    assert(ids1 === ids2, `Document order differs:\n  r1: ${ids1}\n  r2: ${ids2}`);
  }));

  // T8 — immutability (frozen objects)
  results.push(run(8, "Result objects are frozen (immutability)", () => {
    const r = OfficialRetrievalEngine.retrieve("memory");
    assert(Object.isFrozen(r), "RetrievedKnowledge is not frozen");
    assert(Object.isFrozen(r.documents), "documents array is not frozen");
    if (r.documents.length > 0) {
      assert(Object.isFrozen(r.documents[0]), "First document is not frozen");
      assert(Object.isFrozen(r.documents[0].matchedChunks), "matchedChunks is not frozen");
      assert(Object.isFrozen(r.documents[0].metadata), "metadata is not frozen");
    }
  }));

  // T9 — diagnostics trace recorded
  results.push(run(9, "Diagnostics trace is recorded after retrieval", () => {
    RetrievalDiagnostics.clear();
    OfficialRetrievalEngine.retrieve("engineering specification");
    const trace = RetrievalDiagnostics.getLatest();
    assert(trace !== null, "No trace recorded");
    assert(trace!.query === "engineering specification", `Wrong query in trace: ${trace!.query}`);
    assert(trace!.docsAnalyzed > 0, "docsAnalyzed should be > 0");
    assert(trace!.durationMs >= 0, "durationMs should be >= 0");
    assert(trace!.docEvents.length > 0, "No doc events recorded");
  }));

  // T10 — retrieve by explicit document ID
  results.push(run(10, "Retrieve by explicit document ID", () => {
    const doc = OfficialRetrievalEngine.retrieveById("doc-adr-001");
    assert(doc !== null, "Expected doc for id doc-adr-001");
    assert(doc!.documentId === "doc-adr-001", `Wrong id: ${doc!.documentId}`);
    assert(doc!.relevanceScore === 1.0, `Expected score 1.0, got ${doc!.relevanceScore}`);
  }));

  // ── KeywordMatcher unit tests ─────────────────────────────────────────────

  results.push(run(11, "KeywordMatcher: normalizeText strips punctuation", () => {
    const n = normalizeText("MAS, MES! MemoryOS — Sprint.");
    assert(!n.includes(","), "Comma not stripped");
    assert(!n.includes("!"), "Exclamation not stripped");
    assert(n === n.toLowerCase(), "Not lowercase");
  }));

  results.push(run(12, "KeywordMatcher: scoreAgainstKeywords exact match = 1.0", () => {
    const r = scoreAgainstKeywords("architecture", ["architecture", "specification"]);
    assert(r.score === 1.0, `Expected 1.0, got ${r.score}`);
  }));

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    allPassed: failed === 0,
    passed, failed,
    total: results.length,
    durationMs: Date.now() - t0,
    results,
  };
}