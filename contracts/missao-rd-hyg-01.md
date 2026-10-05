# MISSÃO RD-HYG-01 — Limpeza auditada de resíduos de prova

**Componente:** eng-mcp/deliver-verify (resíduos) · **Prioridade:** 3 · **Fonte:** dívidas do RELATORIO-SUITE-LOCK-01 (catálogo de prova `secshellproof` em /data/audit; `/tmp-err.txt`; eventos fora do filtro kinds) · **Autoria:** operator 04/10 ("todo o roadmap" + "nunca apagar ledgers/trilhas de auditoria")

## Problema
Resíduos de provas anteriores acumulados: catálogo de prova no /data/audit (mistura com audit real), temporários fora de lugar, eventos fora do filtro de kinds.

## Entrega (não-quebrante — fronteira dura do operator)
1. NUNCA tocar: ledgers (`mission-state/*.json`), trilhas de auditoria (`git-push.jsonl`, `host-ops.jsonl`, `suite-lock-events.jsonl`, spool de eventos de missão). A limpeza só atinge resíduos de PROVA identificados por origem (gerados por teste/fixture), nunca por idade.
2. Catálogo de prova `secshellproof`: mover para `/data/audit/prove/` (não deletar) com manifest de movimentação auditável.
3. `/tmp-err.txt` e equivalentes: remover com nota no relatório (o que era, origem).
4. Eventos fora do filtro kinds: reportar contagem e origem; mover para `/data/audit/unfiltered/` se não pertencerem ao filtro — nunca truncar.

## Provas
- Antes/depois por item movido/removido (lista com origem citada); prova de que ledgers/trilhas intocados (hash de auditoria antes=depois dos arquivos protegidos).
- verify.py pass + RELATÓRIO pt-BR íntegra + ack.

## Restrições
- Qualquer item ambíguo (não dá para provar origem de teste) = SKIP com nota. Conservador por desenho.