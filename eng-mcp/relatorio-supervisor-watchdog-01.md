# Relatório — SUPERVISOR-WATCHDOG-01 (26/09/2026)

**Missão:** detectar deriva/loop/idle em missões vivas do mission-ops e aconselhar o worker em tempo real (nudge → reset forte → escala). Autorizada pelo operator 26/09 ~16:2xZ.

**Status: CONCLUÍDA. Provas P1-P7 verdes, daemon em produção (systemd), Hermes notificado.**

## O que foi construído

`/opt/gpu-watchdog/watchdog.py` (~614 linhas, Python stdlib puro) + `config.json` + `state.json` + `findings.jsonl` + `watchdog.log` + `RUNBOOK.md` + unit systemd `gpu-watchdog.service`.

**Ciclo (75s, daemon):** carrega config/state → `mc.list_ledgers()` (mission-ops) → filtra elegíveis (excluded → test_only → watched) → resolve pane por missão (`resolve_pane`, nunca confia no paneId do ciclo anterior) → lê conteúdo do pane (120 linhas) → roda detectores → aplica escada → heartbeat.

**Detetores (determinísticos primeiro — custo zero):**
- D1 deriva: regex `missao-[stem]` no pane citando missão alheia não legitimada (contrato pode legitimar cross-refs; `allowed_missions` sobrescreve).
- D2 idle pós-crash: `CRASH_RE` (API Error / press enter to retry / etc.) nas últimas 15 linhas + `agent_status != working`.
- D3 loop: md5 do tail do pane (3000 chars) repetido 3+ ciclos com agente `working`.
- D4 turno longo: >20min `working` sem arquivo novo no cwd → **judge LLM** (fail-open, memoizado).

**Escada:** 0ª det. → nudge de foco; 1ª persistente → reset forte (contrato verbatim + lista do disco + alvo); 2ª → para de injetar, grava finding em `findings.jsonl` + evento bus `watchdog_escalation` (stage 3 permanente até `--reset-state`). Toda injeção com prefixo `SUPERVISOR-WATCHDOG:`. Cooldown 300s/missão.

## Provas (P1-P7) — todas verdes

| Prova | Resultado |
|---|---|
| P1 deriva | detecção em 1 ciclo (pane de teste com `missao-gws-tools-01-adendo-soberano` citado) |
| P2 nudge | texto `SUPERVISOR-WATCHDOG: ...` visível no pane <2min da detecção |
| P3 reset forte | `RESET FORTE` com contrato verbatim (25 linhas) + lista do disco no pane (após 2 fixes: regex greedy; build_message por ACTION) |
| P4 escala | pane INALTERADO (51→51 linhas), finding em `findings.jsonl` + evento bus `watchdog_escalation`, stage=3 permanente |
| P5 cooldown | streak incrementou, SEM re-injeção, `last_reason: cooldown_active` |
| P6 idle pós-crash | nudge "você está parado em bloco pós-erro... continue de onde parou" injetado |
| P7 custo | 6 ciclos limpos: 394ms total (~65ms/cicl. incl. startup Python), cycle_ms in-process = 9, llm_calls=0, errors=0 → **100% determinístico** (target <5% LLM) |

## Judge LLM (honesto)

`judge_endpoint` aponta para a ponte GPU TRINITY (`http://127.0.0.1:8102/v1/messages`, modelo Qwen). A ponte está DOWN (vLLM upstream 8100 caiu — `TypeError: fetch failed`). Comportamento: **fail-open memoizado** — judge indisponível nunca trava o ciclo, heartbeat mostra `judge=unknown`, D4 não gera detecção. Troca de judge (flash→Qwen do ORCHESTRATOR quando GPU-ORCHESTRATOR-01 fechar) = editar `config.json`, zero código. **Não foi testado com LLM real** (ponte down na janela da missão).

## Rollout de produção

1. Artefatos de teste limpos (pane fechado, ledger watchdog-test-p1 e /tmp/watchdog-tests removidos).
2. `test_only: false` em config (vigia missões reais: deliver-verify-01, gpu-orchestrator-01, voice-live-01b).
3. Unit systemd criado + enabled; **fix obrigatório**: `Environment=HERDR_SOCKET_PATH=/root/.config/herdr/herdr.sock` (sem isso: `server_not_running` falso — systemd não herda a env do CLI).
4. Daemon ativo (pid 1516828), heartbeat: `watched=['deliver-verify-01','gpu-orchestrator-01','voice-live-01b'] skipped=[('supervisor-watchdog-01','excluded')] judge=unknown cycle_ms=667`.
5. Evento `watchdog_enabled` no bus; `engineering_notify_hermes` delivered:true (hermes_run_id chatcmpl-1dc91cbc3e024571834e8af64f22f, 16:28:28Z).

## Bugs encontrados e corrigidos durante as provas

1. **Regex non-greedy truncava stem** (`{2,80}?` + `\b` parava no primeiro hífen) → falso positivo citando a própria missão. Fix: classe greedy + `\b`.
2. **build_message selecionava template por KIND de detecção** enquanto a escada acionava por ACTION → reset forte nunca era emitido. Fix: assinatura `(action, kind, ...)` com `if action == "reset"` primeiro.
3. **systemd sem socket do herdr** → `server_not_running` falso. Fix: linha `Environment=` no unit.

## Guardas honrados

Nunca encerra missão, nunca autoriza consequência (só injeta texto prefixado e escala); só injeta em pane de missão VIVA do state; cooldown anti-spam; judge fail-open; anti-crash 10KB; cwd `/opt/gpu-watchdog`.

## P8

RUNBOOK: `/opt/gpu-watchdog/RUNBOOK.md`. Judge verify (camada 0, VERIFY-01) rodado sobre as claims deste relatório; FINGERPRINT no fechamento via `engineering.memory.capture`.