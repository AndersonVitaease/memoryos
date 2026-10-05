# MISSÃO gpu-cost-fix-01 — custo do mission_close sem TypeError (float-str) + trilha honesta

## Contexto

- Pendência do roadmap (27/09): o hook `gpu_down` do `mission_close` quebra com **TypeError float-str** no cálculo de custo — o close fica com o gpu-down degradado/omitindo o custo real por missão (regra do operator: custo é MEDIDO, nunca estimado; proxy_call tokens + timestamps create/destroy, ver GPU-ORCHestrator §(d)).
- A instância de teste `53163485` aparece hoje como "já destruída/sem estado — no-op" no gpu-down de cada close — validar que o caminho no-op segue honesto após o fix.
- Componente: `/root/.hermes/plugins/mission-ops/` (LIVRE agora — chain-dispatch-gov-01 fechou; HEAD com os commits dela 11f8a55/9151f8d; a governança de cadeia `spawned_by`/`chain_depth_max` JÁ está ativa: se você for tentar despachar sub-missão, vai ser recusado sem badge — não tente).
- Confirme `git status`/HEAD antes de editar; patch dirigido, nunca rewrite.

## Tarefas

1. **Reproduzir o TypeError** com teste (float vs str nos campos de custo/tokens do estado da GPU — localize a operação exata no hook gpu_down / cálculo do close).
2. **Fix determinístico:** coerção explícita dos tipos na borda (str de API → float; None/ausente → custo omitido HONESTAMENTE com evento `cost_unmeasured`, nunca estimativa — regra do operator para relatório de decisão).
3. **Trilha de custo por missão:** o close grava `{missionId, tokens_proxy, timestamps create/destroy, cost_usd | cost_unmeasured: reason}` no spool (dedupe por assinatura). Um número por missão, consultável.
4. **Provas red→green:** (a) TypeError reproduzido no teste antes, verde depois; (b) campos str/None/ausentes → sem crash, `cost_unmeasured` gravado com motivo; (c) campos numéricos → custo calculado correto; (d) no-op "instância já destruída" segue honesto (sem custo inventado).
5. **Suíte full isolada (MEM-GUARD obrigatório):** `systemd-run --scope --unit=gpu-cost-fix-suite -p MemoryMax=2G` — verde ao final (hoje: 188/188).
6. **verify.json** — dogfood com `mission_verify_author` (revise o diff; ela está em produção) ou manual no shape canônico.

## Regras

- Restart do gateway para ativar = SUPERVISOR na ativação; prove imports + self-test.
- Concorrência: volume-cache-awq-01 (w5:p0, /opt/guardian-compute) e orchestrator-gate-reval-01 (w5:p1F, /opt/gpu-watchdog + /root/.hermes/tools + /opt/gpu-orchestrator) vivas — NÃO as toque.
- Sem push; sem registry/tokens; sem criar recursos pagos.
- Comando negado pelo classificador → reporte o comando exato e pare. Escopo técnico é seu; pare só para consequência/credencial/orçamento. Releia o contrato por `cat /root/.hermes/plugins/mission-ops/missao-gpu-cost-fix-01.md` via Bash.

## Relatório final

`/root/.hermes/plugins/mission-ops/RELATORIO-gpu-cost-fix-01.md` — red→green, exemplos de trilha de custo, RESULT sem placeholder. Autoverifique com `engineering.judge.verify`. Feche com `engineering.memory.capture`. pt-BR; código/comandos no original.