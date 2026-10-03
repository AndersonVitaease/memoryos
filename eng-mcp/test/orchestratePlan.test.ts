// ORCH-QUEUE-PROMOTE-01 — higiene do planner (src/orchestrate.ts: runOrchestratePlan +
// readMissions). Contrato: capacidade conta SOMENTE status "dispatched" como slot
// ocupado (reopen devolve para "dispatched" — mission_core.py); registros unknown
// (*.verify.json, nudges.json) NUNCA contam como ativos e são classificados em
// unknownCount/unknownFiles. Hermético: mission-state fake sob /tmp, I/O por deps
// injetadas, probes de sistema null (fail-open determinístico).
import test from "node:test";
import assert from "node:assert/strict";
import { runOrchestratePlan } from "../src/orchestrate.ts";

const STATE_DIR = "/tmp/orch-queue-promote-test/state";

function makePlanDeps(files: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const names = Object.keys(files);
  return {
    missionStateDir: STATE_DIR,
    readdir: () => names,
    readText: (path: string) => {
      const base = path.split("/").pop() ?? "";
      return base in files ? files[base] : null;
    },
    exec: () => null, // df/systemctl indisponíveis → fail-open (null)
    now: () => Date.now(),
    ...overrides,
  };
}

function ledger(missionId: string, status: string): string {
  return JSON.stringify({ missionId, status });
}

test("higiene do planner: unknown (*.verify.json, nudges.json) NUNCA conta como ativo", () => {
  const files = {
    "X.verify.json": JSON.stringify({ missionId: "X", steps: [] }), // sem status → unknown
    "nudges.json": JSON.stringify({ nudges: [] }), // sem status → unknown
    "A.json": ledger("A", "dispatched"),
    "B.json": ledger("B", "closed"),
    "C.json": ledger("C", "dispatched"),
  };
  const plan = runOrchestratePlan({}, makePlanDeps(files) as any);
  assert.equal(plan.missions.active, 2); // só dispatched ocupa slot
  assert.equal(plan.missions.byStatus.dispatched, 2);
  assert.equal(plan.missions.byStatus.unknown, 2);
  assert.equal(plan.missions.unknownCount, 2);
  assert.ok(plan.missions.unknownFiles.includes("X.verify.json"));
  assert.ok(plan.missions.unknownFiles.includes("nudges.json"));
  assert.ok(plan.missions.unknownFiles.length <= 10); // cap 10
  assert.equal(plan.verdict, "GO"); // 2 ativos + sem max_parallel conhecido → GO
  assert.equal(plan.capacity.running, 2);
});

test("higiene do planner: falso THROTTLE de 53 unknowns eliminado (1 dispatched + 51 unknown → GO)", () => {
  const files: Record<string, string> = { "A.json": ledger("A", "dispatched") };
  for (let i = 0; i < 51; i++) files[`m${i}.verify.json`] = JSON.stringify({ missionId: `m${i}`, steps: [] });
  const deps = makePlanDeps(files, {
    readText: (path: string) => {
      const base = path.split("/").pop() ?? "";
      if (base === "agents.json") return JSON.stringify([{ type: "mission", max_parallel: 2 }]);
      return base in files ? files[base] : null;
    },
  });
  const plan = runOrchestratePlan({}, deps as any);
  assert.equal(plan.verdict, "GO");
  assert.equal(plan.capacity.running, 1); // 51 unknowns não contam
  assert.equal(plan.capacity.max, 2);
  assert.equal(plan.missions.unknownCount, 51);
});

test("honestidade: 2 dispatched + max_parallel 2 → THROTTLE (slots esgotados, sem unknown inflando)", () => {
  const files: Record<string, string> = {
    "A.json": ledger("A", "dispatched"),
    "B.json": ledger("B", "dispatched"),
  };
  const deps = makePlanDeps(files, {
    readText: (path: string) => {
      const base = path.split("/").pop() ?? "";
      if (base === "agents.json") return JSON.stringify([{ type: "mission", max_parallel: 2 }]);
      return base in files ? files[base] : null;
    },
  });
  const plan = runOrchestratePlan({}, deps as any);
  assert.equal(plan.verdict, "THROTTLE");
  assert.equal(plan.capacity.running, 2);
  assert.ok(plan.throttleReasons.some((r) => r.includes("esgotados (2/2")));
});

test("reopen cobre: status dispatched após reopen é o MESMO slot — e 'working' não conta como ativo", () => {
  // reopen devolve a missão para "dispatched" (mission_core.py) — não existe status
  // "reopened" no ledger; o contrato "dispatched/reopened" = status "dispatched".
  const files = {
    "R.json": ledger("R", "dispatched"), // reaberta pelo deliver-verify vermelho
    "W.json": ledger("W", "working"), // em execução NÃO ocupa slot do planner (ver contrato)
    "Z.json": ledger("Z", "interrupted"),
  };
  const plan = runOrchestratePlan({}, makePlanDeps(files) as any);
  assert.equal(plan.missions.active, 1);
  assert.equal(plan.missions.byStatus.dispatched, 1);
  assert.equal(plan.missions.stuckNoRecover, 1); // interrupted conta como travada
});

test("recover em curso → THROTTLE (e não conta como slot ativo)", () => {
  const files = { "V.json": ledger("V", "recover") };
  const plan = runOrchestratePlan({}, makePlanDeps(files) as any);
  assert.equal(plan.verdict, "THROTTLE");
  assert.equal(plan.missions.active, 0); // recover não é slot dispatched
  assert.equal(plan.missions.recoverInFlight, 1);
  assert.ok(plan.throttleReasons.some((r) => r.includes("recover")));
});

test("BLOCK intocado: orçamento >90% e 2 interrupted sem recover", () => {
  const files = {
    "I1.json": ledger("I1", "interrupted"),
    "I2.json": ledger("I2", "interrupted"),
  };
  const deps = makePlanDeps(files, {
    readText: (path: string) => {
      const base = path.split("/").pop() ?? "";
      if (base === "orchestrator-budget.json") return JSON.stringify({ used_today_usd: 95, ceiling_usd: 100 });
      return base in files ? files[base] : null;
    },
  });
  const plan = runOrchestratePlan({}, deps as any);
  assert.equal(plan.verdict, "BLOCK");
  assert.ok(plan.blockReasons.some((r) => r.includes("budget")));
  assert.ok(plan.blockReasons.some((r) => r.includes("interrupted")));
});

test("malformed state file: skip honesto, nunca derruba o plan", () => {
  const files = {
    "broken.json": "não é json {{{",
    "A.json": ledger("A", "dispatched"),
  };
  const plan = runOrchestratePlan({}, makePlanDeps(files) as any);
  assert.equal(plan.missions.active, 1);
  assert.equal(plan.verdict, "GO");
});

test("mission-state ilegível → THROTTLE honesto (não despachar às cegas)", () => {
  const plan = runOrchestratePlan({}, {
    missionStateDir: STATE_DIR,
    readdir: () => null, // ilegível
    readText: () => null,
    exec: () => null,
    now: () => Date.now(),
  } as any);
  assert.equal(plan.missions.readable, false);
  assert.equal(plan.verdict, "THROTTLE");
  assert.ok(plan.throttleReasons.some((r) => r.includes("ilegível")));
});