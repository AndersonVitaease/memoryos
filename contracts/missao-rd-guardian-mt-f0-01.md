# MISSÃO RD-GUARDIAN-MT-F0-01 — Guardian multi-tenant F0: tenantId no ledger + resolução por workspace (zero-breaking)

**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/__init__.py`) · **Prio 2** · **Enfileirada por intent do operator 05/10 (orch-1791207375946-7bd0)**
**Design-fonte:** `/opt/operator-harness/doctrine/DESIGN-guardian-mt-01.md` (RD-GUARDIAN-MT-DESIGN-01, PASS) — fase **F0** do plano F0–F4.

**Contexto de produto (decisão do operator, capture `ec4c373d`):** Guardian = produto multi-tenant para consolidadoras (1 consolidadora = 1 tenant); colaboradores fazem login no Hermes agent com layout Guardian e operam como o operador faz hoje (herdr via terminal + todos os sistemas). F0 é a fase **zero-breaking**: nada muda para o operador single-tenant atual.

**Escopo (worker):**
1. **Campo `tenantId` no ledger:** default `default` (comportamento atual = 1 tenant); resolução: `herdr workspace` → tenant via mapa declarado (arquivo de config do plugin; workspace ausente do mapa → `default`, jamais erro).
2. **Rótulo de aba:** `MISSION:<tenantId>:<id>` quando tenantId ≠ `default` (hoje: `MISSION:<id>`) — zero quebra para o caso default.
3. **Isolamento mínimo:** leitura do tenant registrado no ledger pelo snapshot/list (campo visível); NÃO implementar ainda fila/pane físicos por tenant (fases F1+).
4. **Suíte:** testes novos (tenant default inalterado; tenant resolvido por mapa; aba rotulada; snapshot expõe tenantId) + suíte existente verde.

**Proibido:** tocar em produção/ship, herdr server (binário), panes em voo (w7:p2/p3/p4/p5), mudar o comportamento default do operador atual.

**Entrega:** relatório `/opt/mission-events/relatorio-rd-guardian-mt-f0-01.md` + `verify.json` (verdict REAL) + resumo no pane com `PASS`/`FAIL` + PARE.
