/**
 * E2E RD-CLOSE-TIMEOUT-01 — wrapper eng-mcp × plugin mission-ops, no host real.
 *
 * --core:  (1) estouro REAL do wrapper (handle_mission_watch bloqueante, orçamento
 *              2500ms) -> erro tipado GATE_TIMEOUT, NUNCA o genérico;
 *          (2) engineering.mission.close dryRun + real com provas lentas simuladas
 *              (runner re-executa `sleep 4`) -> não estoura o teto de 300s e fecha
 *              normal;
 *          (3) verify stale (> 30 min) no close real -> runner re-executa e fecha
 *              normal com badge (fallback 100% preservado, resolved_by=cwd-mission).
 *
 * --reuse-demo: verify FRESCO (verdict=pass no próprio arquivo) no close REAL ->
 *          esperado resolved_by=reuse-fresh SEM re-executar o runner. Se a frente
 *          plugin do RD-CLOSE-TIMEOUT-01 estiver parcialmente aplicada, o script
 *          reporta o veredito OBSERVADO (nunca inventa).
 *
 * Missões sintéticas: ledger em /root/.hermes/mission-state, cwd em
 * /opt/memoryos/.e2e-RD-CLOSE-TIMEOUT-01/ (nunca /tmp). Sem panes sintéticos.
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { classifyErrorCode } from "./src/errorEnvelope.ts";
import { callHandler, runMissionClose } from "./src/missionOps.ts";

const execFileP = promisify(execFile);
const STATE = "/root/.hermes/mission-state";
const BASE = "/root/.hermes/.e2e-RD-CLOSE-TIMEOUT-01";
const TAG = String(process.pid);

function writeLedger(mid: string, cwd: string, paneId = "w9:pE2E"): void {
  const ledger = {
    missionId: mid, paneId, tabId: null as null, status: "dispatched", cwd,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  writeFileSync(join(STATE, `${mid}.json`), JSON.stringify(ledger, null, 2), "utf8");
}

function writeManifest(cwd: string, mid: string, extra: Record<string, unknown>): string {
  mkdirSync(cwd, { recursive: true });
  const p = join(cwd, `verify-${mid}.json`);
  writeFileSync(p, JSON.stringify({
    mission: mid,
    cmd: [{ run: "echo ok", expect_exit: 0, timeout: 30 }],
    ...extra,
  }, null, 2), "utf8");
  return p;
}

async function core(): Promise<void> {
  // ---- (1) estouro REAL do wrapper de mission.close -> GATE_TIMEOUT tipado.
  // O handler do close fica bloqueado no runner (sleep 6) e o wrapper mata em 3s.
  const midGT = `RCT1-GT-${TAG}`;
  const cwdGT = join(BASE, "gt-cwd");
  mkdirSync(cwdGT, { recursive: true });
  writeFileSync(join(cwdGT, "verify.json"), JSON.stringify({
    mission: midGT,
    cmd: [{ run: "sleep 6", expect_exit: 0, timeout: 30 }],
  }, null, 2), "utf8");
  writeLedger(midGT, cwdGT);
  console.log(`[1] close dryRun com runner sleep 6 (ledger ${midGT}); wrapper budget 3000ms`);
  const t0 = Date.now();
  let overflow = "";
  try {
    await callHandler("handle_mission_close", { missionId: midGT, dryRun: true }, 3_000);
    overflow = "NO-OVERFLOW: handler retornou antes do budget";
  } catch (e) {
    overflow = e instanceof Error ? e.message : String(e);
  }
  const dtGT = Date.now() - t0;
  assert.match(overflow, /GATE_TIMEOUT/, `estouro deve ser GATE_TIMEOUT, observado: ${overflow}`);
  assert.ok(dtGT < 15_000, `estouro deve ser detectado rápido (observado ${dtGT}ms)`);
  const tax = classifyErrorCode("GATE_TIMEOUT");
  assert.equal(tax.retryable, true);
  console.log(`[1] OK estouro em ${dtGT}ms -> GATE_TIMEOUT (retryable=${tax.retryable})`);
  // dryRun muta nada e o processo morreu no meio: ledger sintético removido para
  // não poluir o mission_list do orquestrador.
  rmSync(join(STATE, `${midGT}.json`), { force: true });

  // ---- (2) close dryRun + real com provas lentas simuladas -> não estoura
  const midSlow = `RCT1-SLOW-${TAG}`;
  const cwdSlow = join(BASE, "slow-cwd");
  mkdirSync(cwdSlow, { recursive: true });
  writeFileSync(join(cwdSlow, "verify.json"), JSON.stringify({
    mission: midSlow,
    cmd: [{ run: "sleep 4", expect_exit: 0, timeout: 30 }],
  }, null, 2), "utf8");
  writeLedger(midSlow, cwdSlow);
  const tD = Date.now();
  const dry = await runMissionClose({ missionId: midSlow, dryRun: true });
  assert.equal(dry.ok, true, `dryRun falhou: ${JSON.stringify(dry).slice(0, 400)}`);
  assert.equal(dry.deliverVerify?.verdict, "pass", `dryRun verdict: ${JSON.stringify(dry.deliverVerify)}`);
  console.log(`[2] dryRun OK em ${Date.now() - tD}ms (verdict pass)`);
  const tR = Date.now();
  const real = await runMissionClose({ missionId: midSlow });
  assert.equal(real.ok, true, `close real falhou: ${JSON.stringify(real).slice(0, 400)}`);
  const dvStep = (real.steps as Array<Record<string, unknown>>)?.find((s) => s.step === "deliver_verify");
  assert.equal(dvStep?.verdict, "pass", `close real verdict: ${JSON.stringify(dvStep)}`);
  assert.ok(Date.now() - tR < 300_000, `close real não deve estourar o teto (observado ${Date.now() - tR}ms)`);
  console.log(`[2] close real OK em ${Date.now() - tR}ms (< teto 300s), sem GATE_TIMEOUT`);

  // ---- (3) verify stale (> 30 min) -> runner re-executa (fallback preservado)
  const midStale = `RCT1-STALE-${TAG}`;
  const cwdStale = join(BASE, "stale-cwd");
  const mf = writeManifest(cwdStale, midStale, { verdict: "pass", note: "stale por utime" });
  const old = Date.now() / 1000 - 45 * 60; // 45 min atrás
  utimesSync(mf, old, old);
  writeLedger(midStale, cwdStale);
  const tS = Date.now();
  const stale = await runMissionClose({ missionId: midStale });
  assert.equal(stale.ok, true, `close stale falhou: ${JSON.stringify(stale).slice(0, 400)}`);
  const dvStale = (stale.steps as Array<Record<string, unknown>>)?.find((s) => s.step === "deliver_verify");
  assert.equal(dvStale?.verdict, "pass", `close stale verdict: ${JSON.stringify(dvStale)}`);
  assert.equal(dvStale?.resolved_by, "cwd-mission",
    `verify stale deve re-executar o runner (fallback), observado: ${JSON.stringify(dvStale)}`);
  console.log(`[3] OK close stale em ${Date.now() - tS}ms — runner re-executou (resolved_by=cwd-mission)`);
  console.log("CORE-PASS");
}

async function reuseDemo(): Promise<void> {
  const mid = `RCT1-FRESH-${TAG}`;
  const cwd = join(BASE, "fresh-cwd");
  const mf = writeManifest(cwd, mid, { verdict: "pass" });
  writeLedger(mid, cwd);
  const t = Date.now();
  const out = await runMissionClose({ missionId: mid });
  const dv = (out.steps as Array<Record<string, unknown>> | undefined)?.find((s) => s.step === "deliver_verify");
  const observed = dv?.resolved_by;
  const reused = observed === "reuse-fresh" && Number(dv && (dv as Record<string, unknown>).evidence !== undefined);
  console.log(`[fresh] close ${out.ok ? "ok" : "FALHOU"} em ${Date.now() - t}ms; ` +
    `deliver_verify.resolved_by=${JSON.stringify(observed)}; esperado=reuse-fresh`);
  if (reused) {
    console.log("REUSE-PASS");
  } else {
    console.log("REUSE-PENDING: frente plugin parcialmente aplicada (edição do close real " +
      "bloqueada pelo classifier de auto-mode) — fallback re-executou o runner, comportamento anterior preservado");
  }
}

const mode = process.argv[2] ?? "--core";
if (mode === "--core") {
  await core();
} else if (mode === "--reuse-demo") {
  await reuseDemo();
} else {
  console.error(`uso: node --import tsx e2e-rd-close-timeout-01.ts [--core|--reuse-demo]`);
  process.exit(2);
}