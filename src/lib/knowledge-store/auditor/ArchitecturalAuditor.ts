// ArchitecturalAuditor.ts — Sprint EF-39.4
// SRP: audit the MemoryStore implementation state. Never modifies state. Read-only.
// All output is deeply immutable (Object.freeze).

import { MemoryStore } from "../memory/MemoryStore";
import { KnowledgeEvidenceFactory } from "@/lib/ingestion/KnowledgeEvidence";

// ── Re-export ArchitectureScore from dedicated engine (EF-39.6) ───────────────
export type { ArchitectureScore } from "../certification/ArchitectureScoreEngine";
export { ArchitectureScoreEngine } from "../certification/ArchitectureScoreEngine";
import { ArchitectureScoreEngine as _ASE, type ScoreEvidence } from "../certification/ArchitectureScoreEngine";
// Backward-compat alias — dashboard previously called computeArchitectureScore directly
export function computeArchitectureScore(params: ScoreEvidence) {
  return _ASE.compute(params);
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface AuditEvidence {
  readonly check:       string;
  readonly ok:          boolean;
  readonly detail:      string;
  readonly measuredAt:  number;
}

export interface IntegrityReport {
  readonly ok:        boolean;
  readonly checks:    readonly AuditEvidence[];
  readonly passed:    number;
  readonly failed:    number;
  readonly durationMs:number;
}

export interface ImmutabilityReport {
  readonly ok:        boolean;
  readonly checks:    readonly AuditEvidence[];
  readonly passed:    number;
  readonly failed:    number;
  readonly durationMs:number;
}

export interface PerformanceBenchmark {
  readonly operation:  string;
  readonly iterations: number;
  readonly avgMs:      number;
  readonly minMs:      number;
  readonly maxMs:      number;
  readonly medianMs:   number;
  readonly p95Ms:      number;
  readonly p99Ms:      number;
  readonly stdDev:     number;
  readonly opsPerSec:  number;
}

export interface PerformanceReport {
  readonly benchmarks: readonly PerformanceBenchmark[];
  readonly durationMs: number;
}

export interface SOLIDCheck {
  readonly principle:  string;
  readonly verdict:    "PASS" | "WARNING" | "FAIL";
  readonly rationale:  string;
  readonly evidence:   string;
}

export interface SOLIDReport {
  readonly ok:        boolean;
  readonly checks:    readonly SOLIDCheck[];
  readonly durationMs:number;
}

export interface FullAuditReport {
  readonly integrity:    IntegrityReport;
  readonly immutability: ImmutabilityReport;
  readonly performance:  PerformanceReport;
  readonly solid:        SOLIDReport;
  readonly totalDurationMs: number;
  readonly allPassed:    boolean;
  readonly executedAt:   number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function ev(check: string, ok: boolean, detail: string): AuditEvidence {
  return Object.freeze({ check, ok, detail, measuredAt: Date.now() });
}

const E = KnowledgeEvidenceFactory.create({
  source: "auditor", conversationId: "audit-run", messageId: "audit-msg", confidence: 0.99,
});

const DRAFT = {
  type: "Engineering" as const,
  content: "Architectural audit probe record.",
  summary: "Audit probe",
  tags: ["audit", "probe"],
  evidence: E,
};

// ── Integrity Auditor ──────────────────────────────────────────────────────────
async function runIntegrityAudit(): Promise<IntegrityReport> {
  const t0 = performance.now();
  const checks: AuditEvidence[] = [];

  // 1. All public objects returned are frozen
  {
    const s = new MemoryStore();
    const sr = await s.store(DRAFT);
    checks.push(ev("StoreResult is frozen",          Object.isFrozen(sr),          `Object.isFrozen(storeResult) = ${Object.isFrozen(sr)}`));
    checks.push(ev("KnowledgeRecord is frozen",      Object.isFrozen(sr.record),   `Object.isFrozen(record) = ${Object.isFrozen(sr.record)}`));
    const qr = await s.query({ status: ["active"] });
    checks.push(ev("QueryResult is frozen",          Object.isFrozen(qr),          `Object.isFrozen(queryResult) = ${Object.isFrozen(qr)}`));
    checks.push(ev("QueryResult.records is frozen",  Object.isFrozen(qr.records),  `Object.isFrozen(records[]) = ${Object.isFrozen(qr.records)}`));
    const snap = s.takeSnapshot("integrity-audit");
    checks.push(ev("Snapshot is frozen",             Object.isFrozen(snap),        `Object.isFrozen(snapshot) = ${Object.isFrozen(snap)}`));
    const h = await s.health();
    checks.push(ev("HealthResult is frozen",         Object.isFrozen(h),           `Object.isFrozen(healthResult) = ${Object.isFrozen(h)}`));
    const er = await s.exists(sr.id);
    checks.push(ev("ExistsResult is frozen",         Object.isFrozen(er),          `Object.isFrozen(existsResult) = ${Object.isFrozen(er)}`));
    const sr2 = await s.search({ text: "audit" });
    checks.push(ev("SearchResult is frozen",         Object.isFrozen(sr2),         `Object.isFrozen(searchResult) = ${Object.isFrozen(sr2)}`));
    const dr = await s.delete(sr.id);
    checks.push(ev("DeleteResult is frozen",         Object.isFrozen(dr),          `Object.isFrozen(deleteResult) = ${Object.isFrozen(dr)}`));
  }

  // 2. Index consistency: record count == index count
  {
    const s = new MemoryStore();
    await s.store(DRAFT); await s.store(DRAFT); await s.store(DRAFT);
    const idx = s.indexStats();
    const match = idx.totalIds === s.recordCount();
    checks.push(ev("Index count matches recordCount", match, `indexStats.totalIds=${idx.totalIds} recordCount=${s.recordCount()}`));
  }

  // 3. No empty Sets in index after delete
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    await s.delete(r.id);
    const idx = s.indexStats();
    const clean = idx.totalIds === 0 && idx.types === 0 && idx.statuses === 0;
    checks.push(ev("Index has no empty sets after delete", clean,
      `totalIds=${idx.totalIds} types=${idx.types} statuses=${idx.statuses}`));
  }

  // 4. No archived record in active index
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    await s.archive(r.id);
    const q = await s.query({ status: ["active"] });
    const absent = !q.records.some(rec => rec.id === r.id);
    checks.push(ev("Archived record absent from active query", absent,
      `active records count=${q.records.length}, archived record present=${!absent}`));
    const archived = s.listArchived();
    const present = archived.some(e => e.record.id === r.id);
    checks.push(ev("Archived record present in listArchived()", present,
      `listArchived() length=${archived.length}`));
  }

  // 5. Version history consistent
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    await s.update(r.id, { content: "v2" });
    await s.update(r.id, { content: "v3" });
    const hist = s.getVersionHistory(r.id);
    const ok = hist.length === 3 && hist[0].version === 1 && hist[2].version === 3;
    checks.push(ev("Version history has 3 entries after 2 updates", ok,
      `hist.length=${hist.length} v1=${hist[0]?.version} v3=${hist[2]?.version}`));
    const frozen = hist.every(v => Object.isFrozen(v));
    checks.push(ev("All version history entries are frozen", frozen,
      `all frozen=${frozen}`));
  }

  // 6. Delete removes version history
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    await s.delete(r.id);
    const hist = s.getVersionHistory(r.id);
    checks.push(ev("Version history cleared after delete", hist.length === 0,
      `getVersionHistory after delete = length ${hist.length}`));
  }

  // 7. Archive removes from index status=active, adds to status=archived
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    await s.archive(r.id);
    const idxBefore = s.indexStats();
    await s.restore(r.id);
    const idxAfter = s.indexStats();
    // Statuses should not accumulate empty sets
    checks.push(ev("Index statuses do not accumulate empty sets", idxAfter.statuses <= 2,
      `statuses after restore=${idxAfter.statuses}`));
  }

  // 8. Statistics consistent after full lifecycle
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    let st = s.internalStats();
    const a1 = st.activeRecords === 1 && st.archivedRecords === 0;
    await s.archive(r.id);
    st = s.internalStats();
    const a2 = st.activeRecords === 0 && st.archivedRecords === 1;
    await s.restore(r.id);
    st = s.internalStats();
    const a3 = st.activeRecords === 1 && st.archivedRecords === 0;
    await s.delete(r.id);
    st = s.internalStats();
    const a4 = st.activeRecords === 0 && st.deletedCount === 1;
    const ok = a1 && a2 && a3 && a4;
    checks.push(ev("Statistics consistent across full lifecycle", ok,
      `store→ok=${a1} archive→ok=${a2} restore→ok=${a3} delete→ok=${a4}`));
  }

  // 9. Query determinism: same input → same order
  {
    const s = new MemoryStore();
    await s.store({ ...DRAFT, content: "Alpha record" });
    await s.store({ ...DRAFT, content: "Beta record" });
    await s.store({ ...DRAFT, content: "Gamma record" });
    const q1 = await s.query({ status: ["active"] });
    const q2 = await s.query({ status: ["active"] });
    const same = q1.records.every((r, i) => r.id === q2.records[i]?.id);
    checks.push(ev("Query is deterministic (same order on repeat)", same,
      `first[0]=${q1.records[0]?.id?.slice(-6)} second[0]=${q2.records[0]?.id?.slice(-6)}`));
  }

  // 10. Snapshot integrity
  {
    const s = new MemoryStore();
    await s.store(DRAFT); await s.store(DRAFT);
    const snap = s.takeSnapshot("check");
    const ok = snap.recordCount === 2 && Object.isFrozen(snap) && Object.isFrozen(snap.records);
    checks.push(ev("Snapshot recordCount matches store, fully frozen", ok,
      `snap.recordCount=${snap.recordCount} isFrozen(snap)=${Object.isFrozen(snap)} isFrozen(records)=${Object.isFrozen(snap.records)}`));
  }

  // 11. No orphan references — delete cleans all structures
  {
    const s = new MemoryStore();
    const r = await s.store(DRAFT);
    await s.archive(r.id);
    await s.delete(r.id);
    const g = await s.get(r.id);
    const e = await s.exists(r.id);
    const arch = s.listArchived();
    const hist = s.getVersionHistory(r.id);
    const ok = g.record === undefined && !e.exists && !arch.some(x => x.record.id === r.id) && hist.length === 0;
    checks.push(ev("No orphan references after delete (get/exists/listArchived/history all clean)", ok,
      `get=${g.record === undefined} exists=${e.exists} archiveEntry=${arch.some(x => x.record.id === r.id)} hist=${hist.length}`));
  }

  const passed = checks.filter(c => c.ok).length;
  return Object.freeze({
    ok: passed === checks.length,
    checks: Object.freeze(checks),
    passed,
    failed: checks.length - passed,
    durationMs: Math.round((performance.now() - t0) * 100) / 100,
  });
}

