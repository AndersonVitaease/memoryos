# mission-list-compact-default-01 — COMPACTO COMO PADRÃO NO mission_list (latência do chat)

Medida do dia 28/09 (anotação do supervisor): mission_list SEM compact devolve ~35KB por chamada — infla o
prefill de TODO turno do supervisor (o chat lê isso dezenas de vezes/dia). O modo compacto já existe
(`_compact_flag`, opt-in do router, WATCHDOG-LANE2-01) e prova que a saída compacta é suficiente para
supervisão (o supervisor usou o dia todo). Pendência registrada: tornar compacto o DEFAULT.

## Entrega
1. **Default invertido**: mission_list sem argumento → saída COMPACTA (contagens + missões ativas + últimas
   N fechadas). Verbosidade total vira opt-in explícito (`full=true` ou `verbose=true`) — o inverso de hoje,
   sem quebrar nenhum chamador existente (os que passam compact=true continuam idênticos).
2. **Latência medida**: prova de tamanho — sem compact (full): X KB; default novo: Y KB (meta: <8KB no
   default com ≥10 missões no ledger e ≥3 abas vivas). Números no relatório.
3. **Regressão**: suíte mission-ops verde (inclui WATCHDOG-LANE2-01); os snapshots do fast-router
   (missions_snapshot) continuam funcionando — é consumidor da saída compacta, deve ficar estável.
4. **Ativação**: boot novo (sem restart do gateway — a sessão do supervisor vive nele). Anote no relatório
   para o window de boot único do operator.
5. Relatório: /root/.hermes/plugins/mission-ops/RELATORIO-mission-list-compact-default-01.md + verify-<missionId>.json (NOVO padrão do dia — manifesto com campo mission; o runner está sendo corrigido em paralelo
   para exigir isso, missão verify-collision-fix-01).

## Restrições
- Repositório: /root/.hermes/plugins/mission-ops APENAS, mudança mínima no mission_list/status (sem tocar
  deliver_prompt/nudge — fechados hoje). Não abrir: eng-mcp (import-gate em voo), /opt/deliver-verify
  (verify-collision-fix em voo — componentes distintos, não cruzar), gpu-watchdog, guardian-compute,
  fast-router/shadow-router.
- Sem push.