# ARCHITECTURE-GOVERNANCE.md
# MemoryOS — Governança Arquitetural Oficial
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## 1. Princípios de Governança

A governança arquitetural do MemoryOS segue três princípios fundamentais:

1. **Estabilidade por padrão:** O estado normal é frozen. Mudanças são exceções justificadas.
2. **Decisões escritas:** Toda decisão arquitetural relevante é capturada em ADR. Decisões verbais não existem.
3. **Aprovação humana obrigatória:** Nenhuma alteração estrutural é implementada sem aprovação humana explícita.

---

## 2. Quem Pode Alterar a Arquitetura

| Nível | Pode fazer | Requer |
|---|---|---|
| **Qualquer desenvolvedor** | Propor ADR (Draft) | — |
| **Tech Lead / Arquiteto** | Mover ADR para Review | — |
| **Aprovador Humano** | Aceitar/Rejeitar ADR | Análise explícita |
| **Nenhum agente automatizado** | Aceitar/Implementar mudança estrutural | — (proibido) |

---

## 3. Como Criar uma ADR

### 3.1 Critérios de quando criar ADR

Uma ADR é obrigatória para qualquer uma destas situações:

- Adicionar módulo ao pipeline cognitivo
- Remover módulo do pipeline cognitivo
- Promover módulo de `Reserved` para `Official`
- Promover módulo de `Pending` para `Official`
- Deprecar módulo `Official`
- Alterar contrato público congelado
- Mudar canonical declaration
- Mudar estratégia de integração (INT-*)
- Mudar política de versionamento
- Alterar Memory Gate threshold
- Mudar estratégia de retry de módulo crítico
- Introduzir nova entidade de domínio

### 3.2 Processo de criação

```
1. Identificar a DAP (Decisão Arquitetural Pendente)
2. Copiar template: src/docs/foundation/templates/ADR_TEMPLATE.md
3. Preencher: título, contexto, decisão, consequências, alternativas
4. Status inicial: "Draft"
5. Nomear arquivo: ADR-{NNN}-{título-kebab}.md
6. Depositar em: src/docs/foundation/adr/
7. Atualizar: src/docs/foundation/adr/ADR-MASTER-INDEX.md
```

### 3.3 Template obrigatório

```markdown
# ADR-{NNN} — {Título}
Status: Draft | Review | Proposed | Accepted | Rejected | Superseded | Deprecated

## Contexto
{Por que esta decisão precisa ser tomada}

## Decisão
{O que foi decidido}

## Consequências
### Positivas
### Negativas
### Neutras

## Alternativas Consideradas
{Outras opções avaliadas e por que foram descartadas}

## Dependências
{ADRs que devem ser resolvidas antes ou depois desta}

## Referências
{Links para documentos relevantes}
```

---

## 4. Como Aprovar uma ADR

### 4.1 Fluxo de aprovação

```
Draft → (Tech Lead review) → Review → (Aprovador analisa) → Proposed
     ↓
Proposed → (Aprovador humano) → Accepted | Rejected
```

### 4.2 Critérios de aprovação

| Critério | Verificação |
|---|---|
| Contexto claro | A DAP é bem definida e necessária |
| Alternativas documentadas | Pelo menos 2 alternativas consideradas |
| Consequências honestamente avaliadas | Incluindo impactos negativos |
| Dependências mapeadas | ADRs relacionadas identificadas |
| Não viola Constituição | Nenhum dos 50+ princípios é violado |
| Consistência com documentos existentes | Não contradiz OFFICIAL-CONTRACTS, OFFICIAL-COMPONENT-REGISTRY |

### 4.3 Aprovação é humana e explícita

Aprovação requer ação humana positiva documentada (comentário, merge, assinatura). Ausência de objeção não é aprovação.

---

## 5. Como Promover Módulo Reserved → Official

### 5.1 Pré-requisitos obrigatórios

| Requisito | Detalhe |
|---|---|
| ADR aprovada | ADR de promoção com status Accepted |
| Implementação completa | Módulo TypeScript com Types + Engine + Tests + index |
| 28+ cenários de aceitação | Mínimo conforme Constituição Q-01 |
| Hardening ≥ 30% | Conforme Constituição Q-02 |
| health/metrics/statistics/logs | API unificada de observabilidade |
| Contrato público definido | Adicionado a OFFICIAL-CONTRACTS.md |
| Sem dependências circulares | Verificado no OFFICIAL-DEPENDENCY-GRAPH.md |
| Canonical declaration | Se há duplicatas, canonical deve ser declarado |

### 5.2 Processo

```
1. Implementar módulo completo
2. Executar bateria de testes (28+ cenários)
3. Criar ADR de promoção
4. Obter aprovação humana
5. Atualizar OFFICIAL-COMPONENT-REGISTRY (status: Official · Frozen)
6. Adicionar contrato em OFFICIAL-CONTRACTS.md
7. Atualizar OFFICIAL-DEPENDENCY-GRAPH.md
8. Atualizar UPDATED-TARGET-ARCHITECTURE.md
9. Atualizar FREEZE-CHANGELOG.md
```

