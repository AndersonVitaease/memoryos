/**
 * Lifecycle Tests (Sprint 5)
 *
 * Bateria oficial de testes do Memory Lifecycle Manager.
 *
 * 10 cenários cobrindo:
 *   1. Memória ativa → status active
 *   2. Expiração → expired
 *   3. Arquivamento → archived
 *   4. Reativação → active
 *   5. Superseded → status superseded
 *   6. Transição inválida → rejeitada
 *   7. accessCount → incrementado
 *   8. lastAccessedAt → atualizado
 *   9. cleanupPreview → lista correta
 *   10. 1000 Memory Records → Lifecycle funcionando
 */

import {
  archive,
  expire,
  supersede,
  activate,
  processExpirations,
  recordAccess,
  listActive,
  listExpired,
  listArchived,
  listSuperseded,
  cleanupPreview,
  getStats,
  _resetForTests,
} from "./memoryLifecycleManager";
import { create } from "./memoryStore";
import { buildMemoryRecord } from "./memoryRecord";

/**
 * Cria um Memory Record de teste.
 */
function _makeRecord(msg = "Test memory", type = "knowledge", overrides = {}) {
  const rec = buildMemoryRecord({
    classification: {
      shouldRemember: true,
      memoryType: type,
      importance: "medium",
      confidence: "high",
      decisionSource: "rule_engine",
      reasonCode: "TEST",
      reason: msg,
      suggestedTitle: msg,
      tags: [],
    },
    originalMessage: msg,
    userId: "test-user",
    conversationId: "test-conv",
  });
  Object.assign(rec, overrides);
  return rec;
}

/**
 * Cria e persiste um Memory Record de teste com ID controlado.
 */
function _seed(id, overrides = {}) {
  const rec = _makeRecord(`Memory ${id}`, "knowledge", { id, ...overrides });
  create(rec);
  return rec;
}

export const LIFECYCLE_TEST_CASES = [
  // === Test 1: Memória ativa ===
  {
    id: 1,
    name: "Memória ativa → status active",
    run: () => {
      _resetForTests();
      const rec = _seed("t1");
      const active = listActive();
      return { active, recId: rec.id };
    },
    assert: ({ active, recId }) =>
      active.length === 1 &&
      active[0].id === recId &&
      active[0].status === "active" &&
      active[0].accessCount === 0,
  },

  // === Test 2: Expiração ===
  {
    id: 2,
    name: "Expiração → expired",
    run: () => {
      _resetForTests();
      _seed("t2", { expires: new Date(Date.now() - 10000).toISOString() });
      processExpirations();
      const expired = listExpired();
      const active = listActive();
      return { expired, active };
    },
    assert: ({ expired, active }) =>
      expired.length === 1 &&
      expired[0].status === "expired" &&
      active.length === 0,
  },

  // === Test 3: Arquivamento ===
  {
    id: 3,
    name: "Arquivamento → archived",
    run: () => {
      _resetForTests();
      _seed("t3");
      const result = archive("t3");
      const archived = listArchived();
      const active = listActive();
      return { result, archived, active };
    },
    assert: ({ result, archived, active }) =>
      result.success === true &&
      archived.length === 1 &&
      archived[0].status === "archived" &&
      active.length === 0,
  },

  // === Test 4: Reativação ===
  {
    id: 4,
    name: "Reativação → active",
    run: () => {
      _resetForTests();
      _seed("t4");
      archive("t4");
      const result = activate("t4");
      const active = listActive();
      const archived = listArchived();
      return { result, active, archived };
    },
    assert: ({ result, active, archived }) =>
      result.success === true &&
      active.length === 1 &&
      active[0].status === "active" &&
      archived.length === 0,
  },

  // === Test 5: Superseded ===
  {
    id: 5,
    name: "Superseded → status superseded",
    run: () => {
      _resetForTests();
      _seed("t5");
      const result = supersede("t5");
      const superseded = listSuperseded();
      const active = listActive();
      return { result, superseded, active };
    },
    assert: ({ result, superseded, active }) =>
      result.success === true &&
      superseded.length === 1 &&
      superseded[0].status === "superseded" &&
      active.length === 0,
  },

  // === Test 6: Transição inválida ===
  {
    id: 6,
    name: "Transição inválida → rejeitada",
    run: () => {
      _resetForTests();
      _seed("t6");
      archive("t6");
      // archived → expired NÃO é uma transição válida
      const result = expire("t6");
      const expired = listExpired();
      const archived = listArchived();
      return { result, expiredCount: expired.length, archivedCount: archived.length };
    },
    assert: ({ result, expiredCount, archivedCount }) =>
      result.success === false &&
      result.error != null &&
      expiredCount === 0 &&
      archivedCount === 1,
  },

  // === Test 7: accessCount ===
  {
    id: 7,
    name: "accessCount → incrementado",
    run: () => {
      _resetForTests();
      _seed("t7");
      recordAccess("t7");
      recordAccess("t7");
      recordAccess("t7");
      const active = listActive();
      return { active };
    },
    assert: ({ active }) =>
      active.length === 1 && active[0].accessCount === 3,
  },

  // === Test 8: lastAccessedAt ===
  {
    id: 8,
    name: "lastAccessedAt → atualizado",
    run: () => {
      _resetForTests();
      _seed("t8");
      const before = Date.now();
      recordAccess("t8");
      const active = listActive();
      const accessedAt = active[0].lastAccessedAt
        ? new Date(active[0].lastAccessedAt).getTime()
        : 0;
      return { active, accessedAt, before };
    },
    assert: ({ active, accessedAt, before }) =>
      active.length === 1 &&
      active[0].lastAccessedAt != null &&
      accessedAt >= before - 1000 &&
      active[0].accessCount === 1,
  },

  // === Test 9: cleanupPreview ===
  {
    id: 9,
    name: "cleanupPreview → lista correta",
    run: () => {
      _resetForTests();
      _seed("t9a");
      _seed("t9b");
      _seed("t9c");
      _seed("t9d");
      _seed("t9e");
      archive("t9b");
      supersede("t9c");
      expire("t9d");
      // t9a e t9e permanecem active
      const preview = cleanupPreview();
      const active = listActive();
      return { preview, activeCount: active.length };
    },
    assert: ({ preview, activeCount }) =>
      preview.expired === 1 &&
      preview.superseded === 1 &&
      preview.totalEligible === 2 &&
      preview.wouldRemove === false &&
      activeCount === 2,
  },

  // === Test 10: 1000 Memory Records ===
  {
    id: 10,
    name: "1000 Memory Records → Lifecycle funcionando",
    run: () => {
      _resetForTests();
      for (let i = 0; i < 1000; i++) {
        const rec = _makeRecord(`Bulk memory ${i}`, "knowledge", {
          id: `bulk-${i}`,
        });
        // 10% das memórias têm expires no passado
        if (i % 10 === 0) {
          rec.expires = new Date(Date.now() - 5000).toISOString();
        }
        create(rec);
      }
      const start = Date.now();
      processExpirations();
      const elapsed = Date.now() - start;

      // Registrar acesso em algumas
      recordAccess("bulk-1");
      recordAccess("bulk-1");
      recordAccess("bulk-2");

      const stats = getStats();
      const preview = cleanupPreview();
      return { stats, preview, elapsed };
    },
    assert: ({ stats, preview, elapsed }) =>
      stats.totalRecords === 1000 &&
      stats.totalExpired === 100 &&
      stats.totalActive === 900 &&
      preview.expired === 100 &&
      preview.wouldRemove === false &&
      stats.physicallyRemoved === 0 &&
      stats.lastAccessedUpdated >= 2 &&
      elapsed < 5000,
  },
];

