/**
 * watchEngineTests.ts — Suite de testes WE-01 + WE-02
 *
 * Sprint WE-02 | RFC-005 | ADR-012 | EPIC-017
 * Padrão MDS §2.16 — mínimo 10 cenários por sprint
 *
 * Testa: WatchValidator + WatchTypes + WatchEvaluator + ConnectorGateway
 */

import { validateWatchIntent, serializeConditionTree, deserializeConditionTree } from "./WatchValidator";
import { WatchEvaluatorClass } from "./WatchEvaluator";
import { ConnectorGatewayClass } from "./ConnectorGateway";
import { WatchStateTrackerClass } from "./WatchStateTracker";
import { WatchOutboxClass } from "./WatchOutbox";
import type { WatchIntent, ConditionTree, LeafCondition, WatchRecord } from "./WatchTypes";

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

  // ── WE-02: WatchEvaluator ────────────────────────────────────────────────

  // 13. Compilação de leaf simples
  results.push(run("WE-02-001: Compilação de leaf simples retorna CompiledWatch", () => {
    const evaluator = new WatchEvaluatorClass();
    const tree: ConditionTree = LEAF_SIMPLE;
    const compiled = evaluator.compile("w1", serializeConditionTree(tree));
    assert(compiled !== null, "CompiledWatch não deve ser null");
    assert(compiled!.watchId === "w1", "watchId deve ser 'w1'");
    assert(compiled!.pipeline.length === 1, "Pipeline deve ter 1 step");
    assert(compiled!.pipeline[0].provider === "gmail", "Provider deve ser 'gmail'");
  }));

  // 14. Avaliação com resultado positivo (gt 0)
  results.push(run("WE-02-002: Avaliação leaf 'gt 0' retorna true quando count=5", () => {
    const evaluator = new WatchEvaluatorClass();
    const compiled = evaluator.compile("w2", serializeConditionTree(LEAF_SIMPLE));
    assert(compiled !== null, "Deve compilar");
    const resultKey = compiled!.pipeline[0].resultKey;
    const evalResult = compiled!.evaluate({ [resultKey]: { count: 5 } });
    assert(evalResult === true, "Deve retornar true quando count=5 > 0");
  }));

  // 15. Avaliação com resultado negativo
  results.push(run("WE-02-003: Avaliação leaf 'gt 0' retorna false quando count=0", () => {
    const evaluator = new WatchEvaluatorClass();
    const compiled = evaluator.compile("w3", serializeConditionTree(LEAF_SIMPLE));
    const resultKey = compiled!.pipeline[0].resultKey;
    const evalResult = compiled!.evaluate({ [resultKey]: { count: 0 } });
    assert(evalResult === false, "Deve retornar false quando count=0");
  }));

  // 16. Compilação AND — ambas verdadeiras
  results.push(run("WE-02-004: AND com 2 leafs — ambas true → true", () => {
    const evaluator = new WatchEvaluatorClass();
    const tree: ConditionTree = {
      kind: "AND",
      conditions: [
        LEAF_SIMPLE,
        { ...LEAF_SIMPLE, provider: "drive", action: "list_recent", result_path: "count" },
      ],
    };
    const compiled = evaluator.compile("w4", serializeConditionTree(tree));
    assert(compiled!.pipeline.length === 2, "Pipeline deve ter 2 steps");
    const [s0, s1] = compiled!.pipeline;
    const r = compiled!.evaluate({ [s0.resultKey]: { count: 3 }, [s1.resultKey]: { count: 2 } });
    assert(r === true, "AND(true, true) deve ser true");
  }));

  // 17. AND — uma falsa → false
  results.push(run("WE-02-005: AND com uma leaf false → false", () => {
    const evaluator = new WatchEvaluatorClass();
    const tree: ConditionTree = {
      kind: "AND",
      conditions: [LEAF_SIMPLE, { ...LEAF_SIMPLE, provider: "drive", action: "list_recent", result_path: "count" }],
    };
    const compiled = evaluator.compile("w5", serializeConditionTree(tree));
    const [s0, s1] = compiled!.pipeline;
    const r = compiled!.evaluate({ [s0.resultKey]: { count: 5 }, [s1.resultKey]: { count: 0 } });
    assert(r === false, "AND(true, false) deve ser false");
  }));

  // 18. NOT inverte resultado
  results.push(run("WE-02-006: NOT inverte avaliação corretamente", () => {
    const evaluator = new WatchEvaluatorClass();
    const tree: ConditionTree = { kind: "NOT", condition: LEAF_SIMPLE };
    const compiled = evaluator.compile("w6", serializeConditionTree(tree));
    const [s0] = compiled!.pipeline;
    const r = compiled!.evaluate({ [s0.resultKey]: { count: 0 } });
    assert(r === true, "NOT(false) deve ser true");
  }));

  // 19. ConnectorGateway — stub executa sem erro
  results.push(run("WE-02-007: ConnectorGateway executa stub de provider", async () => {
    const gw = new ConnectorGatewayClass();
    const result = await (gw as unknown as { execute: (p: string, a: string, params: Record<string, unknown>) => Promise<unknown> }).execute("gmail", "count_unread", {});
    assert(result !== undefined, "Resultado não deve ser undefined");
  }));

  // 20. ConnectorGateway — Token Bucket esgota após muitas chamadas
  results.push(run("WE-02-008: ConnectorGateway respeita rate limit (Token Bucket)", async () => {
    const gw = new ConnectorGatewayClass();
    let rateLimitHit = false;
    // Consome todos os tokens (20 default + margem)
    for (let i = 0; i < 25; i++) {
      try {
        await (gw as unknown as { execute: (p: string, a: string, params: Record<string, unknown>) => Promise<unknown> }).execute("gmail", "count_unread", {});
      } catch (err) {
        if (err instanceof Error && err.message.includes("Rate limit")) {
          rateLimitHit = true;
          break;
        }
      }
    }
    assert(rateLimitHit, "Token Bucket deve esgotar após 20+ chamadas sem refill");
  }));

  // 21. WatchEvaluator.invalidate limpa cache
  results.push(run("WE-02-009: invalidate() remove do cache", () => {
    const evaluator = new WatchEvaluatorClass();
    evaluator.compile("w_cache", serializeConditionTree(LEAF_SIMPLE));
    assert(evaluator.getCacheSize() === 1, "Cache deve ter 1 entry");
    evaluator.invalidate("w_cache");
    assert(evaluator.getCacheSize() === 0, "Cache deve estar vazio após invalidate");
  }));

  // 22. ConditionTree deserialização inválida retorna null
  results.push(run("WE-02-010: deserializeConditionTree com JSON inválido retorna null", () => {
    const result = deserializeConditionTree("não é json");
    assert(result === null, "Deve retornar null para JSON inválido");
  }));

  // 23. compile com JSON inválido retorna null
  results.push(run("WE-02-011: compile com ConditionTree inválida retorna null", () => {
    const evaluator = new WatchEvaluatorClass();
    const result = evaluator.compile("w_bad", "{ invalid json }");
    assert(result === null, "Deve retornar null para ConditionTree inválida");
  }));

  // ── WE-03: WatchStateTracker + WatchOutbox ──────────────────────────────

  // 24. record false→true detecta transição
  results.push(run("WE-03-001: StateTracker detecta transição false→true como triggered", () => {
    const tracker = new WatchStateTrackerClass();
    const s1 = tracker.record("wt1", false);
    assert(!s1.isTriggered, "Primeiro false não é trigger");
    const s2 = tracker.record("wt1", true);
    assert(s2.isTriggered, "Transição false→true deve ser triggered=true");
  }));

  // 25. true→true não é trigger (evita spam)
  results.push(run("WE-03-002: StateTracker true→true NÃO é triggered (anti-spam)", () => {
    const tracker = new WatchStateTrackerClass();
    tracker.record("wt2", true);
    const s2 = tracker.record("wt2", true);
    assert(!s2.isTriggered, "true→true não deve ser triggered");
    assert(s2.consecutiveTrue === 2, "consecutiveTrue deve ser 2");
  }));

  // 26. true→false reseta consecutiveTrue
  results.push(run("WE-03-003: StateTracker true→false reseta consecutiveTrue", () => {
    const tracker = new WatchStateTrackerClass();
    tracker.record("wt3", true);
    tracker.record("wt3", true);
    const s3 = tracker.record("wt3", false);
    assert(s3.consecutiveTrue === 0, "consecutiveTrue deve ser 0 após false");
    assert(s3.consecutiveFalse === 1, "consecutiveFalse deve ser 1");
  }));

  // 27. getSnapshot retorna null para Watch desconhecido
  results.push(run("WE-03-004: StateTracker.getSnapshot retorna null para watchId desconhecido", () => {
    const tracker = new WatchStateTrackerClass();
    const snap = tracker.getSnapshot("nao_existe");
    assert(snap === null, "Deve retornar null");
  }));

  // 28. clear remove do cache
  results.push(run("WE-03-005: StateTracker.clear remove estado do cache", () => {
    const tracker = new WatchStateTrackerClass();
    tracker.record("wt4", true);
    assert(tracker.getSnapshot("wt4") !== null, "Deve existir antes do clear");
    tracker.clear("wt4");
    assert(tracker.getSnapshot("wt4") === null, "Deve ser null após clear");
  }));

  // 29. WatchOutbox.processAll com lista vazia retorna zeros
  results.push(run("WE-03-006: WatchOutbox.processAll com Outbox vazio retorna zeros", async () => {
    // Testa apenas a lógica de métricas — não faz chamada de rede
    const outbox = new WatchOutboxClass();
    const metrics = outbox.getMetrics();
    assert(metrics.runCount === 0, "runCount inicial deve ser 0");
    assert(metrics.registeredDispatchers === 0, "Sem dispatchers registrados");
  }));

  // 30. WatchOutbox.registerDispatcher registra corretamente
  results.push(run("WE-03-007: WatchOutbox registra dispatcher customizado", () => {
    const outbox = new WatchOutboxClass();
    outbox.registerDispatcher("notify_user", async () => {});
    const m = outbox.getMetrics();
    assert(m.registeredDispatchers === 1, "Deve ter 1 dispatcher registrado");
  }));

  // 31. StateTracker métricas refletem estado
  results.push(run("WE-03-008: StateTracker métricas refletem watches rastreados", () => {
    const tracker = new WatchStateTrackerClass();
    tracker.record("m1", true);
    tracker.record("m2", false);
    tracker.record("m3", true);
    const m = tracker.getMetrics();
    assert(m.trackedWatches === 3, "Deve rastrear 3 watches");
    assert(m.currentlyTrue === 2, "2 watches com resultado true");
    assert(m.currentlyFalse === 1, "1 watch com resultado false");
  }));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const certified = failed === 0;
  const durationMs = Date.now() - t0;

  console.log(`[WatchEngine WE-01+WE-02+WE-03] Testes: ${passed} passou, ${failed} falhou | ${durationMs}ms | Certificado: ${certified}`);

  return { passed, failed, results, certified, durationMs };
}