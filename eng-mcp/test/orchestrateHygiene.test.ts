// ORCH-HYGIENE-01 — testes do ciclo de higiene (src/orchestrateHygiene.ts).
// Herméticos: fs em memória + runner falso (padrão HERMÉTICO-FIX-01) — nada toca
// /opt/mission-events, /root/.hermes, git real ou docker real.
// Cobre os casos do contrato: (1) estado-máquina com fixtures — worktree mergeada
// → remove; dirty → pula; sem janela → adia + needs_operator após threshold;
// janela aberta → segue; (2) idempotência — 2 ciclos seguidos em fixture limpa,
// 2º no-op com evidência; (3) dryRun default — NADA muta (zero runner-mutação,
// zero writeText/appendFile); extras: cap de 3 rollbacks recentes, órfãos marcados
// (nunca apagados), gatilho leve (Modo 2) + gate ORCH_HYGIENE_APPROVED.
import test from "node:test";
import assert from "node:assert/strict";
import {
  runOrchestrateHygieneCycle,
  runHygieneTrigger,
  scanWorktrees,
  parseDockerDate,
  type HygieneDeps,
  type HygieneRunner,
} from "../src/orchestrateHygiene.ts";

const ROOT = "/repo";
const HY = "/hyg";
const STATE_DIR = "/state";
const SPOOL = "/spool.jsonl";
const RELEASE = "/release-state.json";
const T0 = 1_791_000_000_000; // 2026-10-02T… (fixo, determinístico)
const HOUR = 3600 * 1000;

interface WtSpec {
  path: string;
  branch: string | null;
  head: string;
  clean: boolean;
  merged: boolean;
  ahead: number;
  removable?: boolean; // false = git recusa o remove (simula erro)
  deletable?: boolean; // false = git branch -d recusa
  mergeable?: boolean; // false = git merge --ff-only recusa
}

interface Fixture {
  worktrees: WtSpec[];
  containers: string[]; // linhas docker ps: id|name|status|createdAt
  ledgers: Record<string, Record<string, unknown>>;
  panes: string[]; // pane_ids vivos
  tabs: Array<{ tab_id: string; label: string }>;
  memAvailableKb: number;
  swapUsedPct: number | null;
  releaseSha: string | null;
  inFlightDispatched: string[]; // missionIds com status dispatched
}

