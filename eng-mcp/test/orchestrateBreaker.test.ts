// ORCH-BREAKER-01 — provas do breaker de pressão (src/orchestrateBreaker.ts +
// gate de swap/iowait em src/orchestrate.ts: runOrchestratePlan). Hermético:
// fs em memória, hooks fakes, zero rede/LLM/shell real. Cobre o manifesto:
// (1) simulação de amostras → ESTÁGIO 1 pausa o mais novo; reentrância; RETOMA
//     revoga; fail-closed sem dados.
// (2) gate do plan: swap 60% falso ⇒ slots 0 com motivo citando swap (e iowait).
// (3) não-interceptação: financeiro/aprovação/needs_operator/P0 operator-now
//     nunca entram na lista de pausáveis (assert do filtro isProtectedMission).
// (4) herdr irresponsável: streak ≥3 → alerta notify; recuperação zera.
import test from "node:test";
import assert from "node:assert/strict";
import { runBreakerTick, isProtectedMission, BREAKER_THRESHOLDS, PAUSADO_MESSAGE, RESUMO_MESSAGE_PREFIX } from "../src/orchestrateBreaker.ts";
import { runOrchestratePlan } from "../src/orchestrate.ts";

// ---- harness: fs em memória ----

function makeBreakerDeps({ ledgers = {}, files = {}, overrides = {} } = {}) {
  const map = new Map(Object.entries(files));
  for (const [name, ledger] of Object.entries(ledgers)) {
    map.set(`/root/.hermes/mission-state/${name}`, typeof ledger === "string" ? ledger : JSON.stringify(ledger));
  }
  const calls = { pause: [], resume: [], notify: [], spool: [], writes: [] };
  const deps: Record<string, unknown> = {
    now: () => Date.now(),
    readText: (p: string) => map.get(p) ?? null,
    readdir: (p: string) => (p === "/root/.hermes/mission-state" ? [...map.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1)) : []),
    writeText: (p: string, data: string) => { map.set(p, data); calls.writes.push(p); },
    appendFile: (p: string, data: string) => { calls.spool.push(JSON.parse(data.trim())); },
    loadavgPath: "/proc/loadavg",
    meminfoPath: "/proc/meminfo",
    missionStateDir: "/root/.hermes/mission-state",
    spoolPath: "/opt/mission-events/spool.jsonl",
    breakerStatePath: "/opt/mission-events/orchestrator-breaker.state.json",
    cores: 8,
    pauseMission: async (m: { missionId: string }) => { calls.pause.push(m); return { ok: true }; },
    resumeMission: async (m: { missionId: string }) => { calls.resume.push(m); return { ok: true }; },
    notify: async (summary: string, status?: string) => { calls.notify.push({ summary, status }); return { delivered: true }; },
    ...overrides,
  };
  return { deps, map, calls, getState: () => JSON.parse(map.get("/opt/mission-events/orchestrator-breaker.state.json")!) };
}

function meminfo(swapUsedKb: number | null, swapTotalKb = 8_388_608): string {
  if (swapUsedKb == null) return "MemTotal: 32000 kB\nMemFree: 8000 kB\n";
  const free = swapTotalKb - swapUsedKb;
  return `MemTotal: 32000 kB\nMemFree: 8000 kB\nSwapTotal: ${swapTotalKb} kB\nSwapFree: ${free} kB\n`;
}

function loadavgText(v: number): string {
  return `${v} 0.5 0.4 1/100 1234\n`;
}

function ledgerJson(missionId: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ missionId, status: "dispatched", paneId: `p_${missionId}`, dispatchedAt: "2026-10-03T10:00:00Z", updatedAt: "2026-10-03T10:00:00Z", ...extra });
}

// ---- (1) ESTÁGIO 1: 3 amostras altas pausam o MAIS NOVO em voo ----

