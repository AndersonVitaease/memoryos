// RD-ORCH-FILA-01 — provas determinísticas do consumer roadmap (fonte secundária
// de fila). Zero mutation real: todo I/O roteado por deps injetadas (padrão
// HERMÉTICO-FIX-01; nada toca /opt/mission-events, /root/.hermes ou a fila real).
// Provas do contrato: fixture 5 linhas → 1 ciclo promove exatamente 2 na ordem de
// prioridade; re-ciclo = 0 promoção (dedupe idempotente); gate-operator NUNCA gera
// intent (prova negativa); kill switch ROADMAP_QUEUE=off; contrato gerado por
// template; spawnedBy=roadmap-fila no intent; fail-open.
import test from "node:test";
import assert from "node:assert/strict";
import { runOrchestrateConsume } from "../src/orchestrate.ts";
import {
  parseRoadmapRows,
  roadmapContractMarkdown,
  roadmapContractPath,
  contractComponent,
  scanRoadmapQueue,
  type RoadmapScanResult,
} from "../src/orchestrateRoadmap.ts";

const DIR = "/tmp/rd-orch-fila-01-test";
const ROADMAP = `${DIR}/ROADMAP.md`;
const QUEUE = `${DIR}/orchestrator-queue.jsonl`;
const PROMPT = `${DIR}/prompt.txt`;

// Fixture do contrato: 5 linhas — 2 fila:sim pendentes (prio 1 e 2), 1 gate-operator,
// 1 fechada (ledger closed), 1 aguarda-operator.
const FIXTURE = [
  "# ROADMAP fixture",
  "",
  "## 1. Itens pendentes",
  "",
  "| ID proposto | Fonte | Escopo em 1 linha | Dependências | Prio | Fila | DependsOn | Estado |",
  "|---|---|---|---|---|---|---|---|",
  "| RD-AAA-01 | fonte A | escopo A | — | 1 | sim | | pendente |",
  "| RD-BBB-02 | fonte B | escopo B | — | 2 | sim | | pendente |",
  "| RD-GATE-03 | fonte C | escopo C | — | 1 | gate-operator | | pendente |",
  "| RD-CLOSED-04 | fonte D | escopo D | — | 1 | sim | | pendente |",
  "| RD-WAIT-05 | fonte E | escopo E | — | 1 | sim | | aguarda-operator |",
  "",
].join("\n");

type World = {
  files: Map<string, string>;
  appends: string[];
  spool: string[];
  dispatched: Array<{ missionId: string; promptFile: string; spawnedBy?: string; worktree?: string }>;
};

function makeWorld(overrides: Record<string, unknown> = {}) {
  const w: World = { files: new Map(), appends: [], spool: [], dispatched: [] };
  const deps = {
    roadmapPath: ROADMAP,
    roadmapContractDir: DIR,
    queuePath: QUEUE,
    consumerStatePath: `${DIR}/consumer.state.json`,
    consumerLockPath: `${DIR}/consumer.lock`,
    spoolPath: `${DIR}/spool.jsonl`,
    consumeAuditPath: `${DIR}/consume-audit.jsonl`,
    missionStateDir: `${DIR}/state`,
    readText: (p: string) => w.files.get(p) ?? null,
    writeText: (p: string, data: string) => { w.files.set(p, data); },
    appendFile: (p: string, data: string) => {
      w.appends.push(JSON.stringify({ p, data }));
      if (p === QUEUE) w.files.set(QUEUE, (w.files.get(QUEUE) ?? "") + data); // fila persiste entre ciclos (append-only)
    },
    unlink: (p: string) => { w.files.delete(p); },
    existsSync: (p: string) => w.files.has(p) || p === QUEUE,
    readdir: () => [],
    exec: () => null,
    now: () => Date.now(),
    dispatchMission: async (i: { missionId: string; promptFile: string; spawnedBy?: string; worktree?: string }) => {
      w.dispatched.push(i);
      return { ok: true };
    },
    ...overrides,
  };
  return { w, deps };
}

