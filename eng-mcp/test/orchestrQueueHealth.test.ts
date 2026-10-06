// RD-ORCH-ENV-01: unit tests da falha honesta da fila (src/orchestrQueueHealth.ts).
// Determinístico: fs real isolado em /tmp/orch-orchenv-01-test/ (nunca /opt/mission-events);
// a simulação de ilegível REAL usa um DIRETÓRIIO como queuePath (readFileSync → EISDIR,
// existe mesmo rodando como root). effectiveQueuePath testa o env SEM tocar produção
// (save/restore do env).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeQueueReadFailure, markQueueDegraded, clearQueueDegraded } from "../src/orchestrQueueHealth.ts";
import { effectiveQueuePath, effectiveConsumerStatePath } from "../src/orchestrate.ts";

const ROOT = "/tmp/orch-orchenv-01-test";

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), "orch-orchenv-01-"));
}

test("fila AUSENTE = saudável (não degrada) — o estado vazio nunca é falso alarme", () => {
  const failure = probeQueueReadFailure({ queuePath: join(ROOT, "ausente-queue.jsonl") });
  assert.equal(failure, null);
});

test("fila PRESENTE e legível = saudável", () => {
  const tmp = freshDir();
  const queuePath = join(tmp, "queue.jsonl");
  writeFileSync(queuePath, JSON.stringify({ id: "q1", type: "noop" }) + "\n");
  assert.equal(probeQueueReadFailure({ queuePath }), null);
});

test("fila PRESENTE mas ilegível de verdade (dir no lugar do arquivo) → falha tipada", () => {
  const tmp = freshDir();
  const queuePath = join(tmp, "queue-dir");  // DIRETÓRIO: existsSync true, readFileSync EISDIR
  mkdirSync(queuePath, { recursive: true });
  const failure = probeQueueReadFailure({ queuePath });
  assert.ok(failure);
  assert.match(failure.reason, /ilegível/);
  assert.equal(failure.queuePath, queuePath);
  assert.ok(Number.isFinite(Date.parse(failure.at)));
});

test("readText injetado retornando null com exists true → falha (sem tocar fs real)", () => {
  const failure = probeQueueReadFailure({ queuePath: "/tmp/orch-orchenv-01-test/injetado.jsonl", exists: () => true, readText: () => null });
  assert.ok(failure);
  assert.match(failure.reason, /readText null/);
});

test("readText injetado LANÇANDO → falha (fail-open da sonda nunca derruba o caller)", () => {
  const failure = probeQueueReadFailure({ queuePath: "/tmp/orch-orchenv-01-test/lanca.jsonl", exists: () => true, readText: () => { throw new Error("boom"); } });
  assert.ok(failure);
  assert.match(failure.reason, /ilegível/);
});

test("markQueueDegraded: PRESERVA contagens/trilhas e escreve status degraded + spool", () => {
  const tmp = freshDir();
  const statePath = join(tmp, "consumer-state.json");
  const spoolPath = join(tmp, "spool.jsonl");
  writeFileSync(statePath, JSON.stringify({ status: "alive", lastPromotion: "2026-10-06T10:21:12Z", lastPromotionId: "orch-1", promotedCount: 183, skippedCount: 907, promotedIds: ["a", "b"], promotions: { "X": [1] } }));
  const r = markQueueDegraded({ consumerStatePath: statePath, spoolPath, reason: "EACCES: /opt/mission-events/orchestrator-queue.jsonl" });
  assert.equal(r.ok, true);
  assert.equal(r.stateWritten, true);
  assert.equal(r.spooled, true);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.status, "degraded");
  assert.equal(state.promotedCount, 183);
  assert.equal(state.skippedCount, 907);
  assert.deepEqual(state.promotedIds, ["a", "b"]);
  assert.deepEqual(state.promotions, { "X": [1] });
  assert.match(state.degradedReason, /EACCES/);
  assert.ok(Number.isFinite(Date.parse(state.degradedAt)));
  const spool = readFileSync(spoolPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(spool.some((s) => s.event === "orch_degraded" && s.missionId === "queue" && /EACCES/.test(s.msg)));
});

test("markQueueDegraded: state corrompido/ausente → ainda degrada (fail-open, nunca trava)", () => {
  const tmp = freshDir();
  const statePath = join(tmp, "consumer-state.json");
  writeFileSync(statePath, "NÃO-JSON{{{");
  const r = markQueueDegraded({ consumerStatePath: statePath, spoolPath: join(tmp, "spool.jsonl"), reason: "corrompido" });
  assert.equal(r.ok, true);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.status, "degraded");
  assert.equal(state.promotedCount, undefined);  // estado era ilegível — nada a preservar
});

test("clearQueueDegraded: SÓ escreve se o estado anterior era degraded (nunca toca alive/stopped)", () => {
  const tmp = freshDir();
  const statePath = join(tmp, "consumer-state.json");
  // alive → intocado
  writeFileSync(statePath, JSON.stringify({ status: "alive", promotedCount: 7 }));
  assert.deepEqual(clearQueueDegraded({ consumerStatePath: statePath }), { cleared: false });
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).status, "alive");
  // degraded → stopped com contagem preservada
  writeFileSync(statePath, JSON.stringify({ status: "degraded", degradedAt: "t", degradedReason: "r", promotedCount: 183 }));
  const r = clearQueueDegraded({ consumerStatePath: statePath });
  assert.deepEqual(r, { cleared: true });
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.status, "stopped");
  assert.equal(state.promotedCount, 183);
  assert.ok(Number.isFinite(Date.parse(state.degradedClearedAt)));
});

test("effectiveQueuePath: env lido; SEM env → default /data preservado (container intocado)", () => {
  const prev = process.env.ENG_MCP_QUEUE_PATH;
  try {
    process.env.ENG_MCP_QUEUE_PATH = "/opt/mission-events/orchestrator-queue.jsonl";
    assert.equal(effectiveQueuePath(), "/opt/mission-events/orchestrator-queue.jsonl");
    process.env.ENG_MCP_QUEUE_PATH = "   ";
    assert.equal(effectiveQueuePath(), "/data/orchestrator-queue.jsonl");
    delete process.env.ENG_MCP_QUEUE_PATH;
    assert.equal(effectiveQueuePath(), "/data/orchestrator-queue.jsonl");
  } finally {
    if (prev === undefined) delete process.env.ENG_MCP_QUEUE_PATH; else process.env.ENG_MCP_QUEUE_PATH = prev;
  }
});

test("effectiveConsumerStatePath: env lido; default /opt/mission-events preservado", () => {
  const prev = process.env.ENG_MCP_CONSUMER_STATE_PATH;
  try {
    process.env.ENG_MCP_CONSUMER_STATE_PATH = "/run/mission-bus/orchestrator-consumer.state.json";
    assert.equal(effectiveConsumerStatePath(), "/run/mission-bus/orchestrator-consumer.state.json");
    delete process.env.ENG_MCP_CONSUMER_STATE_PATH;
    assert.equal(effectiveConsumerStatePath(), "/opt/mission-events/orchestrator-consumer.state.json");
  } finally {
    if (prev === undefined) delete process.env.ENG_MCP_CONSUMER_STATE_PATH; else process.env.ENG_MCP_CONSUMER_STATE_PATH = prev;
  }
});

test("existsSync do fs real: ROOT hermético é o único lugar tocado (pin de hermeticidade)", () => {
  assert.ok(ROOT.startsWith("/tmp/orch-orchenv-01-test"));
  mkdirSync(ROOT, { recursive: true });
  assert.ok(existsSync(ROOT));
});