test("breaker ESTÁGIO 1: 3 amostras com load > 2×cores pausam o worker mais novo (marker + nudge PAUSADO + notify)", async () => {
  const { deps, map, calls } = makeBreakerDeps({
    ledgers: {
      "OLD.json": ledgerJson("OLD", { dispatchedAt: "2026-10-03T09:00:00Z" }),
      "NEW.json": ledgerJson("NEW", { dispatchedAt: "2026-10-03T11:00:00Z" }),
    },
    files: {
      "/proc/loadavg": loadavgText(20), // 20 > 2×8
      "/proc/meminfo": meminfo(null), // sem swap configurado
    },
  });
  // amostras 1 e 2: só contam (nenhuma ação)
  const t1 = await runBreakerTick(undefined, deps as any);
  assert.equal(t1.stage, 0);
  assert.equal(t1.paused.length, 0);
  const t2 = await runBreakerTick(undefined, deps as any);
  assert.equal(t2.stage, 0);
  // amostra 3: dispara estágio 1
  const t3 = await runBreakerTick(undefined, deps as any);
  assert.equal(t3.stage, 1);
  assert.deepEqual(t3.paused, ["NEW"]); // o MAIS NOVO
  assert.equal(calls.pause.length, 1);
  assert.equal(calls.pause[0].missionId, "NEW");
  assert.equal(calls.notify.length, 1); // primeiro ESTÁGIO 1 → aviso visível
  assert.ok(calls.notify[0].summary.includes("ESTÁGIO 1"));
  // marcador no ledger no formato que o watchdog JÁ respeita (WATCHDOG-PAUSE-01)
  const marked = JSON.parse(map.get("/root/.hermes/mission-state/NEW.json")!);
  assert.equal(marked.pause.paused, true);
  assert.equal(marked.pause.by, "breaker");
  assert.equal(marked.pausedBy, "breaker");
  // estado exposto no formato breaker:{stage,paused,since}
  assert.deepEqual(t3.breaker, { stage: 1, paused: ["NEW"], since: t3.breaker!.since });
  // evento no bus
  assert.ok(calls.spool.some((e: { event: string }) => e.event === "orch_breaker_stage1_pause"));
  assert.ok(calls.spool.some((e: { event: string }) => e.event === "orch_breaker_alert"));
});

test("breaker reentrância: estágio 2 NÃO re-pausa quem já tem pausedBy=breaker (pausa só o 2º mais novo)", async () => {
  const { deps, calls } = makeBreakerDeps({
    ledgers: {
      "OLD.json": ledgerJson("OLD", { dispatchedAt: "2026-10-03T09:00:00Z" }),
      "NEW.json": ledgerJson("NEW", { dispatchedAt: "2026-10-03T11:00:00Z" }),
    },
    files: {
      "/proc/loadavg": loadavgText(40), // 40 > 4×8 → crítico
      "/proc/meminfo": meminfo(null),
    },
  });
  for (let i = 0; i < 3; i++) await runBreakerTick(undefined, deps as any); // estágio 2 dispara com 3 amostras críticas
  // estágio 2 pausa os 2 mais novos de uma vez (NEW e OLD), sem duplicar
  assert.deepEqual(calls.pause.map((m: { missionId: string }) => m.missionId).sort(), ["NEW", "OLD"]);
  const state = await runBreakerTick(undefined, deps as any); // tick extra: nada novo
  assert.equal(state.paused.length, 0); // reentrante: ninguém re-pausado
  assert.equal(calls.pause.length, 2);
  // stage2 alerta com os ids
  assert.ok(calls.notify.some((n: { summary: string }) => n.summary.includes("ESTÁGIO 2")));
});

test("breaker ESTÁGIO 2 por swap > 90% pausa 2 mais novos + alerta", async () => {
  const { deps, calls } = makeBreakerDeps({
    ledgers: {
      "A.json": ledgerJson("A", { dispatchedAt: "2026-10-03T09:00:00Z" }),
      "B.json": ledgerJson("B", { dispatchedAt: "2026-10-03T10:00:00Z" }),
      "C.json": ledgerJson("C", { dispatchedAt: "2026-10-03T11:00:00Z" }),
    },
    files: {
      "/proc/loadavg": loadavgText(2), // load calmo; swap é o gatilho
      "/proc/meminfo": meminfo(8_000_000, 8_388_608), // ~95% usado
    },
  });
  for (let i = 0; i < 3; i++) await runBreakerTick(undefined, deps as any);
  assert.deepEqual(calls.pause.map((m: { missionId: string }) => m.missionId).sort(), ["B", "C"]); // 2 mais novos
  assert.ok(calls.notify.some((n: { summary: string }) => n.summary.includes("ESTÁGIO 2")));
});

