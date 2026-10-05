# ENG-MCP-MISSION-02 — TOOLS engmcp.mission_read/watch/close/recover/ledger_fix + GATE JEV NO CLOSE

Continuação do desenho aprovado pelo operator (29/09). A missão irmã ENG-MCP-MISSION-01 (despacho + status) é SEU ESCOPO EXCLUSIVO — não toque em dispatch/batch/status. Seus alvos: read, watch, recover, close (+ gate JEV) e ledger_fix.

## Contexto
- Plugin /root/.hermes/plugins/mission-ops: handlers puros existentes (handle_mission_read/watch/close, _batch_cancel_ghost) — REUSAR, não duplicar.
- eng-mcp porta 8787 (/opt/memoryos/eng-mcp): siga o padrão dos 124 tools existentes (registro, handler, trilha).
- JEV: typesafe/jev-1.13 via https://openrouter.ai/api/alpha/decisions, credencial /opt/eng-mcp-release-data/credentials/openrouter-judge (prefixo duplicado — chave válida = substring sk-or-v1-; NUNCA imprimir). Referência de implementação: /opt/gpu-watchdog/watchdog.py funções _jev_cred/_judge_post (style "jev") e contrato /opt/memoryos/eng-mcp/src/judge.ts. Custo ~$0,00002, lat ~250ms.

## Entregáveis (SEUS ARQUIVOS: módulo novo engmcp_mission_ops2.* + registro + judge helper compartilhável)
1. **engmcp.mission_read** — {missionId?|paneId?, lines?, source?} → {text, truncated, next_offset}. I/O puro.
2. **engmcp.mission_watch** — {missionId?|all, timeoutMs?, perPaneTimeoutMs?} → {event, verdict, note, probes[]} (os 8 detectores existentes).
3. **engmcp.mission_recover** — {missionId|paneId, pattern?} → escada enter→nudge→redeliver (guard anti-falso-positivo).
4. **engmcp.mission_close** — {missionId*, acceptUnverified?} → {ok, steps[]}.
5. **engmcp.mission_ledger_fix** — {missionId*, paneId?, tabId?, status?} → {fixed, before, after} (correção manual para casos fora da auto-correção da irmã).
6. **GATE JEV NO CLOSE (o único LLM da família)** — hoje o gate de verify é timeout 35s fail-open (repetiu em TODAS as missões de hoje). Novo comportamento:
   - Suíte de verify completa dentro do orçamento (>=provado) → fecha com badge (regex).
   - Suíte estoura o gate → JEV decide "as provas registradas (verify.json + trilha) são suficientes para a intenção do contrato?" → SIM: fecha com badge jev-verificado; NÃO: reabre verify_required (fail-CLOSED). JEV indisponível → mantém fail-open ATUAL (nunca bloquear fechamento por indisponibilidade do judge; registrar degraded).
   - Timeout do JEV: 3s (250ms típico); custo por decisão ~$0,00002 — registrar no bus (mission_cost ou equivalente).
   - O JEV decide APENAS suficiência de provas — NUNCA autoriza consequência externa (receita atual do operator mantida).
7. **Trilha + latência**: evento no spool por chamada com latency_ms (idêntico ao padrão da irmã).
8. **Provas red→green**: unit (TempState/mock): as 5 tools; gate JEV com judge MOCKADO (3 caminhos: suficiente→badge, insuficiente→reabre, indisponível→fail-open degraded). E2E real: 1 canário trivial → read/watch/nele; close SEM verify → reabre verify_required (fail-closed provado); close com acceptUnverified → fecha. Suítes completas verdes.
9. **Relatório**: RELATORIO-engmcp-mission-02.md no cwd — custo do JEV medido (antes/depois do saldo OR) + tabela de latências.

## Guardas ineguiáveis
- Escopo: só os handlers read/watch/close/recover + módulo novo + judge helper. NÃO toque em dispatch/batch/status (irmã).
- Judge do gpu-watchdog (produção, watchdog.py/config.json) INTACTO — o helper JEV aqui é próprio do eng-mcp (não é o mesmo arquivo; pode importar o padrão, não o estado).
- Zero restart do gateway hermes; zero vast; zero push/merge; or-worker-bridge 8103 produção.
- Credencial do judge JAMAIS em log/relatório/spool (só hash16 se precisar referenciar).
- verify.json no cwd com cmd executáveis.
