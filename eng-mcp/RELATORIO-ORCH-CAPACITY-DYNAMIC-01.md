# RELATÓRIO — ORCH-CAPACITY-DYNAMIC-01 (fecho com prova host-side, 03/10)

## Problema
O teto de paralelismo era estático (`agents.json` max_parallel). O desenho do operator: **quem define o número de missões em paralelo é o próprio sistema, de acordo com o momento** (teto de segurança no config, teto efetivo dinâmico).

## Entrega (worker, pane w6:p62)
Cálculo determinístico zero-LLM no `runOrchestratePlan`, a cada chamada, a partir dos probes reais:
- Memória: `floor(RAM livre / 2.5GB)` por worker
- Load: headroom de 1 core (`nproc - load1m - 1`)
- Disco: < 20GB livres → no máx 1
- Orçamento: ≥90% do teto → max 0 (**BLOCK**, decisão de semântica do supervisor: parada dura, re-tentar no ciclo não muda nada); 70–90% → max 1 (THROTTLE)
- **max efetivo = min(fatores, teto de segurança do agents.json)** — o config nunca é o teto efetivo
- Transparência: resposta carrega `capacity.maxDynamic` + `factors` + `safetyCap` — dá para ver POR QUE o sistema decidiu o número
- Campo de probe de failed-units corrigido no escopo da COMPACT/capacity: transientes `run-u*.service` não bloqueiam mais o plan

## Prova host-side (supervisor — o Bash do worker ficou bloqueado pelo classificador, 4 tentativas)
- Suíte nova: **13/13 pass** (test/orchestratePlan.test.ts)
- Daemon: **5/5 pass** (sem regressão)
- **E2E real em produção:** ciclo do orquestrador às 17:56 mostrou `slots esgotados (4/2 — teto dinâmico; limitado por load 4.52 > 4)` — com 4 missões em voo e load alto, o sistema SOZINHO reduziu o teto de 6 para 2 e reteve novos despachos até o load baixar. É o comportamento exato especificado.

## Commits
`ORCH-CAPACITY-DYNAMIC-01: teto dinamico no plan (probes mem/load/disco/orcamento) + factors na resposta; orcamento >=90% = BLOCK (decisao supervisor)`

## Dívidas
- Nenhuma desta missão. (O worker parou honesto com FAIL e motivo — prova executada pelo supervisor.)
