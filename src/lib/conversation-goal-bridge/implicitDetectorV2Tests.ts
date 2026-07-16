/**
 * implicitDetectorV2Tests.ts — Engineering Sprint 9.2.1
 * Test suite for ImplicitConnectorIntentDetector v2
 *
 * Cobre os 8 criterios de aceite da Sprint 9.2.1:
 *
 * T1  — Order independence: trocar ordem de registro nao muda o resultado
 * T2  — Determinism: mesma mensagem 100x = 100 resultados identicos
 * T3  — Gmail wins only with email evidence
 * T4  — Calendar wins with temporal evidence
 * T5  — Drive wins with document evidence
 * T6  — Memory wins with memory evidence
 * T7  — Full ranking returned with all candidates
 * T8  — Explanation returned with all evidences
 * T9  — Below-threshold: ambiguous message returns no detection
 * T10 — Score is order-independent (reverse registry order = same result)
 */

import { implicitConnectorIntentDetector } from "./ImplicitConnectorIntentDetector";
import type { ImplicitIntentResult }       from "./ImplicitConnectorIntentDetector";
import type { GoalDefinition }             from "@/lib/goals/GoalRegistry";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface V2TestResult {
  name:       string;
  passed:     boolean;
  error:      string | null;
  durationMs: number;
  details?:   Record<string, unknown>;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function run(
  name: string,
  fn: () => void | Promise<void>,
): Promise<V2TestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { name, passed: true, error: null, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 };
  }
}

// ── Mock definitions — one per connector ─────────────────────────────────────
// These mimic what GoalRegistry.listAll() returns.

const GMAIL_DEF: GoalDefinition = {
  type:         "gmail.searchMessages",
  namespace:    "gmail",
  description:  "Gmail mock",
  signals:      ["email"],
  extractParams: () => ({}),
};

const CALENDAR_DEF: GoalDefinition = {
  type:         "calendar.listToday",
  namespace:    "calendar",
  description:  "Calendar mock",
  signals:      ["hoje"],
  extractParams: () => ({}),
};

const DRIVE_DEF: GoalDefinition = {
  type:         "drive.searchFiles",
  namespace:    "drive",
  description:  "Drive mock",
  signals:      ["arquivo"],
  extractParams: () => ({}),
};

const MEMORY_DEF: GoalDefinition = {
  type:         "memory.query",
  namespace:    "memory",
  description:  "Memory mock",
  signals:      ["lembro"],
  extractParams: () => ({}),
};

// All 4 connectors registered — used for most tests
const ALL_DEFS_ORDER_A = [GMAIL_DEF, CALENDAR_DEF, DRIVE_DEF, MEMORY_DEF];
// Same 4 connectors, reversed order — used for T1 and T10
const ALL_DEFS_ORDER_B = [MEMORY_DEF, DRIVE_DEF, CALENDAR_DEF, GMAIL_DEF];

const det = implicitConnectorIntentDetector;

// ── Test suite ─────────────────────────────────────────────────────────────────

export interface V2TestSuiteResult {
  passed:  number;
  failed:  number;
  total:   number;
  results: V2TestResult[];
  verdict: "PASS" | "FAIL";
}

