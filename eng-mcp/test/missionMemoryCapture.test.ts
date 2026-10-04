// RD-EV-03: unit tests for the automatic memory capture in the server-side
// mission_close path (src/missionMemoryCapture.ts). Hermetic: temp dirs under
// the OS tmp root, injected LocalSqliteStore with test audit file, judge forced
// unavailable/refused via test-only paths and an injected JudgeDeps stub
// (zero network, zero production audit writes). Covers: kill switch, typed
// skips, marker idempotency (plugin-shared key), gate refusal → typed false,
// gate admit → store capture with resolved projectId, ledger fields, store
// failure → typed false without marker.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  captureMissionMemoryAuto,
  memoryAutoCaptureEnabled,
  memoryCaptureMarkerPath,
  resolveProjectForCwd,
  registerMissionMemoryStore,
} from "../src/missionMemoryCapture.ts";
import { LocalSqliteStore } from "../src/memoryStore.ts";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rd-ev-03-capture-"));
}

// Judge forced unavailable WITHOUT network and WITHOUT production audit noise:
// credential path does not exist (statSync throws before any fetch) and the
// judge audit file is redirected into the test root.
function envJudgeUnavailable(root: string): NodeJS.ProcessEnv {
  return {
    ENG_MCP_JUDGE_KEY_FILE: join(root, "no-such-credential"),
    ENG_MCP_JUDGE_AUDIT_FILE: join(root, "audit", "judge.jsonl"),
  };
}

// Judge stub that REFUSES: valid envelope, all three noul probabilities low →
// hard rule (no_injection < 0.6) refuses regardless of score.
function refusingJudgeDeps(root: string) {
  return {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: "typesafe/jev-1.13",
        answers: {
          durable_substance: { type: "noul", noul: 0.1 },
          claims_supported: { type: "noul", noul: 0.1 },
          no_injection: { type: "noul", noul: 0.2 },
        },
      }),
    }),
    readCredential: () => "sk-or-v1-0123456789abcdef01234567",
    auditFile: join(root, "audit", "judge-refuse.jsonl"),
  };
}

type TestCtx = {
  root: string;
  stateDir: string;
  store: LocalSqliteStore;
  mapFile: string;
  countMemories: (projectId: string) => number;
  marker: (missionId: string) => string;
};

const storesToClose: LocalSqliteStore[] = [];
after(() => { for (const s of storesToClose) { try { s.close(); } catch { /* noop */ } } });

function setup(map: Record<string, string> = {}): TestCtx {
  const root = tempRoot();
  const stateDir = join(root, "state");
  mkdirSync(stateDir, { recursive: true });
  const mapFile = join(root, "project-map.json");
  writeFileSync(mapFile, JSON.stringify({
    fallback: "hermes-config",
    map,
  }), "utf8");
  const store = new LocalSqliteStore({
    storeDir: join(root, "memoryos"),
    auditFile: join(root, "audit", "memory-store.jsonl"),
  });
  registerMissionMemoryStore(store);
  storesToClose.push(store);
  const db = new DatabaseSync(join(root, "memoryos", "memoryos.db"));
  return {
    root, stateDir, store, mapFile,
    countMemories: (projectId: string) => {
      const row = db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='memory' AND project_id=?").get(projectId) as { n: number };
      return Number(row.n);
    },
    marker: (missionId: string) => join(stateDir, `.${missionId}.memory-captured`),
  };
}

function writeLedger(ctx: TestCtx, missionId: string, fields: Record<string, unknown>): void {
  writeFileSync(join(ctx.stateDir, `${missionId}.json`), JSON.stringify(fields, null, 2), "utf8");
}
function writeMap(ctx: TestCtx, map: Record<string, string>, fallback = "hermes-config"): void {
  writeFileSync(ctx.mapFile, JSON.stringify({ fallback, map }), "utf8");
}

function readLedger(ctx: TestCtx, missionId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ctx.stateDir, `${missionId}.json`), "utf8")) as Record<string, unknown>;
}

