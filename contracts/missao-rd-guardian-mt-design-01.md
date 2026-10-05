# MISSÃO RD-GUARDIAN-MT-DESIGN-01 — Design P1: Guardian como produto multi-tenant + layout do Guardian no Hermes agent

**Tipo:** missão de DESIGN (sem escrita em código de produção) · **Prioridade 1**
**Decisão-fonte:** capture durável `ec4c373d` (projeto `guardian-mt`, 05/10 09:47 BRT, force=true por ordem do operator)
**Harness-base:** `/opt/operator-harness/` (commit `cad98ca` — doutrina, skills, roles, plugin mission-ops)

**Contexto do produto (ordem do operator):**
- O **Guardian será oferecido como harness para CONSOLIDADORAS** — cada consolidadora = **1 tenant** (harness próprio).
- Os **colaboradores** de cada consolidadora acessam o Guardian **diariamente** para executar seu trabalho.
- O **login do usuário final é no HERMES AGENT**, que receberá o **LAYOUT DO GUARDIAN** — layout próprio ainda a definir (item central desta missão).
- O usuário final opera **como o operador faz hoje**: pode acessar o **herdr via terminal** se desejar e **todos os outros sistemas**.
- Roadmap de integrações: **P2 Wooba** (primeira; credencial pendente) → **P3** GDS, emails, chat, outros.

**Escopo do design (documento, não código):**
1. **Modelo multi-tenant:** `tenantId` no ledger/mission-state, fila/pane por tenant, auth por consolidador (login), usuários por tenant, isolamento de custo/orçamento por tenant. Onde cada fronteira corta o mission-ops atual (spool, ledger, sandbox, release, guardas).
2. **Layout do Guardian no Hermes agent:** proposta concreta de TUI/tema/layout (o login é no Hermes agent — o layout é o rosto do produto). Incluir: onboarding do colaborador, telas de missões/status, e o caminho de terminal (herdr) como "modo avançado" do mesmo usuário. Apontar o que é config existente (temas Hermes) vs. trabalho novo.
3. **Jornada do colaborador:** do login à execução do trabalho diário — como as ferramentas governadas (tools 3-andares) aparecem para ele; o que ele NUNCA faz (trabalho manual = finding; financeiro/aprovação nunca na camada rápida).
4. **Caminho P2 Wooba:** como a primeira integração se encaixa (tools do portal já construídas; STATUS-WOOBA-TOOLS-02 travada só na credencial).
5. **Migração do hoje (single-tenant) para o multi:** o que muda no mission-ops/herdr para N tenants sem quebrar o operador atual.

**Entrega:** documento `DESIGN-guardian-mt-01.md` em `/opt/operator-harness/doctrine/` (ou caminho acordado) + resumo no pane com `PASS`/`PARE`. Proibido: escrever código, alterar configs de produção, fechar a SHIP pausada ou tocar o pane w7:p2.