function makeDeps(fx: Fixture, opts: { dryRun?: boolean } = {}) {
  const files = new Map<string, string>();
  const mutations: string[] = [];

  // ledgers
  for (const [id, ledger] of Object.entries(fx.ledgers)) {
    files.set(`${STATE_DIR}/${id}.json`, JSON.stringify(ledger, null, 2));
  }
  // released-state
  if (fx.releaseSha) files.set(RELEASE, JSON.stringify({ currentCommitSha: fx.releaseSha }));

  const gitPorcelain: string[] = [];
  gitPorcelain.push(`worktree ${ROOT}`);
  gitPorcelain.push(`HEAD ${"a".repeat(40)}`);
  gitPorcelain.push("branch refs/heads/main");
  gitPorcelain.push("");
  for (const wt of fx.worktrees) {
    gitPorcelain.push(`worktree ${wt.path}`);
    gitPorcelain.push(`HEAD ${wt.head}`);
    if (wt.branch) gitPorcelain.push(`branch refs/heads/${wt.branch}`);
    gitPorcelain.push("");
  }

  const runner: HygieneRunner = (cmd, args, o) => {
    const cwd = o?.cwd ?? ROOT;
    const key = (cmd === "bash" ? `bash ${args[1]}` : `${cmd} ${args.join(" ")}`);
    const record = (what: string) => mutations.push(`${cwd}:${what}`);
    if (cmd === "git") {
      if (args[0] === "worktree" && args[1] === "list") return { stdout: gitPorcelain.join("\n"), code: 0 };
      if (args[0] === "rev-parse") return { stdout: "a".repeat(40), code: 0 };
      if (args[0] === "status") {
        const wt = fx.worktrees.find((w) => w.path === cwd);
        if (!wt) return { stdout: "", code: 0 }; // main limpo por default
        return { stdout: wt.clean ? "" : " M src/x.ts\n", code: 0 };
      }
      if (args[0] === "merge-base") {
        const ref = args[2];
        const wt = fx.worktrees.find((w) => (w.branch ?? w.head) === ref);
        return { stdout: null, code: wt?.merged ? 0 : 1 };
      }
      if (args[0] === "rev-list") {
        const ref = String(args[2] ?? "").replace(/^main\.\./, "");
        const wt = fx.worktrees.find((w) => (w.branch ?? w.head) === ref);
        return { stdout: String(wt?.ahead ?? 0), code: 0 };
      }
      if (args[0] === "worktree" && args[1] === "remove") {
        record(`worktree-remove ${args[2]}`);
        const wt = fx.worktrees.find((w) => w.path === args[2]);
        return { stdout: "", code: wt?.removable === false ? 1 : 0 };
      }
      if (args[0] === "branch" && args[1] === "-d") {
        record(`branch-delete ${args[2]}`);
        const wt = fx.worktrees.find((w) => w.branch === args[2]);
        return { stdout: "", code: wt?.deletable === false ? 1 : 0 };
      }
      if (args[0] === "merge") {
        record(`merge ${args[2]}`);
        const wt = fx.worktrees.find((w) => w.branch === args[2]);
        return { stdout: "ok", code: wt?.mergeable === false ? 1 : 0 };
      }
      return { stdout: null, code: 1 };
    }
    if (cmd === "docker") {
      if (args[0] === "ps") return { stdout: fx.containers.join("\n") + (fx.containers.length ? "\n" : ""), code: 0 };
      if (args[0] === "rm") {
        record(`docker-rm ${args[1]}`);
        return { stdout: args[1], code: 0 };
      }
      return { stdout: null, code: 1 };
    }
    if (cmd === "bash") {
      const script = String(args[1] ?? "");
      if (script.includes("pane list")) {
        return { stdout: JSON.stringify({ result: { panes: fx.panes.map((p) => ({ pane_id: p })) } }), code: 0 };
      }
      if (script.includes("tab list")) {
        return { stdout: JSON.stringify({ result: { tabs: fx.tabs } }), code: 0 };
      }
      return { stdout: null, code: 1 };
    }
    return { stdout: null, code: 1 };
  };

  const deps: HygieneDeps = {
    repoRoot: ROOT,
    hygieneDir: HY,
    missionStateDir: STATE_DIR,
    spoolPath: SPOOL,
    releaseStatePath: RELEASE,
    runner,
    readText: (p) => files.get(p) ?? null,
    readdir: (p) => {
      if (p === STATE_DIR) {
        return [...Object.keys(fx.ledgers).map((id) => `${id}.json`)];
      }
      const seen = new Set<string>();
      for (const k of files.keys()) {
        if (k.startsWith(p + "/")) seen.add(k.slice(p.length + 1).split("/")[0]);
      }
      return [...seen];
    },
    writeText: (p, data) => { mutations.push(`write:${p}`); files.set(p, data); },
    appendFile: (p, data) => { mutations.push(`append:${p}`); files.set(p, (files.get(p) ?? "") + data); },
    existsSync: (p) => files.has(p),
    now: () => T0,
    meminfoPath: "/proc/meminfo-mock",
    loadavgPath: "/proc/loadavg-mock",
    cores: 8,
    ...(opts.dryRun ? {} : {}),
  };
  // /proc mock: MemAvailable via readText override especial
  const realRead = deps.readText!;
  deps.readText = (p: string) => {
    if (p === "/proc/meminfo-mock") {
      return `MemTotal:        16000000 kB\nMemAvailable:    ${fx.memAvailableKb} kB\nSwapTotal:        8000000 kB\nSwapFree:         ${fx.swapUsedPct == null ? 8000000 : Math.round(8000000 * (1 - fx.swapUsedPct / 100))} kB\n`;
    }
    if (p === "/proc/loadavg-mock") return "0.50 0.40 0.30 1/100 1000\n";
    return realRead(p);
  };
  return { deps, files, mutations };
}

