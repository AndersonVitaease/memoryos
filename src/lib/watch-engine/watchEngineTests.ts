/**
 * watchEngineTests.ts — Suite de testes WE-01
 *
 * Sprint WE-01 | RFC-005 | ADR-012 | EPIC-017
 * Padrão MDS §2.16 — mínimo 10 cenários
 *
 * Testa: WatchValidator + WatchTypes (serialização/deserialização)
 * WE-02 adicionará testes de WatchEvaluator e WatchScheduler.
 * WE-03 adicionará testes de WatchOutbox e WatchStateTracker.
 */

import { validateWatchIntent, serializeConditionTree, deserializeConditionTree } from "./WatchValidator";
import type { WatchIntent, ConditionTree, LeafCondition } from "./WatchTypes";

interface TestResult {
  scenario: string;
  passed: boolean;
  error?: string;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LEAF_SIMPLE: LeafCondition = {
  kind: "leaf",
  provider: "gmail",
  action: "count_unread",
  params: { label: "INBOX" },
  result_path: "count",
  comparator: "gt",
  value: 0,
};

const VALID_INTENT_SIMPLE: WatchIntent = {
  name: "Monitor Gmail",
  condition: LEAF_SIMPLE,
  frequency_minutes: 15,
  priority: "normal",
  on_trigger: { type: "notify_user" },
};

// ── Runner ────────────────────────────────────────────────────────────────────

function run(scenario: string, fn: () => void): TestResult {
  try {
    fn();
    return { scenario, passed: true };
  } catch (err) {
    return { scenario, passed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Cenários ──────────────────────────────────────────────────────────────────

export function runWatchEngineTests(): { passed: number; failed: number; results: TestResult[]; certified: boolean; durationMs: number } {
  const t0 = Date.now();
  const results: TestResult[] = [];

  // 1. Intent simples válido
  results.push(run("WE-01-001: Intent simples válido passa na validação", () => {
    const r = validateWatchIntent(VALID_INTENT_SIMPLE);
    assert(r.valid, `Erros: ${r.errors.join(", ")}`);
    assert(r.errors.length === 0, "Não deve ter erros");
  }));

  // 2. Name vazio deve falhar
  results.push(run("WE-01-002: Intent com name vazio é rejeitado", () => {
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, name: "" });
    assert(!r.valid, "Deveria ser inválido");
    assert(r.errors.some((e) => e.includes("name")), "Erro deve mencionar 'name'");
  }));

  // 3. frequency_minutes < 1 deve falhar
  results.push(run("WE-01-003: frequency_minutes=0 é rejeitado", () => {
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, frequency_minutes: 0 });
    assert(!r.valid, "Deveria ser inválido");
    assert(r.errors.some((e) => e.includes("frequency_minutes")), "Erro deve mencionar frequency_minutes");
  }));

  // 4. priority inválida deve falhar
  results.push(run("WE-01-004: priority inválida é rejeitada", () => {
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, priority: "ultra" as never });
    assert(!r.valid, "Deveria ser inválido");
    assert(r.errors.some((e) => e.includes("priority")), "Erro deve mencionar 'priority'");
  }));

  // 5. ConditionTree AND com 2 filhas válidas
  results.push(run("WE-01-005: ConditionTree AND com 2 leafs válidas", () => {
    const tree: ConditionTree = {
      kind: "AND",
      conditions: [LEAF_SIMPLE, { ...LEAF_SIMPLE, provider: "calendar" }],
    };
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, condition: tree });
    assert(r.valid, `Erros: ${r.errors.join(", ")}`);
  }));

  // 6. ConditionTree OR com 2 filhas válidas
  results.push(run("WE-01-006: ConditionTree OR com 2 leafs válidas", () => {
    const tree: ConditionTree = {
      kind: "OR",
      conditions: [LEAF_SIMPLE, { ...LEAF_SIMPLE, provider: "drive" }],
    };
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, condition: tree });
    assert(r.valid, `Erros: ${r.errors.join(", ")}`);
  }));

  // 7. ConditionTree NOT com 1 filha válida
  results.push(run("WE-01-007: ConditionTree NOT com 1 leaf válida", () => {
    const tree: ConditionTree = { kind: "NOT", condition: LEAF_SIMPLE };
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, condition: tree });
    assert(r.valid, `Erros: ${r.errors.join(", ")}`);
  }));

  // 8. AND com menos de 2 filhas deve falhar
  results.push(run("WE-01-008: AND com 1 filha é rejeitado", () => {
    const tree: ConditionTree = { kind: "AND", conditions: [LEAF_SIMPLE] };
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, condition: tree });
    assert(!r.valid, "Deveria ser inválido");
    assert(r.errors.some((e) => e.includes("AND")), "Erro deve mencionar 'AND'");
  }));

  // 9. Serialização e deserialização da ConditionTree (round-trip)
  results.push(run("WE-01-009: Serialização round-trip da ConditionTree", () => {
    const tree: ConditionTree = {
      kind: "AND",
      conditions: [
        LEAF_SIMPLE,
        { kind: "NOT", condition: { ...LEAF_SIMPLE, provider: "drive", comparator: "eq", value: 0 } },
      ],
    };
    const serialized = serializeConditionTree(tree);
    assert(typeof serialized === "string" && serialized.length > 0, "Serialização deve retornar string não-vazia");
    const deserialized = deserializeConditionTree(serialized);
    assert(deserialized !== null, "Deserialização não deve retornar null");
    assert(deserialized!.kind === "AND", "Kind deve ser AND após round-trip");
  }));

  // 10. Leaf com comparator inválido deve falhar
  results.push(run("WE-01-010: Leaf com comparator inválido é rejeitada", () => {
    const badLeaf: ConditionTree = { ...LEAF_SIMPLE, comparator: "invalid" as never };
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, condition: badLeaf });
    assert(!r.valid, "Deveria ser inválido");
    assert(r.errors.some((e) => e.includes("comparator")), "Erro deve mencionar 'comparator'");
  }));

  // 11. Árvore aninhada complexa (AND > OR > NOT > leaf)
  results.push(run("WE-01-011: Árvore aninhada complexa AND > OR > NOT > leaf é válida", () => {
    const tree: ConditionTree = {
      kind: "AND",
      conditions: [
        {
          kind: "OR",
          conditions: [
            LEAF_SIMPLE,
            { kind: "NOT", condition: { ...LEAF_SIMPLE, provider: "calendar" } },
          ],
        },
        { ...LEAF_SIMPLE, provider: "drive", comparator: "exists" },
      ],
    };
    const r = validateWatchIntent({ ...VALID_INTENT_SIMPLE, condition: tree });
    assert(r.valid, `Erros: ${r.errors.join(", ")}`);
  }));

  // 12. on_trigger tipo inválido deve falhar
  results.push(run("WE-01-012: on_trigger com type inválido é rejeitado", () => {
    const r = validateWatchIntent({
      ...VALID_INTENT_SIMPLE,
      on_trigger: { type: "send_sms" as never },
    });
    assert(!r.valid, "Deveria ser inválido");
    assert(r.errors.some((e) => e.includes("on_trigger")), "Erro deve mencionar 'on_trigger'");
  }));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const certified = failed === 0;
  const durationMs = Date.now() - t0;

  console.log(`[WatchEngine WE-01] Testes: ${passed} passou, ${failed} falhou | ${durationMs}ms | Certificado: ${certified}`);

  return { passed, failed, results, certified, durationMs };
}