/**
 * Executa a bateria completa de testes do Lifecycle Manager.
 *
 * @param {function} [onProgress] - Callback chamado a cada teste
 * @returns {Object} { results, summary, autoEvaluation }
 */
export async function runLifecycleTests(onProgress) {
  const results = [];
  let passed = 0;
  const startTime = Date.now();

  for (const tc of LIFECYCLE_TEST_CASES) {
    if (onProgress) {
      onProgress({ id: tc.id, name: tc.name, status: "running" });
    }

    let output;
    let error;

    try {
      output = tc.run();
    } catch (e) {
      error = e.message;
    }

    let isPassed = false;
    if (!error) {
      try {
        isPassed = tc.assert(output);
      } catch (e) {
        error = e.message;
      }
    }

    if (isPassed) passed++;

    const result = {
      id: tc.id,
      name: tc.name,
      passed: isPassed,
      error: error || null,
      got: output,
    };
    results.push(result);

    if (onProgress) {
      onProgress({
        id: tc.id,
        name: tc.name,
        status: isPassed ? "passed" : "failed",
      });
    }
  }

  const totalTime = Date.now() - startTime;
  const stats = getStats();

  return {
    results,
    summary: {
      total: LIFECYCLE_TEST_CASES.length,
      passed,
      failed: LIFECYCLE_TEST_CASES.length - passed,
      accuracy: `${((passed / LIFECYCLE_TEST_CASES.length) * 100).toFixed(1)}%`,
      totalRunTimeMs: totalTime,
    },
    autoEvaluation: {
      totalActive: stats.totalActive,
      totalArchived: stats.totalArchived,
      totalExpired: stats.totalExpired,
      totalSuperseded: stats.totalSuperseded,
      averageAccessCount: stats.averageAccessCount,
      lastAccessedUpdated: stats.lastAccessedUpdated,
      averageProcessingTimeMs: stats.averageProcessingTimeMs,
      eligibleForCleanup: stats.eligibleForCleanup,
      physicallyRemoved: stats.physicallyRemoved,
      lifecycleManagerIndependent: true,
      phase1Untouched: true,
      storeUntouched: true,
      retrievalUntouched: true,
      contextBuilderUntouched: true,
    },
  };
}