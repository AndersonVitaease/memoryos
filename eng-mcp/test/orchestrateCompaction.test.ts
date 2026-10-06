// ORCH-QUEUE-COMPACT-01 — testes da compactação/arquivamento da fila do orquestrador
// (src/orchestrateCompaction.ts: runOrchestrateQueueCompaction). Herméticos: fs em
// memória (padrão HERMÉTICO-FIX-01) — nada toca /opt/mission-events nem /root/.hermes.
// Cobre os casos do contrato: (a) fechadas movem e a fila encolhe; (b) promovida com
// ledger inexistente NÃO move; (c) contagem preservada (fila+archive = antes);
// (d) dedup de cópias no archive; (e) rotação; extras: cap 200, dryRun, malformadas,
// fail-closed pós-escrita com rollback, estado lastCompactionAt.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runOrchestrateQueueCompaction,
  QUEUE_ARCHIVE_ROTATE_BYTES,
  QUEUE_ARCHIVE_MAX_LINES_PER_CYCLE,
  type QueueCompactionDeps,
} from "../src/orchestrateCompaction.ts";

const QUEUE = "/tmp/orch-compaction-test/orchestrator-queue.jsonl";
const ARCHIVE = "/tmp/orch-compaction-test/orchestrator-queue.archive.jsonl";
const STATE = "/tmp/orch-compaction-test/orchestrator-consumer.state.json";
const STATE_DIR = "/tmp/orch-compaction-test/state";

function entry(id: string, missionId: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ id, type: "mission_dispatch", payload: { missionId, ...extra }, priority: 5, enqueuedAt: "2026-10-03T00:00:00.000Z" });
}

/** fs em memória: arquivos por path + ledgers em STATE_DIR/<missionId>.json. */
function makeFs(opts: { queue?: string[]; ledgers?: Record<string, string | null>; state?: Record<string, unknown>; archive?: string; noQueueWrite?: boolean } = {}) {
  const files = new Map<string, string>();
  if (opts.queue && opts.queue.length > 0) files.set(QUEUE, opts.queue.join("\n") + "\n");
  if (opts.archive) files.set(ARCHIVE, opts.archive);
  if (opts.state) files.set(STATE, JSON.stringify(opts.state, null, 2));
  for (const [missionId, ledger] of Object.entries(opts.ledgers ?? {})) {
    if (ledger != null) files.set(`${STATE_DIR}/${missionId}.json`, ledger);
    // null = ledger inexistente (arquivo ausente)
  }
  const deps: QueueCompactionDeps = {
    queuePath: QUEUE,
    archivePath: ARCHIVE,
    consumerStatePath: STATE,
    missionStateDir: STATE_DIR,
    readText: (p: string) => files.get(p) ?? null,
    writeText: (p: string, data: string) => {
      if (p === QUEUE && opts.noQueueWrite) return; // simula escrita perdida (fail-closed)
      files.set(p, data);
    },
    appendFile: (p: string, data: string) => { files.set(p, (files.get(p) ?? "") + data); },
    existsSync: (p: string) => files.has(p),
    rename: (from: string, to: string) => {
      const c = files.get(from);
      if (c === undefined) throw new Error(`ENOENT: ${from}`);
      files.set(to, c);
      files.delete(from);
    },
    statSize: (p: string) => files.has(p) ? (files.get(p) ?? "").length : null,
    now: () => 1791066000000,
  };
  return { files, deps };
}

function queueLines(files: Map<string, string>): string[] {
  return (files.get(QUEUE) ?? "").split("\n").filter((l) => l.trim().length > 0);
}
function archiveLines(files: Map<string, string>): string[] {
  return (files.get(ARCHIVE) ?? "").split("\n").filter((l) => l.trim().length > 0);
}

