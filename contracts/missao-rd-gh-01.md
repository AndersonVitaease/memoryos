# MISSÃO RD-GH-01 — Rotação E2E real das credenciais do GitHub App (id 5114149)

**Fonte:** KB memoryId `0c3e9e8d` (GITHUB-APP-BOOTSTRAP-01) · ROADMAP P3 · **Intent do operator 05/10; scripts `github-app-rotate.ts` prontos em `/opt/memoryos/eng-mcp`**
**Consequência:** `consequence: true` (troca de credencial em produção — rollback anotado)

**Escopo (worker):**
1. Rotação E2E via `github-app-rotate.ts`: nova chave, atualização de `/opt/eng-mcp-secrets/github-app.private-key.pem` (+env), prova de installation token novo válido (permissions contents:write), e um push/ls-remote real de prova.
2. Trilha: provenance da troca (sha16 das chaves antes/depois, nunca o material) em `/data/audit`.
3. Rollback anotado: chave anterior preservada como `.prev` durante a prova, removida após verificação verde.

**Proibido:** imprimir/acionar a chave em logs; mexer no PAT fallback (fora de escopo).
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