function iso(msAgo: number): string {
  return new Date(T0 - msAgo).toISOString();
}

function emptyFixture(): Fixture {
  return {
    worktrees: [],
    containers: [],
    ledgers: {},
    panes: [],
    tabs: [],
    memAvailableKb: 8_000_000,
    swapUsedPct: 10,
    releaseSha: "a".repeat(40),
    inFlightDispatched: [],
  };
}

// ---- (1) estado-máquina com fixtures ----

test("1a. worktree mergeada e limpa → remove worktree + branch; dirty → pula", async () => {
  const fx = emptyFixture();
  fx.worktrees = [
    { path: "/wt-limpa", branch: "limpa-01", head: "b".repeat(40), clean: true, merged: true, ahead: 0 },
    { path: "/wt-suja", branch: "suja-01", head: "c".repeat(40), clean: false, merged: true, ahead: 0 },
  ];
  const { deps, mutations } = makeDeps(fx);
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r.ok, true);
  const limpa = r.cleanup.worktrees.find((w) => w.path === "/wt-limpa");
  const suja = r.cleanup.worktrees.find((w) => w.path === "/wt-suja");
  assert.equal(limpa?.action, "removed");
  assert.equal(limpa?.branchDeleted, true);
  assert.equal(suja?.action, "skipped");
  assert.match(suja?.reason ?? "", /diff não-commitado/);
  // prova: mutações executadas
  assert.ok(mutations.some((m) => m.endsWith("worktree-remove /wt-limpa")));
  assert.ok(mutations.some((m) => m.endsWith("branch-delete limpa-01")));
  assert.ok(!mutations.some((m) => m.includes("/wt-suja")));
  assert.equal(r.noop, false);
});

test("1b. janela fechada → adia; após threshold (4h) com deploy pendente → needs_operator", async () => {
  const fx = emptyFixture();
  fx.inFlightDispatched = ["MISSAO-OCUPADA"]; // 1 missão em voo ⇒ janela fechada
  fx.ledgers["MISSAO-OCUPADA"] = { missionId: "MISSAO-OCUPADA", status: "dispatched" };
  fx.releaseSha = "f".repeat(40); // deploy pendente (HEAD aaaa != ffff)
  const { deps, files } = makeDeps(fx);
  // ciclo 1: adia (deferredSince gravado)
  const r1 = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r1.deployWindow.open, false);
  assert.equal(r1.deployWindow.pendingDeploy, true);
  assert.equal(r1.deployWindow.needsOperatorEmitted, false);
  assert.ok(r1.deployWindow.deferredSince);
  const st1 = JSON.parse(files.get(`${HY}/state.json`)!) as { deferredSince: string | null };
  assert.ok(st1.deferredSince);
  // ciclo 2 com relógio +5h: precisa escalar
  let clock = T0 + 5 * HOUR;
  const deps2: HygieneDeps = { ...deps, now: () => clock };
  const r2 = await runOrchestrateHygieneCycle({ dryRun: false }, deps2);
  assert.equal(r2.deployWindow.needsOperatorEmitted, true);
  assert.ok(r2.deployWindow.deferralMs! >= 4 * HOUR);
  const spool = files.get("/spool.jsonl") ?? "";
  assert.ok(spool.includes("orch_hygiene_needs_operator"));
  // 3º ciclo logo depois: NÃO re-emite (1x por episódio)
  clock += 1000;
  const r3 = await runOrchestrateHygieneCycle({ dryRun: false }, deps2);
  assert.equal(r3.deployWindow.needsOperatorEmitted, false);
});

