// ENG-MCP-TOOLS-FIX-02 — E2E host dos wrappers novos (zero mutação):
// 1) runMissionVerify numa missão REAL fechada com verify.json (roster-01-ship).
// 2) runMissionClose dryRun numa missão REAL fechada (roster-01-fim) — idempotente.
// 3) runMissionClose com missionId inexistente — recusa determinística MISSION_NOT_FOUND (zero mutação).
import { runMissionVerify, runMissionClose } from "../src/missionOps.ts";

const t0 = Date.now();
const v = await runMissionVerify({ missionId: "roster-01-ship" });
console.log("VERIFY roster-01-ship:", JSON.stringify({ ok: v.ok, missionId: v.missionId, error: v.error, latency_ms: v.tool_latency_ms, steps: (v.steps ?? []).length }));

const c = await runMissionClose({ missionId: "roster-01-fim", dryRun: true });
console.log("CLOSE dryRun roster-01-fim:", JSON.stringify({ ok: c.ok, error: c.error, dryRun: c.dryRun ?? c.result?.dryRun, latency_ms: c.tool_latency_ms }));

const r = await runMissionClose({ missionId: "toolsfix02-e2e-nonexistent" });
console.log("CLOSE nonexistent:", JSON.stringify({ ok: r.ok, error: r.error, jevGate: r.jevGate }));

console.log("E2E_TOTAL_MS", Date.now() - t0);