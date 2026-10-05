# ENG-MCP-MISSION-01 — TOOLS engmcp.mission_dispatch + engmcp.mission_status (prioridade 1)

Problema provado 29/09: despachar via plugin do gateway = 5min+ (código antigo em memória, handler síncrono, cancelamento → fantasma); "verificar missão" = 5-6 turnos LLM para I/O de ~5s. O caminho determinístico já provado: handlers do plugin mission-ops são funções puras (dispatch individual 6,9s; lote 2 = 25,5s via handle_mission_batch; auto-correção de paneId obsoleto provada no watchdog02 w6:p9→w6:p8).

## Contexto
- Plugin: /root/.hermes/plugins/mission-ops (funções puras importáveis — REUSAR, não duplicar: mission_core, handle_mission_dispatch, handle_mission_batch, _batch_ghost_check/_batch_cancel_ghost, _qwen_bridge_alive).
- eng-mcp: serviço na porta 8787 (catálogo com 124 tools), /opt/memoryos/eng-mcp (ver layout real no repo; o registro de tools e o padrão de handler já existem — siga o padrão dos 124).
- CREDENCIAL/infra: nada novo (tudo local).

## Entregáveis (SEUS ARQUIVOS: novo módulo engmcp_mission_dispatch.* + registro; NÃO toque em close/watch/read/recover/ledger_fix — são da missão irmã ENG-MCP-MISSION-02)
1. **engmcp.mission_dispatch** — wrapper do handler existente:
   - Entrada: {missionId*, promptFile*, cwd?, consequence?, paneTitle?, engine?, spawnedBy*, batch?: [itens]} — lote 2-6 na mesma chamada (usa handle_mission_batch).
   - Comportamento embutido (já existe no plugin): fail-fast 45s (ponte morta), anti-fantasma (cancel+redespacho), idempotência (ativa → no_op), gate de cadeia (CHAIN_DISPATCH_NOT_ALLOWED/CHAIN_DEPTH_EXCEEDED), validação de manifesto.
   - Saída: {ok, status, paneId, tabId, readyDeadlineS, tempoTotalS, itens?, latency_ms da tool}.
2. **engmcp.mission_status** — o snapshot completo em 1 chamada:
   - Entrada: {missionId? | fragment? (difflib ≥0.8, typo-tolerante) | all?}.
   - Saída por missão: {status ledger, paneId/tabId, paneReal {exists, agent_status, cwd}, verdict: OK|PANEID_OBSOLETO|FANTASMA|INTERROMPIDA|AGUARDANDO_OPERATOR, fix_aplicado?, proxima_acao}.
   - Auto-correção determinística: paneId obsoleto + aba com label MISSION:<id> → re-sincroniza ledger (evento no ledger); sem aba → fantasma (cancel com reason). Sem LLM.
3. **Trilha + latência**: cada chamada registra evento no spool (padrão do eng-mcp) com latency_ms; saída sempre carrega latency_ms.
4. **Provas red→green**: unit com TempState + herdr mockado (os mesmos 5 casos da TestMissionBatch + fragment-typo + paneId obsoleto com e sem aba real); E2E real: despachar 1 canário trivial via a tool nova, mission_status(canário) = OK, matar o pane → status = FANTASMA cancelado; fechar o canário no fim (acceptUnverified). Suítes completas dos dois componentes continuam verdes.
5. **Relatório**: RELATORIO-engmcp-mission-01.md no cwd com tabela {consulta, antes (turnos×tempo), depois (1 chamada, latency medida)}.

## Guardas ineguiáveis
- Escopo de arquivos: só o módulo novo + registro no catálogo do eng-mcp + (se indispensável) import/passivo no plugin. NÃO alterar handlers close/watch/read/recover/ledger_fix (irmã).
- Zero restart do gateway hermes (independência do gateway é justamente o objetivo); zero vast; zero push/merge; or-worker-bridge 8103 produção; judge JEV intocado.
- Liveness honesta: pane morto = FANTASMA, sem "pode estar em curso" inventado.
- verify.json no cwd (padrão MANIFEST_META_KEYS + cmd) — provas executáveis.