test("1c. janela aberta (0 em voo, mem ok, swap < 50%) → segue; reset de deferral", async () => {
  const fx = emptyFixture();
  fx.releaseSha = "f".repeat(40); // pendente
  const { deps, files } = makeDeps(fx);
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r.deployWindow.open, true);
  assert.equal(r.deployWindow.pendingDeploy, true);
  assert.equal(r.deployWindow.needsOperatorEmitted, false);
  const spool = files.get("/spool.jsonl") ?? "";
  assert.ok(spool.includes("hygiene_deploy_window_open"));
  // estados da máquina na ordem
  assert.deepEqual(r.states.map((s) => s.state), ["CLEANUP", "MERGE", "DEPLOY_WINDOW", "IDLE"]);
  assert.equal(r.finalState, "IDLE");
});

test("1d. merge: branch ahead limpa → ff-only serial; divergente → skip sem force", async () => {
  const fx = emptyFixture();
  fx.worktrees = [
    { path: "/wt-a", branch: "feat-a", head: "b".repeat(40), clean: true, merged: false, ahead: 2 },
    { path: "/wt-b", branch: "feat-b", head: "c".repeat(40), clean: true, merged: false, ahead: 1, mergeable: false },
  ];
  const { deps, mutations, files } = makeDeps(fx);
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r.merge.candidates.length, 2);
  assert.equal(r.merge.merged.length, 1);
  assert.equal(r.merge.merged[0]?.branch, "feat-a");
  assert.equal(r.merge.skipped[0]?.branch, "feat-b");
  assert.match(r.merge.skipped[0]?.reason ?? "", /ff-only/);
  assert.ok(mutations.some((m) => m.endsWith("merge feat-a")));
  assert.ok(!mutations.some((m) => m.includes("--force")));
  assert.ok(files.get(`${HY}/state.json`)!.includes("lastCycleAt"));
});

test("1e. merge adiado quando main está sujo (nunca mistura trabalho)", async () => {
  const fx = emptyFixture();
  fx.worktrees = [
    { path: "/wt-a", branch: "feat-a", head: "b".repeat(40), clean: true, merged: false, ahead: 2 },
  ];
  const { deps } = makeDeps(fx);
  // main sujo: status no ROOT retorna diff (wt não encontrado => main)
  const hacked = { ...deps, runner: ((cmd: string, args: string[], o?: { cwd?: string }) => {
    const r = (deps.runner as HygieneRunner)(cmd, args, o);
    if (cmd === "git" && args[0] === "status" && (o?.cwd ?? ROOT) === ROOT) return { stdout: " M main-dirty.ts\n", code: 0 };
    return r;
  }) as HygieneRunner };
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, hacked);
  assert.equal(r.merge.mainClean, false);
  assert.equal(r.merge.merged.length, 0);
  assert.match(r.merge.skipped[0]?.reason ?? "", /diff não-commitado/);
});

// ---- (2) idempotência ----

test("2. 2 ciclos seguidos em fixture limpa ⇒ 2º no-op com evidência", async () => {
  const fx = emptyFixture();
  const { deps } = makeDeps(fx);
  const r1 = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r1.ok, true);
  assert.equal(r1.noop, true);
  assert.ok(r1.trailPath);
  const r2 = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r2.ok, true);
  assert.equal(r2.noop, true);
  assert.ok(r2.trailPath);
  // evidência: estados registrados nas duas trilhas + zero mutação no 2º
  assert.deepEqual(r2.states.map((s) => s.state), ["CLEANUP", "MERGE", "DEPLOY_WINDOW", "IDLE"]);
  assert.equal(r2.cleanup.worktrees.filter((w) => w.action === "removed").length, 0);
});

// ---- (3) dryRun default: NADA muta ----

