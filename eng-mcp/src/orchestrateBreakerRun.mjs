// ORCH-BREAKER-01: runner standalone do breaker (1 tick por invocação — padrão
// zero-LLM systemd, sem loop interno). Uso opcional se o ciclo do consume ficar
// lento e a amostragem precisar de intervalo próprio (~15s): timer systemd próprio
// apontando para este arquivo. ATIVAÇÃO é decisão de deploy do operator — a
// integração default é o tick dentro do ciclo do consume (orchestrateConsumeDaemon).
// Hooks de produção: mission_recover(pattern=interrupted) + nudge de força pela
// MESMA API governada do mission-ops; aviso por engineering.notify.hermes.
import { appendFileSync } from "node:fs";
import os from "node:os";
import { runBreakerCycle } from "./orchestrateConsumeDaemon.mjs";

const STATE_PATH = `${os.tmpdir()}/orchestrator-breaker.standalone.state.jsonl`;

const result = await runBreakerCycle();
try { appendFileSync(STATE_PATH, JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n"); } catch { /* fail-open */ }
console.log(JSON.stringify(result));
process.exit(0); // tick é best-effort: nunca falha o timer (fail-open do breaker)
