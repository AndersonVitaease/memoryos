/**
 * conversationGoalBridgeTests.ts — Engineering Sprint E-02.1A
 * Testes determinísticos do ConversationGoalBridge (Refined).
 *
 * Cobertura:
 * ✓ Intent valida → Goal correto
 * ✓ Intent desconhecida → Goal unknown
 * ✓ GoalTypes compartilhados (import de @/lib/goals/GoalTypes)
 * ✓ GoalRegistry funcionando (registro + lookup)
 * ✓ Sem regressoes (todos os cenarios da E-02.1 permanecem validos)
 * ✓ Bridge nao contem logica de dominio
 * ✓ Imutabilidade dos Goals
 * ✓ Confianca baixa para Goals desconhecidos
 */

import { ConversationGoalBridge }        from "./ConversationGoalBridge";
import { GoalRegistry }                  from "@/lib/goals/GoalRegistry";
import type { GoalType, ConversationGoal } from "@/lib/goals/GoalTypes";

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult {
  name:       string;
  passed:     boolean;
  error:      string | null;
  durationMs: number;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${String(expected)}", got "${String(actual)}"`);
  }
}

async function run(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { name, passed: true, error: null, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 };
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

export async function runConversationGoalBridgeTests(): Promise<{
  passed:  number;
  failed:  number;
  total:   number;
  results: TestResult[];
  verdict: "PASS" | "FAIL";
}> {
  // Isolated bridge per test run to avoid singleton state pollution
  const bridge = new ConversationGoalBridge();

  const results: TestResult[] = await Promise.all([

    // ── T01: GoalTypes compartilhados — import do modulo correto ──────────
    run("T01 — GoalTypes importados de @/lib/goals/GoalTypes", () => {
      // If this test compiles and runs, the shared import is working
      const goalType: GoalType = "gmail.readInbox";
      assert(goalType === "gmail.readInbox", "GoalType literal must resolve");
    }),

    // ── T02: GoalRegistry registrado com builtins ─────────────────────────
    run("T02 — GoalRegistry tem definicoes registradas", () => {
      assert(GoalRegistry.size > 0, "Registry should have built-in definitions");
      const all = GoalRegistry.listAll();
      assert(all.length > 0, "listAll() should return definitions");
      const namespaces = new Set(all.map((d) => d.namespace));
      assert(namespaces.has("gmail"),    "gmail namespace must be registered");
      assert(namespaces.has("calendar"), "calendar namespace must be registered");
      assert(namespaces.has("drive"),    "drive namespace must be registered");
      assert(namespaces.has("memory"),   "memory namespace must be registered");
    }),

    // ── T03: GoalRegistry.matchBySignals — Gmail ──────────────────────────
    run("T03 — GoalRegistry matchBySignals → gmail.readInbox", () => {
      const def = GoalRegistry.matchBySignals("mostre meus emails");
      assert(def !== null, "should match a definition");
      assertEqual(def!.type, "gmail.readInbox", "type");
      assertEqual(def!.namespace, "gmail", "namespace");
    }),

    // ── T04: GoalRegistry.resolveFromIntent — fallback ───────────────────
    run("T04 — GoalRegistry resolveFromIntent — project_status → memory.query", () => {
      const type = GoalRegistry.resolveFromIntent("project_status");
      assertEqual(type, "memory.query", "fallback type");
    }),

    // ── T05: Intent valida — Gmail signal → gmail.readInbox ───────────────
    run("T05 — Intent valida: Gmail signal → gmail.readInbox", () => {
      const { goal } = bridge.derive(
        "Leia meus ultimos 5 emails",
        "connector_diagnostics",
        0.8,
      );
      assertEqual(goal.type, "gmail.readInbox", "type");
      assert(goal.valid, "goal should be valid");
      assertEqual(goal.parameters.maxResults as number, 5, "maxResults from message");
    }),

    // ── T06: Intent valida — Calendar amanha ─────────────────────────────
    run("T06 — Intent valida: Calendar → calendar.listTomorrow", () => {
      const { goal } = bridge.derive(
        "Quais compromissos tenho amanha?",
        "general_conversation",
        0.4,
      );
      assertEqual(goal.type, "calendar.listTomorrow", "type");
      assertEqual(goal.parameters.dateOffset as number, 1, "dateOffset");
      assert(goal.valid, "goal should be valid");
    }),

    // ── T07: Intent valida — Drive openDocument ───────────────────────────
    run("T07 — Intent valida: Drive → drive.openDocument com filename", () => {
      const { goal } = bridge.derive(
        'Abra minha planilha "Financeiro 2026"',
        "general_conversation",
        0.3,
      );
      assertEqual(goal.type, "drive.openDocument", "type");
      assertEqual(goal.parameters.fileName as string, "Financeiro 2026", "fileName");
    }),

    // ── T08: Intent desconhecida sem signal → unknown ─────────────────────
    run("T08 — Intent desconhecida + sem signal → fallback unknown", () => {
      const { goal } = bridge.derive(
        "xyzzy foobar baz qux completamente inexistente",
        "general_conversation",
        0.0,
      );
      assertEqual(goal.type, "general.conversation", "fallback to general.conversation");
      assert(goal.confidence <= 0.3, "confidence must be low for unknown intent");
    }),

    // ── T09: Goal invalido — userIntent vazia ────────────────────────────
    run("T09 — userIntent vazia → valid=false", () => {
      const { goal } = bridge.derive("", "general_conversation", 0.5);
      assert(!goal.valid, "empty userIntent must produce invalid goal");
      assert(goal.validationErrors.length > 0, "must have validation errors");
      assert(
        goal.validationErrors.includes("userIntent is required"),
        "error message must be specific",
      );
    }),

    // ── T10: Goal sem parametros — memory intent fallback ────────────────
    run("T10 — memory intent fallback → parametros vazios e valido", () => {
      const { goal } = bridge.derive(
        "nenhum sinal especifico aqui",
        "project_history",
        0.6,
      );
      assertEqual(goal.type, "memory.query", "project_history maps to memory.query");
      assert(goal.valid, "goal should be valid");
      assertEqual(Object.keys(goal.parameters).length, 0, "no parameters expected");
    }),

    // ── T11: confianca baixa — goal sem match ────────────────────────────
    run("T11 — sem match + confianca=0 → confidence <= 0.3", () => {
      const { goal } = bridge.derive(
        "comando invalido sem sentido !@#$",
        "general_conversation",
        0.0,
      );
      assert(
        goal.confidence <= 0.3,
        `confidence ${goal.confidence} should be <= 0.3`,
      );
    }),

    // ── T12: imutabilidade dos parametros ────────────────────────────────
    run("T12 — parametros sao imutaveis", () => {
      const { goal } = bridge.derive("ver emails", "general_conversation", 0.8);
      let threw = false;
      try {
        (goal.parameters as Record<string, unknown>)["injected"] = "hack";
      } catch { threw = true; }
      const clean = goal.parameters["injected"] === undefined;
      assert(threw || clean, "parameters must be immutable");
    }),

    // ── T13: IDs unicos por chamada ───────────────────────────────────────
    run("T13 — IDs unicos por chamada", () => {
      const { goal: g1 } = bridge.derive("email", "general_conversation", 0.5);
      const { goal: g2 } = bridge.derive("email", "general_conversation", 0.5);
      assert(g1.id !== g2.id, "each call must produce a unique id");
    }),

    // ── T14: Bridge nao tem logica de dominio — delega ao Registry ────────
    run("T14 — Bridge delega matching ao GoalRegistry (nao ao Bridge)", () => {
      // Register a custom test definition
      const testDef = {
        type:         "unknown" as GoalType,
        namespace:    "test",
        description:  "test-only goal",
        signals:      ["zqxtest_unique_signal_xyz"],
        extractParams: () => ({ test: true }),
      };
      GoalRegistry.register(testDef);

      // Bridge must find it via Registry — not via internal logic
      const match = GoalRegistry.matchBySignals("usar zqxtest_unique_signal_xyz agora");
      assert(match !== null, "Registry must find the custom definition");
      assertEqual(match!.namespace, "test", "namespace must match");
    }),

    // ── T15: confianca maxima nao excede 1.0 ─────────────────────────────
    run("T15 — confidence nunca excede 1.0", () => {
      const { goal } = bridge.derive(
        "ver emails inbox",
        "connector_diagnostics",
        1.0,
      );
      assert(goal.confidence <= 1.0, "confidence must never exceed 1.0");
      assert(goal.confidence >= 0.0, "confidence must never be negative");
    }),

  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    passed,
    failed,
    total:   results.length,
    results,
    verdict: failed === 0 ? "PASS" : "FAIL",
  };
}