test("3. default (sem flag) e dryRun=true: zero mutação de runner, zero escrita", async () => {
  const fx = emptyFixture();
  fx.worktrees = [
    { path: "/wt-limpa", branch: "limpa-01", head: "b".repeat(40), clean: true, merged: true, ahead: 0 },
    { path: "/wt-a", branch: "feat-a", head: "c".repeat(40), clean: true, merged: false, ahead: 3 },
  ];
  fx.containers = [
    `deadbeef|${"memoryos-eng-mcp-rollback-123"}|Exited (137) 9 days ago|${new Date(T0 - 9 * 24 * HOUR).toISOString().replace("T", " ").replace("Z", " +0000 UTC")}`,
    `cafe2222|${"memoryos-eng-mcp-rollback-124"}|Exited (137) 20 days ago|${new Date(T0 - 20 * 24 * HOUR).toISOString().replace("T", " ").replace("Z", " +0000 UTC")}`,
    `cafe3333|${"memoryos-eng-mcp-rollback-125"}|Exited (137) 30 days ago|${new Date(T0 - 30 * 24 * HOUR).toISOString().replace("T", " ").replace("Z", " +0000 UTC")}`,
    `cafe4444|${"memoryos-eng-mcp-rollback-126"}|Exited (137) 40 days ago|${new Date(T0 - 40 * 24 * HOUR).toISOString().replace("T", " ").replace("Z", " +0000 UTC")}`,
  ];
  fx.ledgers["ORFA-01"] = { missionId: "ORFA-01", status: "cancelled", updatedAt: iso(72 * HOUR), paneId: "w9:pNone", tabId: "w9:tNone" };
  fx.releaseSha = "f".repeat(40);
  const { deps, mutations, files } = makeDeps(fx);
  const rDefault = await runOrchestrateHygieneCycle({}, deps); // sem flag
  assert.equal(rDefault.dryRun, true);
  const mutationsAfterDefault = mutations.length;
  const r = await runOrchestrateHygieneCycle({ dryRun: true }, deps);
  assert.equal(mutations.length, mutationsAfterDefault);
  assert.equal(mutations.length, 0); // nenhuma mutação desde o início
  assert.equal(files.get(SPOOL), undefined); // spool intocado
  assert.equal(files.get(`${HY}/state.json`), undefined); // estado não gravado
  assert.equal(files.get(`${HY}/ciclo-x.json`) ?? undefined, undefined);
  // projeção: mostra o que FARIA
  assert.ok(r.cleanup.worktrees.some((w) => w.action === "would_remove"));
  assert.ok(r.cleanup.containers.some((c) => c.action === "would_remove"));
  assert.ok(r.cleanup.orphans.some((o) => o.action === "would_mark"));
  assert.equal(r.cleanup.ghosts.ran, false); // snapshot (mutação) adiado
  assert.equal(r.deployWindow.pendingDeploy, true);
  assert.equal(r.trailPath, null);
});

// ---- extras ----

test("4. containers: cap dos 3 mais recentes + idade 7d + só Exited(137)", async () => {
  const fx = emptyFixture();
  const d = (days: number) => new Date(T0 - days * 24 * HOUR).toISOString().replace("T", " ").replace("Z", " +0000 UTC");
  fx.containers = [
    `id1|memoryos-eng-mcp-rollback-1|Exited (137) 10 days ago|${d(10)}`,
    `id2|memoryos-eng-mcp-rollback-2|Exited (137) 9 days ago|${d(9)}`,
    `id3|memoryos-eng-mcp-rollback-3|Exited (137) 8 days ago|${d(8)}`,
    `id4|memoryos-eng-mcp-rollback-4|Exited (137) 7 days ago|${d(7)}`, // 3º mais recente → fica
    `id5|memoryos-eng-mcp-rollback-5|Up 9 days|${d(10)}`,               // não é Exited(137)
    `id6|memoryos-eng-mcp-rollback-6|Exited (137) 2 days ago|${d(2)}`,  // jovem demais
  ];
  const { deps, mutations } = makeDeps(fx);
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  const removed = r.cleanup.containers.filter((c) => c.action === "removed").map((c) => c.id).sort();
  assert.deepEqual(removed, ["id1", "id2"]); // id4 é o 3º mais recente → retenção
  assert.ok(r.cleanup.containers.find((c) => c.id === "id4")?.action === "kept");
  assert.ok(mutations.some((m) => m.includes("docker-rm id1")));
  assert.ok(!mutations.some((m) => m.includes("docker-rm id4")));
});

