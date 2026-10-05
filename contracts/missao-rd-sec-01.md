# MISSÃO RD-SEC-01 — Re-wire do guard supervisor no settings.json COM scoping + validação E2E dupla

**Componente:** mission-ops (supervisor_guard) · **Prioridade:** 1 · **Fonte:** RELATORIO-guardrail-scope-fix-01.md L31 (FAIL parcial); guardrail-wire-validate-01; KB cc96b02a · **Autoria:** operator 04/10 ("todo o roadmap, desenhe todas as missões e promova para a fila")

## Problema
O guard supervisor (SUPERVISOR_MUTATION_FORBIDDEN) está desligado no canal atual (settings.json) — as provas de recusa existem em código mas não estão ativas na sessão do supervisor.

## Entrega (não-quebrante)
1. Re-wire do hook do guard no settings.json COM scoping (aplica ao canal supervisor; workers MISSION_OPS_WORKER=1 continuam ALLOW — nunca bloquear worker).
2. E2E dupla ao vivo: sessão worker → ALLOW (prova positiva); sessão supervisor → DENY em mutação (prova negativa). Nada muda em produção se a dupla não passar as duas pontas.
3. Plano de rollback: linha do settings.json documentada + reversão 1 linha.

## Provas
- E2E dupla gravada (stdout com veredito ALLOW/DENY e IDs de sessão).
- Suíte do plugin íntegra + verify.py pass + RELATÓRIO pt-BR íntegra (RELATÓRIO-INTEGRA + mission_report_ack).

## Restrições
- Não tocar em: orchestrate.spend (RD-OPS-03 em voo), gateway/vigia (MOBILE-02), orchestrate consumer (RD-ORCH-FILA-01). Só hook/guard/settings.