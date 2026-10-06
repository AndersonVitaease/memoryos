# RELATÓRIO — RD-OPS-03-B (re-dispatch de RD-OPS-03-SPEND-01)

**Missão:** Custo por missão no ledger e no relatório — fechar o gap de wire do campo `ledger["spend"]`.
**Data:** 2026-10-06 · **Ledger:** `/root/.hermes/mission-state/RD-OPS-03-B.json` · **Plugin commit:** 2682ffa (master, zero push)

## Problema

A 1ª execução (RD-OPS-03-SPEND-01, 04/10) entregou o lookup multi-root do transcript (eng-mcp b9661ee1, live em produção), o bloco `## Custo` no TEMPLATE-PTBR-01 e o retro daquele dia. Mas o **item 2 do contrato (spend no ledger) tinha gap de wire**: `ledger["spend"]` só era gravado pelo caminho MCP (`runMissionClose` → `writeMissionSpend`). Closes via gateway/supervisor (`handle_mission_close` do plugin) gravavam apenas `ledger["cost"]` — `spend` ficou `null` em **todas** as missões reais fechadas via gateway. E missões fechadas em 04/10 após o retro da 1ª execução ficaram sem custo retroativo.

## Entrega

1. **`ledger["spend"]` no close do gateway/supervisor** (plugin `__init__.py`, ~L3248, bloco de custo do close): após `ledger["cost"]`, grava `ledger["spend"] = nf.spend_ledger_record(cost_rec)` com a forma do contrato `{inputTokens, outputTokens, cacheReadTokens, costUsdEstimate, source}` — fonte citada (`transcript=<path> sha256-16=<hash>`) e custo medido quando há transcript; sem transcript → `costUsdEstimate: null` + `cost_unmeasured` com causa nomeada (`spend_no-transcript`), **nunca número inventado**. Fail-open: qualquer erro no helper → custo null + causa nomeada; o close nunca quebra.
2. **Helper puro `spend_ledger_record`** (plugin `notify.py`) — mesma forma do `writeMissionSpend` server-side; +5 testes (`TestSpendLedgerWire`, 18 total no arquivo).
3. **Retroativo honesto de 04/10** (`retro-spend-RD-OPS-03-B.py`, idempotente por marcador duplo): **5 missões medidas — US$11,113988** (GUARDIAN-MOBILE-02 3.053641, RD-EV-03 3.314397, RD-LEG-01 1.11987, RD-OPS-03-SPEND-01 2.467455, RD-SEC-01 1.158625) + **14 causas nomeadas** (RCT1 sintéticas sem transcript — `no-transcript`); apêndice `<!-- custo-retro RD-OPS-03-B -->` nos relatórios; 29 linhas do retro anterior corretamente puladas.
4. Itens 1/3/5 do contrato (lookup multi-root, `## Custo` no template, dívidas herdadas) — já entregues pela 1ª execução e verificados live nesta passada.

**NÃO-quebra:** mudança aditiva no fim do bloco de custo existente; as 15 capabilities e o caminho MCP intocados; backups `.bak-RD-OPS-03-B` (sizes verificados); zero push.

## Prova

| # | Prova | Resultado |
|---|---|---|
| P1 | Cross-check independente (`prova-cross-check-RD-OPS-03-B.py`): re-soma dos eventos de usage = campo do ledger, 2 missões | RD-MOPS-01 e GUARDIAN-MOBILE-02 `match=True` (sha16 conferido) |
| P2 | E2E live contra produção :8787 (`prova-e2e-live-RD-OPS-03-B.py`, cópias reais em TempState) | **12 checks, 0 fails** — spend medido com forma do contrato + fonte; sem transcript → `spend_no-transcript`, custo null, sem campos inventados |
| P3 | Suíte dirigida `test_rd_ops_spend_01.py` | 18/18 OK |
| P4b | Suíte completa do plugin (`prova-suite-plugin-RD-OPS-03-B.py`) | exit 0 — falha **ambiental declarada** (`test_recipe_relaunches_and_redelivers`, causada pela missão irmã RD-AUTOMODE-OFF-01 em voo, `git diff` de relaunch.py ativo); falhas reais: 0 |
| P5 | Testes dirigidos do eng-mcp (`orchestrateMissionSpend` + `orchestrateSpend`) | 24/24 pass |
| P6 | Commit do plugin | 2682ffa presente (`git log`) |
| P7 | Retro idempotente | 5 medidos US$11,113988 + 14 causas nomeadas; re-run = 0 novos |

Manifesto tipado: `verify-RD-OPS-03-B.json` (gravado no cwd e migrado pelo runner para `/root/.hermes/mission-state/` — RD-LOOP-01 verify por missão; rodado com `python3 /opt/deliver-verify/verify.py --mission RD-OPS-03-B`).

## Custo

**Custo desta missão (próprio):** US$ **1.127871** (snapshot do transcript `25bb389d-…7aca23.jsonl`, sha256-16 `d4f63204bf87cd5f`; a sessão segue viva até o close do supervisor — custo final pode diferir; o close grava o valor real em `ledger["cost"]/["spend"]`).

- Fórmula: `custo = (in×0.15 + out×0.5 + cache_read×0.03)/1e6` (price table `/opt/mission-events/orchestrator-price-table.json`, modelo `z-ai/glm-5.3-flash`)
- Tokens: input 1.786.168 · output 203.384 · cache_read 25.275.136

**Retroativo aplicado por esta missão (04/10):** US$ 11,113988 em 5 missões medidas + 14 custos não medidos com causa nomeada (`no-transcript`).

## Dívidas / gray-zones

- **Suíte completa do plugin** não ficou 100% verde por causa AMBIENTAL (irmã RD-AUTOMODE-OFF-01 em voo editando `relaunch.py` — fora do diff desta missão). Declarada estruturalmente no wrapper; fica para a irmã corrigir a expectativa no próprio commit.
- **Callers vivos não migrados** (dívida herdada da 1ª execução): pipeline ainda chama `base44`/transcript direto onde couber; sem impacto neste escopo.
- Custo próprio é **snapshot** (sessão viva); o valor definitivo entra no close.
- Custo **não medido**: nenhuma causa nesta missão — todas as medições usaram transcript real com hash citado.

## Estado da memória

memória: não aplicável — capture/FINGERPRINT fica para o fechamento do supervisor (ledger + provas em `verify-RD-OPS-03-B.json`).

PASS
