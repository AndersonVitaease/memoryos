# ARCHITECTURE-FREEZE-CHECKLIST.md
# MemoryOS — Checklist de Congelamento Arquitetural v2.0
**Sprint ARC-02 · Engineering First**
Date: 2026-07-11
Type: Freeze Checklist
Status: OFFICIAL

---

## Veredicto

**A arquitetura pode ser congelada como versão 2.0?**

> **CONDICIONAL — NÃO IMEDIATAMENTE.**
>
> A arquitetura pode ser congelada após resolução de 5 itens bloqueantes listados na Seção 1.
> Os 7 itens não-bloqueantes (Seção 2) podem ser resolvidos após o congelamento,
> em sprints editoriais paralelas ao desenvolvimento.

---

## Seção 1 — Itens Bloqueantes (impedem congelamento)

Estes 5 itens devem ser resolvidos antes de declarar a arquitetura como v2.0 congelada.

---

### BLOQ-01 — DAP-07: Posição do Reasoning Engine não resolvida

**Por que bloqueia:** O pipeline oficial inclui "Reasoning Engine" entre Reflection Engine e LLM Gateway. Se Reasoning Engine for removido (DAP-07 Alternativa B) ou redefinido (Alternativa C), o pipeline oficial muda. O pipeline deve estar definido e estável antes do congelamento.

**Status:** ❌ Pendente — aguarda decisão humana (DAP-07)

**Resolução mínima necessária:** Decidir se Reasoning Engine existe como módulo EF separado ou se a responsabilidade é distribuída. Atualizar TARGET-ARCHITECTURE.md com a decisão.

---

### BLOQ-02 — DAP-03: Semântica de "Plano" não resolvida

**Por que bloqueia:** O contrato do Planning Engine (EF-07) produz `ExecutionPlan`. O produto usa `plan` com semântica diferente. O congelamento da arquitetura requer que contratos públicos de todos os módulos sejam definitivos. `plan` e `ExecutionPlan` não podem coexistir com o mesmo nome após o congelamento.

**Status:** ❌ Pendente — aguarda decisão humana (DAP-03)

**Resolução mínima necessária:** Decidir nomenclatura canônica. Congelar contrato público do Planning Engine: `PlanningEngine.plan() → ExecutionPlan { steps[], complexity, estimatedMs, risk }`.

---

### BLOQ-03 — Canonical de Capability Registry não declarado

**Por que bloqueia:** 3 implementações paralelas sem declaração oficial de qual é canônico. O congelamento da arquitetura requer que o registry de capabilities tenha uma fonte única de verdade. Capability Runtime (EF-15) atualmente referencia o errado.

**Status:** ❌ Pendente — ação editorial necessária

**Resolução mínima necessária:**
1. Declarar `src/lib/capability-registry/` (EF-14) como canonical oficial
2. Marcar `src/lib/capability-runtime/CapabilityRegistry.ts` como deprecated
3. Marcar `src/lib/capabilities/registry/` como deprecated
4. Atualizar ARCHITECTURE-VALIDATION-REPORT com o resultado

---

### BLOQ-04 — Canonical de Connector Registry não declarado

**Por que bloqueia:** 5 implementações de Connector Registry sem declaração de canonical. O congelamento da arquitetura requer que o registry de conectores tenha fonte única de verdade.

**Status:** ❌ Pendente — ação editorial necessária

**Resolução mínima necessária:**
1. Declarar qual é o canonical temporário até EF-16
2. Congelar os demais (não crescem, não são referenciados em código novo)
3. Separar explicitamente "Capability Registry" de "Connector Registry" como conceitos distintos na documentação

---

### BLOQ-05 — DAP-01: Estratégia de classificação da Intent Layer não resolvida

**Por que bloqueia:** Intent Layer é o primeiro módulo a ser implementado (EF-22) e o primeiro a ser integrado (INT-02). O congelamento da arquitetura deve especificar o contrato público e a estratégia da Intent Layer antes de implementação começar. Implementar com estratégia errada e corrigir depois quebra contratos downstream.

**Status:** ❌ Pendente — aguarda decisão humana (DAP-01)

**Resolução mínima necessária:** Decidir entre Determinística / Híbrida / LLM+Cache. Congelar contrato: `IntentLayer.detect(message) → { intent_type, query_types, is_list_query, search_keywords, confidence }`.

---

## Seção 2 — Itens Não-Bloqueantes (resolvíveis após congelamento)

Estes 7 itens podem ser endereçados em sprints editoriais paralelas sem impedir o congelamento.

---

### NB-01 — GoalRegistryServiceTypes.ts ausente

**Ação:** Criar arquivo `src/lib/goal-registry-service/GoalRegistryServiceTypes.ts` extraindo tipos inline.
**Sprint:** Editorial 1 (30 min)

---

### NB-02 — Goal Runtime promoção v0.1 → v1.0

**Ação:** Adicionar `GoalRuntimeTypes.ts` separado, elevar cenários de 21 para 28, renomear de `goal-runtime-v01/` para `goal-runtime/`.
**Sprint:** EF-24 (antes de INT-03)

---

### NB-03 — Módulos legados sem destino documentado

**Ação:** Criar `LEGACY-MODULE-DISPOSITION.md` declarando destino de cada módulo:
- `connector-simulator/` → deprecar (substituído por Connector Runtime real)
- `enterprise-integration/` → deprecar (substituído por Connector Runtime + Capability Runtime)
- `autonomous-executive-engine/` → deprecar (substituído por pipeline EF completo)
- `universal-event-bus/` → avaliar (pode ser reutilizado pela Event layer do pipeline)
**Sprint:** Editorial 1

---

### NB-04 — Entidades redundantes (ChatMessage/Message, Conversation/ChatSession)