---

## 6. Como Promover Módulo Pending → Official

### 6.1 Diferença entre Reserved e Pending

| Reserved | Pending |
|---|---|
| Módulo não implementado ou incompleto | Módulo implementado mas sub-certificado |
| Requer sprint de implementação | Requer sprint de certificação/correção |
| ADR de promoção necessária | ADR de promoção necessária |

### 6.2 Pré-requisitos para Pending → Official

- Todos os requisitos de Reserved → Official se aplicam
- Adicionalmente: resolução da razão específica do status Pending (ex: EF-01 precisa de 28 cenários)

---

## 7. Como Deprecar Módulo Legacy

### 7.1 Processo de deprecação

```
Fase 1 — Sinalização (sem breaking change):
  - Adicionar @deprecated no código
  - Atualizar status no OFFICIAL-COMPONENT-REGISTRY para "Deprecated"
  - Criar ADR de deprecação
  - Documentar data prevista de remoção (mínimo 2 sprints de aviso)

Fase 2 — Remoção (breaking change):
  - ADR de remoção aprovada
  - Verificar que nenhum módulo importa o deprecated
  - Remover código
  - Atualizar todas as referências em documentação
  - Registrar no FREEZE-CHANGELOG.md
```

### 7.2 O que não pode ser deprecado

- Entidades Base44 com dados em produção (requer migração de dados primeiro)
- Contratos `Official · Frozen` (vide Constituição G-03)

---

## 8. Como Congelar Contratos

### 8.1 Critérios para congelamento

| Critério | Verificação |
|---|---|
| Módulo no status Official | OFFICIAL-COMPONENT-REGISTRY confirma |
| 28+ cenários passando | Dashboard de testes confirma |
| Sem ADRs abertas sobre o módulo | ADR-MASTER-INDEX confirma |
| Contrato revisado por Arquiteto | Revisão explícita |
| Backward compatibility verificada | Com versão anterior se existir |

### 8.2 Processo

```
1. Escrever contrato TypeScript completo
2. Adicionar em OFFICIAL-CONTRACTS.md com status "Official · Frozen"
3. Criar entrada no FREEZE-CHANGELOG.md
4. Comunicar aos consumidores do módulo
```

### 8.3 Contrato congelado não pode ser alterado

Qualquer mudança requer nova versão major do módulo e ADR aprovada. O contrato original permanece no arquivo com status "Superseded by vX.0".

---

## 9. Como Criar Módulo EF

### 9.1 Estrutura obrigatória

```
src/lib/{module-name}/
  ├── index.ts              // exports públicos
  ├── {ModuleName}Types.ts  // tipos e interfaces
  ├── {ModuleName}.ts       // implementação
  └── {module-name}Tests.ts // bateria de testes
```

### 9.2 Convenções obrigatórias (MDS v2.0)

- TypeScript puro sem side effects externos
- Sem imports de módulos de produto (ChatPage, base44Client, etc.)
- Sem imports de outros módulos EF (dependência por contrato, não por instância)
- Tipos explícitos — zero uso de `any` em API pública
- Object.freeze() em outputs imutáveis
- health(), metrics(), statistics(), logs() implementados
- Cenários de aceitação seguem padrão: `{ criterion: N, name: string, passed: boolean, detail?: string, durationMs: number }`

### 9.3 Checklist de criação

Use ARCHITECTURE-CHECKLIST.md antes de solicitar promoção.

---

## 10. Como Remover Módulo EF

Remoção de módulo EF é um evento excepcional que requer:

1. ADR aprovada com justificativa completa
2. Período de deprecated (mínimo 2 sprints)
3. Migração de todos os consumidores
4. Atualização de OFFICIAL-DEPENDENCY-GRAPH.md
5. Registro em FREEZE-CHANGELOG.md com impacto e migração

**Nota:** Contratos `Official · Frozen` nunca são deletados do OFFICIAL-CONTRACTS.md; são marcados como "Superseded" para histórico.

---

## 11. Processo de Revisão Arquitetural Periódica

| Frequência | Atividade |
|---|---|
| A cada sprint | Verificar consistência entre código e OFFICIAL-COMPONENT-REGISTRY |
| A cada 5 sprints | Executar ABV (Architectural Boundary Validation) |
| A cada release major | Executar FCE (Foundation Compliance Engine) completo |
| Quando necessário | Criar novo ARCHITECTURE-CONSISTENCY-REPORT |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- MEMORYOS-CONSTITUTION.md — Artigo VII
- ADR-LIFECYCLE.md
- VERSIONING-POLICY.md
- ARCHITECTURE-CHECKLIST.md
- src/docs/foundation/adr/ADR-MASTER-INDEX.md

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*