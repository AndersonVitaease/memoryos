/**
 * officialLibraryIndexTests.ts — Sprint EF-41
 *
 * Test suite for the Official Library Index Engine.
 * Tests cover all 8 required scenarios:
 *
 *   T1 — Initial indexing
 *   T2 — Incremental update
 *   T3 — Full rebuild
 *   T4 — Duplicate document detection
 *   T5 — Checksum validation
 *   T6 — Version registration
 *   T7 — Document relationships
 *   T8 — Index integrity
 *
 * All tests run in-memory — no network, no file system, no LLM.
 */

import type { OfficialDocumentMeta, OfficialChunk } from "../OfficialLibraryTypes";
import { MemoryAuthority, MemorySourceType } from "../OfficialLibraryTypes";
import { OfficialLibraryIndexerEF41 } from "./OfficialLibraryIndexer";
import { OfficialLibraryIndex }       from "./OfficialLibraryIndex";
import { OfficialLibraryRegistry }    from "./OfficialLibraryRegistry";
import { OfficialDocumentScanner }    from "./OfficialDocumentScanner";
import { computeChecksum }            from "./OfficialDocumentMetadata";

// ── Test infrastructure ───────────────────────────────────────────────────────

export interface TestResult {
  readonly id:        string;
  readonly name:      string;
  readonly passed:    boolean;
  readonly durationMs: number;
  readonly detail?:   string;
  readonly error?:    string;
}

export interface TestSuiteResult {
  readonly passed:     number;
  readonly failed:     number;
  readonly total:      number;
  readonly durationMs: number;
  readonly results:    readonly TestResult[];
  readonly allPassed:  boolean;
}

async function runTest(
  id: string,
  name: string,
  fn: () => Promise<void> | void,
): Promise<TestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return Object.freeze({ id, name, passed: true, durationMs: Date.now() - t0 });
  } catch (e) {
    return Object.freeze({
      id, name, passed: false,
      durationMs: Date.now() - t0,
      error: (e as Error).message,
    });
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<OfficialDocumentMeta> = {}): OfficialDocumentMeta {
  return {
    documentId:   "doc-001",
    documentName: "Memory Architecture Specification",
    version:      "v1.0",
    createdAt:    "2026-01-01T00:00:00.000Z",
    updatedAt:    "2026-07-01T00:00:00.000Z",
    deprecated:   false,
    supersedes:   null,
    supersededBy: null,
    authority:    MemoryAuthority.OFFICIAL,
    tags:         ["architecture", "core"],
    path:         "src/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md",
    ...overrides,
  };
}

function makeChunk(docId: string, n = 0): OfficialChunk {
  return {
    id:           `${docId}-chunk-${n}`,
    documentId:   docId,
    documentName: `Document ${docId}`,
    version:      "v1.0",
    chapter:      "1",
    section:      `1.${n}`,
    title:        `Section ${n}`,
    content:      `Content of section ${n} for document ${docId}. This is a meaningful paragraph.`,
    summary:      `Summary of section ${n}.`,
    authority:    MemoryAuthority.OFFICIAL,
    sourceType:   MemorySourceType.OFFICIAL_LIBRARY,
    createdAt:    "2026-01-01T00:00:00.000Z",
    updatedAt:    "2026-07-01T00:00:00.000Z",
    tags:         ["architecture"],
    metadata:     {},
  };
}

function makeMetaSet(): { metas: OfficialDocumentMeta[]; chunks: OfficialChunk[] } {
  const metas: OfficialDocumentMeta[] = [
    makeMeta({ documentId: "doc-001", documentName: "Memory Architecture Specification", version: "v1.0" }),
    makeMeta({ documentId: "doc-002", documentName: "Memory Engineering Specification", version: "v2.0", tags: ["engineering"] }),
    makeMeta({ documentId: "doc-003", documentName: "Memory Vision", version: "v1.1", tags: ["vision"] }),
  ];
  const chunks: OfficialChunk[] = [
    makeChunk("doc-001", 0), makeChunk("doc-001", 1),
    makeChunk("doc-002", 0),
    makeChunk("doc-003", 0),
  ];
  return { metas, chunks };
}