**Ação:** Confirmar desuso via grep de imports. Se confirmado, adicionar JSDoc `@deprecated` nos arquivos de entidade.
**Sprint:** Editorial 1

---

### NB-05 — Sidebar separação produto/engenharia

**Ação:** Separar navItems em dois arrays: `productNav` e `engineeringNav`. Adicionar modo de visualização.
**Sprint:** Editorial 2 (produto)

---

### NB-06 — Restrição de Scheduler/Queue no path interativo não documentada

**Ação:** Adicionar comentário explícito nos arquivos `GoalScheduler.ts` e `GoalExecutionQueue.ts` indicando que são adequados apenas para goals de background. Atualizar TARGET-ARCHITECTURE.md §1 para clarificar os dois paths.
**Sprint:** Editorial 1

---

### NB-07 — `base44.analytics.track()` acoplado ao objeto `plan` legado

**Ação:** Documentar como risco RB-03. Atualizar quando DAP-03 for resolvido.
**Sprint:** Junto com resolução de DAP-03

---

## Seção 3 — Estado de Cada Módulo EF para Congelamento

| Módulo | Certificado | Contrato Congelável? | Bloqueante? |
|---|---|---|---|
| Goal Runtime v0.1 | ✅ 21 cenários | 🟡 Requer promoção v1.0 | NB-02 |
| Goal Registry | ✅ 22 cenários | ✅ | — |
| Goal Scheduler | ✅ 22 cenários | ✅ (+ restrição NB-06) | — |
| Goal Execution Queue | ✅ 24 cenários | ✅ (+ restrição NB-06) | — |
| Execution Dispatcher | ✅ 24 cenários | ✅ | — |
| Decision Engine | ✅ 24 cenários | ✅ | — |
| Planning Engine | ✅ 24 cenários | 🟡 Aguarda DAP-03 | BLOQ-02 |
| Reflection Engine | ✅ 24 cenários | ✅ | — |
| Self Evaluation Engine | ✅ 24 cenários | ✅ | — |
| Knowledge Engine | ✅ 28 cenários | ✅ | — |
| Learning Engine | ✅ 28 cenários | ✅ | — |
| Memory Engine (EF-12) | ✅ 28 cenários | ✅ | — |
| Retrieval Engine | ✅ 28 cenários | ✅ | — |
| Capability Registry (EF-14) | ✅ 28 cenários | 🟡 Aguarda consolidação | BLOQ-03 |
| Capability Runtime (EF-15) | 🟡 testCount=0 | 🟡 Aguarda DAP-04 | — |
| Intent Layer | ❌ Não existe | ❌ Aguarda DAP-01 | BLOQ-05 |
| Context Engine | ❌ Não existe | ❌ Não definido | — |
| Conversation Engine | ❌ Não existe | ❌ Não definido | — |
| LLM Gateway | ❌ Não existe | ❌ Não definido | — |
| Reasoning Engine | ❌ Posição indefinida | ❌ Aguarda DAP-07 | BLOQ-01 |

---

## Seção 4 — Checklist de Congelamento v2.0

Para declarar a arquitetura MemoryOS como **v2.0 FROZEN**, os seguintes itens devem ser ✅:

### Itens Bloqueantes (todos devem ser ✅)

- [ ] BLOQ-01 — DAP-07 resolvido: Reasoning Engine posicionado ou removido do pipeline oficial
- [ ] BLOQ-02 — DAP-03 resolvido: Semântica de "plano" unificada; Planning Engine contrato congelado
- [ ] BLOQ-03 — Capability Registry canonical declarado; outros 2 marcados como deprecated
- [ ] BLOQ-04 — Connector Registry canonical temporário declarado; outros 4 congelados
- [ ] BLOQ-05 — DAP-01 resolvido: Intent Layer estratégia definida e contrato público congelado

### Itens de Qualidade (não bloqueantes, recomendados antes de v2.0)

- [ ] NB-01 — GoalRegistryServiceTypes.ts criado
- [ ] NB-02 — Goal Runtime promovido para v1.0
- [ ] NB-03 — Destino de módulos legados documentado
- [ ] NB-04 — Entidades redundantes marcadas como deprecated
- [ ] NB-05 — Sidebar separada em produto/engenharia
- [ ] NB-06 — Restrição Scheduler/Queue em path interativo documentada
- [ ] NB-07 — analytics.track desacoplado de plan legado (junto com DAP-03)

---

## Seção 5 — Definição de "Arquitetura v2.0 Congelada"

Quando todos os itens bloqueantes forem resolvidos, a arquitetura v2.0 é declarada congelada com o seguinte significado:

1. **O pipeline oficial está fixo** — nenhum módulo pode ser adicionado ou removido sem ADR aprovado
2. **Contratos públicos estão fixos** — assinaturas de métodos dos módulos EF certificados não mudam sem versionamento
3. **Canonical de registries está declarado** — qualquer nova implementação de Registry deve ser rejeição de PR
4. **Migrations INT-02 a INT-07 podem prosseguir** — sem risco de quebra arquitetural durante a migração
5. **Novos módulos EF (EF-22+) seguem pipeline fixo** — sem redesenho do fluxo

---

## Seção 6 — O que NÃO é definido pelo congelamento

O congelamento v2.0 NÃO congela:

- Implementações internas dos módulos (podem evoluir)
- Estratégias de prompt do LLM
- Esquemas das entidades Base44
- Interface de usuário (ChatPage, componentes)
- Ordem de execução das sprints de migração (INT-*)
- Número de cenários de teste (podem aumentar)

---

*Sprint ARC-02 — 2026-07-11 — Engineering First*
*Nenhum código foi criado ou modificado.*