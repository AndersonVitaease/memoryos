# MISSÃO RD-SEC-03 — Provas em produção das recusas do guard supervisor (bearer supervisor via /mcp-proxy)

**Fonte:** RELATORIO-SHIP-ENG-MCP-06 D1 · ROADMAP P2 · **Intent do operator 05/10; desbloqueado (SEC-02: token de ordem ativo e em uso; proxy-secret em /data/credentials/hermes-proxy-secret)**
**Consequência:** `consequence: true` (provas em produção, read-only por natureza — provas de RECUSA)

**Escopo (worker):**
1. Via `/mcp-proxy` com `X-Proxy-Secret` (credencial montada, nunca em argv/log): exercitar como bearer SUPERVISOR (a) tentativa de mutação sem ordem → `SUPERVISOR_MUTATION_FORBIDDEN`; (b) mutação com token de ordem válido → `supervisor_mutation_allowed_by_order`; (c) tentativa com token inválido → recusa tipada.
2. Trilha: cada caso com evidência (audit line + resposta) em `/data/audit`.
3. Suíte E2E re-runnável do trio de casos.

**Proibido:** mutação real fora das provas; expor proxy-secret.
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
