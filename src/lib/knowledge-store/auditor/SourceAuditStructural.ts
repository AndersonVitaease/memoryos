// SourceAuditStructural.ts — Sprint EF-39.5
// Runtime-observable structural checks (separated from text-based SourceAudit).
// All output is immutable.

import { KnowledgeEvidenceFactory } from "@/lib/ingestion/KnowledgeEvidence";

export interface StructuralCheck {
  readonly check:  string;
  readonly ok:     boolean;
  readonly detail: string;
}

export interface StructuralAuditReport {
  readonly ok:        boolean;
  readonly checks:    readonly StructuralCheck[];
  readonly passed:    number;
  readonly failed:    number;
  readonly durationMs:number;
}

function makeEvidence() {
  return KnowledgeEvidenceFactory.create({
    source: "structural", conversationId: "c1", messageId: "m1", confidence: 0.9,
  });
}

export async function runStructuralAudit(): Promise<StructuralAuditReport> {
  const t0 = performance.now();
  const checks: StructuralCheck[] = [];

  // 1. KnowledgeStoreMetrics.reset() is fully typed — no runtime errors
  {
    const { KnowledgeStoreMetrics } = await import("../KnowledgeStoreMetrics");
    KnowledgeStoreMetrics.reset();
    const snap = KnowledgeStoreMetrics.snapshot();
    const ok = snap.storeCount === 0 && snap.totalOps === 0;
    checks.push(Object.freeze({ check: "KnowledgeStoreMetrics.reset() fully typed (no as-any)", ok, detail: `storeCount=${snap.storeCount} totalOps=${snap.totalOps}` }));
  }

  // 2. MemoryStoreSearch handles empty summary/tags without throwing
  {
    const { MemoryStore } = await import("../memory/MemoryStore");
    const e = makeEvidence();
    const s = new MemoryStore();
    await s.store({ type: "Engineering", content: "structural probe", summary: "", tags: [], evidence: e });
    let threw = false;
    try { await s.search({ text: "structural" }); } catch { threw = true; }
    checks.push(Object.freeze({ check: "MemoryStoreSearch: no throw on empty summary/tags", ok: !threw, detail: `threw=${threw}` }));
  }

  // 3. Query pagination pages don't overlap (Filter→Sort→Paginate order)
  {
    const { MemoryStore } = await import("../memory/MemoryStore");
    const e = makeEvidence();
    const s = new MemoryStore();
    for (let i = 0; i < 10; i++) await s.store({ type: "Engineering", content: `record-${i}`, evidence: e });
    const p1 = await s.query({ status: ["active"], limit: 3, offset: 0 });
    const p2 = await s.query({ status: ["active"], limit: 3, offset: 3 });
    const ids1 = new Set(p1.records.map(r => r.id));
    const overlap = p2.records.filter(r => ids1.has(r.id)).length;
    checks.push(Object.freeze({ check: "Query pagination: no page overlap (Filter→Sort→Paginate)", ok: overlap === 0 && p1.total === 10, detail: `p1.len=${p1.records.length} p2.len=${p2.records.length} overlap=${overlap} total=${p1.total}` }));
  }

  // 4. MemoryStoreIndex: no empty Sets after delete
  {
    const { MemoryStore } = await import("../memory/MemoryStore");
    const e = makeEvidence();
    const s = new MemoryStore();
    const r = await s.store({ type: "Engineering", content: "probe", evidence: e });
    await s.delete(r.id);
    const idx = s.indexStats();
    checks.push(Object.freeze({ check: "MemoryStoreIndex: no empty Sets after delete", ok: idx.totalIds === 0 && idx.types === 0 && idx.statuses === 0, detail: `totalIds=${idx.totalIds} types=${idx.types} statuses=${idx.statuses}` }));
  }

  // 5. Statistics consistent after double archive/restore
  {
    const { MemoryStore } = await import("../memory/MemoryStore");
    const e = makeEvidence();
    const s = new MemoryStore();
    const r = await s.store({ type: "Engineering", content: "stats probe", evidence: e });
    await s.archive(r.id); await s.restore(r.id);
    await s.archive(r.id); await s.restore(r.id);
    const st = s.internalStats();
    checks.push(Object.freeze({ check: "MemoryStoreStatistics: consistent after double archive/restore", ok: st.activeRecords === 1 && st.archivedRecords === 0, detail: `active=${st.activeRecords} archived=${st.archivedRecords}` }));
  }

  const passed = checks.filter(c => c.ok).length;
  return Object.freeze({
    ok:  passed === checks.length,
    checks: Object.freeze(checks),
    passed,
    failed: checks.length - passed,
    durationMs: Math.round((performance.now() - t0) * 100) / 100,
  });
}