# MISSÃO RD-GUARDIAN-MT-F1-01 — Guardian multi-tenant F1: fila/pane por tenant (isolamento real)

**Fonte:** fase F1 de `/opt/operator-harness/doctrine/DESIGN-guardian-mt-01.md` (fechado PASS) · dependência: F0 (na fila, orch-7bd0) · **Intent do operator 05/10**
**Componente:** mission-ops (`/opt/operator-harness/plugins/mission-ops/`)

**Pré-requisito:** F0 fechada (tenantId no ledger). Se F0 ainda não tiver fechado, PARE com `dep-unsatisfied` (o consumer respeita DependsOn).

**Escopo (worker):**
1. **Fila por tenant:** intents do orquestrador com `tenantId` no envelope; consumer promove por tenant (fila de cada consolidadora independente; dedupe por tenant+missionId).
2. **Panes por tenant:** workspace do herdr por tenant (`w<tenant>`), rótulo `MISSION:<tenantId>:<id>`; mapa workspace→tenant declarado (config do plugin).
3. **Ledger consultável por tenant:** snapshot/list filtra por tenantId; custos agregados por tenant.
4. **Zero quebra:** tenant `default` continua 100% igual ao comportamento atual do operador.
5. Suítes novas (fila/pane/ledger por tenant; default inalterado) + existentes verdes.

**Proibido:** produção eng-mcp, herdr binário, panes do operador (w7:*).
**Entrega:** relatório + verify.json (verdict REAL) + resumo no pane com PASS/FAIL + PARE.