// ---- RETOMA: 3 amostras calmas revogam ----

test("breaker RETOMA: 3 amostras calmas revogam a pausa (marker limpo + FILA LIBERADA + re-leitura do contrato)", async () => {
  const { deps, map, calls } = makeBreakerDeps({
    ledgers: {
      "NEW.json": ledgerJson("NEW", { dispatchedAt: "2026-10-03T11:00:00Z" }),
    },
    files: {
      "/proc/loadavg": loadavgText(20),
      "/proc/meminfo": meminfo(null),
    },
  });
  for (let i = 0; i < 3; i++) await runBreakerTick(undefined, deps as any); // pausa
  assert.equal(JSON.parse(map.get("/root/.hermes/mission-state/NEW.json")!).pausedBy, "breaker");
  // pressão passa
  map.set("/proc/loadavg", loadavgText(1));
  const r1 = await runBreakerTick(undefined, deps as any);
  const r2 = await runBreakerTick(undefined, deps as any);
  assert.equal(r1.resumed.length, 0);
  const r3 = await runBreakerTick(undefined, deps as any);
  assert.deepEqual(r3.resumed, ["NEW"]);
  assert.equal(r3.stage, 0);
  assert.deepEqual(r3.breaker!.paused, []);
  // marcador limpo
  const cleared = JSON.parse(map.get("/root/.hermes/mission-state/NEW.json")!);
  assert.equal(cleared.pause, undefined);
  assert.equal(cleared.pausedBy, undefined);
  // nudge de retomada cita FILA LIBERADA + re-leitura do contrato
  assert.equal(calls.resume.length, 1);
  assert.ok(calls.notify.some((n: { summary: string }) => n.summary.includes("FILA LIBERADA") && n.summary.includes("REVOGADA")));
  assert.ok(RESUMO_MESSAGE_PREFIX.includes("releia o contrato"));
  assert.ok(calls.spool.some((e: { event: string }) => e.event === "orch_breaker_resume"));
});

// ---- fail-closed sem dados ----

test("breaker fail-closed: sem load E sem swap → nenhuma ação, estágio inalterado", async () => {
  const { deps, calls } = makeBreakerDeps({
    ledgers: { "A.json": ledgerJson("A") },
    files: { "/proc/loadavg": "ilegível", "/proc/meminfo": "MemTotal: 1 kB\n" },
  });
  for (let i = 0; i < 5; i++) {
    const t = await runBreakerTick(undefined, deps as any);
    assert.equal(t.sampled, false);
    assert.equal(t.paused.length, 0);
    assert.ok(t.note!.includes("fail-closed"));
  }
  assert.equal(calls.pause.length, 0);
  assert.equal(calls.notify.length, 0);
});

// ---- (3) não-interceptação (doutrina) ----

test("filtro de não-interceptação: needs_operator, P0 operator-now, financeiro e aprovação são protegidos", () => {
  assert.deepEqual(isProtectedMission({ needsOperator: true }, null), { protected: true, reason: "needs_operator" });
  assert.deepEqual(isProtectedMission({ needs_operator: true }, null), { protected: true, reason: "needs_operator" });
  assert.deepEqual(isProtectedMission({ priority: 1, operatorNow: true }, null), { protected: true, reason: "P0 operator-now" });
  assert.deepEqual(isProtectedMission({ priority: 1, "operator-now": "true" }, null), { protected: true, reason: "P0 operator-now" });
  for (const cls of ["financeiro", "financial", "aprovacao", "aprovação", "approval"]) {
    assert.equal(isProtectedMission({}, cls).protected, true, cls);
  }
  // P0 SEM operator-now NÃO é protegida (pausável); prioridade comum idem
  assert.equal(isProtectedMission({ priority: 1 }, null).protected, false);
  assert.equal(isProtectedMission({ priority: 5 }, null).protected, false);
  assert.equal(isProtectedMission({}, null).protected, false);
});

