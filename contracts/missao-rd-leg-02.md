# MISSÃO RD-LEG-02 — zz-proxy-live: skip condicional na suíte

**Componente:** eng-mcp (suíte) · **Prioridade:** 3 · **Fonte:** dívida de relatório (proxy externo Forbidden no ambiente) · **Autoria:** operator 04/10 ("todo o roadmap")

## Problema
`zz-proxy-live` quebra na suíte por ambiente (proxy externo devolve Forbidden) — flake nomeado, não silenciado até hoje.

## Entrega (não-quebrante)
1. Skip CONDICIONAL (não cego): o teste roda quando o proxy responde; quando Forbidden/do ambiente, skip tipado (`SKIPPED: ambiente sem proxy upstream — FLAKE-NOMEADO`) que aparece no sumário da suíte, nunca silêncio.
2. Padrão do repo para flakes nomeados seguido (baseline NOMINAL por nome, como na SEC-IDENTITY P4).

## Provas
- Run duplo: com proxy (roda) e sem (skip tipado no sumário); suíte íntegra; verify.py pass; RELATÓRIO pt-BR íntegra + ack.

## Restrições
- Só esse teste + helper de skip se necessário. Zero runtime.