test("5. ledger órfão (>48h dispatched, sem pane/aba) é MARCADO, nunca apagado", async () => {
  const fx = emptyFixture();
  fx.ledgers = {
    "ORFA-01": { missionId: "ORFA-01", status: "cancelled", updatedAt: iso(72 * HOUR), paneId: "w9:pNONE", tabId: "w9:tNONE" },
    "VIVA-01": { missionId: "VIVA-01", status: "dispatched", updatedAt: iso(72 * HOUR), paneId: "w6:p1", tabId: "w6:t1" },
    "ABAVIVA-01": { missionId: "ABAVIVA-01", status: "dispatched", updatedAt: iso(72 * HOUR), paneId: "w9:pNONE", tabId: "w9:tNONE" },
    "JOVEM-01": { missionId: "JOVEM-01", status: "cancelled", updatedAt: iso(2 * HOUR), paneId: "w9:pNONE", tabId: "w9:tNONE" },
  };
  fx.panes = ["w6:p1"];
  fx.tabs = [{ tab_id: "w6:tX", label: "MISSION:ABAVIVA-01" }];
  const { deps, files } = makeDeps(fx);
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  const orphan = r.cleanup.orphans.find((o) => o.missionId === "ORFA-01");
  assert.equal(orphan?.action, "marked");
  // ledger mantido (não apagado) com a marca
  const ledger = JSON.parse(files.get(`${STATE_DIR}/ORFA-01.json`)!) as Record<string, unknown>;
  assert.ok(ledger.missionId === "ORFA-01"); // trilha imune
  assert.ok((ledger.hygiene_orphan as Record<string, unknown>).at);
  assert.equal(r.cleanup.orphans.find((o) => o.missionId === "VIVA-01")?.action, "skipped");
  assert.equal(r.cleanup.orphans.find((o) => o.missionId === "ABAVIVA-01")?.action, "skipped");
  assert.equal(r.cleanup.orphans.find((o) => o.missionId === "JOVEM-01")?.action, "skipped");
});

test("6. ghosts: execute chama o mission_snapshot (reuso), dryRun não", async () => {
  const fx = emptyFixture();
  let snapshotCalls = 0;
  const depsWithSnap: HygieneDeps = {
    ...makeDeps(fx).deps,
    runSnapshot: async () => {
      snapshotCalls += 1;
      return { ghosts: [{ missionId: "G-1" }], fixed: [], summary: { ghosts: 1, fixed: 0, ok: [] } };
    },
  };
  const dry = await runOrchestrateHygieneCycle({ dryRun: true }, depsWithSnap);
  assert.equal(dry.cleanup.ghosts.ran, false);
  assert.equal(snapshotCalls, 0);
  const exe = await runOrchestrateHygieneCycle({ dryRun: false }, depsWithSnap);
  assert.equal(exe.cleanup.ghosts.ran, true);
  assert.equal(exe.cleanup.ghosts.ghostCount, 1);
  assert.equal(snapshotCalls, 1);
});

