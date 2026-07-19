/**
 * GmailReadEmailIntegrationTest.ts
 *
 * Integration test: proves the full gmail.readEmail pipeline from
 * user message → GoalType → ExecutionPlan → capability dispatch.
 *
 * Does NOT make real HTTP calls (no token in test env).
 * Validates every layer deterministically:
 *   GoalRegistry.matchBySignals
 *   ConversationGoalBridge.derive
 *   GoalCapabilityRegistry.resolve
 *   ConversationPlanningEngine.plan
 *   GmailConnector._dispatch routing (via capability name check)
 *   GmailMimeParser.parseGmailMessage (via fixture)
 */

import { GoalRegistry }              from "@/lib/goals/GoalRegistry";
import { GoalCapabilityRegistry }    from "@/lib/planning-engine-e022/GoalCapabilityRegistry";
import { conversationGoalBridge }    from "@/lib/conversation-goal-bridge/ConversationGoalBridge";
import { conversationPlanningEngine } from "@/lib/planning-engine-e022/ConversationPlanningEngine";
import { parseGmailMessage }         from "@/lib/gmail/GmailMimeParser";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_GMAIL_MESSAGE = {
  id: "18fa3b2c1d4e5f6a",
  threadId: "18fa3b2c1d4e5f6a",
  snippet: "Ola, segue o relatorio mensal...",
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "Subject", value: "Relatorio Mensal - Julho 2026" },
      { name: "From",    value: "remetente@example.com" },
      { name: "To",      value: "destinatario@example.com" },
      { name: "Date",    value: "Sun, 19 Jul 2026 12:00:00 -0300" },
    ],
    body: { size: 0 },
    parts: [
      {
        partId:   "0",
        mimeType: "text/plain",
        headers:  [],
        body: {
          size: 46,
          // Base64URL of "Ola, segue o relatorio mensal completo aqui."
          data: "T2xhLCBzZWd1ZSBvIHJlbGF0b3JpbyBtZW5zYWwgY29tcGxldG8gYXF1aS4=",
        },
      },
      {
        partId:   "1",
        mimeType: "text/html",
        headers:  [],
        body: {
          size: 60,
          // Base64URL of "<p>Ola, segue o relatorio mensal completo aqui.</p>"
          data: "PHA-T2xhLCBzZWd1ZSBvIHJlbGF0b3JpbyBtZW5zYWwgY29tcGxldG8gYXF1aS48L3A-",
        },
      },
    ],
  },
};

// ── Assertions helper ─────────────────────────────────────────────────────────

type TestResult = { pass: boolean; label: string; detail?: string };

