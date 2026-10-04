// ORCH-TOOLS-01: E2E determinístico — intents tool_call executadas num ciclo REAL
// do daemon (dryRun=false → execute com ORCH_DAEMON_APPROVED=1), isolado em tmpdirs
// (consumeDeps herméticos). Zero efeito em produção: fila/estado/audit/spool em
// tmpdir, breaker no-op, compactação/higiene desligadas. Handler REAL
// (createToolCallHandler) executa tier-1 in-processo. Prova gravada em
// e2e-proof-ORCH-TOOLS-01.json.
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDaemonCycle } from "./src/orchestrateConsumeDaemon.mjs";

const tmp = mkdtempSync(join(tmpdir(), "orch-tools-01-e2e-"));
const queuePath = join(tmp, "queue.jsonl");
const nowIso = new Date().toISOString();
// 3 fixtures: tier-1 (executa in-processo), tier-2 sem preauth (awaiting_approval
// fail-closed), tier-3 (blocked com reason tipada — barreira antes de qualquer artefato).
writeFileSync(queuePath, [
  JSON.stringify({ id: "e2e-t1", type: "tool_call", payload: { tool: "engineering.session.roster" }, priority: 5, enqueuedAt: nowIso }),
  JSON.stringify({ id: "e2e-t2", type: "tool_call", payload: { tool: "engineering.git.commit", args: { message: "fixture" } }, priority: 5, enqueuedAt: nowIso }),
  JSON.stringify({ id: "e2e-t3", type: "tool_call", payload: { tool: "engineering.release.pipeline" }, priority: 5, enqueuedAt: nowIso }),
].join("\n") + "\n");

const consumeDeps = {
  queuePath,
  consumerStatePath: join(tmp, "consumer-state.json"),
  consumerLockPath: join(tmp, "consumer.lock"),
  spoolPath: join(tmp, "spool.jsonl"),
  consumeAuditPath: join(tmp, "consume-audit.jsonl"),
  missionStateDir: join(tmp, "mission-state"),
};
const breakerDeps = {
  readText: () => null, readdir: () => [], existsSync: () => false,
  spoolPath: join(tmp, "breaker-spool.jsonl"), breakerStatePath: join(tmp, "breaker.json"),
  missionStateDir: join(tmp, "mission-state"),
  probePaneList: () => "ok",
  pauseMission: async () => ({ ok: true }), resumeMission: async () => ({ ok: true }),
  notify: async () => ({ delivered: true }),
};

const prev = { approved: process.env.ORCH_DAEMON_APPROVED, compact: process.env.ORCH_QUEUE_COMPACT, hygiene: process.env.ORCH_HYGIENE };
process.env.ORCH_DAEMON_APPROVED = "1";
process.env.ORCH_QUEUE_COMPACT = "0";
process.env.ORCH_HYGIENE = "0";
let cycle;
try {
  cycle = await runDaemonCycle({ consumeDeps, breakerDeps });
} finally {
  if (prev.approved === undefined) delete process.env.ORCH_DAEMON_APPROVED; else process.env.ORCH_DAEMON_APPROVED = prev.approved;
  if (prev.compact === undefined) delete process.env.ORCH_QUEUE_COMPACT; else process.env.ORCH_QUEUE_COMPACT = prev.compact;
  if (prev.hygiene === undefined) delete process.env.ORCH_HYGIENE; else process.env.ORCH_HYGIENE = prev.hygiene;
}

// Provas lidas dos artefatos reais do ciclo.
const state = JSON.parse(readFileSync(consumeDeps.consumerStatePath, "utf8"));
const audit = readFileSync(consumeDeps.consumeAuditPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const spool = readFileSync(consumeDeps.spoolPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const ex = cycle.executed ?? {};
const byId = (id) => (ex.results ?? []).find((r) => r.entryId === id) ?? null;

const proof = {
  mission: "ORCH-TOOLS-01",
  at: new Date().toISOString(),
  hermetic: { tmpdir: tmp, note: "fila/estado/audit/spool isolados em tmpdir; produção intocada" },
  cycle: { ok: cycle.ok, mode: cycle.mode, toolCallsExecuted: ex.toolCallsExecuted, awaitingApproval: ex.awaitingApproval, blocked: ex.blocked },
  checks: {
    tier1_executed_in_process: {
      verdict: byId("e2e-t1")?.action === "executed" && ex.toolCallsExecuted === 1 && (state.toolResults ?? []).some((t) => t.entryId === "e2e-t1" && t.ok === true && t.tool === "engineering.session.roster"),
      action: byId("e2e-t1")?.action ?? null,
      stateToolResult: (state.toolResults ?? []).find((t) => t.entryId === "e2e-t1") ?? null,
    },
    tier2_awaiting_approval_fail_closed: {
      verdict: byId("e2e-t2")?.action === "awaiting_approval" && ex.awaitingApproval === 1,
      action: byId("e2e-t2")?.action ?? null,
      reason: byId("e2e-t2")?.reason ?? null,
    },
    tier3_blocked_typed: {
      verdict: byId("e2e-t3")?.action === "blocked" && /tier3_external_consequence_operator_path/.test(byId("e2e-t3")?.reason ?? ""),
      action: byId("e2e-t3")?.action ?? null,
      reason: byId("e2e-t3")?.reason ?? null,
    },
    audit_evidence: {
      verdict: audit.some((a) => a.entryId === "e2e-t1" && a.decision === "EXECUTED") && audit.some((a) => a.entryId === "e2e-t3" && a.decision === "BLOCKED" && /tier3_external_consequence_operator_path/.test(a.reason)),
      lines: audit.map((a) => ({ entryId: a.entryId, decision: a.decision, reason: (a.reason ?? "").slice(0, 160) })),
    },
    spool_evidence: {
      verdict: spool.some((s) => s.event === "orch_executed") && spool.some((s) => s.event === "orch_blocked"),
      events: spool.map((s) => s.event),
    },
    consumer_state_evidence: {
      verdict: state.status === "alive" && Array.isArray(state.toolResults) && state.toolResults.length === 1,
      toolResults: state.toolResults ?? [],
    },
  },
};
proof.verdict = Object.values(proof.checks).every((c) => c.verdict === true);
writeFileSync(join(tmp, "e2e-proof-ORCH-TOOLS-01.json"), JSON.stringify(proof, null, 1) + "\n");
// Cópia da prova para o repo (artefato da missão).
writeFileSync(new URL("./e2e-proof-ORCH-TOOLS-01.json", import.meta.url), JSON.stringify(proof, null, 1) + "\n");
console.log(JSON.stringify({ verdict: proof.verdict, cycle: proof.cycle, checks: Object.fromEntries(Object.entries(proof.checks).map(([k, v]) => [k, v.verdict])) }));
process.exit(proof.verdict ? 0 : 1);