function seedWorld(w: World, roadmap = FIXTURE) {
  w.files.set(ROADMAP, roadmap);
  w.files.set(PROMPT, "prompt base");
  // RD-CLOSED-04 com ledger fechado
  w.files.set(`${DIR}/state/RD-CLOSED-04.json`, JSON.stringify({ status: "closed" }));
  // Contratos existentes para as duas linhas fila:sim (reuso, sem geração)
  w.files.set(roadmapContractPath(DIR, "RD-AAA-01"), "# MISSÃO RD-AAA-01\n\n**Componente:** mission-ops (x) · **Prioridade:** 1\n");
  w.files.set(roadmapContractPath(DIR, "RD-BBB-02"), "# MISSÃO RD-BBB-02\n\n**Componente:** eng-mcp · **Prioridade:** 2\n");
}

function lastQueueEntries(w: World) {
  return w.appends.filter((a) => JSON.parse(a).p === QUEUE).map((a) => JSON.parse(a).data.trim());
}

test("parseRoadmapRows: colunas mapeadas pelo cabeçalho (Fila/DependsOn/Estado)", () => {
  const rows = parseRoadmapRows(FIXTURE);
  assert.equal(rows.length, 5);
  const aaa = rows.find((r) => r.id === "RD-AAA-01")!;
  assert.equal(aaa.fila, "sim");
  assert.equal(aaa.estado, "pendente");
  assert.equal(aaa.prio, 1);
  const gate = rows.find((r) => r.id === "RD-GATE-03")!;
  assert.equal(gate.fila, "gate-operator");
  // sem coluna Fila → fila null (feature inerte)
  const semFila = FIXTURE.replace(" | Fila | DependsOn", "").replace("|---|---|---|---|---|---|---|---|", "|---|---|---|---|---|");
  const rows2 = parseRoadmapRows(semFila);
  assert.ok(rows2.every((r) => r.fila == null));
});

test("prova determinística: 1 ciclo promove exatamente 2, na ordem de prioridade", async () => {
  const { w, deps } = makeWorld();
  seedWorld(w);
  const r1 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps as never);
  assert.equal(r1.roadmap?.enqueued, 2);
  assert.equal(r1.promoted, 2);
  // ordem de prioridade: RD-AAA-01 (prio 1) antes de RD-BBB-02 (prio 2)
  assert.deepEqual(w.dispatched.map((x) => x.missionId), ["RD-AAA-01", "RD-BBB-02"]);
  // spawnedBy=roadmap-fila no pai da cadeia
  assert.ok(w.dispatched.every((x) => x.spawnedBy === "roadmap-fila"));
  // componente do contrato existente é extraído (mission-ops / eng-mcp)
  const entries = lastQueueEntries(w).map((l) => JSON.parse(l));
  assert.equal(entries.find((e: { payload: { missionId: string } }) => e.payload.missionId === "RD-AAA-01").payload.componente, "mission-ops");
  assert.equal(entries.find((e: { payload: { missionId: string } }) => e.payload.missionId === "RD-BBB-02").payload.componente, "eng-mcp");
  // worktree por catálogo de componente
  assert.equal(entries.find((e: { payload: { missionId: string } }) => e.payload.missionId === "RD-BBB-02").payload.worktree, "/opt/memoryos/eng-mcp");

  // re-ciclo = 0 promoção (dedupe idempotente: ledger em voo + queue-duplicate + promotedIds)
  const r2 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps as never);
  assert.equal(r2.roadmap?.enqueued, 0);
  assert.equal(r2.promoted, 0);
  assert.equal(w.dispatched.length, 2);
});

