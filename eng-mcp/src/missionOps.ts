// ENG-MCP-MISSION-01/02 (29/09): tools mission-* como wrappers determinísticos
// sobre os handlers PUROS do plugin mission-ops (fonte única de verdade — o
// eng-mcp NÃO duplica lógica; chama python e recebe JSON).
// Andar 1 (regex/IO) para tudo; JEV (250ms, /alpha/decisions) só no gate do close.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod/v4";

const execFileP = promisify(execFile);
const PLUGIN_DIR = "/root/.hermes/plugins/mission-ops";
const JEV_GATE_SCRIPT = "/opt/memoryos/eng-mcp/scripts/jev_gate.py";

async function callHandler(handler: string, args: Record<string, unknown>, timeoutMs = 300_000): Promise<Record<string, unknown>> {
  const code = `
import sys, json, importlib.util, time
spec = importlib.util.spec_from_file_location("mission_ops", "${PLUGIN_DIR}/__init__.py", submodule_search_locations=["${PLUGIN_DIR}"])
PKG = importlib.util.module_from_spec(spec); sys.modules["mission_ops"] = PKG
spec.loader.exec_module(PKG)
fn = getattr(PKG, "${handler}")
t0 = time.time()
raw = fn(json.loads(sys.argv[1]))
print(json.dumps({"_latency_ms": int((time.time()-t0)*1000), "result": json.loads(raw)}))
`;
  const { stdout } = await execFileP("python3", ["-c", code, JSON.stringify(args)], {
    timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, cwd: PLUGIN_DIR,
  });
  const line = stdout.trim().split("\n").filter(Boolean).pop() || "{}";
  const parsed = JSON.parse(line) as { _latency_ms: number; result: Record<string, unknown> };
  return { ...parsed.result, tool_latency_ms: parsed._latency_ms };
}

// ---- schemas ----
export const missionDispatchInputSchema = z.object({
  missionId: z.string().min(1), promptFile: z.string().min(1),
  cwd: z.string().optional(), consequence: z.boolean().optional(),
  paneTitle: z.string().optional(), engine: z.string().optional(),
  spawnedBy: z.string().default("operator"),
  batch: z.array(z.object({
    missionId: z.string(), promptFile: z.string(), cwd: z.string().optional(),
    consequence: z.boolean().optional(), paneTitle: z.string().optional(),
  })).min(2).max(6).optional(),
}).strict();
export const missionStatusInputSchema = z.object({
  missionId: z.string().optional(), fragment: z.string().optional(), all: z.boolean().optional(),
}).strict();
export const missionReadInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(),
  lines: z.number().int().optional(),
}).strict();
export const missionWatchInputSchema = z.object({
  missionId: z.string().optional(), timeoutMs: z.number().int().optional(),
}).strict();
export const missionRecoverInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(), pattern: z.string().optional(),
}).strict();
export const missionCloseInputSchema = z.object({
  missionId: z.string().min(1), acceptUnverified: z.string().optional(),
}).strict();
export const missionLedgerFixInputSchema = z.object({
  missionId: z.string().min(1), paneId: z.string().optional(), tabId: z.string().optional(),
}).strict();

// ---- GHOST-CLEAN-01 (proteção 2): dispatch fecha ZUMBI da MESMA missão antes de criar aba
async function closeDuplicateTabs(missionId: string): Promise<string[]> {
  const closed: string[] = [];
  try {
    const { stdout } = await execFileP("bash", ["-lc",
      "H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H tab list"], { timeout: 15_000 });
    const tabs = JSON.parse(stdout).result?.tabs ?? [];
    const mine = tabs.filter((t: { label?: string; tab_id?: string }) =>
      t.label === `MISSION:${missionId}`);
    for (const t of mine) {
      try {
        await execFileP("bash", ["-lc",
          `H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H tab close ${t.tab_id}`],
          { timeout: 15_000 });
        closed.push(String(t.tab_id));
      } catch { /* aba pode já ter ido */ }
    }
  } catch { /* herdr indisponível: dispatch decide */ }
  return closed;
}

export async function runMissionDispatch(input: z.infer<typeof missionDispatchInputSchema>) {
  const zombies = await closeDuplicateTabs(input.missionId);
  const handler = input.batch ? "handle_mission_batch" : "handle_mission_dispatch";
  const args = input.batch
    ? { missions: [{ missionId: input.missionId, promptFile: input.promptFile,
        cwd: input.cwd, consequence: input.consequence, paneTitle: input.paneTitle,
        spawnedBy: input.spawnedBy }, ...input.batch] }
    : { ...input };
  const result = await callHandler(handler, args);
  return { ...result, zombiesClosed: zombies };
}

// ENG-MCP-MISSION-01: status = snapshot completo (verdict + auto-correção) do plugin
export async function runMissionStatus(input: z.infer<typeof missionStatusInputSchema>) {
  return callHandler("handle_mission_snapshot", input, 60_000);
}

export async function runMissionRead(input: z.infer<typeof missionReadInputSchema>) {
  return callHandler("handle_mission_read", input, 60_000);
}

export async function runMissionWatch(input: z.infer<typeof missionWatchInputSchema>) {
  return callHandler("handle_mission_watch", input, 660_000);
}

export async function runMissionRecover(input: z.infer<typeof missionRecoverInputSchema>) {
  return callHandler("handle_mission_recover", input, 60_000);
}

export async function runMissionLedgerFix(input: z.infer<typeof missionLedgerFixInputSchema>) {
  return callHandler("handle_mission_ledger_fix", input, 30_000);
}

// ENG-MCP-MISSION-02: close com GATE JEV (fim do fail-open).
// Caminho: 1) close normal. 2) se saiu fail-open (verify estourou 35s) ou reabriu
// verify_required, pergunta ao JEV (3s timeout) se as provas registradas são suficientes;
// SIM → fecha com badge jev-verificado; NÃO → devolve verify_required honesto;
// JEV indisponível → mantém o comportamento atual (fail-open), degraded=true.
export async function runMissionClose(input: z.infer<typeof missionCloseInputSchema>) {
  const first = await callHandler("handle_mission_close", input);
  const stepsJson = JSON.stringify(first.steps ?? []);
  const needsGate = first.ok === false
    || stepsJson.includes("fail-open") || stepsJson.includes("reopenedByDeliverVerify");
  if (!needsGate) return { ...first, jevGate: "not-needed" };

  const acceptReason = input.acceptUnverified ?? "";
  let jev: { verdict?: string; motivo?: string; latency_ms?: number; degraded?: boolean } = {};
  try {
    const { stdout } = await execFileP("python3", [JEV_GATE_SCRIPT, input.missionId,
      JSON.stringify({ acceptReason, first: JSON.stringify(first).slice(0, 2000) })],
      { timeout: 8_000, maxBuffer: 1024 * 1024 });
    jev = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  } catch (e) {
    return { ...first, jevGate: "degraded", jevError: String(e).slice(0, 200) };
  }
  if (jev.verdict === "SIM") {
    const second = await callHandler("handle_mission_close", {
      missionId: input.missionId,
      acceptUnverified: `jev-gate-verified: ${jev.motivo ?? "provas suficientes"}`,
    });
    return { ...second, jevGate: "jev-verificado", jevLatency_ms: jev.latency_ms };
  }
  return { ...first, jevGate: "verify_required", jevMotivo: jev.motivo, jevLatency_ms: jev.latency_ms };
}
