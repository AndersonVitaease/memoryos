# mission-ops

MISSION-OPS-01 — plugin lado Hermes: orquestração de ciclo de vida de missões GH.
Zero LLM. Não toca eng-mcp, worktrees, config ou credenciais. Nenhuma tool aprova/mergea/deploa
(transporte e recuperação determinística apenas — tier-3 é do operador, verificação é do supervisor).

## Tools (toolset `mission-ops`)

| Tool | Faz |
|---|---|
| `mission_dispatch` | Divide pane no herdr a partir da pane atual (`sourcePaneId` ou env `HERDR_PANE_ID`), abre claude, envia só `leia <promptFile> e execute` (convenção prompt-in-file). Grava ledger em `~/.hermes/mission-state/<missionId>.json`. Idempotente: missão ativa → `no_op`. |
| `mission_watch` | Watchdog **orientado a evento** via `herdr pane wait-output` (nunca polling). Single (`missionId`) ou `all=true` (todas as ativas, timeout por pane). Cada evento → ledger + `events.jsonl` + receita quando segura. |
| `mission_recover` | Receita determinística por pane: `pattern` ∈ `interrupted\|palette\|transcript400\|shell_fallback\|autocompact`. Desconhecido → `needs_supervisor`, zero mutação. |
| `mission_status` | `{missionId, paneId, status, lastEventAt, lastEvent, resumeSessionId}` em 1 chamada — a resposta de "onde estávamos", sobrevive a restart do chat. |

## Evento → receita (mapa, espelha `recipes.py`)

| Evento | Ação |
|---|---|
| `interrupted` | **auto**: Esc + `continue` + Enter → status=dispatched |
| `palette` | **auto**: Esc somente (**nunca executar /quit**) |
| `autocompact` | marca status=autocompact (comportamento esperado, nada a fazer) |
| `transcript400` | marca `needs_recovery`; recover = sessão claude **nova enxuta** (**NÃO retomar a envenenada** — regra 23–24/09) + prompt curto de retomada com estado do disco |
| `shell_fallback` | marca `needs_recovery`; recover = `claude --resume <id do ledger>` ou claude novo + resume |
| `delivered` | status=delivered ("Relatório final"/FINGERPRINT detectado — **verificação é do supervisor**) |
| desconhecido | `needs_supervisor` — evento gravado, nenhuma ação |

## Transporte

Todo comando herdr passa por `run_herdr()`: `subprocess.run` com timeout rígido, parse JSON,
fail-closed. Falha de herdr = erro estruturado limpo, nunca crash. Ledger atômico 0600;
`events.jsonl` append-only best-effort.

## DELIVER-VERIFY (26/09) — verificação E2E no fechamento

Gate do `mission_close` (passo 0/0.5, `__init__.py` ~591–664; primitivos em `verify_gate.py`;
runner em `/opt/deliver-verify/verify.py` — zero-LLM, 7 tipos de prova `http/pixels/ocr/cmd/file/service/bus`):

1. A missão declara `verify.json` no SEU cwd (exemplo canônico: `/opt/deliver-verify/examples/verify.example.json`).
2. No `mission_close`: **passo 0** — se o ledger tem `cwd`+`missionId` e existe `<cwd>/verify.json`, roda o runner (subprocess, timeout 35s) e grava o relatório `<missionId>.verify.json` em mission-state.
   - **VERDE** (exit 0) → badge **`verified_e2e`** no ledger (`{"verdict","ts","report"}` — nome exato, cross-dependency GPU-ORCHESTRATOR-01).
   - **VERMELHO REAL** (exit 2 com falhas fora de `manifest-parse`/`inference`) → status=`interrupted` salvo ANTES do nudge; `{"ok": false, "reopenedByDeliverVerify": true}`; nudge na pane + evento `deliver_verify_red` no bus (RUNBOOK de mission-events, ADENDO 3).
3. **passo 0.5** — se o ledger declara `operator_channel` (SUPERVISOR-VERIFY-01), prova o canal do operator (curl).
4. **Fail-open ×3:** exit inesperado do runner, timeout 35s ou exceção → step `{"verdict": "fail-open", "note": "<erro exato>"}` e fechamento segue. VERMELHO REAL sempre bloqueia; fail-open cobre só falha de INFRA do verificador.
5. **Sem `verify.json`: caminho de fechamento 100% inalterado** — o gate NUNCA bloqueia missão sem manifesto (modo inferido do runner existe mas só é usado pela tool `mission_verify`).

Tool **`mission_verify`** (wrapper `handle_mission_verify`): verificação sob demanda pelo supervisor-Qwen — determinística, independente de LLM; aceita `manifest`/`ledger_dir` opcionais.

Complementaridade: o passo 0 verifica a ENTREGA, o passo 0.5 o CANAL do operator — ambos ativos no mission_close, nenhum substitui o outro. Guarda read-only fora do ledger/relatório: nunca muta a entrega verificada.

## Template de dispatch (WATCHDOG-02, 26/09)

Todo dispatch/recuperação usa `mc.dispatch_prompt(prompt_file)` — o template carrega a cláusula
anti-stop-and-ask: perguntas de escopo técnico são do agente; pare esperando o operator SOMENTE
para consequência externa/credencial/orçamento; contrato perdido se re-le por `cat` (nunca pedir
colagem). 5 call sites (`__init__.py` ×2, `recipes.py` ×3) passam por ela; suíte 73/73.

## Testes

```bash
python3 test_mission_ops.py   # 30 testes, herdr mockado (positivo+negativo por receita)
```