test("(a) intents fechadas movem para o archive e a fila encolhe", () => {
  const { files, deps } = makeFs({
    queue: [entry("i1", "closed-a"), entry("i2", "open-b"), entry("i3", "closed-c")],
    ledgers: { "closed-a": JSON.stringify({ status: "closed" }), "open-b": JSON.stringify({ status: "dispatched" }), "closed-c": JSON.stringify({ status: "cancelled" }) },
    state: { status: "alive", promotedIds: ["i1"] },
  });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 2);
  assert.equal(r.archivedIntents, 2);
  assert.equal(r.afterQueueLines, 1);
  assert.deepEqual(queueLines(files), [entry("i2", "open-b")]); // só a pendente fica
  assert.equal(archiveLines(files).length, 2);
  assert.equal(r.stateError, undefined);
  // estado do consumidor ganha lastCompactionAt
  const state = JSON.parse(files.get(STATE) ?? "{}");
  assert.equal(state.lastCompactionAt, new Date(1791066000000).toISOString());
});

test("(b) intent promovida com ledger inexistente NÃO move (fail-closed)", () => {
  const { files, deps } = makeFs({
    queue: [entry("p1", "ghost-m"), entry("p2", "broken-m")],
    ledgers: { "ghost-m": null, "broken-m": "not-json{{{", },
    state: { status: "alive", promotedIds: ["p1", "p2"] },
  });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 0);
  assert.deepEqual(queueLines(files), [entry("p1", "ghost-m"), entry("p2", "broken-m")]);
  assert.equal(archiveLines(files).length, 0);
});

test("(c) contagem preservada: fila+archive (por cópias) = antes", () => {
  const { files, deps } = makeFs({
    queue: [entry("c1", "m1"), entry("c2", "m2"), entry("c3", "m3"), entry("c4", "m4")],
    ledgers: { m1: '{"status":"closed"}', m2: '{"status":"closed"}', m3: '{"status":"dispatched"}', m4: '{"status":"closed"}' },
    state: { status: "alive", promotedIds: [] },
  });
  const before = 4;
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.beforeQueueLines, before);
  // invariante: fila_depois + cópias_arquivadas == antes (trilha: nada some sem destino)
  const archivedCopiesSum = archiveLines(files).reduce((acc, l) => acc + ((JSON.parse(l) as { archivedCopies?: number }).archivedCopies ?? 1), 0);
  assert.equal(r.afterQueueLines + archivedCopiesSum, before);
  assert.equal(r.afterQueueLines + r.moved, r.beforeQueueLines);
  // cada linha arquivada declara archivedCopies (mesmo 1)
  for (const l of archiveLines(files)) {
    assert.ok(typeof (JSON.parse(l) as { archivedCopies?: number }).archivedCopies === "number");
  }
});

test("(d) dedup no archive: 3 cópias da mesma intent viram 1 linha (a mais recente) com archivedCopies: 3", () => {
  const { files, deps } = makeFs({
    queue: [
      entry("d1", "dup-m", { _attemptCount: 1 }),
      entry("d1", "dup-m", { _attemptCount: 2 }),
      entry("d1", "dup-m", { _attemptCount: 3 }),
      entry("other", "live-m"),
    ],
    ledgers: { "dup-m": '{"status":"closed"}', "live-m": '{"status":"dispatched"}' },
    state: { status: "alive", promotedIds: [] },
  });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 3);            // 3 cópias físicas movidas
  assert.equal(r.archivedLines, 1);    // dedup: 1 linha no archive
  assert.equal(r.archivedIntents, 1);
  assert.equal(r.afterQueueLines, 1);
  const archived = archiveLines(files);
  assert.equal(archived.length, 1);
  const parsed = JSON.parse(archived[0]) as { archivedCopies?: number; payload?: { _attemptCount?: number } };
  assert.equal(parsed.archivedCopies, 3);
  assert.equal(parsed.payload?._attemptCount, 3); // a MAIS RECENTE (última ocorrência)
  // a linha original na fila NÃO é alterada: as cópias saíram intactas para o archive... (original = última, com campo extra só no archive)
  assert.deepEqual(queueLines(files), [entry("other", "live-m")]);
});

