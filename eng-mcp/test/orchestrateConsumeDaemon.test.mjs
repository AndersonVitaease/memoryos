// ORCH-DAEMON-01: 5 casos do ciclo do daemon (node --import tsx --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDaemonCycle, LOCK_PATH } from "../src/orchestrateConsumeDaemon.mjs";

// RD-ORCH-ENV-01: hermético por default — a sonda de health da fila nunca toca
// paths de produção nos testes (consumeDeps/queueHealthDeps isolam em tmpdir).
const HEALTH = {
  queuePath: join(tmpdir(), "orch-daemon-health-test-fila-ausente.jsonl"),
  consumerStatePath: join(tmpdir(), "orch-daemon-health-test-state.json"),
  spoolPath: join(tmpdir(), "orch-daemon-health-test-spool.jsonl"),
};

test("1. fila vazia → ciclo ok, modo plan, nada executado", async () => {
  const r = await runDaemonCycle({ queueHealthDeps: HEALTH });
  assert.equal(r.ok, true);
  assert.equal(r.mode, "plan");
  assert.equal(r.executed, null);
});

test("2. lock concorrente → ciclo recusa (fail-closed)", async () => {
  const fs = await import("node:fs");
  // Lock em tmpdir via LOCK_PATH exportado — teste NUNCA escreve em /opt/mission-events (EROFS).
  fs.writeFileSync(LOCK_PATH, "other");
  fs.utimesSync(LOCK_PATH, new Date(), new Date()); // fresco: dentro da janela de 30s
  const r = await runDaemonCycle({ queueHealthDeps: HEALTH });
  assert.equal(r.ok, false);
  assert.match(r.reason, /lock/);
  fs.unlinkSync(LOCK_PATH);
});

test("3. ciclo nunca despacha fora do caminho governado (sem execute quando plan não promove)", async () => {
  const r = await runDaemonCycle({ queueHealthDeps: HEALTH });
  // Sem promovíveis, executed permanece null — zero dispatch direto.
  assert.equal(r.executed, null);
});

test("4. resultado do ciclo é serializável (auditoria via state jsonl)", async () => {
  const r = await runDaemonCycle({ queueHealthDeps: HEALTH });
  assert.doesNotThrow(() => JSON.stringify(r));
});

test("5. maxPromotions respeitado no plano (limite de slots por ciclo)", async () => {
  const r = await runDaemonCycle({ maxPromotions: 1, queueHealthDeps: HEALTH });
  assert.equal(r.ok, true);
  if (r.plan && typeof r.plan.promoted === "number") {
    assert.ok(r.plan.promoted <= 1);
  }
});
// ---- ORCH-TOOLS-01: E2E determinístico — tool_call executada num ciclo REAL do daemon ----
// Fila/estado/audit/spool isolados em tmpdir (consumeDeps herméticos); breaker e
// hygiene stubados/desligados; handler REAL (createToolCallHandler) executa tier-1
// in-processo. Zero efeito em produção: nenhuma linha em /opt/mission-events.

test("6. ORCH-TOOLS-01 E2E: tier-1 executada in-processo no ciclo real; tier-3 blocked com reason tipada", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "orch-tools-01-e2e-"));
  const queuePath = join(tmp, "queue.jsonl");
  const nowIso = new Date().toISOString();
  writeFileSync(queuePath, [
    JSON.stringify({ id: "e2e-t1", type: "tool_call", payload: { tool: "engineering.session.roster" }, priority: 5, enqueuedAt: nowIso }),
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
    probePaneList: () => "ok", // herdr responsável — breaker determinístico no-op
    pauseMission: async () => ({ ok: true }), resumeMission: async () => ({ ok: true }),
    notify: async () => ({ delivered: true }),
  };
  const prevApproved = process.env.ORCH_DAEMON_APPROVED;
  const prevCompact = process.env.ORCH_QUEUE_COMPACT;
  const prevHygiene = process.env.ORCH_HYGIENE;
  process.env.ORCH_DAEMON_APPROVED = "1";
  process.env.ORCH_QUEUE_COMPACT = "0";
  process.env.ORCH_HYGIENE = "0";
  try {
    const r = await runDaemonCycle({ consumeDeps, breakerDeps });    assert.equal(r.ok, true);
    assert.equal(r.mode, "execute");
    assert.equal(r.executed.toolCallsExecuted, 1);
    assert.equal(r.executed.awaitingApproval, 0);
    // tier-1 executada (handler real, in-processo) e tier-3 blocked
    assert.equal(r.executed.results.find((e) => e.entryId === "e2e-t1")?.action, "executed");
    assert.equal(r.executed.results.find((e) => e.entryId === "e2e-t1")?.tier, 1);
    assert.equal(r.executed.results.find((e) => e.entryId === "e2e-t3")?.action, "blocked");
    assert.match(r.executed.results.find((e) => e.entryId === "e2e-t3")?.reason ?? "", /tier3_external_consequence_operator_path/);

    // (1) prova no estado do consumidor: toolResults com a execução real
    const stateRaw = readFileSync(consumeDeps.consumerStatePath, "utf8");
    const state = JSON.parse(stateRaw);
    assert.equal(state.toolResults.length, 1);
    assert.equal(state.toolResults[0].tool, "engineering.session.roster");
    assert.equal(state.toolResults[0].ok, true);
    assert.equal(state.toolResults[0].entryId, "e2e-t1");

    // (2) prova no audit: EXECUTED (tier-1) + BLOCKED com reason tipada (tier-3)
    const auditRaw = readFileSync(consumeDeps.consumeAuditPath, "utf8").trim();
    const auditLines = auditRaw.split("\n").map((l) => JSON.parse(l));
    assert.equal(auditLines.some((a) => a.entryId === "e2e-t1" && a.decision === "EXECUTED"), true);
    const blocked = auditLines.find((a) => a.entryId === "e2e-t3" && a.decision === "BLOCKED");
    assert.ok(blocked);
    assert.match(blocked.reason, /tier3_external_consequence_operator_path/);

    // (3) prova no spool: orch_executed + orch_blocked
    const spoolRaw = readFileSync(consumeDeps.spoolPath, "utf8").trim();
    const spoolLines = spoolRaw.split("\n").map((l) => JSON.parse(l));
    assert.equal(spoolLines.some((s) => s.event === "orch_executed"), true);
    assert.equal(spoolLines.some((s) => s.event === "orch_blocked"), true);
  } finally {
    if (prevApproved === undefined) delete process.env.ORCH_DAEMON_APPROVED; else process.env.ORCH_DAEMON_APPROVED = prevApproved;
    if (prevCompact === undefined) delete process.env.ORCH_QUEUE_COMPACT; else process.env.ORCH_QUEUE_COMPACT = prevCompact;
    if (prevHygiene === undefined) delete process.env.ORCH_HYGIENE; else process.env.ORCH_HYGIENE = prevHygiene;
  }
});