test("prova de fronteira: gate-operator e aguarda-operator NUNCA geram intent", async () => {
  const { w, deps } = makeWorld();
  seedWorld(w);
  await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps as never);
  const ids = lastQueueEntries(w).map((l) => (JSON.parse(l) as { payload: { missionId: string } }).payload.missionId);
  assert.ok(!ids.includes("RD-GATE-03"), "gate-operator não pode ser enfileirado");
  assert.ok(!ids.includes("RD-WAIT-05"), "aguarda-operator não pode ser enfileirado");
  assert.ok(!ids.includes("RD-CLOSED-04"), "ledger fechado não pode ser re-despachado");
  // telemetria tipada no spool do ciclo (execute): skip de gate-operator auditado
  const spoolLines = w.appends.filter((a) => JSON.parse(a).p.includes("spool.jsonl")).map((a) => JSON.parse(a).data);
  assert.ok(spoolLines.some((l) => l.includes("orch_roadmap_skip") && l.includes("RD-GATE-03") && l.includes("gate-operator")));
});

test("scan: reasons tipadas para gate-operator / estado / ledger fechado", () => {
  const { w, deps } = makeWorld();
  seedWorld(w);
  const scan = scanRoadmapQueue(deps as never, { mode: "execute", queueEntries: [], spool: (k, m, msg) => w.spool.push(`${k}|${m}|${msg}`) });
  const byId = new Map(scan.decisions.map((x) => [x.id, x]));
  assert.equal(byId.get("RD-GATE-03")?.reason, "gate-operator: entra APENAS por intent explícita do operator (prova negativa)");
  assert.equal(byId.get("RD-WAIT-05")?.decision, "skipped");
  assert.match(byId.get("RD-WAIT-05")!.reason, /aguarda-operator/);
  assert.match(byId.get("RD-CLOSED-04")!.reason, /ledger:closed/);
  // telemetria tipada com origem/linha/dedupe
  assert.ok(w.spool.some((s) => s.startsWith("orch_roadmap_skip|RD-GATE-03|") && s.includes("origem=roadmap-fila") && s.includes("L9")));
  assert.ok(w.spool.some((s) => s.startsWith("orch_roadmap_enqueue|RD-AAA-01|") && s.includes("dedupe=novo")));
});

test("kill switch ROADMAP_QUEUE=off desliga o scan (tipado, nada enfileira)", async () => {
  const { w, deps } = makeWorld();
  seedWorld(w);
  process.env.ROADMAP_QUEUE = "off";
  try {
    const r = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps as never);
    assert.equal(r.roadmap?.enabled, false);
    assert.equal(r.roadmap?.killSwitch, true);
    assert.equal(r.promoted, 0);
    assert.equal(w.dispatched.length, 0);
  } finally {
    delete process.env.ROADMAP_QUEUE;
  }
});

test("contrato ausente é gerado por template determinístico (execute); plan não escreve", async () => {
  const { w, deps } = makeWorld();
  seedWorld(w);
  w.files.delete(roadmapContractPath(DIR, "RD-AAA-01")); // sem contrato
  // plan: nada escrito, decisão would_enqueue
  const plan = await runOrchestrateConsume({ execute: false }, deps as never);
  assert.equal(plan.mode, "plan");
  const planDec = plan.roadmap?.decisions.find((x) => x.id === "RD-AAA-01");
  assert.equal(planDec?.decision, "would_enqueue");
  assert.equal(planDec?.contractGenerated, true);
  assert.equal(w.files.has(roadmapContractPath(DIR, "RD-AAA-01")), false, "plan não gera contrato");

  // execute: contrato gerado a partir do escopo da linha (fonte obrigatória)
  const exec = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps as never);
  assert.equal(exec.roadmap?.decisions.find((x) => x.id === "RD-AAA-01")?.contractGenerated, true);
  const md = w.files.get(roadmapContractPath(DIR, "RD-AAA-01")) ?? "";
  assert.ok(md.includes("# MISSÃO RD-AAA-01"));
  assert.ok(md.includes("escopo A"), "escopo citado da linha é a fonte obrigatória");
  assert.ok(md.includes("spawnedBy: roadmap-fila"));
  assert.ok(md.includes("escopo-insuficiente"), "regra de fail-closed do template presente");
  // intent usa o contrato gerado
  const entry = JSON.parse(lastQueueEntries(w).find((l) => l.includes("RD-AAA-01")));
  assert.equal(entry.payload.prompt, roadmapContractPath(DIR, "RD-AAA-01"));
});

