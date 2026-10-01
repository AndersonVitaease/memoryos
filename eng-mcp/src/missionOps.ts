// ENG-MCP-MISSION-01/02 (29/09): tools mission-* como wrappers determinísticos
// sobre os handlers PUROS do plugin mission-ops (fonte única de verdade — o
// eng-mcp NÃO duplica lógica; chama python e recebe JSON).
// Andar 1 (regex/IO) para tudo; JEV (250ms, /alpha/decisions) só no gate do close.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod/v4";

const execFileP = promisify(execFile);
const PLUGIN_DIR = "/root/.hermes/plugins/mission-ops";
const JEV_GATE_SCRIPT = "/opt/memoryos/eng-mcp/scripts/jev_gate.py";

async function callHandler(handler: string, args: Record<string, unknown>, timeoutMs = 300_000): Promise<Record<string, unknown>> {
  // ENG-MCP-VERIFY-PYFIX-03: sem o plugin montado (ex.: container hermético do release
  // gate) o execFile com cwd inexistente estoura "spawn python3 ENOENT" — erro enganoso
  // (python3 existe na imagem). Recusa honesta e determinística, sem inventar estado.
  if (!existsSync(`${PLUGIN_DIR}/__init__.py`)) {
    return { ok: false, error: "MISSION_OPS_UNAVAILABLE", pluginDir: PLUGIN_DIR, handler };
  }
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
// ENG-MCP-TOOLS-FIX-02: resolução missionId XOR paneId XOR fragment (contrato do
// handler): 0 resolvedores = INVALID_MISSION_ID (compatibilidade com callers antigos),
// 2+ = INVALID_INPUT; fragment = substring case-insensitive, ≥2 matches = AMBIGUOUS.
export const missionCloseInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(),
  fragment: z.string().optional(),
  acceptUnverified: z.string().optional(),
  cancel: z.boolean().optional(), force: z.boolean().optional(),
  keepPane: z.boolean().optional(), dryRun: z.boolean().optional(),
  expectBadge: z.boolean().optional(), decisionNote: z.string().optional(),
}).strict();
// ENG-MCP-TOOLS-FIX-02: verify read-only (runner zero-LLM) — mesmo resolvedor do close.
export const missionVerifyInputSchema = z.object({
  missionId: z.string().optional(), paneId: z.string().optional(),
  fragment: z.string().optional(), manifest: z.string().optional(),
  timeoutMs: z.number().int().optional(),
  checks: z.array(z.string().min(1)).optional(),
}).strict();
export const missionLedgerFixInputSchema = z.object({
  missionId: z.string().min(1), paneId: z.string().optional(), tabId: z.string().optional(),
  // ENG-MCP-GOVERN-FIX-01: correção manual de status do ledger (mesmo enum do handler)
  status: z.enum(["dispatched", "working", "interrupted", "delivered", "cancelled", "closed", "failed", "recover"]).optional(),
}).strict();
// ENG-MCP-MISSION-NUDGE (29/09): intervenção do supervisor — CHECK->SEND->VERIFY
// atômico do plugin (handler puro, zero LLM). Sem gate JEV por desenho: não há
// prova a julgar, só estado mecânico do pane (decisão registrada 29/09).
export const missionNudgeInputSchema = z.object({
  missionId: z.string().min(1), message: z.string().min(1),
  sender: z.string().optional(), force: z.boolean().optional(),
  verifySeconds: z.number().int().min(0).max(600).optional(),
}).strict();

// ---- DISPATCHER-DUPFIX-01: dispatch fecha TODA aba órfã da MESMA missão.
// Antes (GHOST-CLEAN-01) rodava ANTES do dispatch com igualdade exata de label e
// sem mapeamento tab↔pane — abas órfãs de ledger cancelled/done/start_timeout
// sobreviviam. Agora roda DEPOIS do dispatch: fecha toda aba cujo label CONTÉM
// "MISSION:<id>" e cujo pane NÃO é o recém-criado (independente do status do
// ledger — a aba antiga é órfã por definição quando a missão é re-despachada).
const HERDR_LIST = "H=$(ls /usr/local/bin/herdr* 2>/dev/null | head -1); $H";
type HerdrRunner = (cmd: string) => Promise<string>; // stdout cru do CLI

const defaultRunner: HerdrRunner = (cmd) =>
  execFileP("bash", ["-lc", `${HERDR_LIST} ${cmd}`], { timeout: 15_000 })
    .then((r) => r.stdout);

async function herdrJson(run: HerdrRunner, cmd: string): Promise<Record<string, unknown>> {
  return JSON.parse(await run(cmd)) as Record<string, unknown>;
}

// Ponto de injeção p/ testes (padrão makeBase44CliRunner): runner falso responde
// os comandos herdr sem tocar no herdr real.
export function makeCloseDuplicateTabsRunner(
  responses: Record<string, string>, run?: HerdrRunner,
): { calls: string[]; run: HerdrRunner } {
  const calls: string[] = [];
  return {
    calls,
    run: async (cmd: string) => {
      calls.push(cmd);
      const impl = run ?? (async () => responses[cmd] ?? "{}");
      return impl(cmd);
    },
  };
}