// ---- RD-ORCH-ENV-01: falha honesta — fila ilegível no ciclo REAL do daemon ----

test("7. RD-ORCH-ENV-01: fila ilegível → ciclo em DEGRADED com log CRITICAL + estado + spool", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "orch-env-01-e2e-"));
  const queuePath = join(tmp, "queue.jsonl");
  const statePath = join(tmp, "consumer-state.json");
  const spoolPath = join(tmp, "spool.jsonl");
  // ilegível de verdade no fs real: o path é um DIRETÓRIO (readFileSync → EISDIR;
  // existsSync true — o caso exato do fail-open engolido no incidente).
  mkdirSync(queuePath, { recursive: true });
  // estado prévio do consumidor com contagens — DEVE ser preservado
  writeFileSync(statePath, JSON.stringify({ status: "alive", lastPromotion: "2026-10-06T10:21:12Z", promotedCount: 183, skippedCount: 907, promotedIds: ["x1"] }));
  const errs = [];
  const origErr = console.error;
  console.error = (...args) => { errs.push(args.join(" ")); };
  try {
    const r = await runDaemonCycle({ queueHealthDeps: { queuePath, consumerStatePath: statePath, spoolPath } });
    assert.equal(r.ok, true);
    assert.ok(r.degraded, "resultado do ciclo deve carregar degraded");
    assert.equal(r.degraded.stateWritten, true);
    assert.equal(r.degraded.spooled, true);
    assert.match(r.degraded.reason, /ilegível/);
    // log CRITICAL no journal (stderr do ciclo)
    assert.ok(errs.some((e) => e.includes("[CRITICAL]") && e.includes("ilegível")), errs.join(" | "));

    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.status, "degraded");           // NÃO "alive" falso
    assert.equal(state.promotedCount, 183);           // contagem preservada
    assert.equal(state.skippedCount, 907);
    assert.deepEqual(state.promotedIds, ["x1"]);      // dedupe preservado
    assert.match(state.degradedReason, /ilegível/);
    const spool = readFileSync(spoolPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(spool.some((s) => s.event === "orch_degraded" && s.missionId === "queue"));
  } finally {
    console.error = origErr;
  }
});

test("8. RD-ORCH-ENV-01: fila ilegível NUNCA despacha (executed null) e ausente = saudável", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "orch-env-01-e2e2-"));
  const queuePath = join(tmp, "queue.jsonl"); // AUSENTE = fila vazia, saudável
  const statePath = join(tmp, "consumer-state.json");
  const r1 = await runDaemonCycle({ queueHealthDeps: { queuePath, consumerStatePath: statePath } });
  assert.equal(r1.ok, true);
  assert.equal(r1.degraded, null);          // ausente não degrada
  assert.equal(r1.executed, null);

  // recuperação: estado "degraded" + leitura bem-sucedida → "stopped" (não "alive")
  writeFileSync(statePath, JSON.stringify({ status: "degraded", degradedAt: "t", degradedReason: "r", promotedCount: 183 }));
  writeFileSync(queuePath, "");
  const r2 = await runDaemonCycle({ queueHealthDeps: { queuePath, consumerStatePath: statePath } });
  assert.deepEqual(r2.degraded, { cleared: true });
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.status, "stopped");    // recuperação honesta (não finge alive)
  assert.equal(state.promotedCount, 183);
});
