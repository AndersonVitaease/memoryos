# ESTADO — MISSION-NOTIFY-01 (3ª sessão, worktree mission-notify-01)

Atualizado: 2026-09-27. SUITE: **87/87 OK**. MISSÃO CONCLUÍDA.

## Feito nesta sessão (M2 + M3)
- Diagnóstico da suíte vermelha herdada (7F+2E em 87): causa raiz = defaults
  avaliados no import em emit_event/probe_asset_lost/mission_gpu_cost_usd/
  probe_budget_alert (patch do NotifyState não valia; dedupe lia assinaturas
  REAIS poluídas por rodadas anteriores → tudo "duplicate").
- Fixes (commit d5d0418): defaults resolvem constantes na CHAMADA; run_probes
  ganhou skip_text; NotifyState fixa BUDGET_* (env do host não muda veredito);
  asset_lost → missionId infra:gpu-volume; limpas 10 assinaturas de teste
  (m1-m4, w4:pX) do /root/.hermes/mission-state/notify-signatures.json.
- Provas P1-P7: 12 testes plantados executados individualmente — TODOS OK.
- Relatório: relatorio-mission-notify-01.md (pt-BR, resultados reais).
- TESTE VIVO FINAL: primeiro mission_completed REAL da história emitido no bus
  — é o fechamento desta missão (mission-notify-02, custo GPU real US$0.0021,
  ts 2026-09-27T00:16:48Z). Os 6 anteriores no bus são resíduo de teste (m1/m3/m4).

## Histórico de commits da missão
- 3cb6998 — matriz + sondas + watcher multi-workspace (2ª sessão)
- d5d0418 — fix dedupe/sondas isoladas + 87/87 verde (3ª sessão)
- (final) — relatório + Estado

## Pendente (fora do escopo, pro operator)
- [ ] Deploy governado do mission-ops com a matriz
- [ ] budget_alert ligado ao config central (hoje: env MISSION_NOTIFY_BUDGET_*)
- [ ] mission_waiting_operator → PUSH real no canal do operator

## Guards respeitados
- ZERO escrita no plugin principal (só worktree). Zero deploy/push. Zero LLM.
- Watchdog e deliver-verify intocados.
