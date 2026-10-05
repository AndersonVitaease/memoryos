# MISSÃO RD-OPS-04 — Linha de adoção do suite_lock no CLAUDE.md do eng-mcp

**Componente:** eng-mcp (doc) · **Prioridade:** 3 · **Fonte:** dívida do RELATORIO-SUITE-LOCK-01 · **Autoria:** operator 04/10 ("todo o roadmap")

## Problema
O `suite_lock` é produção no verify.py, mas suítes manuais fora do verify não têm a linha de adoção documentada no CLAUDE.md do eng-mcp.

## Entrega
1. Linha/parágrafo no CLAUDE.md do eng-mcp: suítes que tocam estado compartilhado usam o lock (`python3 /opt/deliver-verify/suite_lock.py acquire/release` ou wrapper), kill switch `SUITE_LOCK=off` citado.
2. Prova: diff mínimo (≤10 linhas), nada mais muda no arquivo; grep da linha nova.

## Provas
- verify.py pass (prova de estado), commit, RELATÓRIO pt-BR íntegra + ack.

## Restrições
- Só CLAUDE.md do eng-mcp. Zero código. Missão de minutos.