test("(e) rotação: archive ≥ limite → archive.jsonl vira .1 e o novo archive recebe as linhas", () => {
  const { files, deps } = makeFs({
    queue: [entry("r1", "rot-m")],
    ledgers: { "rot-m": '{"status":"closed"}' },
    archive: "x".repeat(600) + "\n", // 601 bytes ≥ rotateBytes de teste (500)
    state: { status: "alive", promotedIds: [] },
  });
  const r = runOrchestrateQueueCompaction({ }, { ...deps, rotateBytes: 500 });
  assert.equal(r.ok, true);
  assert.equal(r.rotated, true);
  assert.deepEqual(queueLines(files), []); // fila esvaziou
  const rotated = (files.get(ARCHIVE + ".1") ?? "").split("\n").filter((l) => l.trim().length > 0);
  assert.equal(rotated.length, 1); // geração anterior preservada em .1
  const fresh = archiveLines(files);
  assert.equal(fresh.length, 1); // novo archive só com a linha deste ciclo
  assert.ok((JSON.parse(fresh[0]) as { id?: string }).id === "r1");
});

test("(e-const) limites default: rotação 5MB e cap 200 por ciclo", () => {
  assert.equal(QUEUE_ARCHIVE_ROTATE_BYTES, 5_000_000);
  assert.equal(QUEUE_ARCHIVE_MAX_LINES_PER_CYCLE, 200);
});

test("cap 200: ciclo move no máx 200 linhas, o resto fica para o próximo ciclo", () => {
  const queue: string[] = [];
  for (let i = 0; i < 205; i++) queue.push(entry(`cap-${i}`, "cap-m"));
  const { files, deps } = makeFs({ queue, ledgers: { "cap-m": '{"status":"closed"}' } });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 200);
  assert.equal(r.archivedIntents, 200);
  assert.equal(r.skipped, 5); // acima do cap: ficam na fila
  assert.equal(queueLines(files).length, 5);
});

test("dryRun projeta sem escrever nada", () => {
  const { files, deps } = makeFs({
    queue: [entry("dr1", "dr-m")],
    ledgers: { "dr-m": '{"status":"closed"}' },
  });
  const r = runOrchestrateQueueCompaction({ dryRun: true }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  assert.equal(r.moved, 1);
  assert.equal(r.afterQueueLines, 0);
  assert.equal(files.has(ARCHIVE), false);           // archive não criado
  assert.equal(queueLines(files).length, 1);         // fila intacta
  assert.equal(files.get(STATE), undefined);         // estado não tocado
});

test("fila vazia/ausente → ok sem efeito", () => {
  const { deps } = makeFs({});
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 0);
  const { deps: deps2 } = makeFs({ queue: [] });
  const r2 = runOrchestrateQueueCompaction({}, deps2);
  assert.equal(r2.ok, true);
  assert.equal(r2.moved, 0);
});

test("linhas malformadas e em branco ficam verbatim (nunca movidas)", () => {
  const { files, deps } = makeFs({
    queue: [entry("ok1", "ok-m"), "not json at all", "", entry("ok2", "ok2-m")],
    ledgers: { "ok-m": '{"status":"closed"}', "ok2-m": '{"status":"closed"}' },
  });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 2);
  const kept = (files.get(QUEUE) ?? "").split("\n");
  assert.ok(kept.includes("not json at all"));
  assert.ok(kept.includes(""));
});

test("fail-closed pós-escrita: escrita da fila perdida → fila restaurada, ok:false honesto", () => {
  const { files, deps } = makeFs({
    queue: [entry("f1", "fail-m")],
    ledgers: { "fail-m": '{"status":"closed"}' },
    noQueueWrite: true, // writeText do queue é no-op → postcheck verá a fila original
  });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /ORCH_COMPACT_POSTCHECK_FAILED/);
  // rollback: fila volta ao conteúdo original (trilha preservada; archive tem cópia a mais — reportado)
  assert.deepEqual(queueLines(files), [entry("f1", "fail-m")]);
});

