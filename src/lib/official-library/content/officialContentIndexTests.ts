/**
 * officialContentIndexTests.ts — Sprint EF-42.5
 *
 * 15 deterministic tests for the Content Index pipeline.
 */

import { OfficialDocumentParser } from "./OfficialDocumentParser";
import { ChunkBuilder }           from "./ChunkBuilder";
import { ChunkMetadataBuilder }   from "./ChunkMetadataBuilder";
import { ChunkIndex }             from "./ChunkIndex";
import { ContentIndexer }         from "./ContentIndexer";

// ── Helpers ───────────────────────────────────────────────────────────────────

export interface CITestResult {
  id:         number;
  name:       string;
  passed:     boolean;
  durationMs: number;
  error?:     string;
  detail?:    string;
}

export interface CITestSuiteResult {
  allPassed:  boolean;
  passed:     number;
  failed:     number;
  total:      number;
  durationMs: number;
  results:    CITestResult[];
}

function run(id: number, name: string, fn: () => void): CITestResult {
  const t0 = Date.now();
  try {
    fn();
    return { id, name, passed: true, durationMs: Date.now() - t0 };
  } catch (e) {
    return { id, name, passed: false, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SHORT_DOC = {
  documentId: "test-doc-short",
  title:      "Short Test Document",
  content:    `# Short Test Document\n\nThis is a short document used for testing.\nIt has minimal content.\n`,
};

const MULTI_SECTION_DOC = {
  documentId: "test-doc-sections",
  title:      "Multi Section Document",
  content:    `# Architecture Overview\n\nThe MemoryOS architecture is based on pipeline principles.\n\n## Memory Layer\n\nThe memory layer is responsible for storing all user knowledge persistently.\n\n### Retrieval\n\nRetrieval is deterministic and keyword-based.\n\n## Engineering\n\nAll engineering decisions follow SRP and immutability principles.\n`,
};

function makeLargeDoc(sections: number): { documentId: string; title: string; content: string } {
  let content = `# Large Document\n\n`;
  for (let i = 0; i < sections; i++) {
    content += `## Section ${i + 1}\n\n`;
    content += `This section covers topic ${i + 1} in detail. `.repeat(60) + "\n\n";
  }
  return { documentId: "test-doc-large", title: "Large Document", content };
}

const EMPTY_DOC = {
  documentId: "test-doc-empty",
  title:      "Empty Document",
  content:    "",
};

// ── Test Suite ────────────────────────────────────────────────────────────────

export async function runOfficialContentIndexTests(): Promise<CITestSuiteResult> {
  const t0 = Date.now();
  ChunkIndex.clear();
  const results: CITestResult[] = [];

  // T1 — Parser: content is extracted and cleaned
  results.push(run(1, "Parser extracts and cleans content", () => {
    const parsed = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    assert(parsed.documentId === "test-doc-sections", "Wrong documentId");
    assert(parsed.rawContent.length > 0, "Content should not be empty");
    assert(parsed.wordCount > 0, "Word count should be > 0");
    assert(parsed.lines.length > 0, "Lines should not be empty");
    assert(!parsed.rawContent.includes("\r"), "CR chars should be stripped");
  }));

  // T2 — ChunkBuilder: builds chunks from parsed document
  results.push(run(2, "ChunkBuilder builds chunks from parsed document", () => {
    const parsed = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const chunks = ChunkBuilder.build(parsed);
    assert(chunks.length > 0, "Should produce at least 1 chunk");
    for (const c of chunks) {
      assert(c.id.startsWith("test-doc-sections::chunk::"), `Bad chunk id: ${c.id}`);
      assert(c.documentId === "test-doc-sections", "Wrong documentId on chunk");
      assert(c.content.length > 0, "Chunk content should not be empty");
      assert(c.tokenEstimate > 0, "tokenEstimate should be > 0");
    }
  }));

  // T3 — Chapters preserved
  results.push(run(3, "Chapters are preserved in chunks", () => {
    const parsed = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const chunks = ChunkBuilder.build(parsed);
    const chapters = chunks.map(c => c.chapter);
    assert(chapters.some(ch => ch.length > 0), "No chapter extracted");
  }));

  // T4 — Sections preserved
  results.push(run(4, "Sections are preserved in chunks", () => {
    const parsed = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const chunks = ChunkBuilder.build(parsed);
    const sections = chunks.map(c => c.section);
    assert(sections.some(s => s.length > 0), "No section extracted");
  }));

  // T5 — Order is sequential and zero-based
  results.push(run(5, "Chunk order is sequential and zero-based", () => {
    const parsed = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const chunks = ChunkBuilder.build(parsed);
    for (let i = 0; i < chunks.length; i++) {
      assert(chunks[i].order === i, `Expected order=${i}, got ${chunks[i].order}`);
    }
  }));

  // T6 — tokenEstimate consistent with content length
  results.push(run(6, "tokenEstimate is consistent with content length", () => {
    const parsed = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const chunks = ChunkBuilder.build(parsed);
    for (const c of chunks) {
      const expected = Math.ceil(c.content.length / 4);
      assert(
        Math.abs(c.tokenEstimate - expected) <= 2,
        `tokenEstimate ${c.tokenEstimate} deviates from expected ${expected} for chunk ${c.id}`,
      );
    }
  }));

  // T7 — Empty document handled gracefully
  results.push(run(7, "Empty document is handled gracefully", () => {
    const parsed = OfficialDocumentParser.parse(EMPTY_DOC);
    assert(parsed.wordCount === 0, "Empty doc should have 0 words");
    const chunks = ChunkBuilder.build(parsed);
    assert(chunks.length === 0, `Empty doc should produce 0 chunks, got ${chunks.length}`);
  }));

  // T8 — Large document produces multiple chunks within token limits
  results.push(run(8, "Large document produces multiple chunks within token limits", () => {
    ChunkIndex.clear();
    const large = makeLargeDoc(5);
    const result = ContentIndexer.index(large);
    assert(result.success, `Indexing failed: ${result.error}`);
    assert(result.chunksCreated > 1, `Expected >1 chunks, got ${result.chunksCreated}`);
    const chunks = ChunkIndex.getChunks("test-doc-large");
    for (const c of chunks) {
      assert(c.tokenEstimate <= 900, `Chunk ${c.id} has ${c.tokenEstimate} tokens (>900, too large)`);
    }
  }));

  // T9 — Retrieve chunks by documentId
  results.push(run(9, "Retrieve chunks by documentId", () => {
    ChunkIndex.clear();
    ContentIndexer.index(SHORT_DOC);
    const chunks = ChunkIndex.getChunks("test-doc-short");
    assert(chunks.length > 0, "Expected chunks for test-doc-short");
    assert(chunks.every(c => c.documentId === "test-doc-short"), "Wrong documentId on retrieved chunk");
  }));

  // T10 — Retrieve chunk by chunkId
  results.push(run(10, "Retrieve chunk by chunkId", () => {
    ChunkIndex.clear();
    ContentIndexer.index(SHORT_DOC);
    const all = ChunkIndex.getChunks("test-doc-short");
    assert(all.length > 0, "No chunks");
    const first = all[0];
    const retrieved = ChunkIndex.getChunk(first.id);
    assert(retrieved !== null, `Chunk ${first.id} not found`);
    assert(retrieved!.id === first.id, "Retrieved wrong chunk");
  }));

  // T11 — Determinism (same input → same output)
  results.push(run(11, "Determinism: same input produces same chunks", () => {
    const parsed1 = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const parsed2 = OfficialDocumentParser.parse(MULTI_SECTION_DOC);
    const chunks1 = ChunkBuilder.build(parsed1);
    const chunks2 = ChunkBuilder.build(parsed2);
    assert(chunks1.length === chunks2.length, `Different chunk counts: ${chunks1.length} vs ${chunks2.length}`);
    for (let i = 0; i < chunks1.length; i++) {
      assert(chunks1[i].content === chunks2[i].content, `Chunk ${i} content differs`);
      assert(chunks1[i].id === chunks2[i].id, `Chunk ${i} id differs`);
    }
  }));

  // T12 — Immutability: chunk objects are frozen
  results.push(run(12, "Chunks are frozen (immutable)", () => {
    ChunkIndex.clear();
    ContentIndexer.index(SHORT_DOC);
    const chunks = ChunkIndex.getChunks("test-doc-short");
    assert(chunks.length > 0, "No chunks");
    for (const c of chunks) {
      assert(Object.isFrozen(c), `Chunk ${c.id} is not frozen`);
      assert(Object.isFrozen(c.tags), `Tags of ${c.id} are not frozen`);
    }
  }));

  // T13 — Incremental update (reindex replaces previous chunks)
  results.push(run(13, "Incremental update replaces previous chunks", () => {
    ChunkIndex.clear();
    ContentIndexer.index(SHORT_DOC);
    const before = ChunkIndex.getChunks("test-doc-short").length;
    // Reindex with modified content
    const modified = { ...SHORT_DOC, content: SHORT_DOC.content + "\n\nAdditional paragraph added." };
    ContentIndexer.reindex(modified);
    const after = ChunkIndex.getChunks("test-doc-short");
    assert(after.length > 0, "No chunks after reindex");
    assert(!after.some(c => c.id.includes("::chunk::99")), "Old chunks not replaced");
  }));

  // T14 — Removal (clearDocument)
  results.push(run(14, "clearDocument removes exactly that document's chunks", () => {
    ChunkIndex.clear();
    ContentIndexer.index(SHORT_DOC);
    ContentIndexer.index(MULTI_SECTION_DOC);
    const beforeCount = ChunkIndex.count();
    ChunkIndex.clearDocument("test-doc-short");
    const afterShort = ChunkIndex.getChunks("test-doc-short");
    const afterSections = ChunkIndex.getChunks("test-doc-sections");
    assert(afterShort.length === 0, "test-doc-short should be cleared");
    assert(afterSections.length > 0, "test-doc-sections should still exist");
    assert(ChunkIndex.count() < beforeCount, "Total count should have decreased");
  }));

  // T15 — Statistics
  results.push(run(15, "Stats returns accurate aggregate data", () => {
    ChunkIndex.clear();
    ContentIndexer.index(SHORT_DOC);
    ContentIndexer.index(MULTI_SECTION_DOC);
    const stats = ChunkIndex.stats();
    assert(stats.totalDocuments === 2, `Expected 2 docs, got ${stats.totalDocuments}`);
    assert(stats.totalChunks === ChunkIndex.count(), `Stats chunks (${stats.totalChunks}) != count (${ChunkIndex.count()})`);
    assert(stats.totalTokens > 0, "totalTokens should be > 0");
    assert(stats.documentIds.includes("test-doc-short"), "Missing test-doc-short in documentIds");
    assert(stats.documentIds.includes("test-doc-sections"), "Missing test-doc-sections in documentIds");
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    allPassed: failed === 0,
    passed,
    failed,
    total:     results.length,
    durationMs: Date.now() - t0,
    results,
  };
}