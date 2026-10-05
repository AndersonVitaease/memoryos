# RELATÓRIO — MISSION-NUDGE-01 (incl. retomada 02)

Missão: tool governada de intervenção do supervisor — nudge atômico CHECK → SEND → VERIFY no plugin mission-ops (zero LLM).
Contrato: `/opt/memoryos/eng-mcp/missao-mission-nudge-01.md` (retomada: `missao-mission-nudge-02.md`).

## O que foi entregue

**Tool `mission_nudge(missionId, message, {sender, force, verifySeconds})`** registrada no toolset `mission-ops` (agora 11 tools):

1. **CHECK** — resolve o pane via ledger (não existe missão sem ledger → recusa tipada) e lê o pane:
   `working` (footer "esc to interrupt"), `idle` (⏵⏵), `interrupted` (claude no foreground sem marcador de
   turno), `shell`, `perdido` ou `unknown`. Recusa operar em **working ativo** sem `force` (lição do Enter
   perdido: não interrompe turno em curso — P1) e aplica dedupe: 2º nudge <60s → `refused_dedupe`.
2. **SEND** — `deliver_prompt` (send-text → verificação de aceitação → Enter), com o **sender declarado**
   (default `supervisor:hermes`, declarável) propagado via `HERDR_SENDER` para o audit de pane-writes
   (SENDER-ID-01); evento `mission_nudged` no bus de eventos.
3. **VERIFY** — espera N segundos (config, default 30) → re-lê o pane → engatou `working` ? `nudged` :
   `engage_failed` com o texto do pane e **sem reenvio** (sem retry infinito).
4. **Retorno estruturado**: `{status: nudged|refused_busy|refused_dedupe|engage_failed|pane_lost,
   paneStateBefore/After, sender, verified, reason}`.

## Provas (red-then-green, suíte `python3 test_mission_ops.py`)

- **P1** — caso real citado no desenho: Enter perdido interrompeu a boot-verify; o desenho do VERIFY
  (confirmação de aceitação no deliver + re-leitura pós-espera) é a resposta direta. (documento no docstring
  da classe de testes)
- **P2**: missão-teste idle → `nudged`, `paneStateAfter=working`, sender registrado no audit (`test_p2_idle_engages_with_sender`).
- **P3**: missão working → `refused_busy`, ZERO send-text no rastro de chamadas (turno intocado) (`test_p3_working_refused_not_interrupted`).
- **P4**: pane que ignora → `engage_failed` com o texto do pane, UMA entrega só, sem retry infinito (`test_p4_no_engagement_reported_without_retry`).
- **P5**: pane id inválido / pane sumido → `pane_lost` tipado, sem crash (`test_p5_pane_lost_typed_no_crash`).
- **P6**: 2º nudge <60s → `refused_dedupe`, um único send (`test_p6_dedupe_second_nudge_refused`).
- **P7**: suíte completa **81/81 verde** (73 pré-existentes + 8 novas).

## Decisões de projeto

- **Dedupe por missão** em `nudges.json` (STATE_DIR, 0600, atômico) — isolado por missão; `force` bypassa
  busy e dedupe.
- **Dedupe somente após envio** (não conta tentativa recusada) — evita bloquear um nudge legítimo depois
  de uma recusa busy.
- **Missing ledger → pane_lost** com reason explícita "missão sem ledger/paneId" (recusa tipada; nunca envia
  em pane de missão inexistente no ledger).
- **`refused_dedupe` entra no enum de status** (extensão do contrato, que já previa dedupe como recusa).

## Guards respeitados

- Tudo no worktree `/root/.hermes/worktrees/fix-mission-nudge` (branch `fix-mission-nudge`). Zero deploy, zero push.
- A tool nunca autoriza consequência, nunca fecha missão, nunca envia em pane de missão sem ledger.
- Zero LLM (herdr + leitura de marcadores determinísticos apenas).

## Suíte

`python3 test_mission_ops.py` → **81/81 OK** (73 legados + 8 do nudge: P2, P3, P4, P5, P6, force, invalid
inputs, sender-env). `pytest` direto não funciona no worktree (import relativo exige execução como
pacote/documentado: `python3 test_mission_ops.py`).

## Pendências / próximos passos

- Nada bloqueante. `verifySeconds` default 30s em produção (testes usam 0 com sleep mockado).
- Sugestão futura: expor `mission_nudge` no runbook do supervisor (seção de intervenção).
