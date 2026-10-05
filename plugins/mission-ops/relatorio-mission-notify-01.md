# RELATÓRIO — MISSION-NOTIFY-01/02: MATRIZ DE NOTIFICAÇÃO DO WORKTREE

Sessão 3 (retomada no QWEN, teto 12k). Data: 2026-09-27. Worktree:
`/root/.hermes/worktrees/mission-notify`, branch `mission-notify-01`.

## Resumo

A 2ª sessão havia entregado a matriz (notify.py: transições + sondas + watcher
multi-workspace) mas morreu antes de rodar os testes. Esta sessão **não reescreu
nada** — achou a suíte vermelha (7 falhas + 2 erros em 87), diagnosticou, corrigiu
e fechou: **87/87 verde**, provas P1–P7 todas OK, e o primeiro `mission_completed`
REAL da história no bus é o fechamento desta própria missão.

## Causa raiz das falhas (3 bugs, um só padrão)

1. **Defaults avaliados no import**: `emit_event(signatures_path=SIGNATURES_FILE)`,
   `probe_asset_lost(gpu_state_path=GPU_STATE)`, `mission_gpu_cost_usd(...)` e
   `probe_budget_alert(limit_*=BUDGET_*)` capturavam as constantes do módulo NA
   DEFINIÇÃO da função. O fixture `NotifyState` fazia patch em `nf.SIGNATURES_FILE`/
   `nf.GPU_STATE`, mas os defaults continuavam apontando para os caminhos REAIS.
   Consequência: a dedupe lia `/root/.hermes/mission-state/notify-signatures.json`
   (poluído por rodadas de teste anteriores) e engolia TODOS os eventos como
   duplicados — daí os `0 != 1` em cascata.
2. **`run_probes` sem `skip_text`**: os testes chamavam com `skip_text=True`;
   o parâmetro não existia (TypeError nos P6).
3. **Resíduo de teste em produção**: as rodadas anteriores da 2ª sessão haviam
   gravado 10 assinaturas de missões-teste (m1–m4, pane w4:pX) no arquivo de
   assinaturas real e 6 eventos `mission_completed` falsos no bus real
   (ts 00:08:55Z e 00:15:13Z, ids m1/m3/m4). Removidas as assinaturas; os 6
   eventos ficam no spool documentados como resíduo (bus é append-only).

## Correções (commit d5d0418)

- `notify.py`: todos os defaults acima resolvem a constante NA CHAMADA
  (`x = CONST if x is None else x`); `run_probes` ganhou `skip_text`;
  `asset_lost` usa `missionId=infra:gpu-volume` (o asset é o volume vast).
- `test_mission_ops.py`: `NotifyState` fixa `BUDGET_MISSION_USD=5.0`/
  `BUDGET_DAY_USD=10.0` (o env do host não pode mudar veredito de teste).
- Estado real: limpadas 10 assinaturas de teste de
  `/root/.hermes/mission-state/notify-signatures.json`.

## PROVAS P1–P7 (resultado real de cada uma, executadas individualmente)

| Prova | Situação | Teste plantado | Resultado |
|---|---|---|---|
| P1 | missão fechada → `mission_completed` com badge+custo+veredito | `test_p1_close_emits_mission_completed_with_badge_and_cost`, `test_p1_close_sem_verify_emite_veredito_no_verify_manifest` | **OK** — badge=verified_e2e, custo_gpu=US$1.25, veredito=pass; sem verify manifest → veredito=no_verify_manifest |
| P2 | pergunta legítima → `mission_waiting_operator` (PUSH, camada própria) | `test_p2_waiting_operator_event_and_push` | **OK** — classify_text reconhece o vocabulário anti-stop-and-ask; evento no bus + notifyWaitingOperator=true |
| P3 | missão em outro workspace (w4/w5) → vista pelo watcher | `test_p3_orphan_pane_turn_done_in_other_workspace`, `test_p3_orphan_scan_ignores_tracked_and_non_turn_done` | **OK** — turn_done em pane órfão `w4:pX` → `mission_orphan_turn_done`; panes rastreados/sem turn_done não disparam |
| P4 | "API Error: 400" no pane → `transcript_corrupt` | `test_p4_transcript_corrupt_probe` | **OK** — sonda emite evento no bus <2min (ciclo do watcher) |
| P5 | "5%/7% until auto-compact" → `context_low`; 50% não dispara | `test_p5_context_low_probe` | **OK** — 7% dispara com degrau de 5% na assinatura; 50% → None |
| P6 | asset_lost (state.json sumiu) + budget_alert (custo > limite) | `test_p6_asset_lost_when_state_missing`, `test_p6_budget_alert_over_limits` | **OK** — `asset_lost` com missionId `infra:gpu-volume`; missão US$6>5 e dia US$11>10 disparam, US$1/US$2 não; run_probes com custo real 0 → nada |
| P7 | suíte verde + dedupe provado + recovering | `test_p7_dedupe_same_transition_not_reemitted`, `test_p7_dedupe_persists_on_disk`, `test_p7_recover_emits_mission_recovering`, `test_reopen_path_emits_mission_reopened` | **OK** — 2ª emissão da mesma transição → duplicate; assinaturas persistem em disco (restart não reemite); recover → `mission_recovering`; reopen → `mission_reopened` |

