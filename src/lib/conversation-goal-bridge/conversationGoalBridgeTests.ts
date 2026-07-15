/**
 * conversationGoalBridgeTests.ts — Engineering Sprint E-02.1
 * Testes determinísticos do ConversationGoalBridge.
 *
 * Cobertura:
 * ✓ pergunta comum
 * ✓ comando Gmail
 * ✓ comando Calendar
 * ✓ comando Drive
 * ✓ comando desconhecido
 * ✓ Goal invalido
 * ✓ Goal sem parametros
 * ✓ confianca baixa
 */

import { ConversationGoalBridge } from "./ConversationGoalBridge";
import type { ConversationGoal } from "./ConversationGoalBridge";

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult {
  name:     string;
  passed:   boolean;
  error:    string | null;
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
  passed: number;
  failed: number;
  total:  number;
  results: TestResult[];
  verdict: "PASS" | "FAIL";
}> {
  const bridge = new ConversationGoalBridge(); // isolated instance per test run

  const results: TestResult[] = await Promise.all([

    // ── T01: pergunta comum (general conversation) ─────────────────────────
    run("T01 — pergunta comum → general.conversation", () => {
      const { goal } = bridge.derive(
        "Oi, tudo bem?",
        "general_conversation",
        0.0,
      );
      assertEqual(goal.type, "general.conversation", "type");
      assert(goal.valid, "goal should be valid");
      assert(goal.confidence >= 0 && goal.confidence <= 1, "confidence in range");
    }),

    // ── T02: comando Gmail — leitura de inbox ─────────────────────────────
    run("T02 — Gmail readInbox → gmail.readInbox", () => {
      const { goal } = bridge.derive(
        "Leia meus ultimos 5 emails",
        "connector_diagnostics",
        0.8,
      );
      assertEqual(goal.type, "gmail.readInbox", "type");
      assert(goal.valid, "goal should be valid");
      assertEqual(goal.parameters.maxResults as number, 5, "maxResults");
      assert(goal.confidence > 0.3, "confidence should be above low threshold");
    }),

    // ── T03: comando Gmail — quantidade padrao ─────────────────────────────
    run("T03 — Gmail sem quantidade → maxResults=10 default", () => {
      const { goal } = bridge.derive(
        "Mostre minha caixa de entrada",
        "general_conversation",
        0.5,
      );
      assertEqual(goal.type, "gmail.readInbox", "type");
      assertEqual(goal.parameters.maxResults as number, 10, "default maxResults");
    }),

    // ── T04: comando Calendar — amanha ────────────────────────────────────
    run("T04 — Calendar listTomorrow → calendar.listTomorrow", () => {
      const { goal } = bridge.derive(
        "Quais compromissos tenho amanha?",
        "general_conversation",
        0.4,
      );
      assertEqual(goal.type, "calendar.listTomorrow", "type");
      assertEqual(goal.parameters.dateOffset as number, 1, "dateOffset");
      assert(goal.valid, "goal should be valid");
    }),

    // ── T05: comando Calendar — hoje ──────────────────────────────────────
    run("T05 — Calendar listToday → calendar.listToday", () => {
      const { goal } = bridge.derive(
        "Ver minha agenda de hoje",
        "general_conversation",
        0.5,
      );
      assertEqual(goal.type, "calendar.listToday", "type");
      assertEqual(goal.parameters.dateOffset as number, 0, "dateOffset");
    }),

    // ── T06: comando Drive — abrir documento ──────────────────────────────
    run("T06 — Drive openDocument → drive.openDocument", () => {
      const { goal } = bridge.derive(
        'Abra minha planilha "Financeiro 2026"',
        "general_conversation",
        0.3,
      );
      assertEqual(goal.type, "drive.openDocument", "type");
      assertEqual(goal.parameters.fileName as string, "Financeiro 2026", "fileName from quotes");
      assert(goal.valid, "goal should be valid");
    }),

    // ── T07: comando Drive — sem nome entre aspas ─────────────────────────
    run("T07 — Drive openDocument sem aspas → fileName null", () => {
      const { goal } = bridge.derive(
        "Abra meu documento",
        "general_conversation",
        0.3,
      );
      assertEqual(goal.type, "drive.openDocument", "type");
      assertEqual(goal.parameters.fileName as null, null, "fileName should be null");
    }),

    // ── T08: comando desconhecido ─────────────────────────────────────────
    run("T08 — mensagem desconhecida → fallback por intent", () => {
      const { goal } = bridge.derive(
        "xyzzy foobar baz qux 123",
        "general_conversation",
        0.0,
      );
      assertEqual(goal.type, "general.conversation", "fallback type");
      assert(goal.confidence <= 0.3, "low confidence for unknown");
      assert(goal.valid, "should still be valid structurally");
    }),

    // ── T09: Goal invalido — userIntent vazia ─────────────────────────────
    run("T09 — userIntent vazia → valid=false", () => {
      const { goal } = bridge.derive(
        "",   // empty
        "general_conversation",
        0.5,
      );
      assert(!goal.valid, "empty userIntent should produce invalid goal");
      assert(goal.validationErrors.length > 0, "should have validation errors");
    }),

    // ── T10: Goal sem parametros esperados — memory.query ─────────────────
    run("T10 — memory.query → parameters vazio mas valido", () => {
      const { goal } = bridge.derive(
        "Lembro de ter decidido algo sobre arquitetura",
        "project_history",
        0.6,
      );
      // memory.query ou general.conversation — ambos sao validos sem params obrigatorios
      assert(["memory.query", "general.conversation"].includes(goal.type), "type should be memory-related");
      assert(goal.valid, "goal should be valid even with empty parameters");
    }),

    // ── T11: confianca baixa — goal tipo unknown ──────────────────────────
    run("T11 — cognitiveConfidence=0, sem match → confidence <= 0.3", () => {
      const { goal } = bridge.derive(
        "comando completamente invalido e sem sentido!@#$",
        "general_conversation",
        0.0,
      );
      assert(goal.confidence <= 0.3, `confidence ${goal.confidence} should be <= 0.3 for unknown goal`);
    }),

    // ── T12: imutabilidade dos parametros ────────────────────────────────
    run("T12 — parametros sao imutaveis (Object.freeze)", () => {
      const { goal } = bridge.derive(
        "Leia meus emails",
        "general_conversation",
        0.8,
      );
      let threw = false;
      try {
        (goal.parameters as Record<string, unknown>)["injected"] = "hack";
      } catch {
        threw = true;
      }
      // In strict mode Object.freeze throws; in non-strict it silently fails
      const stillClean = goal.parameters["injected"] === undefined;
      assert(threw || stillClean, "parameters must be immutable");
    }),

    // ── T13: goal tem id unico por chamada ────────────────────────────────
    run("T13 — ids sao unicos por chamada", () => {
      const { goal: g1 } = bridge.derive("email", "general_conversation", 0.5);
      const { goal: g2 } = bridge.derive("email", "general_conversation", 0.5);
      assert(g1.id !== g2.id, "each call must produce a unique id");
    }),

    // ── T14: Drive — buscar arquivo ───────────────────────────────────────
    run("T14 — Drive searchFiles → drive.searchFiles", () => {
      const { goal } = bridge.derive(
        'Buscar arquivo "Relatorio Q1"',
        "general_conversation",
        0.5,
      );
      assertEqual(goal.type, "drive.searchFiles", "type");
      assertEqual(goal.parameters.query as string, "Relatorio Q1", "query from quotes");
    }),

    // ── T15: Calendar — criar evento ──────────────────────────────────────
    run("T15 — Calendar createEvent → calendar.createEvent", () => {
      const { goal } = bridge.derive(
        "Agendar reuniao para amanha as 14h",
        "general_conversation",
        0.5,
      );
      // "agendar" triggers createEvent; "amanha" would also match listTomorrow
      // createEvent comes AFTER listTomorrow in patterns, but "agendar" is exclusive
      assertEqual(goal.type, "calendar.createEvent", "type");
      assert(goal.parameters.rawText !== undefined, "rawText should be captured");
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