test("não-interceptação end-to-end: a missão mais nova é financeira → o breaker pausa a próxima pausável", async () => {
  const { deps, calls } = makeBreakerDeps({
    ledgers: {
      "FIN.json": JSON.stringify({ missionId: "FIN", status: "dispatched", paneId: "p_FIN", missionClass: "financeiro", dispatchedAt: "2026-10-03T11:00:00Z" }),
      "TECH.json": ledgerJson("TECH", { dispatchedAt: "2026-10-03T10:00:00Z" }),
      "APPROV.json": JSON.stringify({ missionId: "APPROV", status: "dispatched", paneId: "p_A", promptFile: "/opt/mission-events/missao-aprov-front.md", dispatchedAt: "2026-10-03T09:30:00Z" }),
    },
    files: {
      "/proc/loadavg": loadavgText(20),
      "/proc/meminfo": meminfo(null),
      "/opt/mission-events/missao-aprov-front.md": "---\nclass: aprovacao\n---\n# contrato",
    },
  });
  for (let i = 0; i < 3; i++) await runBreakerTick(undefined, deps as any);
  const paused = calls.pause.map((m: { missionId: string }) => m.missionId);
  assert.ok(!paused.includes("FIN"), "financeiro NUNCA pausado");
  assert.ok(!paused.includes("APPROV"), "aprovação (frontmatter) NUNCA pausada");
  assert.ok(paused.includes("TECH"));
  // auditoria das proteções (FIN examinado e pulado; APPROV pode ficar além do desired)
  assert.ok(calls.spool.filter((e: { event: string }) => e.event === "orch_breaker_skip_protected").length >= 1);
});

// ---- (2) gate do plan: swap/iowait ⇒ slots 0 com motivo citando o gatilho ----

function makePlanDeps(files: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    readText: (p: string) => files[p] ?? null,
    readdir: () => [],
    exec: () => null,
    now: () => Date.now(),
    loadavgPath: "/proc/loadavg",
    meminfoPath: "/proc/meminfo",
    psiPath: "/proc/pressure/io",
    breakerStatePath: "/opt/mission-events/orchestrator-breaker.state.json",
    ...overrides,
  };
}

test("gate do plan: swap 60% falso ⇒ THROTTLE com slots 0 e motivo citando swap", () => {
  const deps = makePlanDeps({
    "/proc/loadavg": loadavgText(1),
    "/proc/meminfo": meminfo(6_000_000, 10_000_000), // 60% exato
  });
  const plan = runOrchestratePlan({}, deps as any);
  assert.equal(plan.verdict, "THROTTLE");
  assert.equal(plan.capacity.max, 0);
  assert.equal(plan.capacity.factors.swap, 0);
  assert.equal(plan.system.swapUsedPct, 60);
  assert.ok(plan.throttleReasons.some((r) => r.includes("swap") && r.includes("60%")));
});

test("gate do plan: iowait sustentado (PSI full avg60 12%) ⇒ slots 0 com motivo citando iowait", () => {
  const deps = makePlanDeps({
    "/proc/loadavg": loadavgText(1),
    "/proc/meminfo": meminfo(null),
    "/proc/pressure/io": "some avg10=1.00 avg60=9.00 avg300=2.00 total=1\nfull avg10=5.00 avg60=12.00 avg300=1.00 total=1\n",
  });
  const plan = runOrchestratePlan({}, deps as any);
  assert.equal(plan.verdict, "THROTTLE");
  assert.equal(plan.capacity.max, 0);
  assert.equal(plan.capacity.factors.iowait, 0);
  assert.ok(plan.throttleReasons.some((r) => r.includes("iowait sustentado")));
});