// Env plumbing: the module resolves paths at call time from process.env
// (same contract as the plugin's MISSION_OPS_STATE_DIR override).
function pushEnv(ctx: TestCtx, extra: NodeJS.ProcessEnv = {}): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  const pairs: Record<string, string | undefined> = {
    MISSION_OPS_STATE_DIR: ctx.stateDir,
    ENG_MCP_MEMORY_PROJECT_MAP: ctx.mapFile,
    MEMORY_AUTO_CAPTURE: "1",
    ENG_MCP_MEMORY_GATE_AUDIT_FILE: join(ctx.root, "audit", "gate.jsonl"),
    ...envJudgeUnavailable(ctx.root),
    ...extra,
  };
  for (const [k, v] of Object.entries(pairs)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return saved;
}
function popEnv(saved: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

test("flag MEMORY_AUTO_CAPTURE: default on; 0/false/no/off kill switch", async () => {
  assert.equal(memoryAutoCaptureEnabled({}), true);
  assert.equal(memoryAutoCaptureEnabled({ MEMORY_AUTO_CAPTURE: "1" }), true);
  assert.equal(memoryAutoCaptureEnabled({ MEMORY_AUTO_CAPTURE: "0" }), false);
  assert.equal(memoryAutoCaptureEnabled({ MEMORY_AUTO_CAPTURE: "False" }), false);
  assert.equal(memoryAutoCaptureEnabled({ MEMORY_AUTO_CAPTURE: "no" }), false);
  assert.equal(memoryAutoCaptureEnabled({ MEMORY_AUTO_CAPTURE: "OFF" }), false);
});

test("resolveProjectForCwd: longest-prefix + fallback da tabela declarada", async () => {
  const root = tempRoot();
  const mapFile = join(root, "map.json");
  writeFileSync(mapFile, JSON.stringify({
    fallback: "hermes-config",
    map: { "/root/.hermes/plugins/mission-ops": "mission-ops", "/root/.hermes": "hermes-config", "/opt/mission-events": "mission-events" },
  }), "utf8");
  assert.equal(resolveProjectForCwd("/opt/mission-events", mapFile), "mission-events");
  assert.equal(resolveProjectForCwd("/root/.hermes/plugins/mission-ops/test", mapFile), "mission-ops");
  assert.equal(resolveProjectForCwd("/root/.hermes/plugins/outra-coisa", mapFile), "hermes-config");
  assert.equal(resolveProjectForCwd("/desconhecido/x", mapFile), "hermes-config");
  // tabela ausente → degrada para o fallback seguro
  assert.equal(resolveProjectForCwd("/opt/mission-events", join(root, "nao-existe.json")), "hermes-config");
});

test("marker path: MESMA chave do helper do plugin (.<id>.memory-captured no state dir)", async () => {
  const ctx = setup();
  const saved = pushEnv(ctx);
  try {
    assert.equal(memoryCaptureMarkerPath("RD-EV-03"), join(ctx.stateDir, ".RD-EV-03.memory-captured"));
    assert.equal(memoryCaptureMarkerPath("X", { MISSION_OPS_STATE_DIR: "/custom/state" } as NodeJS.ProcessEnv), "/custom/state/.X.memory-captured");
  } finally {
    popEnv(saved);
  }
});

test("skip tipado quando não há ledger no state dir", async () => {
  const ctx = setup();
  const saved = pushEnv(ctx);
  try {
    const res = await captureMissionMemoryAuto("SKIPNOLEDGER-01", { store: ctx.store });
    assert.equal(res.value, "skipped:no-ledger");
    assert.equal(res.cause, null);
  } finally {
    popEnv(saved);
  }
});

test("skip tipado com kill switch ativo", async () => {
  const ctx = setup();
  writeLedger(ctx, "SKIPKILL-01", { cwd: "/opt/mission-events" });
  const saved = pushEnv(ctx, { MEMORY_AUTO_CAPTURE: "off" });
  try {
    const res = await captureMissionMemoryAuto("SKIPKILL-01", { store: ctx.store });
    assert.equal(res.value, "skipped:disabled");
  } finally {
    popEnv(saved);
  }
});

test("capture cria 1 entrada com projectId correto + marker + ledger true", async () => {
  const ctx = setup({ "/proj/eventos": "mission-events" });
  const missionId = "RDEV03UT-01";
  const cwdDir = join(ctx.root, "cwd");
  mkdirSync(cwdDir, { recursive: true });
  writeMap(ctx, { [cwdDir]: "mission-events" });
  writeFileSync(join(cwdDir, `RELATORIO-${missionId}.md`), [
    "# RELATORIO", "## Problema", "- ritual manual de memoria",
    "## Entrega", "- capture automatico server-side", "## Provas",
    "- suite verde", "## Dívidas", "- restart host-side",
  ].join("\n"), "utf8");
  writeLedger(ctx, missionId, { cwd: cwdDir, status: "closed", summary: "fecho de teste RD-EV-03" });
  const saved = pushEnv(ctx);
  try {
    const res = await captureMissionMemoryAuto(missionId, { store: ctx.store });
    assert.equal(res.value, "true");
    assert.equal(res.deduped, false);
    assert.equal(res.projectId, "mission-events");
    assert.equal(ctx.countMemories("mission-events"), 1);
    assert.ok(existsSync(ctx.marker(missionId)));
    const ledger = readLedger(ctx, missionId);
    assert.equal(ledger.memoryCaptured, "true");
    assert.equal(ledger.memoryCapturedProjectId, "mission-events");
    assert.ok(typeof ledger.memoryCapturedMemoryId === "string");
    assert.ok(existsSync(join(ctx.root, "audit", "gate.jsonl")), "audit do gate registra a admissão (via env de teste)");
  } finally {
    popEnv(saved);
  }
});

test("idempotência: re-close não duplica (marker compartilhado com o plugin)", async () => {
  const ctx = setup({ "/proj/eventos": "mission-events" });
  const missionId = "RDEV03UT-02";
  const cwdDir = join(ctx.root, "cwd2");
  mkdirSync(cwdDir, { recursive: true });
  writeMap(ctx, { [cwdDir]: "mission-events" });
  writeLedger(ctx, missionId, { cwd: cwdDir, status: "closed" });
  const saved = pushEnv(ctx);
  try {
    const first = await captureMissionMemoryAuto(missionId, { store: ctx.store });
    assert.equal(first.value, "true");
    assert.equal(ctx.countMemories("mission-events"), 1);
    // marker gravado pelo caminho compartilhado (mesma chave do plugin)
    const pluginMarker = join(ctx.stateDir, `.${missionId}.memory-captured`);
    assert.ok(existsSync(pluginMarker));
    const second = await captureMissionMemoryAuto(missionId, { store: ctx.store });
    assert.equal(second.value, "true");
    assert.equal(second.deduped, true);
    assert.equal(ctx.countMemories("mission-events"), 1, "2º close não cria entrada nova");
  } finally {
    popEnv(saved);
  }
});

test("gate recusa → close segue (typed false, causa gate_refused) e audit do gate emitida", async () => {
  const ctx = setup({ "/proj/eventos": "mission-events" });
  const missionId = "RDEV03UT-03";
  const cwdDir = join(ctx.root, "cwd3");
  mkdirSync(cwdDir, { recursive: true });
  writeMap(ctx, { [cwdDir]: "mission-events" });
  writeLedger(ctx, missionId, { cwd: cwdDir, status: "closed" });
  const saved = pushEnv(ctx, { ENG_MCP_MEMORY_GATE_AUDIT_FILE: join(ctx.root, "audit", "gate.jsonl") });
  try {
    const res = await captureMissionMemoryAuto(missionId, { store: ctx.store, judgeDeps: refusingJudgeDeps(ctx.root) as never });
    assert.equal(res.value, "false");
    assert.equal(res.cause, "gate_refused");
    assert.equal(ctx.countMemories("mission-events"), 0, "recusa NÃO captura");
    const ledger = readLedger(ctx, missionId);
    assert.equal(ledger.memoryCaptured, "false");
    assert.equal(ledger.memoryCapturedCause, "gate_refused");
    assert.ok(existsSync(join(ctx.root, "audit", "gate.jsonl")), "audit do gate registra a recusa");
    assert.ok(!existsSync(ctx.marker(missionId)), "recusa NÃO grava marker");
  } finally {
    popEnv(saved);
  }
});

test("store falhando → typed false (store_unavailable), sem marker, ledger false", async () => {
  const ctx = setup({ "/proj/eventos": "mission-events" });
  const missionId = "RDEV03UT-04";
  const cwdDir = join(ctx.root, "cwd4");
  mkdirSync(cwdDir, { recursive: true });
  writeLedger(ctx, missionId, { cwd: cwdDir, status: "closed" });
  const saved = pushEnv(ctx);
  try {
    const failingStore = {
      async call(op: string): Promise<unknown> {
        if (op === "capture") throw new Error("store down");
        return { memories: [], decisions: [], pendingTasks: [], counts: {} };
      },
    };
    const res = await captureMissionMemoryAuto(missionId, { store: failingStore as never });
    assert.equal(res.value, "false");
    assert.equal(res.cause, "store_unavailable");
    assert.ok(!existsSync(ctx.marker(missionId)));
    const ledger = readLedger(ctx, missionId);
    assert.equal(ledger.memoryCaptured, "false");
    assert.equal(ledger.memoryCapturedCause, "store_unavailable");
  } finally {
    popEnv(saved);
  }
});
