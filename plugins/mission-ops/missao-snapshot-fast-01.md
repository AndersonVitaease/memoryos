# SNAPSHOT-FAST-01 — MISSION_SNAPSHOT: ESTADO VERDADEIRO DA MISSÃO EM 1 CHAMADA (custo-zero, determinístico)

Problema provado (29/09): "verifique a missão X" do operator exige do supervisor Hermes 5-6 turnos
de LLM (status → read → pane get → diagnóstico de paneId obsoleto → fix de ledger → read de novo)
para o que é I/O puro de ~20s — o resto é turno de LLM entre passos mecânicos. E o snapshot do
fast-router responde rápido mas INCOMPLETO ("sem ledger"), sem o remédio.

## Contexto técnico
- Plugin: /root/.hermes/plugins/mission-ops (handlers = funções puras; registro no register()).
- JÁ EXISTE (não reinventar): `mission_status`, `mission_read` (fontes de dado), correção de
  ledger provada (paneId obsoleto pós-restart do gateway: watchdog02-detectores-02, w6:p9→w6:p8),
  cancelamento de fantasma provado (`_batch_ghost_check`/`_batch_cancel_ghost` da mission_batch).
- Fast-router do gateway (hook) já monta um snapshot mission_list — usar como referência de UX,
  mas a tool nova é do plugin, não do hook.

## Entregáveis (componente /root/.hermes/plugins/mission-ops)
1. **Tool `mission_snapshot`** — registro no catálogo (toolset mission-ops):
   - Entrada: `{missionId}` OU sem argumento (todas as ativas) OU `{fragment}` (busca por substring,
     tolerante a typo do operator — ex. "watchhdog" casa watchdog via difflib ratio >= 0.8).
   - Saída ÚNICA chamada, por missão: {status do ledger, paneId/tabId do ledger, PANE REAL
     (herdr: existe? agent_status? cwd?), verdict: OK | PANEID_OBSOLETO | FANTASMA | INTERROMPIDA,
     remédio aplicado ou sugerido}.
2. **Auto-correção determinística** (a mudança que mata o ciclo manual):
   - PANEID_OBSOLETO: ledger aponta pane inexistente + existe abа com label MISSION:<id> →
     re-sincroniza paneId/tabId no ledger (prova: caso real watchdog02 w6:p9→w6:p8, reproduzível
     em teste com herdr mockado) e registra evento no ledger. Se NÃO achar aba com o label →
     trata como FANTASMA (cancela com reason automática, padrão `_batch_cancel_ghost`).
   - Saída diz o que aplicou: `{fixed: [...], ghosts: [...], ok: [...]}`.
3. **Zero LLM**: tudo regex/lookup/comparação. Nenhuma chamada de rede além do herdr local.
4. **Provas red→green**:
   - Unit (TempState + herdr mockado): fragment com typo casa a missão certa; paneId obsoleto com
     aba real → re-sincronizado; paneId obsoleto sem aba → fantasma cancelado; snapshot sem
     argumento lista todas as ativas com verdict; missão fechada → ok.
   - E2E real: despachar 1 canário trivial via handle_mission_dispatch direto, rodar
     mission_snapshot(canário) → OK; matar o pane (tab close) → snapshot → FANTASMA cancelado.
     Fechar o canário no fim (acceptUnverified).
   - Suíte completa do plugin continua verde (247 + novas).
5. **Relatório**: RELATORIO-snapshot-fast-01.md no cwd — tabela {consulta, antes (turnos LLM ×
   tempo), depois (1 chamada ~5s)} + ativação (restart do gateway no close, pelo supervisor).

## Guardas inegociáveis
- Zero restart do gateway neste escopo (ativação no close é do supervisor/operator).
- Judge JEV intocado; or-worker-bridge 8103 produção; zero vast; zero push/merge.
- Auto-correção SÓ toca ledger de missão (nunca mata processo/aba viva; o único close de aba é o
  caminho padrão do mission_close).
- Custos: zero (tudo local).

## Provas obrigatórias no verify.json (padrão MANIFEST_META_KEYS + cmd)
- unit snapshot verde; suíte completa verde; E2E real (canário vivo → OK; pane morto → fantasma) provado.