test("missão viva (dispatched) e interrupted NÃO movem (apenas closed/cancelled)", () => {
  const { files, deps } = makeFs({
    queue: [entry("v1", "live-m"), entry("v2", "int-m")],
    ledgers: { "live-m": '{"status":"dispatched"}', "int-m": '{"status":"interrupted"}' },
    state: { status: "alive", promotedIds: ["v1", "v2"] },
  });
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 0);
  assert.equal(r.skipped, 2);
  assert.equal(queueLines(files).length, 2);
});

test("promotedIds como sinal: promotedCopies conta cópias de ids promovidos", () => {
  const { deps } = makeFs({
    queue: [entry("s1", "sig-m"), entry("s1", "sig-m"), entry("s2", "sig-m")],
    ledgers: { "sig-m": '{"status":"closed"}' },
    state: { status: "alive", promotedIds: ["s1"] },
  });
  const r = runOrchestrateQueueCompaction({ dryRun: true }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 3);
  assert.equal(r.promotedCopies, 2); // só as cópias de s1
});

test("stateError: falha ao gravar estado é fail-open (trilha preservada, ok:true)", () => {
  const files = new Map<string, string>();
  files.set(QUEUE, entry("st1", "st-m") + "\n");
  files.set(`${STATE_DIR}/st-m.json`, '{"status":"closed"}');
  const deps: QueueCompactionDeps = {
    queuePath: QUEUE, archivePath: ARCHIVE, consumerStatePath: STATE, missionStateDir: STATE_DIR,
    readText: (p: string) => files.get(p) ?? null,
    writeText: (p: string, data: string) => {
      if (p === STATE) throw new Error("disk full");
      files.set(p, data);
    },
    appendFile: (p: string, data: string) => { files.set(p, (files.get(p) ?? "") + data); },
    existsSync: (p: string) => files.has(p),
    rename: () => { throw new Error("should not rotate"); },
    statSize: (p: string) => files.has(p) ? (files.get(p) ?? "").length : null,
    now: () => 1791066000000,
  };
  const r = runOrchestrateQueueCompaction({}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.moved, 1);
  assert.match(r.stateError ?? "", /disk full/);
  assert.equal(queueLines(files).length, 0); // trilha: movida está no archive
  assert.equal(archiveLines(files).length, 1);
});
// ---- RD-ORCH-ENV-01: compaction lê a fila do env (ENG_MCP_QUEUE_PATH) sem deps ----
// A simulação usa fila contendo só linha malformada (nunca elegível → nada movido);
// beforeQueueLines=1 PROVA a leitura do path do env (e não do default /data).
test("RD-ORCH-ENV-01: compaction resolve fila via ENG_MCP_QUEUE_PATH sem deps", () => {
  const tmp = mkdtempSync(join(tmpdir(), "orch-compaction-env-"));
  const queuePath = join(tmp, "queue.jsonl");
  writeFileSync(queuePath, "linha-malformada-não-json\n");
  const prevState = process.env.ENG_MCP_CONSUMER_STATE_PATH;
  const prevQueue = process.env.ENG_MCP_QUEUE_PATH;
  try {
    process.env.ENG_MCP_QUEUE_PATH = queuePath;
    process.env.ENG_MCP_CONSUMER_STATE_PATH = join(tmp, "state.json");
    const result = runOrchestrateQueueCompaction({});
    assert.equal(result.ok, true);
    assert.equal(result.beforeQueueLines, 1);   // leu o path do env
    assert.equal(result.moved, 0);              // linha malformada nunca é movida
    assert.equal(result.afterQueueLines, 1);
  } finally {
    if (prevQueue === undefined) delete process.env.ENG_MCP_QUEUE_PATH; else process.env.ENG_MCP_QUEUE_PATH = prevQueue;
    if (prevState === undefined) delete process.env.ENG_MCP_CONSUMER_STATE_PATH; else process.env.ENG_MCP_CONSUMER_STATE_PATH = prevState;
  }
});