// ── Immutability Auditor ───────────────────────────────────────────────────────
async function runImmutabilityAudit(): Promise<ImmutabilityReport> {
  const t0 = performance.now();
  const checks: AuditEvidence[] = [];

  const s = new MemoryStore();
  const sr = await s.store(DRAFT);

  // StoreResult
  checks.push(ev("StoreResult frozen", Object.isFrozen(sr), `isFrozen=${Object.isFrozen(sr)}`));
  // KnowledgeRecord
  checks.push(ev("KnowledgeRecord frozen", Object.isFrozen(sr.record), `isFrozen=${Object.isFrozen(sr.record)}`));
  // tags frozen
  checks.push(ev("KnowledgeRecord.tags frozen", Object.isFrozen(sr.record?.tags), `isFrozen=${Object.isFrozen(sr.record?.tags)}`));

  // UpdateResult
  const ur = await s.update(sr.id, { content: "updated content" });
  checks.push(ev("UpdateResult frozen", Object.isFrozen(ur), `isFrozen=${Object.isFrozen(ur)}`));
  checks.push(ev("Updated KnowledgeRecord frozen", Object.isFrozen(ur.record), `isFrozen=${Object.isFrozen(ur.record)}`));

  // ArchiveResult
  const ar = await s.archive(sr.id);
  checks.push(ev("ArchiveResult frozen", Object.isFrozen(ar), `isFrozen=${Object.isFrozen(ar)}`));
  checks.push(ev("Archived KnowledgeRecord frozen", Object.isFrozen(ar.record), `isFrozen=${Object.isFrozen(ar.record)}`));

  // ArchiveEntry in listArchived
  const entries = s.listArchived();
  const entry = entries[0];
  checks.push(ev("ArchiveEntry frozen", Object.isFrozen(entry), `isFrozen=${Object.isFrozen(entry)}`));

  // RestoreResult
  const rr = await s.restore(sr.id);
  checks.push(ev("RestoreResult frozen", Object.isFrozen(rr), `isFrozen=${Object.isFrozen(rr)}`));
  checks.push(ev("Restored KnowledgeRecord frozen", Object.isFrozen(rr.record), `isFrozen=${Object.isFrozen(rr.record)}`));

  // QueryResult
  const qr = await s.query({ status: ["active"] });
  checks.push(ev("QueryResult frozen", Object.isFrozen(qr), `isFrozen=${Object.isFrozen(qr)}`));
  checks.push(ev("QueryResult.records frozen", Object.isFrozen(qr.records), `isFrozen=${Object.isFrozen(qr.records)}`));

  // SearchResult
  const srch = await s.search({ text: "audit" });
  checks.push(ev("SearchResult frozen", Object.isFrozen(srch), `isFrozen=${Object.isFrozen(srch)}`));
  checks.push(ev("SearchResult.records frozen", Object.isFrozen(srch.records), `isFrozen=${Object.isFrozen(srch.records)}`));
  checks.push(ev("SearchResult.scores frozen", Object.isFrozen(srch.scores), `isFrozen=${Object.isFrozen(srch.scores)}`));

  // Snapshot
  const snap = s.takeSnapshot("immutability");
  checks.push(ev("Snapshot frozen", Object.isFrozen(snap), `isFrozen=${Object.isFrozen(snap)}`));
  checks.push(ev("Snapshot.records frozen", Object.isFrozen(snap.records), `isFrozen=${Object.isFrozen(snap.records)}`));

  // HealthResult
  const h = await s.health();
  checks.push(ev("HealthResult frozen", Object.isFrozen(h), `isFrozen=${Object.isFrozen(h)}`));

  // VersionHistory entries
  const hist = s.getVersionHistory(sr.id);
  const histFrozen = hist.every(v => Object.isFrozen(v));
  checks.push(ev("All VersionHistory entries frozen", histFrozen, `all frozen=${histFrozen} count=${hist.length}`));

  // Statistics snapshot
  const stats = s.internalStats();
  checks.push(ev("Statistics snapshot frozen", Object.isFrozen(stats), `isFrozen=${Object.isFrozen(stats)}`));

  // ExistsResult
  const er = await s.exists(sr.id);
  checks.push(ev("ExistsResult frozen", Object.isFrozen(er), `isFrozen=${Object.isFrozen(er)}`));

  // DeleteResult
  const dr = await s.delete(sr.id);
  checks.push(ev("DeleteResult frozen", Object.isFrozen(dr), `isFrozen=${Object.isFrozen(dr)}`));

  const passed = checks.filter(c => c.ok).length;
  return Object.freeze({
    ok: passed === checks.length,
    checks: Object.freeze(checks),
    passed,
    failed: checks.length - passed,
    durationMs: Math.round((performance.now() - t0) * 100) / 100,
  });
}