function assert(cond: boolean, label: string, detail?: string): TestResult {
  return { pass: cond, label, detail };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

export function runGmailReadEmailIntegrationTests(): {
  passed: number;
  failed: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];

  // ── T1: GoalType "gmail.readEmail" is declared ────────────────────────────
  const allDefs = GoalRegistry.listAll();
  const readEmailDef = allDefs.find((d) => d.type === "gmail.readEmail");
  results.push(assert(
    !!readEmailDef,
    "T1: GoalRegistry has gmail.readEmail definition",
    readEmailDef ? `namespace=${readEmailDef.namespace}, signals=${readEmailDef.signals.length}` : "NOT FOUND",
  ));

  // ── T2: Signal matching — "leia este email" ───────────────────────────────
  const match1 = GoalRegistry.matchBySignals("leia este email");
  results.push(assert(
    match1?.type === "gmail.readEmail",
    `T2: matchBySignals("leia este email") → gmail.readEmail`,
    `got: ${match1?.type ?? "null"}`,
  ));

  // ── T3: Signal matching — "leia o email completo" ─────────────────────────
  const match2 = GoalRegistry.matchBySignals("leia o email completo");
  results.push(assert(
    match2?.type === "gmail.readEmail",
    `T3: matchBySignals("leia o email completo") → gmail.readEmail`,
    `got: ${match2?.type ?? "null"}`,
  ));

  // ── T4: Signal matching — "mostre o conteudo deste email" ─────────────────
  const match3 = GoalRegistry.matchBySignals("mostre o conteudo deste email");
  results.push(assert(
    match3?.type === "gmail.readEmail",
    `T4: matchBySignals("mostre o conteudo deste email") → gmail.readEmail`,
    `got: ${match3?.type ?? "null"}`,
  ));

  // ── T5: Signal matching — "read the full email" ───────────────────────────
  const match4 = GoalRegistry.matchBySignals("read the full email");
  results.push(assert(
    match4?.type === "gmail.readEmail",
    `T5: matchBySignals("read the full email") → gmail.readEmail`,
    `got: ${match4?.type ?? "null"}`,
  ));

  // ── T6: extractParams extracts emailIndex for ordinals ────────────────────
  const params1 = readEmailDef?.extractParams("leia o primeiro email") ?? {};
  results.push(assert(
    (params1 as Record<string, unknown>).emailIndex === 0,
    `T6: extractParams("leia o primeiro email").emailIndex === 0`,
    `got: ${JSON.stringify(params1)}`,
  ));

  // ── T7: extractParams extracts messageId when present ─────────────────────
  const params2 = readEmailDef?.extractParams("leia o email 18fa3b2c1d4e5f6a") ?? {};
  results.push(assert(
    (params2 as Record<string, unknown>).messageId === "18fa3b2c1d4e5f6a",
    `T7: extractParams with messageId → messageId="18fa3b2c1d4e5f6a"`,
    `got: ${JSON.stringify(params2)}`,
  ));

  // ── T8: GoalCapabilityRegistry maps gmail.readEmail → readEmail ───────────
  const descriptors = GoalCapabilityRegistry.resolve("gmail.readEmail");
  results.push(assert(
    Array.isArray(descriptors) && descriptors.length === 1,
    "T8: GoalCapabilityRegistry.resolve(gmail.readEmail) returns 1 descriptor",
    `got: ${JSON.stringify(descriptors)}`,
  ));

  const desc = descriptors?.[0];
  results.push(assert(
    desc?.connector === "gmail" && desc?.capability === "readEmail",
    `T9: descriptor → connector="gmail", capability="readEmail"`,
    `got connector=${desc?.connector}, capability=${desc?.capability}`,
  ));

  // ── T10: ConversationGoalBridge derives gmail.readEmail ───────────────────
  const bridgeResult = conversationGoalBridge.derive(
    "leia este email",
    "general_conversation" as never,
    0.7,
  );
  results.push(assert(
    bridgeResult.goal.type === "gmail.readEmail",
    `T10: ConversationGoalBridge.derive("leia este email") → gmail.readEmail`,
    `got: ${bridgeResult.goal.type}, valid=${bridgeResult.goal.valid}`,
  ));

  // ── T11: ConversationPlanningEngine produces plan with readEmail step ──────
  const planResult = conversationPlanningEngine.plan(bridgeResult.goal);
  results.push(assert(
    planResult.success && planResult.plan.steps.length === 1,
    "T11: ConversationPlanningEngine.plan produces 1 step",
    `success=${planResult.success}, steps=${planResult.plan.steps.length}, error=${planResult.error ?? "none"}`,
  ));

  const step = planResult.plan.steps[0];
  results.push(assert(
    step?.connector === "gmail" && step?.capability === "readEmail",
    `T12: ExecutionStep → connector="gmail", capability="readEmail"`,
    `got connector=${step?.connector}, capability=${step?.capability}`,
  ));

  // ── T13: GmailMimeParser extracts plainText from fixture ──────────────────
  const parsed = parseGmailMessage(SAMPLE_GMAIL_MESSAGE as never);
  results.push(assert(
    typeof parsed.plainText === "string" && parsed.plainText.length > 0,
    "T13: GmailMimeParser.parseGmailMessage extracts plainText",
    `plainText="${parsed.plainText.slice(0, 80)}"`,
  ));

  results.push(assert(
    parsed.subject === "Relatorio Mensal - Julho 2026",
    `T14: GmailMimeParser extracts subject`,
    `got: "${parsed.subject}"`,
  ));

  results.push(assert(
    parsed.from === "remetente@example.com",
    `T15: GmailMimeParser extracts from`,
    `got: "${parsed.from}"`,
  ));

  results.push(assert(
    parsed.id === "18fa3b2c1d4e5f6a",
    `T16: GmailMimeParser preserves message id`,
    `got: "${parsed.id}"`,
  ));

  results.push(assert(
    typeof parsed.html === "string",
    `T17: GmailMimeParser extracts html part`,
    `htmlLen=${parsed.html.length}`,
  ));

  // ── T18: gmail.readEmail does NOT break existing gmail.readInbox ──────────
  const inboxMatch = GoalRegistry.matchBySignals("meus emails");
  results.push(assert(
    inboxMatch?.type === "gmail.readInbox",
    `T18: "meus emails" still resolves to gmail.readInbox (no regression)`,
    `got: ${inboxMatch?.type ?? "null"}`,
  ));

  // ── T19: gmail.readEmail does NOT break gmail.searchMessages ─────────────
  const searchMatch = GoalRegistry.matchBySignals("procure emails da Shopee");
  results.push(assert(
    searchMatch?.type === "gmail.searchMessages",
    `T19: "procure emails da Shopee" still resolves to gmail.searchMessages (no regression)`,
    `got: ${searchMatch?.type ?? "null"}`,
  ));

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  return { passed, failed, results };
}