test("gate do plan: swap 30% e PSI calmo → sem fator de pressão (comportamento atual preservado)", () => {
  const deps = makePlanDeps({
    "/proc/loadavg": loadavgText(1),
    "/proc/meminfo": meminfo(3_000_000, 10_000_000), // 30% exato — abaixo do gate 50
    "/proc/pressure/io": "some avg10=0.00 avg60=0.81 avg300=2.34 total=1\nfull avg10=0.00 avg60=0.29 avg300=0.72 total=1\n",
  });
  const plan = runOrchestratePlan({}, deps as any);
  assert.equal(plan.verdict, "GO");
  assert.equal(plan.capacity.factors.swap, null);
  assert.equal(plan.capacity.factors.iowait, null);
});

// ---- (§3) estado do breaker consultável no plan/list ----

test("plan/list expõem breaker:{stage,paused,since} quando o breaker já rodou; null quando nunca rodou", () => {
  const stateJson = JSON.stringify({ stage: 1, paused: [{ missionId: "NEW", since: "2026-10-03T20:00:00Z", stage: 1 }], since: "2026-10-03T20:00:00Z", streaks: { high: 3, critical: 0, low: 0 }, herdrUnresponsiveStreak: 0, herdrAlerted: false, alertedStage1: true, updatedAt: "2026-10-03T20:00:00Z" });
  const withState = makePlanDeps({ "/opt/mission-events/orchestrator-breaker.state.json": stateJson });
  const plan = runOrchestratePlan({}, withState as any);
  assert.deepEqual(plan.breaker, { stage: 1, paused: ["NEW"], since: "2026-10-03T20:00:00Z" });
  const withoutState = makePlanDeps({});
  assert.equal(runOrchestratePlan({}, withoutState as any).breaker, null);
});

// ---- (§4) herdr irresponsável ----

test("herdr irresponsável: 3 ciclos sem pane list → evento por ciclo + alerta notify; recuperação zera o streak", async () => {
  const { deps, calls } = makeBreakerDeps({
    files: { "/proc/loadavg": loadavgText(1), "/proc/meminfo": meminfo(null) },
    overrides: { probePaneList: () => null },
  });
  const t1 = await runBreakerTick(undefined, deps as any);
  assert.equal(t1.herdr!.streak, 1);
  assert.equal(t1.herdr!.alerted, false);
  const t2 = await runBreakerTick(undefined, deps as any);
  assert.equal(t2.herdr!.streak, 2);
  const t3 = await runBreakerTick(undefined, deps as any);
  assert.equal(t3.herdr!.streak, 3);
  assert.equal(t3.herdr!.alerted, true);
  assert.ok(calls.notify.some((n: { summary: string }) => n.summary.includes("herdr irresponsável")));
  assert.equal(calls.notify.filter((n: { summary: string }) => n.summary.includes("herdr")).length, 1, "alerta 1× por episódio");
  assert.ok(calls.spool.filter((e: { event: string }) => e.event === "herdr_unresponsive").length >= 3);
  // herdr volta: streak zera e um novo episódio re-alerta
  (deps as Record<string, unknown>).probePaneList = () => "{\"result\":{\"panes\":[]}}";
  const t4 = await runBreakerTick(undefined, deps as any);
  assert.equal(t4.herdr!.streak, 0);
  (deps as Record<string, unknown>).probePaneList = () => null;
  for (let i = 0; i < 3; i++) await runBreakerTick(undefined, deps as any);
  assert.equal(calls.notify.filter((n: { summary: string }) => n.summary.includes("herdr")).length, 2, "novo episódio re-alerta");
});

// ---- limiares explícitos (contrato) ----

test("limiares do contrato declarados", () => {
  assert.equal(BREAKER_THRESHOLDS.stage1LoadFactor, 2);
  assert.equal(BREAKER_THRESHOLDS.stage1SwapPct, 60);
  assert.equal(BREAKER_THRESHOLDS.stage2LoadFactor, 4);
  assert.equal(BREAKER_THRESHOLDS.stage2SwapPct, 90);
  assert.equal(BREAKER_THRESHOLDS.resumeLoadFactor, 1.5);
  assert.equal(BREAKER_THRESHOLDS.resumeSwapPct, 30);
  assert.equal(BREAKER_THRESHOLDS.samplesToAct, 3);
  assert.equal(BREAKER_THRESHOLDS.planSwapPct, 50);
  assert.ok(PAUSADO_MESSAGE.includes("PAUSADO"));
});