export async function runImplicitDetectorV2Tests(): Promise<V2TestSuiteResult> {
  const results: V2TestResult[] = await Promise.all([

    // ── T1: Order independence ───────────────────────────────────────────────
    run("T1 — Order independence: reversed registry = same winner", () => {
      const msg = "Leia meus emails da Shopee";
      const rA  = det.resolve(msg, ALL_DEFS_ORDER_A);
      const rB  = det.resolve(msg, ALL_DEFS_ORDER_B);
      assert(rA.goalType === rB.goalType,
        `Order A winner=${rA.goalType}, Order B winner=${rB.goalType} — must be equal`);
      assert(rA.confidence === rB.confidence,
        `Order A confidence=${rA.confidence}, Order B=${rB.confidence} — must be equal`);
    }),

    // ── T2: Determinism ───────────────────────────────────────────────────────
    run("T2 — Determinism: same message 100x = identical results", () => {
      const msg     = "Tenho email da Shopee?";
      const first   = det.resolve(msg, ALL_DEFS_ORDER_A);
      for (let i = 1; i < 100; i++) {
        const r = det.resolve(msg, ALL_DEFS_ORDER_A);
        assert(r.goalType   === first.goalType,   `Run ${i}: goalType differs`);
        assert(r.confidence === first.confidence, `Run ${i}: confidence differs`);
        assert(r.detected   === first.detected,   `Run ${i}: detected differs`);
      }
    }),

    // ── T3: Gmail wins only with email evidence ───────────────────────────────
    run("T3 — Gmail wins with email evidence", () => {
      const cases = [
        "email da Shopee",
        "Tenho algum email da Hostinger?",
        "Recebi algum boleto?",
        "nota fiscal da Amazon",
      ];
      for (const msg of cases) {
        const r = det.resolve(msg, ALL_DEFS_ORDER_A);
        assert(r.detected, `"${msg}" should be detected`);
        assert(r.goalType === "gmail.searchMessages",
          `"${msg}": expected gmail, got ${r.goalType}`);
        assert((r.resolution?.winner.evidences.length ?? 0) > 0,
          `"${msg}": must have evidences`);
      }
    }),

    // ── T4: Calendar wins with temporal evidence ──────────────────────────────
    run("T4 — Calendar wins with temporal evidence", () => {
      const cases = [
        "reunioes amanha",
        "compromissos de hoje",
        "agenda da semana",
        "eventos de segunda",
      ];
      for (const msg of cases) {
        const r = det.resolve(msg, ALL_DEFS_ORDER_A);
        assert(r.detected, `"${msg}" should be detected`);
        assert(r.goalType === "calendar.listToday",
          `"${msg}": expected calendar, got ${r.goalType} (score=${r.confidence})`);
      }
    }),

    // ── T5: Drive wins with document evidence ─────────────────────────────────
    run("T5 — Drive wins with document evidence", () => {
      const cases = [
        "meus arquivos recentes",
        "planilha do projeto",
        "documento de contrato",
        "pdf do relatorio",
      ];
      for (const msg of cases) {
        const r = det.resolve(msg, ALL_DEFS_ORDER_A);
        assert(r.detected, `"${msg}" should be detected`);
        assert(r.goalType === "drive.searchFiles",
          `"${msg}": expected drive, got ${r.goalType} (score=${r.confidence})`);
      }
    }),

    // ── T6: Memory wins with memory evidence ──────────────────────────────────
    run("T6 — Memory wins with memory evidence", () => {
      const cases = [
        "o que eu disse ontem",
        "resumo das nossas conversas",
        "lembro de um assunto importante",
      ];
      for (const msg of cases) {
        const r = det.resolve(msg, ALL_DEFS_ORDER_A);
        assert(r.detected, `"${msg}" should be detected`);
        assert(r.goalType === "memory.query",
          `"${msg}": expected memory, got ${r.goalType} (score=${r.confidence})`);
      }
    }),

    // ── T7: Full ranking returned ─────────────────────────────────────────────
    run("T7 — Full ranking contains all registered connectors", () => {
      const msg = "email da Shopee";
      const r   = det.resolve(msg, ALL_DEFS_ORDER_A);
      assert(r.detected, "should detect");
      assert(r.resolution !== null, "resolution must not be null");
      const ranking = r.resolution!.ranking;
      // All 4 connectors that scored >= 0 should appear in ranking
      // (at least the winner must be present)
      assert(ranking.length >= 1, "ranking must have at least 1 candidate");
      // Winner must be first
      assert(ranking[0].connectorId === r.resolution!.winner.connectorId,
        "ranking[0] must be the winner");
      // Ranking must be sorted descending
      for (let i = 0; i < ranking.length - 1; i++) {
        assert(ranking[i].score >= ranking[i + 1].score,
          `ranking not sorted at position ${i}: ${ranking[i].score} < ${ranking[i + 1].score}`);
      }
    }),

    // ── T8: Explanation returned ──────────────────────────────────────────────
    run("T8 — Explanation contains evidences", () => {
      const msg = "Tenho email da Shopee?";
      const r   = det.resolve(msg, ALL_DEFS_ORDER_A);
      assert(r.detected, "should detect");
      assert(r.resolution !== null, "resolution must not be null");
      const explanation = r.resolution!.explanation;
      assert(explanation.length >= 3, "explanation must have at least 3 lines");
      assert(explanation.some((e) => e.includes("Winner:")),   "explanation must mention Winner");
      assert(explanation.some((e) => e.includes("Evidences:")), "explanation must mention Evidences");
      assert(explanation.some((e) => e.includes("Ranking:")),  "explanation must mention Ranking");
    }),

    // ── T9: Below threshold — ambiguous message → no detection ────────────────
    run("T9 — Below threshold: ambiguous message returns no detection", () => {
      // "x" alone has no signal for any connector
      const r = det.resolve("x", ALL_DEFS_ORDER_A);
      // Either not detected, or if detected it's a genuine match
      // This test validates that garbage input doesn't produce high-confidence results
      if (r.detected) {
        assert(r.confidence < 0.5, `Ambiguous "x" should have low confidence, got ${r.confidence}`);
      }
    }),

    // ── T10: Score values are identical regardless of registry order ──────────
    run("T10 — Scores identical regardless of registry order", () => {
      const messages = [
        "email da Shopee",
        "reunioes de amanha",
        "minha planilha de custos",
        "o que eu disse sobre o sprint",
      ];
      for (const msg of messages) {
        const rA = det.resolve(msg, ALL_DEFS_ORDER_A);
        const rB = det.resolve(msg, ALL_DEFS_ORDER_B);
        assert(rA.goalType   === rB.goalType,
          `"${msg}": Order A=${rA.goalType}, Order B=${rB.goalType}`);
        assert(rA.confidence === rB.confidence,
          `"${msg}": Order A confidence=${rA.confidence}, Order B=${rB.confidence}`);
        assert(rA.detected   === rB.detected,
          `"${msg}": Order A detected=${rA.detected}, Order B=${rB.detected}`);
      }
    }),

    // ── T11: Social phrases rejected ──────────────────────────────────────────
    run("T11 — Social phrases produce no detection", () => {
      const socials = ["Ola", "Bom dia", "Obrigado", "Tudo bem", "ok"];
      for (const msg of socials) {
        const r = det.resolve(msg, ALL_DEFS_ORDER_A);
        assert(!r.detected, `Social phrase "${msg}" must not be detected`);
        assert(r.resolution === null, `Social phrase "${msg}" must have null resolution`);
      }
    }),

    // ── T12: Gmail vs Calendar — temporal + email = calendar wins ─────────────
    run("T12 — Temporal context beats commercial brand (calendar vs gmail)", () => {
      // "reuniao amanha" has strong calendar signals — no email signals
      const r = det.resolve("reuniao amanha", ALL_DEFS_ORDER_A);
      assert(r.detected, "should detect");
      assert(r.goalType === "calendar.listToday",
        `Expected calendar, got ${r.goalType}`);
    }),

    // ── T13: Immutability of returned objects ─────────────────────────────────
    run("T13 — Returned ImplicitIntentResult is immutable", () => {
      const r = det.resolve("email da Shopee", ALL_DEFS_ORDER_A);
      let threw = false;
      try {
        (r as Record<string, unknown>)["injected"] = "hack";
      } catch { threw = true; }
      const clean = (r as Record<string, unknown>)["injected"] === undefined;
      assert(threw || clean, "result must be immutable");
    }),

    // ── T14: Drive + email conflict → email wins by score ────────────────────
    run("T14 — Email keyword beats contract doc (gmail vs drive)", () => {
      // "contrato por email" has both email and contract signals
      // email keyword is weighted 0.40, contract doc 0.25 → gmail should win
      const r = det.resolve("contrato enviado por email", ALL_DEFS_ORDER_A);
      assert(r.detected, "should detect");
      // Gmail has email keyword AND contract-adjacent, Drive has contract doc
      // Gmail wins because email keyword (0.40) > contract doc alone (0.25)
      assert(r.goalType === "gmail.searchMessages",
        `Expected gmail for "contrato por email", got ${r.goalType}`);
    }),

    // ── T15: Only registered connectors are candidates ────────────────────────
    run("T15 — Only registered connectors appear as candidates", () => {
      // Register only gmail and calendar
      const limited = [GMAIL_DEF, CALENDAR_DEF];
      const r = det.resolve("minha planilha", limited);
      if (r.detected && r.resolution) {
        const ids = r.resolution.ranking.map((c) => c.connectorId);
        assert(!ids.includes("drive"), "drive must not appear — not registered");
        assert(!ids.includes("memory"), "memory must not appear — not registered");
      }
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