test("7. gatilho (Modo 2): sem merge pendente não dispara; com pendente dispara dryRun; APPROVED=1 executa", async () => {
  const fx = emptyFixture();
  // sem pendente: só worktree mergeada
  fx.worktrees = [{ path: "/wt-m", branch: "m-01", head: "b".repeat(40), clean: true, merged: true, ahead: 0 }];
  const f1 = makeDeps(fx);
  const t1 = await runHygieneTrigger({}, f1.deps);
  assert.equal(t1.triggered, false);
  assert.match(t1.reason, /sem merge pendente/);

  // com pendente
  fx.worktrees = [{ path: "/wt-p", branch: "feat-p", head: "c".repeat(40), clean: true, merged: false, ahead: 1 }];
  const f2 = makeDeps(fx);
  const t2 = await runHygieneTrigger({}, f2.deps);
  assert.equal(t2.triggered, true);
  assert.equal(t2.cycle?.dryRun, true); // default fail-closed
  assert.equal(f2.mutations.length, 0); // dryRun não muta

  const f3 = makeDeps(fx);
  process.env.ORCH_HYGIENE_APPROVED = "1";
  try {
    const t3 = await runHygieneTrigger({}, f3.deps);
    assert.equal(t3.cycle?.dryRun, false);
    assert.ok(f3.mutations.length > 0);
  } finally {
    delete process.env.ORCH_HYGIENE_APPROVED;
  }
});

test("8. scanWorktrees pula a worktree principal e calcula merged/ahead", async () => {
  const fx = emptyFixture();
  fx.worktrees = [{ path: "/wt-x", branch: "x-01", head: "b".repeat(40), clean: true, merged: true, ahead: 0 }];
  const { deps } = makeDeps(fx);
  const scan = scanWorktrees(deps as never);
  assert.equal(scan.ok, true);
  assert.equal(scan.items.length, 1);
  assert.equal(scan.items[0]?.branch, "x-01");
  assert.equal(scan.items[0]?.mergedIntoMain, true);
  assert.equal(scan.mainHead, "a".repeat(40));
});

test("9. parseDockerDate interpreta CreatedAt do docker (+0000 UTC)", () => {
  const ms = parseDockerDate("2026-10-03 15:38:44 +0000 UTC");
  assert.equal(ms, Date.UTC(2026, 9, 3, 15, 38, 44));
  assert.equal(parseDockerDate("lixo"), null);
});

test("10. mem sob teto: MemAvailable ilegível ⇒ janela não abre (conservador)", async () => {
  const fx = emptyFixture();
  fx.memAvailableKb = 1_000_000; // ~0.95GB → floor(0.95/2.5)=0 < 1
  const { deps } = makeDeps(fx);
  const r = await runOrchestrateHygieneCycle({ dryRun: true }, deps);
  assert.equal(r.deployWindow.conditions.memOk, false);
  assert.equal(r.deployWindow.open, false);
  assert.ok(r.deployWindow.reasons.join(" ").includes("memória"));
});

test("11. herdr ilegível ⇒ órfãos NÃO marcados (fail-closed: sem prova de pane ausente)", async () => {
  const fx = emptyFixture();
  fx.ledgers = {
    "ORFA-02": { missionId: "ORFA-02", status: "dispatched", updatedAt: iso(72 * HOUR), paneId: "w9:pX", tabId: "w9:tX" },
  };
  const built = makeDeps(fx);
  const deps: HygieneDeps = {
    ...built.deps,
    runner: ((cmd: string, args: string[], o?: { cwd?: string }) => {
      if (cmd === "bash") return { stdout: null, code: 1 }; // herdr fora
      return (built.deps.runner as HygieneRunner)(cmd, args, o);
    }) as HygieneRunner,
  };
  const r = await runOrchestrateHygieneCycle({ dryRun: false }, deps);
  assert.equal(r.cleanup.orphans.find((o) => o.missionId === "ORFA-02")?.action, "skipped");
  const ledger = JSON.parse(built.files.get(`${STATE_DIR}/ORFA-02.json`)!) as Record<string, unknown>;
  assert.equal(ledger.hygiene_orphan, undefined); // nada marcado
});
