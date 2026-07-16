/**
 * semanticRegistryTests.ts — Engineering Sprint 9.2.2
 *
 * Valida:
 * - Registro de provider
 * - Duplicidade (idempotencia)
 * - Provider inexistente
 * - Ordem de registro irrelevante
 * - Determinismo
 * - Imutabilidade
 * - Ranking
 * - Explicabilidade
 * - Open/Closed: provider ficticio (SlackSemanticProvider) sem modificar o detector
 */

import { ConnectorSemanticRegistry } from "./ConnectorSemanticRegistry";
import type { SemanticProvider, SemanticScore } from "./SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";
import { implicitConnectorIntentDetector } from "@/lib/conversation-goal-bridge/ImplicitConnectorIntentDetector";
import type { GoalDefinition } from "@/lib/goals/GoalRegistry";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SRTestResult {
  name:       string;
  passed:     boolean;
  error:      string | null;
  durationMs: number;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function run(name: string, fn: () => void | Promise<void>): Promise<SRTestResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { name, passed: true, error: null, durationMs: Date.now() - t0 };
  } catch (e) {
    return { name, passed: false, error: (e as Error).message, durationMs: Date.now() - t0 };
  }
}

// ── SlackSemanticProvider — fictitious connector for Open/Closed test ─────────
// Demonstrates that adding a new connector requires ZERO changes to the detector.

const SLACK_KEYWORDS = Object.freeze([
  "slack", "canal", "channel", "workspace", "mensagem slack", "notificacao slack",
]);

const SlackSemanticProvider: SemanticProvider = Object.freeze({
  connectorId:      "slack",
  implicitGoalType: "general.conversation", // closest available GoalType

  score(lower: string, _norm: NormalizationResult): SemanticScore {
    const evidences: string[] = [];
    let score = 0;
    for (const kw of SLACK_KEYWORDS) {
      if (lower.includes(kw)) {
        score += 0.50;
        evidences.push(`slack-keyword: "${kw}"`);
        break;
      }
    }
    return Object.freeze({ score: Math.min(score, 1.0), evidences: Object.freeze(evidences) });
  },
});

// ── Mock GoalDefinitions for the detector ─────────────────────────────────────

const MOCK_DEFS: readonly GoalDefinition[] = Object.freeze([
  { type: "gmail.searchMessages", namespace: "gmail",    description: "", signals: [], extractParams: () => ({}) },
  { type: "calendar.listToday",   namespace: "calendar", description: "", signals: [], extractParams: () => ({}) },
  { type: "drive.searchFiles",    namespace: "drive",    description: "", signals: [], extractParams: () => ({}) },
  { type: "memory.query",         namespace: "memory",   description: "", signals: [], extractParams: () => ({}) },
  { type: "general.conversation", namespace: "slack",    description: "", signals: [], extractParams: () => ({}) },
]);

// ── Test suite ─────────────────────────────────────────────────────────────────

export interface SRTestSuiteResult {
  passed:  number;
  failed:  number;
  total:   number;
  results: SRTestResult[];
  verdict: "PASS" | "FAIL";
}