export async function closeDuplicateTabs(
  missionId: string, keepPaneId?: string, runner: HerdrRunner = defaultRunner,
): Promise<string[]> {
  const closed: string[] = [];
  const needle = `MISSION:${missionId}`;
  try {
    const tabs = ((await herdrJson(runner, "tab list")) as { result?: { tabs?: unknown[] } })
      .result?.tabs ?? [];
    // mapear tab↔pane: o tab list não traz pane_id; vem do pane list (p.tab_id).
    let paneByTab = new Map<string, string>();
    try {
      const panes = ((await herdrJson(runner, "pane list")) as { result?: { panes?: unknown[] } })
        .result?.panes ?? [];
      paneByTab = new Map(panes
        .filter((p): p is { pane_id: string; tab_id: string } =>
          typeof (p as { pane_id?: unknown })?.pane_id === "string"
          && typeof (p as { tab_id?: unknown })?.tab_id === "string")
        .map((p) => [p.tab_id, p.pane_id]));
    } catch { /* sem pane list: fecha por label, sem exclusão por pane */ }
    for (const t of tabs as { label?: string; tab_id?: string }[]) {
      if (typeof t.tab_id !== "string" || !(t.label ?? "").includes(needle)) continue;
      const pane = paneByTab.get(t.tab_id);
      if (keepPaneId && (pane === keepPaneId || t.tab_id === keepPaneId)) continue;
      try {
        await runner(`tab close ${t.tab_id}`);
        closed.push(t.tab_id);
      } catch { /* aba pode já ter ido */ }
    }
  } catch { /* herdr indisponível: dispatch decide */ }
  return closed;
}

export async function runMissionDispatch(input: z.infer<typeof missionDispatchInputSchema>) {
  const handler = input.batch ? "handle_mission_batch" : "handle_mission_dispatch";
  const args = input.batch
    ? { missions: [{ missionId: input.missionId, promptFile: input.promptFile,
        cwd: input.cwd, consequence: input.consequence, paneTitle: input.paneTitle,
        spawnedBy: input.spawnedBy }, ...input.batch] }
    : { ...input };
  const result = await callHandler(handler, args);
  // DUPFIX-01: fecha órfãs DEPOIS do dispatch, preservando o pane recém-criado
  // (result.paneId). Antes rodava antes do dispatch — aba órfã de ledger
  // cancelled/done/start_timeout sobrevivia e virava duplicata.
  const zombies = await closeDuplicateTabs(input.missionId,
    typeof result.paneId === "string" ? result.paneId : undefined);
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

export async function runMissionNudge(input: z.infer<typeof missionNudgeInputSchema>) {
  const verifyMs = (input.verifySeconds ?? 30) * 1000;
  return callHandler("handle_mission_nudge", input, verifyMs + 60_000);
}

// ENG-MCP-MISSION-02: close com GATE JEV (fim do fail-open).
// Caminho: 1) close normal. 2) se saiu fail-open (verify estourou 35s) ou reabriu
// verify_required, pergunta ao JEV (8s timeout) se as provas registradas são suficientes;
// SIM → fecha com badge jev-verificado; NÃO → devolve verify_required honesto;
// JEV indisponível → mantém o comportamento atual (fail-open), degraded=true.
// ENG-MCP-TOOLS-FIX-02: recusas determinísticas do handler (BADGE_REQUIRED/
// WORKER_ACTIVE/CANCEL_REASON_REQUIRED/CLOSE_BUSY/... ) NÃO passam pelo gate —
// são estado mecânico, não prova; missionId pode vir resolvido (paneId/fragment).
const DETERMINISTIC_REFUSALS = new Set([
  "BADGE_REQUIRED", "WORKER_ACTIVE", "CANCEL_REASON_REQUIRED", "CLOSE_BUSY",
  "INVALID_INPUT", "INVALID_MISSION_ID", "MISSION_NOT_FOUND", "AMBIGUOUS",
]);
export async function runMissionClose(input: z.infer<typeof missionCloseInputSchema>) {
  const first = await callHandler("handle_mission_close", input, 90_000);
  const stepsJson = JSON.stringify(first.steps ?? []);
  const isDeterministicRefusal = first.ok === false
    && typeof first.error === "string" && DETERMINISTIC_REFUSALS.has(first.error);
  const needsGate = !isDeterministicRefusal && (first.ok === false
    || stepsJson.includes("fail-open") || stepsJson.includes("reopenedByDeliverVerify"));
  if (!needsGate) return { ...first, jevGate: "not-needed" };

  const resolvedId = typeof first.missionId === "string" && first.missionId
    ? first.missionId : (input.missionId ?? "");
  const acceptReason = input.acceptUnverified ?? input.decisionNote ?? "";
  let jev: { verdict?: string; motivo?: string; latency_ms?: number; degraded?: boolean } = {};
  try {
    const { stdout } = await execFileP("python3", [JEV_GATE_SCRIPT, resolvedId,
      JSON.stringify({ acceptReason, first: JSON.stringify(first).slice(0, 2000) })],
      { timeout: 8_000, maxBuffer: 1024 * 1024 });
    jev = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  } catch (e) {
    return { ...first, jevGate: "degraded", jevError: String(e).slice(0, 200) };
  }
  if (jev.verdict === "SIM") {
    const second = await callHandler("handle_mission_close", {
      ...input,
      missionId: resolvedId,
      acceptUnverified: `jev-gate-verified: ${jev.motivo ?? "provas suficientes"}`,
    }, 90_000);
    return { ...second, jevGate: "jev-verificado", jevLatency_ms: jev.latency_ms };
  }
  return { ...first, jevGate: "verify_required", jevMotivo: jev.motivo, jevLatency_ms: jev.latency_ms };
}

// ENG-MCP-TOOLS-FIX-02: verify read-only (40s budget — runner 35s + margem).
export async function runMissionVerify(input: z.infer<typeof missionVerifyInputSchema>) {
  return callHandler("handle_mission_verify", input, 40_000);
}
