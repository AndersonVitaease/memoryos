// ORCH-HYGIENE-01: runner standalone do ciclo de higiene (1 ciclo por invocação —
// padrão zero-LLM systemd, sem loop interno). Alternativa ao gatilho integrado no
// ciclo do consume (orchestrateConsumeDaemon): timer systemd próprio apontando para
// este arquivo. dryRun é o DEFAULT (fail-closed); execute só com ORCH_HYGIENE_APPROVED=1
// no drop-in (mesmo padrão de aprovação do ORCH-DAEMON-01). ATIVAÇÃO é decisão de
// deploy do operator. Resultado de cada ciclo vai para stdout + append no estado local.
import { appendFileSync } from "node:fs";
import os from "node:os";
import { runOrchestrateHygieneCycle } from "./orchestrateHygiene.ts";

const STATE_PATH = `${os.tmpdir()}/orchestrate-hygiene.standalone.state.jsonl`;
const dryRun = process.env.ORCH_HYGIENE_APPROVED !== "1"; // fail-closed por padrão

let result;
try {
  result = await runOrchestrateHygieneCycle({ dryRun });
} catch (error) {
  result = { ok: false, dryRun, error: error instanceof Error ? error.message : String(error) };
}
try { appendFileSync(STATE_PATH, JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n"); } catch { /* fail-open */ }
console.log(JSON.stringify(result));
process.exit(0); // ciclo é best-effort: nunca falha o timer (fail-open da higiene)