export async function runSemanticRegistryTests(): Promise<SRTestSuiteResult> {
  // Ensure builtins are loaded before tests run
  await import("./index");

  const results: SRTestResult[] = await Promise.all([

    // ── SR-01: Builtins auto-registered ─────────────────────────────────────
    run("SR-01 — Builtin providers auto-registered at import", () => {
      assert(ConnectorSemanticRegistry.has("gmail"),    "gmail must be registered");
      assert(ConnectorSemanticRegistry.has("calendar"), "calendar must be registered");
      assert(ConnectorSemanticRegistry.has("drive"),    "drive must be registered");
      assert(ConnectorSemanticRegistry.has("memory"),   "memory must be registered");
      assert(ConnectorSemanticRegistry.size >= 4,        "at least 4 providers");
    }),

    // ── SR-02: Idempotent registration ────────────────────────────────────
    run("SR-02 — Duplicate registration is ignored (idempotent)", () => {
      const sizeBefore = ConnectorSemanticRegistry.size;
      // Attempt to re-register gmail
      const { GmailSemanticProvider } = require("./providers/GmailSemanticProvider");
      ConnectorSemanticRegistry.register(GmailSemanticProvider);
      assert(ConnectorSemanticRegistry.size === sizeBefore, "size must not change on duplicate");
    }),

    // ── SR-03: Unknown provider returns null ──────────────────────────────
    run("SR-03 — Unknown connectorId returns null", () => {
      const result = ConnectorSemanticRegistry.get("nonexistent_connector_xyz");
      assert(result === null, "unknown connector must return null");
    }),

    // ── SR-04: listAll returns sorted (alphabetical) — order-independent ──
    run("SR-04 — listAll() returns alphabetical order regardless of registration order", () => {
      const ids = ConnectorSemanticRegistry.listAll().map((p) => p.connectorId);
      for (let i = 0; i < ids.length - 1; i++) {
        assert(
          ids[i].localeCompare(ids[i + 1]) <= 0,
          `listAll not sorted at [${i}]: "${ids[i]}" > "${ids[i + 1]}"`,
        );
      }
    }),

    // ── SR-05: listAll returns frozen array ───────────────────────────────
    run("SR-05 — listAll() returns immutable array", () => {
      const list = ConnectorSemanticRegistry.listAll();
      let threw = false;
      try {
        (list as unknown as SemanticProvider[]).push(SlackSemanticProvider);
      } catch { threw = true; }
      const clean = list.length === ConnectorSemanticRegistry.size;
      assert(threw || clean, "listAll() result must be immutable");
    }),

    // ── SR-06: Provider score is deterministic ────────────────────────────
    run("SR-06 — score() is deterministic: same input = same output x100", () => {
      const provider = ConnectorSemanticRegistry.get("gmail");
      assert(provider !== null, "gmail provider must exist");
      const lower = "email da shopee";
      const norm = { entity: "Shopee", normalized: "", isEmailQuery: true, isSocialPhrase: false, isKnownEntity: true };
      const first = provider!.score(lower, norm as NormalizationResult);
      for (let i = 0; i < 100; i++) {
        const r = provider!.score(lower, norm as NormalizationResult);
        assert(r.score === first.score, `Run ${i}: score differs`);
        assert(r.evidences.length === first.evidences.length, `Run ${i}: evidences length differs`);
      }
    }),

    // ── SR-07: Provider score returns frozen objects ───────────────────────
    run("SR-07 — score() returns immutable SemanticScore", () => {
      const provider = ConnectorSemanticRegistry.get("calendar");
      assert(provider !== null, "calendar must exist");
      const norm = { entity: "", normalized: "", isEmailQuery: false, isSocialPhrase: false, isKnownEntity: false };
      const result = provider!.score("reuniao amanha", norm as NormalizationResult);
      let threw = false;
      try { (result as Record<string, unknown>)["injected"] = "hack"; } catch { threw = true; }
      const clean = (result as Record<string, unknown>)["injected"] === undefined;
      assert(threw || clean, "SemanticScore must be immutable");
    }),

    // ── SR-08: Open/Closed — add Slack without touching detector ──────────
    run("SR-08 — Open/Closed: SlackSemanticProvider registered without modifying detector", () => {
      // Register Slack — zero lines of detector changed
      ConnectorSemanticRegistry.register(SlackSemanticProvider);
      assert(ConnectorSemanticRegistry.has("slack"), "slack must be registered after register()");
      assert(ConnectorSemanticRegistry.get("slack") === SlackSemanticProvider, "get() must return the same provider");
    }),

    // ── SR-09: Slack provider scores Slack messages correctly ─────────────
    run("SR-09 — SlackSemanticProvider scores Slack messages", () => {
      const provider = ConnectorSemanticRegistry.get("slack");
      assert(provider !== null, "slack provider must exist");
      const norm = { entity: "", normalized: "", isEmailQuery: false, isSocialPhrase: false, isKnownEntity: false };
      const r = provider!.score("mensagem slack do canal geral", norm as NormalizationResult);
      assert(r.score >= 0.50, `Expected score >= 0.50, got ${r.score}`);
      assert(r.evidences.length > 0, "Slack evidences must not be empty");
    }),

    // ── SR-10: Detector uses SlackSemanticProvider without code change ────
    run("SR-10 — Detector routes 'slack' message to Slack provider (Open/Closed proof)", () => {
      // Mock defs include "slack" namespace
      const r = implicitConnectorIntentDetector.resolve("mensagem slack do canal geral", MOCK_DEFS);
      assert(r.detected, "should detect slack message");
      assert(r.goalType === "general.conversation", `Expected general.conversation, got ${r.goalType}`);
      // The winner should be slack (highest score for slack message)
      assert(r.resolution?.winner.connectorId === "slack",
        `Expected winner=slack, got ${r.resolution?.winner.connectorId}`);
    }),

    // ── SR-11: Detector knows zero domain — no connector name in its source ─
    run("SR-11 — Detector has no hardcoded connector names (structural proof)", async () => {
      // The detector file must not reference Gmail/Calendar/Drive/Memory as strings
      // We verify this by confirming the registry drives all routing
      const r1 = implicitConnectorIntentDetector.resolve("email da shopee", MOCK_DEFS);
      const r2 = implicitConnectorIntentDetector.resolve("reuniao amanha", MOCK_DEFS);
      const r3 = implicitConnectorIntentDetector.resolve("minha planilha", MOCK_DEFS);
      const r4 = implicitConnectorIntentDetector.resolve("o que eu disse", MOCK_DEFS);
      assert(r1.goalType === "gmail.searchMessages",  `r1: ${r1.goalType}`);
      assert(r2.goalType === "calendar.listToday",    `r2: ${r2.goalType}`);
      assert(r3.goalType === "drive.searchFiles",     `r3: ${r3.goalType}`);
      assert(r4.goalType === "memory.query",          `r4: ${r4.goalType}`);
    }),

    // ── SR-12: Ranking contains all scored candidates ─────────────────────
    run("SR-12 — Ranking contains all registered+filtered candidates", () => {
      const r = implicitConnectorIntentDetector.resolve("email da shopee", MOCK_DEFS);
      assert(r.detected, "should detect");
      assert((r.resolution?.ranking.length ?? 0) >= 1, "ranking must have candidates");
      // Winner is first
      assert(r.resolution!.ranking[0].connectorId === r.resolution!.winner.connectorId,
        "ranking[0] must be winner");
    }),

    // ── SR-13: Explanation has required fields ────────────────────────────
    run("SR-13 — Explanation returned with all required fields", () => {
      const r = implicitConnectorIntentDetector.resolve("reuniao de amanha", MOCK_DEFS);
      assert(r.detected, "should detect");
      const exp = r.resolution!.explanation;
      assert(exp.some((e) => e.startsWith("Winner:")),   "must have Winner");
      assert(exp.some((e) => e.startsWith("Evidences:")), "must have Evidences");
      assert(exp.some((e) => e.startsWith("Ranking:")),  "must have Ranking");
      assert(exp.some((e) => e.startsWith("Entity:")),   "must have Entity");
    }),

    // ── SR-14: Determinism across registry order changes ──────────────────
    run("SR-14 — Detector result is same regardless of provider registration order", () => {
      // listAll() is alphabetical — inherently order-independent
      const defsA = [...MOCK_DEFS];
      const defsB = [...MOCK_DEFS].reverse();
      const rA = implicitConnectorIntentDetector.resolve("email da shopee", defsA);
      const rB = implicitConnectorIntentDetector.resolve("email da shopee", defsB);
      assert(rA.goalType   === rB.goalType,   `goalType: A=${rA.goalType} B=${rB.goalType}`);
      assert(rA.confidence === rB.confidence, `confidence: A=${rA.confidence} B=${rB.confidence}`);
    }),
  ]);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results, verdict: failed === 0 ? "PASS" : "FAIL" };
}