test("dependências: DependsOn não resolvido bloqueia a linha (dep-unsatisfied)", () => {
  const roadmap = FIXTURE.replace(
    "| RD-BBB-02 | fonte B | escopo B | — | 2 | sim | | pendente |",
    "| RD-BBB-02 | fonte B | escopo B | — | 2 | sim | RD-AAA-01 | pendente |",
  );
  const { w, deps } = makeWorld();
  seedWorld(w, roadmap);
  // RD-AAA-01 pendente (não resolvida) → RD-BBB-02 bloqueada
  let scan = scanRoadmapQueue(deps as never, { mode: "execute", queueEntries: [], spool: () => {} });
  let byId = new Map(scan.decisions.map((x) => [x.id, x]));
  assert.match(byId.get("RD-BBB-02")!.reason, /dep-unsatisfied:RD-AAA-01/);
  // RD-AAA-01 resolvida no roadmap → dependência satisfeita
  w.files.set(ROADMAP, roadmap.replace("| RD-AAA-01 | fonte A | escopo A | — | 1 | sim | | pendente |", "| RD-AAA-01 | fonte A | escopo A | — | 1 | sim | | resolvido 04/10 (prova) |"));
  scan = scanRoadmapQueue(deps as never, { mode: "execute", queueEntries: [], spool: () => {} });
  byId = new Map(scan.decisions.map((x) => [x.id, x]));
  assert.equal(byId.get("RD-BBB-02")?.decision, "enqueued");
  // ledger closed da dependência também satisfaz
  w.files.set(ROADMAP, roadmap);
  w.files.set(`${DIR}/state/RD-AAA-01.json`, JSON.stringify({ status: "closed" }));
  scan = scanRoadmapQueue(deps as never, { mode: "execute", queueEntries: [], spool: () => {} });
  byId = new Map(scan.decisions.map((x) => [x.id, x]));
  assert.equal(byId.get("RD-BBB-02")?.decision, "enqueued");
});

test("fail-open: ROADMAP ausente e erro de write nunca derrubam o ciclo", async () => {
  const { w, deps } = makeWorld();
  seedWorld(w);
  w.files.delete(ROADMAP);
  const r = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps as never);
  assert.equal(r.roadmap?.roadmapRead, false);
  assert.match(r.roadmap?.error ?? "", /roadmap-ausente/);
  assert.equal(r.promoted, 0);

  // write falho do contrato → skip tipado, ciclo segue (throw SÓ no path do
  // contrato — lock/estado usam o mesmo writeText injetado e não podem quebrar)
  const { w: w2, deps: deps2 } = makeWorld();
  seedWorld(w2);
  w2.files.delete(roadmapContractPath(DIR, "RD-AAA-01"));
  (deps2 as Record<string, unknown>)["writeText"] = (p: string, data: string) => {
    if (p === roadmapContractPath(DIR, "RD-AAA-01")) throw new Error("disk full");
    w2.files.set(p, data);
  };
  const r2 = await runOrchestrateConsume({ execute: true, approval: { approved: true } }, deps2 as never);
  const dec = r2.roadmap?.decisions.find((x) => x.id === "RD-AAA-01");
  assert.match(dec?.reason ?? "", /contract-write-failed/);
  assert.equal(w2.dispatched.filter((x) => x.missionId === "RD-AAA-01").length, 0);
  // a outra linha fila:sim segue (ciclo não morreu)
  assert.equal(w2.dispatched.filter((x) => x.missionId === "RD-BBB-02").length, 1);
});

test("template e helpers: path, markdown e extração de componente", () => {
  const rows = parseRoadmapRows(FIXTURE);
  const row = rows[0];
  const md = roadmapContractMarkdown(row, "mission-ops");
  assert.ok(md.startsWith("# MISSÃO RD-AAA-01"));
  assert.ok(md.includes("**Fonte:** fonte A"));
  assert.ok(md.includes("## Provas"));
  assert.equal(contractComponent("**Componente:** mission-ops (supervisor_guard) · **Prioridade:** 1"), "mission-ops");
  assert.equal(contractComponent("sem componente"), null);
});