**Suíte completa: 87/87 OK** (73 antigas + 14 novas). Antes das correções: 87
testes, 7 falhas + 2 erros — todos explicados pelas 3 causas acima.

## TESTE VIVO FINAL — primeiro mission_completed real da história

Emissão real (sem mocks, state real) no bus `/opt/mission-events/spool.jsonl`:

```
{"ts": "2026-09-27T00:16:48Z", "event": "finding", "kind": "mission_completed",
 "missionId": "mission-notify-02",
 "detail": "veredito=suite-87-87-ok; matriz+sondas+watcher multi-ws; provas P1-P7 OK; custo_gpu=US$0.0021",
 "source": "mission-ops:notify"}
```

- Custo GPU real lido do state.json do gpu-orchestrator: **US$0.0021**.
- Os únicos 6 `mission_completed` anteriores no bus são resíduo de teste
  (ids m1/m3/m4, gravados por rodadas sem mock) — nenhum real. Este é o primeiro.
- Assinatura dedupe gravada: `mission_completed:mission-notify-02:completed`.

## Entregas da matriz (herdadas da 2ª sessão, verificadas nesta)

- **Transições**: `mission_completed` (badge verified_e2e + custo cost_ledger/
  runtime + veredito), `mission_reopened`, `mission_waiting_operator` (PUSH pro
  operator), `mission_recovering` — todas no close/recover/_on_event do
  `__init__.py`.
- **Watcher multi-workspace**: `_scan_orphan_panes` — turn_done em pane fora do
  mission-ops (qualquer ws) → `mission_orphan_turn_done` (fecha o gap w3-only
  do caso watchdog-02).
- **Sondas**: `context_low` (degrau 5%), `transcript_corrupt`, `pane_lost`,
  `asset_lost` (state.json do gpu-orchestrator), `budget_alert` (limites por
  env `MISSION_NOTIFY_BUDGET_MISSION/DAY`, defaults US$5/US$10) — rodam no
  ciclo do watcher (texto por pane, infra 1x/ciclo).
- **Dedupe**: assinatura `kind:missionId:transição` em
  `notify-signatures.json`, persistida em disco, nunca reemite.

## Commits

- `3cb6998` — matriz de notificação + sondas + watcher multi-workspace (2ª sessão)
- `d5d0418` — fix dedupe/sondas isoladas + skip_text + 87/87 verde (esta sessão)
- commit final — relatório + Estado (esta sessão)

## Guards respeitados

Zero escrita no plugin principal (só worktree). Zero deploy/push. Zero LLM no
caminho (emissão determinística). Nenhum guarda existente (watchdog,
deliver-verify) tocado. Única escrita fora do worktree: limpeza das assinaturas
de teste no state dir de runtime + o evento do fechamento no bus (pedido
explícito da missão).

## Próximos passos (fora do escopo desta missão)

1. Deploy governado do mission-ops com a matriz (etapa separada, operator).
2. Conectar `budget_alert` ao config central quando existir (hoje: env).
3. `mission_waiting_operator` → PUSH real no canal do operator (vocabulário já
   definido; entrega depende do canal de notificação).
