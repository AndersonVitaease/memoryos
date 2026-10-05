# MISSÃO RD-OPS-03-SPEND-01 — Custo por missão no ledger e no relatório

**Componente:** mission-ops (/root/.hermes/plugins/mission-ops) + orchestrate.spend · **Prioridade:** 1 · **Autoria:** operator 04/10 ("sim") após cobrança de que o custo não aparece nos relatórios

## Problema (provas: closes de 04/10, todos com `cost_unmeasured: "spend_no-transcript"`; RELATORIO-ORCH-TELEMETRY-01.md L16; ROADMAP.md RD-OPS-03)

O custo por missão existe (consultável via `engineering.orchestrate.spend/list`) mas o wire final falha: o close não encontra o transcript da sessão do worker (panes herdr rodam claude com `CLAUDE_CONFIG_DIR=/opt/mission-events/.claude-config` — layout diferente do lookup atual) e o ledger grava `cost_unmeasured` em vez do valor. O operator não foi informado do estado (falha de reporting registrada como dívida de conduta).

## Entrega

1. **Fix do lookup de spend no close**: resolver o transcript da sessão do worker no layout real dos panes herdr (`.claude-config/projects/-opt-mission-events/*.jsonl` ou equivalente); se não houver transcript, `cost_unmeasured` com a CAUSA NOMEADA (nunca número inventado, nunca silêncio).
2. **`spend` real no ledger no close**: campo `spend` = `{inputTokens, outputTokens, cacheReadTokens, costUsdEstimate, source}` — fonte citada (transcript path + hash16). Consultável via orchestrate.list/spend como hoje, agora também no ledger.
3. **Custo no relatório do worker (cláusula no DISPATCH_TEMPLATE)**: nova seção `## Custo` no template — tokens por categoria + custo estimado (fórmula declarada com os preços do modelo do turno) OU `custo não medido: <causa>`. Honestidade de liveness também aqui.
4. **Retroativo honesto**: re-calcular o spend das missões fechadas de 04/10 cujo transcript ainda exista e pousar apêndice no relatório/ledger (o que não existir mais: `cost_unmeasured` com causa, sem re-inventar).
5. **Dívida herdada visível (mecanismo)**: no fechamento, o resumo do close inclui linha `Dívidas herdadas: <lista>` (uma linha por dívida herdada de missão anterior relevante ao componente) — dívida que o operator cobrou explicitamente sobe para P1 do ROADMAP automaticamente.

## Provas (reais, antes de gravar)

- Duas missões de custo conhecido: spend calculado e conferido manualmente (prova: soma dos eventos de usage do transcript = campo do ledger).
- Close de missão sintética com transcript → `spend` preenchido; close sem transcript → `cost_unmeasured` com causa nomeada. NUNCA o inverso.
- Suíte do plugin íntegra (estrutural) + test_mission_ops.py OK.
- verify.json tipado no cwd + verify.py pass + RELATÓRIO pt-BR íntegra no close (RELATÓRIO-INTEGRA + mission_report_ack) — agora com a seção `## Custo`.

## Restrições

- Só o caminho de spend/custo (nada de veredito/gate/lock). Zero push (plugin sem remote). Commit local de housekeeping próprio.
- Preços de modelo como dado editável (catálogo), nunca hardcode; modelo desconhecido → custo estimado com nota, não falha.
- Janela: o orquestrador serializa por componente (mission-ops em voo: GUARDIAN-MOBILE-02).