// ── Test suite ────────────────────────────────────────────────────────────────

export async function runOfficialLibraryIndexTests(): Promise<TestSuiteResult> {
  const t0 = Date.now();
  const results: TestResult[] = [];

  // T1 — Initial indexing
  results.push(await runTest("T1", "Initial indexing — builds index from scratch", async () => {
    OfficialLibraryIndexerEF41.reset();
    const { metas, chunks } = makeMetaSet();
    const result = await OfficialLibraryIndexerEF41.rebuildFull(metas, chunks);

    assert(result.success, `rebuildFull should succeed, got error: ${result.error}`);
    assert(result.totalDocuments === 3, `Expected 3 documents, got ${result.totalDocuments}`);
    assert(result.addedCount === 3, `Expected addedCount=3, got ${result.addedCount}`);
    assert(OfficialLibraryIndex.size === 3, `Index should have 3 entries, got ${OfficialLibraryIndex.size}`);

    const doc = OfficialLibraryIndex.get("doc-001");
    assert(doc !== null, "doc-001 should be in the index");
    assert(doc!.title === "Memory Architecture Specification", `Unexpected title: ${doc!.title}`);
    assert(doc!.chunkCount === 2, `Expected 2 chunks for doc-001, got ${doc!.chunkCount}`);
    assert(doc!.checksum.length > 0, "Checksum should be non-empty");
    assert(doc!.status === "active", `Expected status=active, got ${doc!.status}`);
  }));

  // T2 — Incremental update
  results.push(await runTest("T2", "Incremental update — re-indexes only changed documents", async () => {
    OfficialLibraryIndexerEF41.reset();
    const { metas, chunks } = makeMetaSet();
    await OfficialLibraryIndexerEF41.rebuildFull(metas, chunks);

    // Modify doc-002 (change version → checksum will differ)
    const updatedMetas = metas.map(m =>
      m.documentId === "doc-002"
        ? { ...m, version: "v2.1", updatedAt: "2026-07-21T00:00:00.000Z" }
        : m
    );

    const updateResult = await OfficialLibraryIndexerEF41.updateIncremental(updatedMetas, chunks);
    assert(updateResult.updatedIds.length === 1, `Expected 1 updated doc, got ${updateResult.updatedIds.length}`);
    assert(updateResult.updatedIds[0] === "doc-002", `Expected doc-002 to be updated`);
    assert(updateResult.removedIds.length === 0, `Expected 0 removed, got ${updateResult.removedIds.length}`);

    const doc = OfficialLibraryIndex.get("doc-002");
    assert(doc!.version === "v2.1", `Expected updated version v2.1, got ${doc!.version}`);
  }));

  // T3 — Full rebuild
  results.push(await runTest("T3", "Full rebuild — replaces entire index", async () => {
    OfficialLibraryIndexerEF41.reset();
    const { metas, chunks } = makeMetaSet();
    await OfficialLibraryIndexerEF41.rebuildFull(metas, chunks);
    assert(OfficialLibraryIndex.size === 3, "Should have 3 docs after first build");

    // Rebuild with only 2 documents
    const subset = { metas: metas.slice(0, 2), chunks };
    const result2 = await OfficialLibraryIndexerEF41.rebuildFull(subset.metas, subset.chunks);
    assert(result2.success, "Second rebuild should succeed");
    assert(OfficialLibraryIndex.size === 2, `After rebuild with 2 docs, index should have 2, got ${OfficialLibraryIndex.size}`);
    assert(OfficialLibraryIndex.get("doc-003") === null, "doc-003 should be gone after rebuild");
    assert(OfficialLibraryIndex.get("doc-001") !== null, "doc-001 should still be present");
  }));

  // T4 — Duplicate document detection
  results.push(await runTest("T4", "Duplicate detection — index holds only one record per id", async () => {
    OfficialLibraryIndexerEF41.reset();
    const dupMetas: OfficialDocumentMeta[] = [
      makeMeta({ documentId: "doc-dup", documentName: "Duplicate Doc A" }),
      makeMeta({ documentId: "doc-dup", documentName: "Duplicate Doc B" }), // same id
    ];
    const dupChunks = [makeChunk("doc-dup", 0)];

    await OfficialLibraryIndexerEF41.rebuildFull(dupMetas, dupChunks);
    // Index upserts by id — last write wins; size must still be 1
    assert(OfficialLibraryIndex.size === 1, `Index should deduplicate to 1 entry, got ${OfficialLibraryIndex.size}`);

    const integrity = OfficialLibraryIndex.checkIntegrity();
    assert(integrity.duplicateIds.length === 0, "Integrity check should report 0 duplicates (index deduplicates on insert)");
  }));

  // T5 — Checksum validation
  results.push(await runTest("T5", "Checksum validation — same input produces same checksum", async () => {
    const input = "doc-001|Memory Architecture Specification|v1.0|src/docs/MAS.md|architecture,core";
    const c1 = computeChecksum(input);
    const c2 = computeChecksum(input);
    assert(c1 === c2, `Checksum is non-deterministic: ${c1} vs ${c2}`);
    assert(c1.length === 8, `Checksum should be 8 hex chars, got length ${c1.length}`);

    const c3 = computeChecksum(input.replace("v1.0", "v1.1"));
    assert(c1 !== c3, "Different input should produce different checksum");

    OfficialLibraryIndexerEF41.reset();
    const meta = makeMeta({ documentId: "doc-cs", tags: ["architecture", "core"] });
    const chunks = [makeChunk("doc-cs", 0)];
    await OfficialLibraryIndexerEF41.rebuildFull([meta], chunks);

    const doc = OfficialLibraryIndex.get("doc-cs");
    assert(doc !== null, "Indexed doc should be present");
    assert(doc!.checksum.length > 0, "Indexed doc must have a checksum");
    // Verify needsReindex returns false when checksum hasn't changed
    assert(!OfficialLibraryIndexerEF41.needsReindex(doc!), "Document should not need reindex if unchanged");
  }));

  // T6 — Version registration
  results.push(await runTest("T6", "Version registration — registry tracks all versions", async () => {
    OfficialLibraryIndexerEF41.reset();
    const metas: OfficialDocumentMeta[] = [
      makeMeta({ documentId: "doc-v1", documentName: "MAS v1", version: "v1.0" }),
      makeMeta({ documentId: "doc-v2", documentName: "MAS v2", version: "v2.0" }),
      makeMeta({ documentId: "doc-v3", documentName: "MAS v3", version: "v2.0" }), // same version, different doc
    ];
    const chunks = [makeChunk("doc-v1", 0), makeChunk("doc-v2", 0), makeChunk("doc-v3", 0)];

    await OfficialLibraryIndexerEF41.rebuildFull(metas, chunks);

    const versions = OfficialLibraryIndex.getVersions();
    assert(versions.includes("v1.0"), "Index should contain version v1.0");
    assert(versions.includes("v2.0"), "Index should contain version v2.0");
    assert(versions.length === 2, `Expected 2 unique versions, got ${versions.length}: ${versions.join(", ")}`);

    const v2Docs = OfficialLibraryIndex.query({ version: "v2.0" });
    assert(v2Docs.length === 2, `Expected 2 docs with version v2.0, got ${v2Docs.length}`);

    const timeline = OfficialLibraryRegistry.getVersionTimeline("doc-v1");
    assert(timeline.length === 1, `Expected 1 timeline entry for doc-v1, got ${timeline.length}`);
    assert(timeline[0].version === "v1.0", `Expected version v1.0 in timeline, got ${timeline[0].version}`);
  }));

  // T7 — Document relationships
  results.push(await runTest("T7", "Document relationships — supersedes/superseded-by tracked", async () => {
    OfficialLibraryIndexerEF41.reset();
    const metas: OfficialDocumentMeta[] = [
      makeMeta({ documentId: "doc-old", documentName: "Old Spec", version: "v1.0", supersededBy: "doc-new" }),
      makeMeta({ documentId: "doc-new", documentName: "New Spec", version: "v2.0", supersedes: "doc-old" }),
    ];
    const chunks = [makeChunk("doc-old", 0), makeChunk("doc-new", 0)];

    await OfficialLibraryIndexerEF41.rebuildFull(metas, chunks);

    const oldDoc = OfficialLibraryIndex.get("doc-old");
    const newDoc = OfficialLibraryIndex.get("doc-new");

    assert(oldDoc !== null, "doc-old should be indexed");
    assert(newDoc !== null, "doc-new should be indexed");

    const oldRels = oldDoc!.relatedDocuments;
    assert(oldRels.length >= 1, `doc-old should have at least 1 relationship, got ${oldRels.length}`);
    const supersededByRel = oldRels.find(r => r.relationshipType === "superseded-by");
    assert(supersededByRel !== undefined, "doc-old should have superseded-by relationship");
    assert(supersededByRel!.targetId === "doc-new", `Expected targetId=doc-new, got ${supersededByRel!.targetId}`);

    const newRels = newDoc!.relatedDocuments;
    const supersedesRel = newRels.find(r => r.relationshipType === "supersedes");
    assert(supersedesRel !== undefined, "doc-new should have supersedes relationship");
    assert(supersedesRel!.targetId === "doc-old", `Expected targetId=doc-old, got ${supersedesRel!.targetId}`);

    const relatedToNew = OfficialLibraryIndex.getRelated("doc-new");
    assert(relatedToNew.length >= 1, "getRelated('doc-new') should return doc-old");

    const registryRels = OfficialLibraryRegistry.getRelationships("doc-new");
    assert(registryRels.includes("doc-old"), "Registry should track doc-old as related to doc-new");
  }));

  // T8 — Index integrity
  results.push(await runTest("T8", "Index integrity — checkIntegrity passes on clean build", async () => {
    OfficialLibraryIndexerEF41.reset();
    const { metas, chunks } = makeMetaSet();
    await OfficialLibraryIndexerEF41.rebuildFull(metas, chunks);

    const integrity = OfficialLibraryIndex.checkIntegrity();
    assert(integrity.isIntact, `Integrity check failed: ${JSON.stringify({ dup: integrity.duplicateIds, missing: integrity.missingChecksums })}`);
    assert(integrity.duplicateIds.length === 0, `Expected 0 duplicates, got: ${integrity.duplicateIds.join(", ")}`);
    assert(integrity.missingChecksums.length === 0, `Expected 0 missing checksums`);
    assert(integrity.totalDocuments === 3, `Expected 3 docs in integrity report, got ${integrity.totalDocuments}`);
    assert(integrity.activeDocuments === 3, `Expected 3 active docs, got ${integrity.activeDocuments}`);
    assert(integrity.orphanRelationships.length === 0, `Expected 0 orphan relationships, got: ${integrity.orphanRelationships.join(", ")}`);

    // Verify stats are consistent
    const stats = OfficialLibraryIndex.stats();
    assert(stats.totalDocuments === 3, `Stats totalDocuments should be 3, got ${stats.totalDocuments}`);
    assert(stats.totalChunks >= 3, `Stats totalChunks should be >= 3, got ${stats.totalChunks}`);
    assert(stats.builtAt !== null, "Stats builtAt should be set");
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return Object.freeze({
    passed,
    failed,
    total:      results.length,
    durationMs: Date.now() - t0,
    results:    Object.freeze(results),
    allPassed:  failed === 0,
  });
}