// ── Performance Auditor — delegates to PerformanceBenchmarkEngine (EF-39.6) ───
async function runPerformanceAudit(): Promise<PerformanceReport> {
  const t0 = performance.now();
  const { PerformanceBenchmarkEngine } = await import("../certification/PerformanceBenchmarkEngine");
  const { benchmarkSeedRecords, benchmarkIterations } = (await import("../certification/CertificationConfig")).CertificationConfig;

  const bench = PerformanceBenchmarkEngine.benchmark.bind(PerformanceBenchmarkEngine);

  // store()
  const storeStore = new MemoryStore();
  const storeBench = await bench("store()", () => storeStore.store(DRAFT));

  // update()
  const updateStore = new MemoryStore();
  const ur0 = await updateStore.store(DRAFT);
  const updateBench = await bench("update()", () => updateStore.update(ur0.id, { content: `v${Date.now()}` }));

  // query()
  const queryStore = new MemoryStore();
  for (let i = 0; i < benchmarkSeedRecords; i++) await queryStore.store(DRAFT);
  const queryBench = await bench("query()", () => queryStore.query({ status: ["active"] }));

  // search()
  const searchStore = new MemoryStore();
  for (let i = 0; i < benchmarkSeedRecords; i++) await searchStore.store({ ...DRAFT, content: `Search probe record number ${i}` });
  const searchBench = await bench("search()", () => searchStore.search({ text: "probe" }));

  // archive() / restore()
  const arcStore = new MemoryStore();
  const arcR = await arcStore.store(DRAFT);
  let arcArchived = false;
  const archiveBench = await bench("archive()", async () => {
    if (!arcArchived) { await arcStore.archive(arcR.id); arcArchived = true; }
    else              { await arcStore.restore(arcR.id); arcArchived = false; }
  });

  // snapshot()
  const snapStore = new MemoryStore();
  for (let i = 0; i < 20; i++) await snapStore.store(DRAFT);
  const snapBench = await bench("snapshot()", () => Promise.resolve(snapStore.takeSnapshot()));

  // version()
  const verStore = new MemoryStore();
  const vr0 = await verStore.store(DRAFT);
  const verBench = await bench("getVersionHistory()", () => Promise.resolve(verStore.getVersionHistory(vr0.id)));

  // delete()
  const delStore = new MemoryStore();
  const delIds: string[] = [];
  for (let i = 0; i < benchmarkIterations; i++) { const r = await delStore.store(DRAFT); delIds.push(r.id); }
  let delIdx = 0;
  const deleteBench = await bench("delete()", () => delStore.delete(delIds[delIdx++ % benchmarkIterations]));

  return Object.freeze({
    benchmarks: Object.freeze([
      storeBench, updateBench, archiveBench, queryBench,
      searchBench, snapBench, verBench, deleteBench,
    ]),
    durationMs: Math.round((performance.now() - t0) * 100) / 100,
  });
}

// ── SOLID Auditor — delegates to modular sub-auditors (EF-39.6) ───────────────
async function runSOLIDAudit(): Promise<SOLIDReport> {
  const { runSOLIDAudit: run } = await import("../certification/solid/SOLIDAuditor");
  return run();
}

// ── Main entry ─────────────────────────────────────────────────────────────────
export async function runFullAudit(): Promise<FullAuditReport> {
  const t0 = performance.now();

  const [integrityResult, immutabilityResult, performanceResult, solidResult] = await Promise.all([
    runIntegrityAudit(),
    runImmutabilityAudit(),
    runPerformanceAudit(),
    runSOLIDAudit(),
  ]);

  const allPassed =
    integrityResult.ok && immutabilityResult.ok && performanceResult.benchmarks.length > 0 && solidResult.ok;

  return Object.freeze({
    integrity:    integrityResult,
    immutability: immutabilityResult,
    performance:  performanceResult,
    solid:        solidResult,
    totalDurationMs: Math.round((performance.now() - t0) * 100) / 100,
    allPassed,
    executedAt: Date.now(),
  });
}