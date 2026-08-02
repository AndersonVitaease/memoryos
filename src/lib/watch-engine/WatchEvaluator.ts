/**
 * WatchEvaluator.ts — Compilador de ConditionTree para função JS pura
 *
 * Sprint WE-02 | RFC-005 | ADR-012 | EPIC-017 FEAT-111
 *
 * Responsabilidade única: compilar uma ConditionTree em uma função pura
 * avaliável sem chamadas externas, e executar o pipeline de providers.
 *
 * Regras ADR-012:
 * - NUNCA usa eval() — funções são compostas recursivamente em tempo de compilação
 * - Compilação determinística: mesma árvore → mesma função
 * - Falha de um provider nunca propaga para outros (isolamento por try-catch)
 * - Resultados de providers são acessados via result_path (dot-notation)
 */

import type {
  ConditionTree,
  LeafCondition,
  CompiledWatch,
  ExecutionStep,
  WatchRecord,
} from "./WatchTypes";
import { deserializeConditionTree } from "./WatchValidator";
import { connectorGateway } from "./ConnectorGateway";

// ── Acesso seguro por dot-notation ────────────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// ── Comparação determinística ─────────────────────────────────────────────────

function compare(actual: unknown, comparator: string, expected: unknown): boolean {
  switch (comparator) {
    case "eq":           return actual === expected;
    case "neq":          return actual !== expected;
    case "gt":           return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":          return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":           return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":          return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "contains":     return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    case "not_contains": return typeof actual === "string" && typeof expected === "string" && !actual.includes(expected);
    case "matches":      return typeof actual === "string" && typeof expected === "string" && new RegExp(expected).test(actual);
    case "exists":       return actual !== undefined && actual !== null;
    case "not_exists":   return actual === undefined || actual === null;
    default:             return false;
  }
}

// ── Compilador recursivo — NUNCA usa eval() ───────────────────────────────────

type EvalFn = (results: Readonly<Record<string, unknown>>) => boolean;

function compileNode(node: ConditionTree, stepCounter: { n: number }): {
  fn: EvalFn;
  steps: ExecutionStep[];
} {
  if (node.kind === "leaf") {
    const stepId = `step_${stepCounter.n++}`;
    const resultKey = `${node.provider}__${node.action}__${stepId}`;
    const leaf = node as LeafCondition;

    const step: ExecutionStep = Object.freeze({
      stepId,
      provider:  leaf.provider,
      action:    leaf.action,
      params:    Object.freeze({ ...leaf.params }),
      resultKey,
    });

    // Função pura — fecha sobre leaf (imutável após freeze)
    const fn: EvalFn = (results) => {
      const providerResult = results[resultKey];
      if (providerResult === undefined) return false; // provider não executou
      const actual = getByPath(providerResult, leaf.result_path);
      return compare(actual, leaf.comparator, leaf.value);
    };

    return { fn, steps: [step] };
  }

  if (node.kind === "AND") {
    const children = node.conditions.map((c) => compileNode(c, stepCounter));
    const fns = children.map((c) => c.fn);
    const steps = children.flatMap((c) => c.steps);
    const fn: EvalFn = (results) => fns.every((f) => f(results));
    return { fn, steps };
  }

  if (node.kind === "OR") {
    const children = node.conditions.map((c) => compileNode(c, stepCounter));
    const fns = children.map((c) => c.fn);
    const steps = children.flatMap((c) => c.steps);
    const fn: EvalFn = (results) => fns.some((f) => f(results));
    return { fn, steps };
  }

  if (node.kind === "NOT") {
    const child = compileNode(node.condition, stepCounter);
    const fn: EvalFn = (results) => !child.fn(results);
    return { fn, steps: child.steps };
  }

  // kind desconhecido — retorna false sem lançar
  return { fn: () => false, steps: [] };
}

// ── WatchEvaluator ────────────────────────────────────────────────────────────

export interface EvaluationResult {
  readonly watchId:         string;
  readonly result:          boolean;
  readonly triggered:       boolean;     // houve transição false → true
  readonly providerResults: Readonly<Record<string, unknown>>;
  readonly durationMs:      number;
  readonly error?:          string;
}

class WatchEvaluatorClass {
  private _compiledCache = new Map<string, CompiledWatch>();

  // ── compile ────────────────────────────────────────────────────────────────

  compile(watchId: string, conditionTreeJson: string): CompiledWatch | null {
    // Cache hit: re-usa se o JSON não mudou
    const cached = this._compiledCache.get(watchId);
    if (cached && cached.compiledAt > 0) {
      // Verificação simples: compiledAt é recente (< 10min) e cache não stale
      if (Date.now() - cached.compiledAt < 600_000) return cached;
    }

    const tree = deserializeConditionTree(conditionTreeJson);
    if (!tree) {
      console.error(`[WatchEvaluator] Falha ao deserializar ConditionTree para watch ${watchId}`);
      return null;
    }

    try {
      const counter = { n: 0 };
      const { fn, steps } = compileNode(tree, counter);
      const compiled: CompiledWatch = Object.freeze({
        watchId,
        pipeline:    Object.freeze(steps),
        evaluate:    fn,
        compiledAt:  Date.now(),
      });
      this._compiledCache.set(watchId, compiled);
      return compiled;
    } catch (err) {
      console.error(`[WatchEvaluator] Erro na compilação do watch ${watchId}:`, err);
      return null;
    }
  }

  // ── evaluate ───────────────────────────────────────────────────────────────

  async evaluate(watch: WatchRecord): Promise<EvaluationResult> {
    const t0 = Date.now();

    const compiled = this.compile(watch.id, watch.condition_tree);
    if (!compiled) {
      return Object.freeze({
        watchId:         watch.id,
        result:          false,
        triggered:       false,
        providerResults: {},
        durationMs:      Date.now() - t0,
        error:           "Falha na compilação da ConditionTree",
      });
    }

    // Executa os steps do pipeline via ConnectorGateway
    const providerResults: Record<string, unknown> = {};
    await Promise.all(
      compiled.pipeline.map(async (step) => {
        try {
          const result = await connectorGateway.execute(
            step.provider,
            step.action,
            step.params as Record<string, unknown>,
          );
          providerResults[step.resultKey] = result;
        } catch (err) {
          // Falha de um provider não propaga para os outros
          console.warn(`[WatchEvaluator] Provider ${step.provider}.${step.action} falhou:`, err);
          providerResults[step.resultKey] = undefined;
        }
      }),
    );

    let result = false;
    try {
      result = compiled.evaluate(Object.freeze(providerResults));
    } catch (err) {
      console.error(`[WatchEvaluator] Erro na avaliação do watch ${watch.id}:`, err);
    }

    // Detecta transição false → true
    const previousResult = watch.last_evaluation_result ?? false;
    const triggered = !previousResult && result;

    return Object.freeze({
      watchId:         watch.id,
      result,
      triggered,
      providerResults: Object.freeze(providerResults),
      durationMs:      Date.now() - t0,
    });
  }

  // ── invalidate cache ───────────────────────────────────────────────────────

  invalidate(watchId: string): void {
    this._compiledCache.delete(watchId);
  }

  getCacheSize(): number {
    return this._compiledCache.size;
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WATCH_EVALUATOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WatchEvaluatorClass();
}

export const watchEvaluator: WatchEvaluatorClass = (
  globalThis as unknown as Record<string, WatchEvaluatorClass>
)[_KEY];

export { WatchEvaluatorClass };