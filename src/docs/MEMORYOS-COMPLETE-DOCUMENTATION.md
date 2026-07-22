# MEMORYOS — DOCUMENTAÇÃO COMPLETA E OFICIAL
# Reconstrução Integral do Projeto
# Data: 2026-07-22 | Status: DOCUMENTO VIVO — atualizado automaticamente

---

## ÍNDICE NAVEGÁVEL

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Documentação Oficial — Hierarquia Documental](#2-documentação-oficial)
3. [Histórico das Sprints](#3-histórico-completo-das-sprints)
4. [Arquitetura v2.0 — Pipeline Cognitivo](#4-arquitetura-v20)
5. [ADRs — Decisões Arquiteturais Formais](#5-adrs)
6. [Connectors — Documentação Completa](#6-connectors)
7. [Google Drive — Relação Foundation vs Adapter](#7-google-drive)
8. [GitHub Connector](#8-github-connector)
9. [Execution Outcome Architecture](#9-execution-outcome-architecture)
10. [ExecutionResultSet — Evolução Completa](#10-executionresultset)
11. [RuntimeContextLayer](#11-runtimecontextlayer)
12. [ConversationPipeline v2](#12-conversationpipeline-v2)
13. [Certificações EF-39 a EF-44](#13-certificações)
14. [Dívidas Técnicas](#14-dívidas-técnicas)
15. [Inventário de Código](#15-inventário-de-código)
16. [Linha do Tempo Cronológica](#16-linha-do-tempo)

---

# 1. VISÃO GERAL DO PROJETO

## 1.1 Origem

O MemoryOS nasceu da percepção de que a forma de interação entre pessoas e IAs está fragmentada:

- Usuários iniciam novas conversas constantemente
- Repetem informações
- Reapresentam contexto
- Reaprendem diferentes softwares

O projeto surgiu para eliminar essa limitação criando uma **camada cognitiva permanente**.

## 1.2 Visão Oficial (MV v1.0)

> Criar o primeiro Sistema Operacional Cognitivo capaz de acompanhar uma pessoa durante toda a sua vida digital, preservando memória permanente, compreendendo contexto continuamente e coordenando inteligentemente qualquer tecnologia necessária para ajudá-la.

**O MemoryOS é:**
- Sistema Operacional Cognitivo
- Camada inteligente acima de todas as aplicações
- Memória permanente do usuário

**O MemoryOS NÃO é:**
- Um chatbot
- Apenas uma IA
- Uma aplicação de memória

## 1.3 Missão

Permitir que qualquer pessoa converse naturalmente com uma única inteligência durante toda a vida.

Essa inteligência deve:
- Lembrar permanentemente do usuário
- Compreender seu contexto
- Aprender continuamente padrões de resolução de problemas
- Coordenar especialistas
- Utilizar diferentes IAs
- Conversar com qualquer sistema através de conectores
- Preservar sempre a memória do usuário

## 1.4 Princípios Fundamentais (MV §7)

1. O usuário conversa apenas com o MemoryOS
2. O Core aprende resolver problemas, nunca aprende APIs, tecnologias ou integrações
3. Os conectores aprendem linguagens — cada conector conhece apenas um sistema
4. A memória pertence ao usuário, nunca ao modelo de IA
5. A conversa nunca termina — existe apenas uma conversa contínua
6. A confiança vem antes da automação

## 1.5 Hierarquia Documental Oficial

```
MV  (Memory Vision)
  ↓
MPS (MemoryOS Product Specification)
  ↓
MAS (MemoryOS Architecture Specification)
  ↓
MES (MemoryOS Engineering Specification)
  ↓
MCF (MemoryOS Connector Framework)
  ↓
MCIS (MemoryOS Connector Intelligence Specification)
  ↓
MGIS (MemoryOS Goal Intelligence Specification)
  ↓
MDS v1.0 → MDS v1.1 → ... → MDS v1.6 → MDS v2.0
  ↓
MRS (MemoryOS Runtime Specification)
  ↓
MCS (MemoryOS Core Specification)
  ↓
MDIS + MIES
  ↓
MDPS + MGFS
  ↓
MRI (Reference Implementation)
  ↓
MQCCS (Quality & Compliance)
  ↓
MPEGS (Platform Evolution Governance)
```

## 1.6 Evolução do Produto

### Fase Foundation (S01–S20)
- Criação de todos os documentos oficiais
- Definição da arquitetura
- Congelamento da Foundation v1.0 em 2026-07-10

### Fase Engineering First (S21+)
- Implementação real da arquitetura
- Integração dos módulos EF no produto
- Migrações INT-01 a INT-07
- Desenvolvimento dos conectores reais (Google, GitHub, Gmail, Drive, Calendar)

### Fase Atual (2026-07-22)
- Architecture Freeze v2.0 estabelecida
- Execution Outcome Architecture certificada
- ConversationPipeline v2 operacional
- Conectores Google Drive, Gmail, GitHub, Google Calendar ativos
- EF-43C e EF-44 implementadas

---

# 2. DOCUMENTAÇÃO OFICIAL

## 2.1 MV — MemoryOS Vision

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovado — Oficial |
| Data | 2026-07-10 (congelamento Foundation) |
| Objetivo | Definir a visão estratégica do projeto |
| Documentos substituídos | Nenhum (é o documento raiz) |

**Conteúdo:** Define o problema, a visão, a missão, os princípios fundamentais, a filosofia, os valores permanentes e a declaração oficial de que o MemoryOS é um Sistema Operacional Cognitivo.

---

## 2.2 MPS — MemoryOS Product Specification

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovado |
| Data | 2026-07-10 |
| Objetivo | Definir O QUE o produto representa para seus usuários |
| Complementa | MAS, MDS 1.0–1.6, MDS Architectural Principles |

**Conteúdo:** Visão do produto como plataforma de Inteligência Contextual. Define público-alvo, proposta de valor, filosofia do produto, jornada do usuário, papel da IA, escalabilidade, mercados estratégicos e princípios permanentes.

**Distinção crítica entre documentos:**

| Documento | Define |
|---|---|
| MAS | COMO o sistema é construído (arquitetura técnica) |
| MDS | COMO implementá-lo (engenharia e especificações) |
| MPS | O QUE o produto representa para seus usuários |

---

## 2.3 MAS — MemoryOS Architecture Specification

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovado — É a Constituição Técnica |
| Data | 2026-07-10 |
| Objetivo | Definir a arquitetura oficial |

**Camadas Oficiais:**

| Camada | Responsabilidade | Restrição |
|---|---|---|
| MemoryOS Core | Interpreta intenções | Nunca executa integrações |
| Memory Layer | Preserva contexto e conhecimento | Nunca interpreta intenções |
| Specialists | Fornecem conhecimento especializado | Nunca executam ações |
| Capability Layer | Executa operações cognitivas | Nunca acessa sistemas externos |
| Service Layer | Representa domínios funcionais | Nunca executa integrações |
| Policy Engine | Autoriza ou bloqueia execuções | Nunca interpreta intenções |
| Execution Planner | Organiza sequência de execução | Nunca conversa com sistemas externos |
| Connector Manager | Seleciona conectores | Nunca toma decisões de negócio |
| Connectors | Executam integrações | Nunca interpretam intenções |
| Providers | Fornecem inteligência artificial | Nunca armazenam memória do usuário |

**Fluxo Oficial:**
```
Usuário → Core → Context Builder → Planner → Capability Detector
→ Capability Layer → Specialists → Service Layer → Policy Engine
→ Execution Planner → Connector Manager → Connector
→ Sistema Externo → Resultado → Memory Update → Resposta
```

---

## 2.4 MES — MemoryOS Engineering Specification

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Status | Aprovado |
| Data | 2026-07-10 |
| Objetivo | Definir como a arquitetura deve ser implementada |

**Princípios de Engenharia:**
1. Responsabilidade Única (SRP)
2. Baixo Acoplamento
3. Alta Coesão
4. Interfaces Estáveis
5. Independência Tecnológica
6. Evolução Contínua

---

## 2.5 MDS — MemoryOS Developer Specification

O MDS é o Manual Oficial de Engenharia do MemoryOS. Passou por múltiplas versões:

| Versão | Sprint | Foco |
|---|---|---|
| MDS v1.0 | S03 | Organização da solução, Arquitetura Física e Lógica, Monorepo |
| MDS v1.1 | S07 | Capability Negotiation |
| MDS v1.2 | S08 | Capability Negotiation Engine |
| MDS v1.3 | S09 | Capability Intelligence Layer |
| MDS v1.4 | S10 | Learning Engine Architecture |
| MDS v1.5 | S11 | Knowledge Architecture |
| MDS v1.6 | S12 | Memory Architecture |
| MDS v2.0 | Atual | Manual completo de implementação |

**MDS v2.0 — Estrutura por arquivo:**

| Arquivo | Partes |
|---|---|
| MDS (raiz) | Parte I — Organização da Solução |
| MDS-Engines | II-Motores · III-Modelagem · IV-Banco · V-Comunicação |
| MDS-Platform | VI-Frontend · VII-Voice · VIII-Enterprise · IX-Specialists · XII-Testes · XIII-DevOps · XIV-Segurança |
| MDS-Connectors | X-Connectors Oficiais · XI-Marketplace · XV-Sprint Zero |

---

## 2.6 MEMORYOS-ARCHITECTURE-v2.0

| Campo | Valor |
|---|---|
| Versão | 2.0 |
| Status | OFFICIAL · FROZEN |
| Data | 2026-07-11 |
| Sprint | SPR-FREEZE-01 |

**Inclui:**
- Pipeline cognitivo oficial com 19 posições de módulo
- 14 módulos EF certificados (329 cenários)
- Contratos públicos congelados
- Roadmap de migração INT-02 a INT-07

**Histórico de versões:**

| Versão | Sprint | Data | Descrição |
|---|---|---|---|
| 0.1 | EF-01 a EF-14 | 2026-07-09 | Foundation: 14 módulos certificados |
| 1.0 | INT-01 | 2026-07-10 | CognitivePipelineAdapter (scaffold) |
| 1.5 | ARC-01 | 2026-07-11 | Estratégia de unificação documentada |
| 1.8 | ARC-02 | 2026-07-11 | Validação arquitetural + risk register |
| 1.9 | SPR-ADR-01 | 2026-07-11 | 7 ADRs formais produzidas |
| 2.0 | SPR-FREEZE-01 | 2026-07-11 | Architecture Freeze v2.0 |

---

# 3. HISTÓRICO COMPLETO DAS SPRINTS

## 3.1 Fase Foundation (S01–S20)

| Sprint | Foco | Entregável | Status |
|---|---|---|---|
| S01 | Vision & Product | MV + MPS | ✅ Done |
| S02 | Architecture | MAS | ✅ Done |
| S03 | Developer Spec | MDS v1.0 | ✅ Done |
| S04 | Connector Framework | MCF | ✅ Done |
| S05 | Connector Intelligence | MCIS | ✅ Done |
| S06 | Goal Intelligence | MGIS | ✅ Done |
| S07 | MDS v1.1 | Capability Negotiation | ✅ Done |
| S08 | MDS v1.2 | Capability Negotiation Engine | ✅ Done |
| S09 | MDS v1.3 | Capability Intelligence Layer | ✅ Done |
| S10 | MDS v1.4 | Learning Engine Architecture | ✅ Done |
| S11 | MDS v1.5 | Knowledge Architecture | ✅ Done |
| S12 | MDS v1.6 | Memory Architecture | ✅ Done |
| S13 | Runtime & Core | MRS + MCS | ✅ Done |
| S14 | Intelligence | MDIS + MIES | ✅ Done |
| S15 | Platform | MDPS + MGFS | ✅ Done |
| S16 | MRI Spec | Reference Implementation spec | ✅ Done |
| S17 | Execution Engine | ExecutionEngine + Connectors | ✅ Done |
| S18 | Planning & Decision | Planning + Decision Engines | ✅ Done |
| S19 | MQCCS + MPEGS | Quality + Governance | ✅ Done |
| S20 | Foundation v1.0 | Frozen Baseline + Engineering First | ✅ Done |

## 3.2 Fase Engineering First (S21+)

### Sprint INT-01 — CognitivePipelineAdapter v1.0 ✅
- CognitivePipelineAdapter v1.0 implementado
- Primeiro scaffold de integração do pipeline EF no produto
- Status: Done

### Sprints EF-01 a EF-14 — Módulos EF Foundation
Certificação dos 14 módulos EF fundacionais com 329 cenários totais.

| Módulo | EF | Cenários | Status |
|---|---|---|---|
| Goal Runtime | EF-01 | 21 | Official (v0.1) |
| Goal Registry Service | EF-02 | 22 | Official · Frozen |
| Goal Scheduler | EF-03 | 22 | Official · Frozen |
| Goal Execution Queue | EF-04 | 24 | Official · Frozen |
| Execution Dispatcher | EF-05 | 24 | Official · Frozen |
| Decision Engine | EF-06 | 24 | Official · Frozen |
| Planning Engine | EF-07 | 24 | Official · Frozen |
| Reflection Engine | EF-08 | 24 | Official · Frozen |
| Self Evaluation Engine | EF-09 | 24 | Official · Frozen |
| Knowledge Engine | EF-10 | 28 | Official · Frozen |
| Learning Engine | EF-11 | 28 | Official · Frozen |
| Memory Engine v1 | EF-12 | 28 | Official · Frozen |
| Retrieval Engine | EF-13 | 28 | Official · Frozen |
| Capability Registry | EF-14 | 28 | Official · Frozen |

### Sprints de Auditoria Arquitetural

**ARC-01:** Estratégia de unificação de pipelines documentada  
**ARC-02:** Validação arquitetural completa + risk register  
**SPR-ADR-01:** 7 ADRs formais produzidas (ADR-001 a ADR-007)  
**SPR-FREEZE-01:** Architecture Freeze v2.0 declarada

### Sprints de Conectores (Sprint 7.x)

**Phase700/Phase710:** GWS Foundation — Google Workspace base  
**Phase711:** Gmail GWS Integration  
**Phase712:** Google Drive Integration  
**Phase713:** Google Calendar Integration  
**Phase714:** Multi-Connector  

### Sprints de Engineering First avançado (Sprint 8.x)

**Sprint811/812:** Unified Context Builder / Knowledge Fusion Engine  
**SprintC022-C040:** Connector Runtime consolidações  
**SprintP011A/B/C:** Planning Intelligence A/B/C  
**SprintEF63x:** EF-63 series  
**SprintEF640-670:** EF-64 a EF-67 series  

### Sprints EF-39 a EF-44 (Foco em Runtime Context e Verified Execution)

| Sprint | Foco | Status |
|---|---|---|
| EF-39 | Memory Store | Done |
| EF-39.3 | Certification | Done |
| EF-39.8 | Drive Debug | Done |
| EF-39.9 | Validation | Done |
| EF-40 | Shadow Mode Architecture | Done |
| EF-40.1 | Component Origin Audit | Done |
| EF-40.2 | Official Library Flow | Done |
| EF-40.3 | EOA Certification | Done |
| EF-40.4 | SprintEF403 | Done |
| EF-40.5 | SprintEF404 | Done |
| EF-40.6 | UCME Shadow Mode | Done |
| EF-40.7 | SprintEF407 | Done |
| EF-40.7a | SprintEF407a | Done |
| EF-40.8 | SprintEF408 | Done |
| EF-40.8B | SprintEF408B | Done |
| EF-41 | Unified Execution Result Set (UERS) | Done |
| EF-41A | RuntimeContextLayer update | Done |
| EF-42 | Runtime Introspection Framework (RIF) | Done |
| EF-42.5–42.10 | EF-42 subseries | Done |
| EF-43 | Standardized ESM-compatible imports | Done |
| EF-43A | RuntimeContext globalThis singleton | Done |
| EF-43B | RuntimeContext source of truth | Done |
| EF-43C | ExecutionResultSet preservation fix | Done |
| EF-44 | Verified Execution Layer | Done |
| EF-45 a EF-49 | Continuações | Done |
| EF-49.1/49.2 | Pipeline Instrument | Done |
| EF-51 a EF-59 | Engineering series | Done |
| EF-60A/60B | Architectural Stabilization | Done |
| MVP-01 | MVP Certification | Done |
| EPIC-D | EPIC-D Runtime Observability | Done |

---

# 4. ARQUITETURA v2.0

## 4.1 Pipeline Cognitivo Oficial

O pipeline opera em dois paths distintos:

### Path A — Interativo (< 2s)
```
Mensagem
  ↓
[1] Conversation Engine (EF-21) — Reserved
  ↓
[2] Intent Layer (EF-22) — Reserved
  ↓
[3] Goal Runtime (EF-01/EF-24) — Certified
  ↓
[4] Decision Engine (EF-06) — Frozen
  ↓
[5] Planning Engine (EF-07) — Frozen
  ↓
[6] Context Engine (EF-20) — Reserved
  ↓
[7] Specialist Layer (EF-25) — Reserved
  ↓
[8] Capability Runtime (EF-15) — Pending Cert.
  ↓
[9] Connector Runtime (EF-16+) — Reserved
  ↓
[10] LLM Gateway (EF-23) — Reserved
  ↓
[11] Reflection Engine (EF-08) — Frozen
  ↓
[12] Self Evaluation Engine (EF-09) — Frozen
  ↓
Resposta
```

### Path B — Background (assíncrono)
```
Goal (background)
  ↓
[13] Goal Scheduler (EF-03)
  ↓
[14] Execution Dispatcher (EF-05)
  ↓
[15] Goal Execution Queue (EF-04)
  ↓
[16] Knowledge Engine (EF-10)
  ↓
[17] Learning Engine (EF-11)
  ↓
[18] Memory Engine (EF-12)
```

### Infra (suporte a ambos)
```
[19] Goal Registry Service (EF-02)
[20] Capability Registry (EF-14)
[21] Retrieval Engine (EF-13)
```

## 4.2 Princípios Arquiteturais Congelados (v2.0)

**P1 — Single Responsibility per Module:** Cada módulo EF tem exatamente uma responsabilidade.

**P2 — Dois Paths Distintos:** Goal Scheduler, Execution Dispatcher e Goal Execution Queue são restritos ao Path B.

**P3 — Entidades Base44 como Storage Permanente:** As entidades Base44 são o storage permanente.

**P4 — Contratos Públicos Imutáveis:** Após congelamento, assinaturas não mudam sem versão major + ADR aprovada.

**P5 — Canonical Registry Único:** Para cada tipo de Registry existe um único canonical oficial.

**P6 — Migrações por Substituição Incremental:** Nenhum componente é removido antes que seu substituto EF esteja integrado.

**P7 — Nenhuma Decisão Automática:** Qualquer mudança estrutural requer ADR com aprovação humana.

## 4.3 Storage Layer Oficial

| Entidade | Tipo | Produtor EF | Status |
|---|---|---|---|
| Message | Base44 Entity | Conversation Engine (EF-21) | Active |
| ChatSession | Base44 Entity | Conversation Engine (EF-21) | Active |
| Document | Base44 Entity | ingestKnowledge pipeline | Active |
| KnowledgeEntity | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Decision | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Task | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Topic | Base44 Entity | Knowledge Engine (EF-10) | Active |
| Keyword | Base44 Entity | Knowledge Engine (EF-10) | Active |
| ChatMessage | Base44 Entity | Nenhum | Pending Deprecation |
| Conversation | Base44 Entity | Nenhum | Pending Deprecation |

---

# 5. ADRs — DECISÕES ARQUITETURAIS FORMAIS

## ADR-001 — Intent Layer: Estratégia de Classificação

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)  
**DAP:** DAP-01

**Problema:** A Intent Layer (EF-22) usa LLM para classificar intenção. A arquitetura EF propõe determinístico.

**Alternativas:**
- A: Determinística pura (recomendada)
- B: Híbrida (determinística + fallback LLM)
- C: LLM com cache

**Recomendação:** Alternativa A — Determinística Pura  
**Decisão humana:** PENDENTE

---

## ADR-002 — Goal Runtime: Promoção v0.1 → v1.0

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)

**Problema:** Goal Runtime tem 21 cenários (padrão EF: 28). Módulos dependentes têm mais cenários que a fundação.

**Alternativas:**
- A: Promover antes de INT-03 (recomendada)
- B: Integrar v0.1 e promover em paralelo
- C: Integrar e nunca promover

**Recomendação:** Alternativa A  
**Decisão humana:** PENDENTE

---

## ADR-003 — Semântica de "Plano"

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)

**Problema:** Dois objetos chamados `plan` com semânticas incompatíveis: analytics (`{goal, skills, sourcesCount}`) vs ExecutionPlan (`{steps[], complexity, estimatedMs}`).

**Alternativas:**
- A: Renomear analytics para `executionMetrics` (recomendada)
- B: Dois objetos coexistindo com nomes distintos
- C: Substituição total

**Recomendação:** Alternativa A  
**Decisão humana:** PENDENTE

---

## ADR-004 — Capability Runtime: Certificação

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)

**Problema:** `testCount=0` no auditor automático. Violação arquitetural: Capability Runtime usa Registry interno em vez de EF-14 oficial.

**Alternativas:**
- A: Auditar manualmente antes de qualquer ação (recomendada)
- B: Implementar do zero
- C: Completar adicionando o que falta

**Recomendação:** Alternativa A + Declarar EF-14 como canonical imediatamente  
**Decisão humana:** PENDENTE

---

## ADR-005 — Connector Registry: Consolidação

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)

**Problema:** 5 implementações de Connector Registry sem canonical declarado.

**Implementações existentes:**
1. `src/lib/connectors/registry.js` — usado pelo produto (canonical de facto)
2. `src/lib/connector-registry/` — 11 arquivos JS (não usado)
3. `src/lib/connector-runtime/ConnectorRegistry.ts` — TypeScript embutido
4. `src/lib/enterprise-integration/connectorRegistry.js` — JS não usado
5. `src/lib/connector-sdk/` — 12 arquivos JS (SDK layer)

**Alternativas:**
- A: Declarar `connectors/registry.js` como canonical temporário
- B: Declarar `connector-registry/` como canonical e migrar
- C: Implementar EF-16 imediatamente
- D: Canonical temporário agora + EF-16 depois (recomendada)

**Recomendação:** Alternativa D  
**Decisão humana:** PENDENTE

---

## ADR-006 — Memory Engine Legado: Deprecação

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)

**Problema:** `src/lib/memory-engine/` — 47 arquivos JavaScript coexistindo com `src/lib/memory-engine-v1/` (EF-12 oficial). O produto não usa nenhum dos dois.

**Alternativas:**
- A: Deprecar imediatamente (Fase 1 editorial + Fase 2 remoção futura) — recomendada
- B: Aguardar INT-06
- C: Arquivar em `_deprecated/`

**Recomendação:** Alternativa A, Fase 1 imediatamente  
**Decisão humana:** PENDENTE

---

## ADR-007 — Reasoning Engine: Módulo ou Distribuído

**Status:** Proposed  
**Sprint:** SPR-ADR-01 (2026-07-11)

**Problema:** Após migrações INT-02 a INT-07, `src/lib/reasoning/` fica vazio exceto pelo Conversation Engine. Não existe responsabilidade de raciocínio não coberta por módulos EF existentes.

**Alternativas:**
- A: Remover Reasoning Engine do pipeline (recomendada)
- B: Manter como módulo EF separado com meta-cognição
- C: Renomear diretório sem mudar responsabilidades

**Recomendação:** Alternativa A — responsabilidade distribuída  
**Decisão humana:** PENDENTE

**NOTA:** ADR-007 afeta diretamente TARGET-ARCHITECTURE.md e BLOQ-01 do ARCHITECTURE-FREEZE-CHECKLIST.

---

# 6. CONNECTORS — DOCUMENTAÇÃO COMPLETA

## 6.1 Arquitetura de Connectors

O MemoryOS implementa conectores reais para Google Workspace (Drive, Gmail, Calendar), GitHub e Base44.

**Estrutura Oficial de um Connector:**
```
ConversationPipeline
  ↓ _pipelineConnCtx (userId, workspaceId, sessionId, goalId, origin)
ConversationRuntimeEngine
  ↓ ExecutionPlan
UniversalConnectorRouter (UCR)
  ↓ capability routing
IConnector.execute(capability, parameters, context)
  ↓
Sistema Externo (Google API, GitHub API, etc.)
  ↓
ExecutionResult (steps[{connector, capability, status, output, error}])
  ↓
ConnectorResultSynthesizer
  ↓ LLM (se dados válidos)
Resposta ao Usuário
```

## 6.2 Google Workspace Authentication

Todos os conectores Google usam a mesma fundação de autenticação:

**Entidade:** `GoogleOAuthToken`
```json
{
  "user_id": "string",
  "workspace_id": "string (ex: 'default')",
  "refresh_token": "string",
  "email": "string",
  "scopes": "string",
  "updated_at": "string"
}
```

**Backend Functions:**
- `googleOAuthInit/entry.ts` — inicia fluxo OAuth
- `googleOAuthExchange/entry.ts` — troca code por tokens
- `googleOAuthRefresh/entry.ts` — renova access token
- `googleOAuthRevoke/entry.ts` — revoga tokens
- `googleOAuthDiag/entry.ts` — diagnóstico
- `googleOAuthDiag2/entry.ts` — diagnóstico 2
- `googleOAuthDiag3/entry.ts` — diagnóstico 3

**Workspace ID:**
- O `workspaceId` oficial é `"default"` (valor fixo em `WorkspaceContext.js`)
- A função `getActiveWorkspaceId()` retorna `"default"`

## 6.3 GoogleDriveConnector — Duas Implementações

**ATENÇÃO: Existe dualidade arquitetural confirmada aqui. Ver Seção 7 para análise completa.**

### Implementation A: Adapter (src/lib/connector-runtime/connectors/GoogleDriveConnector.ts)
- É o **Adapter** oficial do sistema de Connector Runtime
- Recebe o `context` com `workspaceId` do pipeline
- Possui portão de autenticação em `execute()` (linhas ~205-249):
  ```typescript
  if (!context.workspaceId) throw new Error(...);
  const workspaceId = context.workspaceId;
  const token = getAccessToken(workspaceId);
  if (!token) {
    try { await ensureValidToken(workspaceId); }
    catch { return notConfigured(...); }   // ← retorna ANTES do _dispatch
    if (!getAccessToken(workspaceId)) return notConfigured(...);
  }
  const result = await this._dispatch(...);  // só chega aqui se token válido
  ```
- **BUG HISTÓRICO:** O Pipeline passava `workspaceId: session.project_id ?? "default-workspace"`, causando `NOT_CONFIGURED` pois o token estava salvo com workspaceId `"default"`.
- **CORREÇÃO (2026-07-22):** Pipeline corrigido para usar `workspaceId: getActiveWorkspaceId()` retornando `"default"`.

### Implementation B: Foundation (src/lib/google-drive/GoogleDriveConnector.ts)
- É a **implementação Foundation** da Google Drive API
- Chamada pelo DriveDownloadExecutor
- Usa `workspaceId = "default"` internamente
- **Irrelevante se o Adapter falha antes de chegar no _dispatch()**

## 6.4 GmailConnector

**Arquivos:**
- `src/lib/connector-runtime/connectors/GmailConnector.ts` — Adapter oficial
- `src/lib/gmail/GmailConnector.js` — Foundation/legado
- `src/lib/gmail-ucr/GmailCapabilityExecutor.ts` — UCR executor

**Capabilities:**
- `gmail.readInbox` — lista emails da caixa de entrada
- `gmail.searchMessages` — busca emails por query
- `gmail.readMessage` — lê um email específico
- `gmail.readEmail` — alias de readMessage

## 6.5 GoogleCalendarConnector

**Arquivo:** `src/lib/connector-runtime/connectors/GoogleCalendarConnector.ts`

**Capabilities:**
- `calendar.listToday` — lista eventos de hoje
- `calendar.listWeek` — lista eventos da semana

## 6.6 GitHubConnector

**Arquivo:** `src/lib/connector-runtime/connectors/GitHubConnector.ts`

**Capabilities:**
- `github.listRepos` — lista repositórios
- `github.listFiles` — lista arquivos de um repositório
- `github.getFile` — obtém conteúdo de um arquivo
- `github.searchCode` — busca código
- `github.searchFiles` — busca arquivos
- `github.listCommits` — lista commits
- `github.listBranches` — lista branches
- `github.listPullRequests` — lista PRs
- `github.listIssues` — lista issues

**GitHubPlanningContextProvider:** Enriquece o plano com owner/repo/branch antes da execução.

## 6.7 Base44Connector

**Arquivo:** `src/lib/connector-runtime/connectors/Base44Connector.ts`

**Capabilities:** Acesso às entidades Base44 via SDK.

---

# 7. GOOGLE DRIVE — RELAÇÃO FOUNDATION vs ADAPTER

## 7.1 A Dualidade Arquitetural

Existem duas implementações distintas do Google Drive connector:

### Caminho 1 — Via Connector Runtime (Adapter)

```
ConversationPipeline
  ↓ _pipelineConnCtx.workspaceId
GoogleDriveConnector (src/lib/connector-runtime/connectors/GoogleDriveConnector.ts)
  ↓ PORTÃO: verifica workspaceId + token
  ↓ [falha aqui se workspaceId incorreto → retorna NOT_CONFIGURED]
  ↓ [sucesso → _dispatch()]
GoogleDriveCapabilityExecutor
  ↓
Google Drive API
```

### Caminho 2 — Via DriveDownloadExecutor (Foundation)

```
DriveDownloadExecutor (src/lib/google-drive/DriveDownloadExecutor.ts)
  ↓ usa workspaceId = "default" hardcoded internamente
GWSFoundation (src/lib/google-drive/GoogleDriveConnector.ts)
  ↓
Google Drive API
```

## 7.2 Qual é oficial?

**O Caminho 1 (Connector Runtime Adapter) é o caminho oficial** para todas as operações drive.* chamadas pelo ConversationPipeline.

O Caminho 2 (DriveDownloadExecutor + Foundation) existe como implementação alternativa mas é irrelevante operacionalmente quando o Caminho 1 falha no portão de autenticação.

## 7.3 O Bug de WorkspaceId (Histórico)

### Problema original (até 2026-07-22)

O `ConversationPipeline` construía `_pipelineConnCtx` com:
```typescript
workspaceId: session.project_id ?? "default-workspace",
```

O `GoogleDriveConnector` (Adapter) verificava:
```typescript
const token = getAccessToken("default-workspace"); // → null
// ensureValidToken("default-workspace") → falha
// return NOT_CONFIGURED ← AQUI o drive sempre falha
```

Enquanto o token estava armazenado com workspaceId `"default"` (valor correto de `getActiveWorkspaceId()`).

### Diagnóstico completo

O portão de autenticação em `GoogleDriveConnector.execute()` (linhas ~205-249) executa:
1. `if (!context.workspaceId)` → verifica presença
2. `const workspaceId = context.workspaceId` → captura o valor
3. `const token = getAccessToken(workspaceId)` → busca token com a chave recebida
4. Se null: tenta `ensureValidToken(workspaceId)` com a mesma chave errada
5. Se ainda null: `return notConfigured(...)` ← **retorna aqui ANTES de qualquer _dispatch()**

O `DriveDownloadExecutor.ts` nunca era alcançado porque o Adapter retornava `NOT_CONFIGURED` antes.

**Logs confirmadores esperados:**
- `[RUNTIME-PROBE][GDC-02]`: `workspaceId: "default-workspace"`, `tokenPresent: false` → antes da correção
- `[RUNTIME-PROBE][GDC-02]`: `workspaceId: "default"`, `tokenPresent: true` → após a correção

### Correção aplicada (2026-07-22)

**Arquivo:** `src/lib/conversation-platform/ConversationPipeline.ts`

**Mudança 1 — import adicionado (linha 18):**
```diff
+ import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";
```

**Mudança 2 — construção do `_pipelineConnCtx` (linha ~610):**
```diff
- workspaceId: session.project_id ?? "default-workspace",
+ workspaceId: getActiveWorkspaceId(),
```

**Justificativa:** Usar `getActiveWorkspaceId()` (função dinâmica) em vez da constante `ACTIVE_WORKSPACE_ID` mantém a abstração existente em `WorkspaceContext.js` como única fonte de verdade, sem exigir mudanças se o sistema evoluir para multi-workspace real.

**Restrições da correção:**
- `session.project_id` não foi alterado em nenhum outro uso no arquivo
- `GoogleDriveConnector.ts` (Adapter e Foundation) não foi alterado
- `GoogleAuthSession.js` não foi alterado
- `ExecutionContextFactory.ts` não foi alterado
- `DriveDownloadExecutor.ts` não foi alterado

## 7.4 Diagrama Atualizado (pós-correção)

```
ConversationPipeline
  ↓ getActiveWorkspaceId() → "default"
GoogleDriveConnector (Adapter)
  ↓ getAccessToken("default") → token válido ✅
  ↓ _dispatch(capability, parameters)
GoogleDriveCapabilityExecutor
  ↓ [drive.listRecent / drive.searchFiles / drive.downloadFile]
Google Drive API
  ↓
ExecutionResult (completed)
  ↓
ConnectorResultSynthesizer
  ↓ LLM(dados reais)
Resposta ao Usuário ✅
```

---

# 8. GITHUB CONNECTOR

## 8.1 Arquitetura

O GitHubConnector opera em dois níveis:

### Nível 1 — GitHubConnector (Adapter)
**Arquivo:** `src/lib/connector-runtime/connectors/GitHubConnector.ts`

Responsabilidades:
- Recebe contexto com token GitHub
- Roteia para capability executors
- Gerencia erros de autenticação

### Nível 2 — GitHubPlanningContextProvider
**Arquivo:** `src/lib/github-plan-context/GitHubPlanningContextProvider.ts`

Responsabilidade: Enriquece o `ExecutionPlan` com owner/repo/branch antes da execução.

Funciona via:
1. Lê contexto existente do `ConversationStore` (slot `"github"`)
2. Analisa o histórico de mensagens para extrair owner/repo
3. Injeta os parâmetros no plano

## 8.2 Fluxo de Busca GitHub

```
Mensagem: "liste os arquivos do repositório memoryos"
  ↓
GoalBridge → goalType: "github.listRepos"
  ↓
PlanningEngine → ExecutionPlan { steps: [{connector: "github", capability: "github.listRepos"}] }
  ↓
GitHubPlanningContextProvider.enrich(plan, userMessage)
  → extrai owner/repo do histórico/contexto
  → injeta parameters.owner, parameters.repo
  ↓
ConversationRuntimeEngine.execute(enrichedPlan)
  ↓
GitHubConnector.execute("github.listRepos", {owner, repo})
  ↓
GitHub API v3
  ↓
ExecutionResult { steps: [{output: {items: [...repos]}}] }
  ↓
ExecutionResultSetBuilder.build(connectorData)
  → entityType: "repository"
  → items: [{displayName, reference: {owner, name, full_name}}]
  ↓
RuntimeContextLayer.setResultSet(resultSet)
  ↓
ConnectorResultSynthesizer → LLM → Resposta
```

## 8.3 Problemas Históricos

**GoalBridge signal collision (dead end confirmado):** Houve colisão entre `drive.openDocument` e `github.getFile` causando roteamento incorreto. Resolvido via ajuste de sinais no ConversationGoalBridge.

**GitHub Code Search API (dead end confirmado):** Busca via `search.symbol` para repos privados retornou 0 resultados devido a latência de índice. Solucionado com fetch direto via path quando contexto de repositório disponível.

**GitHubSemanticProvider (dead end confirmado):** Criava ambiguidade para queries genéricas 'procure' sem sinais contextuais. Removido.

---

# 9. EXECUTION OUTCOME ARCHITECTURE

## 9.1 Visão Geral

A Execution Outcome Architecture (EOA) foi certificada em 2026-07-21 como **APPROVED WITH RECOMMENDATIONS**.

Objetivo: eliminar a lógica manual de if/else/prioridade do ConversationPipeline e substituir por um sistema de candidatos + árbitro determinístico.

## 9.2 Componentes

| Componente | Responsabilidade única |
|---|---|
| `ExecutionOutcomeTypes` | Contratos de dados puros (tipos, interfaces, enums) |
| `ExecutionOutcome` | Re-export dos tipos |
| `ExecutionOutcomeFactory` | Criação, validação e normalização de ExecutionOutcome |
| `ExecutionOutcomeAdapterTypes` | Contratos da camada de adaptação |
| `ExecutionOutcomeAdapterRegistryTypes` | Contratos do sistema de registro |
| `ExecutionOutcomeDomainAdapter` | Implementações builtin (General, Unknown) + shared helpers |
| `ExecutionOutcomeAdapterRegistry` | Catálogo e resolução de adapters por domínio |
| `ExecutionOutcomeAdapter` | Orquestrador: valida → resolve via Registry → delega |
| `ExecutionOutcomeAdapterFactory` | Atalho de alto nível: input bruto → Outcome → Candidate |
| `ResponseCandidate` | Contrato imutável do candidato de resposta |
| `ResponseArbiter` | Seleção determinística do melhor candidato |

## 9.3 Fluxo

```
Pipeline
  ├─ [LLM path] → AdapterFactory.fromLLMReasoning()
  ├─ [Connector path] → AdapterFactory.fromConnectorSuccess()
  └─ [Failure path] → AdapterFactory.fromConnectorFailure()
          ↓
  ExecutionOutcomeFactory.create(input)
    → gera id, calcula durationMs, normaliza cost/confidence
    → retorna ExecutionOutcome (Object.freeze())
          ↓
  ExecutionOutcomeAdapter.adapt(outcome, hint)
    → ExecutionOutcomeAdapterRegistry.resolve(outcome)
    → IExecutionOutcomeDomainAdapter.adapt(outcome, hint)
    → createResponseCandidate(...)
          ↓
  ResponseArbiter.arbitrate([candidates], context)
    1. DOMAIN_MATCH (preferredDomain + executionSucceeded)
    2. HANDLED_HIGH_CONFIDENCE (confidence >= 0.7)
    3. HANDLED_ANY (melhor confidence)
    4. NULL_FALLBACK
          ↓
  selected.answer → Resposta Final
```

## 9.4 Domínios Suportados

| Domínio | Status |
|---|---|
| `github` | ✅ Nativo |
| `google_drive` | ✅ Nativo |
| `gmail` | ✅ Nativo |
| `google_calendar` | ✅ Nativo |
| `general` | ✅ Builtin |
| `memory` | ✅ Builtin |
| `slack` | ⚠️ Requer add ao union |
| `whatsapp` | ⚠️ Requer add ao union |

## 9.5 SOLID Analysis (Auditoria 2026-07-21)

| Princípio | Status | Observação |
|---|---|---|
| SRP | ✅ APROVADO | Cada classe tem responsabilidade única |
| OCP | ✅ APROVADO | Novos adapters sem modificação do Registry |
| LSP | ✅ APROVADO | Adapters substituíveis |
| ISP | ⚠️ ATENÇÃO | Pode crescer com adapters stateful |
| DIP | ✅ APROVADO | Adapter depende de interface, não implementação |

---

# 10. EXECUTIONRESULTSET

## 10.1 Origem

O ExecutionResultSet (EF-41) foi criado para resolver o problema de navegação por resultados de connector:

**Problema original:** Após executar `github.listRepos`, o usuário dizia "abra o primeiro". O sistema não sabia qual era o "primeiro" porque os resultados não estavam armazenados de forma estruturada e navegável.

**Solução EF-41:** `ExecutionResultSet` — coleção navegável de itens do conector com:
- `id` único
- `entityType` (repository, file, email, event, drive_file)
- `connector` e `capability` de origem
- `items[]` com `displayName` e `reference`
- `selectedIndex` (índice navegável)

## 10.2 Evolução

### EF-41 — Unified Execution Result Set (UERS)
- `ExecutionResultSet` definido
- `ExecutionResultSetBuilder` implementado
- Persistência via `RuntimeContextLayer.setResultSet()`

### EF-41A — RuntimeContextLayer Update
- Integração do ResultSet com RuntimeContextLayer
- `RuntimeContextLayer.getResultSet()` exposto

### EF-43A — Contextual Navigation
- Resolução ordinal (primeiro/segundo/último) usa `entityType` do ResultSet
- `resolveGoalTypeFromIntent()` usa ResultSet para determinar goalType correto
- Atualização do contexto GitHub via ordinal selection

### EF-43C — ExecutionResultSet Preservation Fix

**Bug:** `runtimeContextLayer.update()` resetava `currentResultSet` para null, sobrescrevendo o ResultSet salvo pelo `ConnectorResultSynthesizer`.

**Root Cause:** `update()` criava um novo estado com `currentResultSet: null` sem preservar o existente.

**Fix:** `update()` agora lê o estado existente antes de criar o novo:
```typescript
const existingState = this.get();
const preservedRS = existingState.currentResultSet; // EF-43C
const next: RuntimeContextState = {
  ...
  currentResultSet: preservedRS, // preservado!
  ...
};
```

## 10.3 ExecutionResultSetBuilder

**Arquivo:** `src/lib/execution-result-set/ExecutionResultSetBuilder.ts`

**Responsabilidade:** Converter outputs brutos de conectores em `ExecutionResultSet` estruturado.

**Lógica:**
1. Infere `entityType` pelo nome da capability (ex: "listRepos" → "repository")
2. Extrai itens navegáveis por heurísticas (arrays em output, campos comuns)
3. Constrói `reference` com campos de identidade (owner, name, path, fileId)
4. Limita a N itens para segurança

**Entity Type Inference:**
```
capability contém "repo" → "repository"
capability contém "file" → "file"
capability contém "email" ou "message" → "email"
capability contém "event" → "event"
capability contém "drive" → "drive_file"
default → "item"
```

---

# 11. RUNTIMECONTEXTLAYER

## 11.1 Propósito

O `RuntimeContextLayer` é a camada central de estado operacional da conversa.

**Arquivo:** `src/lib/runtime-context/RuntimeContextLayer.ts`

**Status:** EXPERIMENTAL (Sprint EXP-RUNTIME-CONTEXT-LAYER) — reversível

**Para reverter:**
1. Apagar `src/lib/runtime-context/`
2. Remover blocos `[EXP-RUNTIME-CONTEXT-LAYER]` em `ConversationPipeline.ts`

## 11.2 Responsabilidades

Centraliza todo o estado operacional:
- `currentExecutionId` — ID da execução ativa
- `currentGoalType` — GoalType da última execução bem-sucedida
- `currentConnector` — ConnectorId da última execução
- `currentCapability` — Capability da última execução
- `currentDomain` — Domínio ativo
- `currentArtifact` — Artefato em contexto (owner/repo/path/fileId)
- `currentResultSet` — ExecutionResultSet da última execução (EF-41)
- `executionIntent` — Registro de intent da execução
- `sessionId` — ID da sessão ativa

## 11.3 API Pública

```typescript
runtimeContextLayer.get()               // estado atual
runtimeContextLayer.set(partial)         // atualiza campos
runtimeContextLayer.update(params)       // após execução bem-sucedida
runtimeContextLayer.clear()              // limpa (troca de sessão)
runtimeContextLayer.snapshot()           // cópia profunda para debug
runtimeContextLayer.restore(snap)        // restaura snapshot
runtimeContextLayer.resolveContinuation(message) // detecta continuidade
runtimeContextLayer.setResultSet(rs)     // persiste ResultSet (EF-41)
runtimeContextLayer.getResultSet()       // retorna ResultSet atual
runtimeContextLayer.dump()               // log completo (leitura)
```

## 11.4 Singleton Pattern

```typescript
const _KEY = "__RUNTIME_CONTEXT_LAYER__";
if (!(globalThis as any)[_KEY]) {
  (globalThis as any)[_KEY] = new RuntimeContextLayerClass();
}
export const runtimeContextLayer = (globalThis as any)[_KEY];
```

**Razão:** Sobrevive a HMR (Hot Module Replacement) do Vite. A mesma instância é acessada por `ConnectorResultSynthesizer` via `(globalThis as any)["__RUNTIME_CONTEXT_LAYER__"]` para evitar importação circular.

## 11.5 Persistência

Utiliza exclusivamente `conversationStore.setConnectorContext(CONTEXT_SLOT, ...)` com `CONTEXT_SLOT = "runtime-context-layer"`.

**Nenhum outro componente novo deve acessar ConversationStore diretamente.**

---

# 12. CONVERSATIONPIPELINE v2

## 12.1 Visão Geral

**Arquivo:** `src/lib/conversation-platform/ConversationPipeline.ts`

**Versão:** v2 (Execution Outcome Architecture)

**Estágios:**
```
Prepare → Persist → Reason → Route → Capabilities → Synthesize → Stream → Finalize
```

## 12.2 Mudanças v1 → v2

| v1 | v2 |
|---|---|
| if/else manual de prioridade de resposta | Todos candidatos → ResponseArbiter |
| Short-circuit manual para cognitive gateway | Candidate pool igual para todos produtores |
| Precedência manual hardcoded | ResponseArbiter.arbitrate() é a ÚNICA autoridade |
| Pipeline como decision maker | Pipeline como puro orchestrador |

## 12.3 Produtores de Candidatos

**PRODUCER A — Cognitive Gateway:**
```typescript
executionOutcomeAdapterFactory.fromInput({
  producer: "cognitive_gateway",
  hint: { synthesizedAnswer: ca.answer }
})
```

**PRODUCER B — Connector Runtime:**
```typescript
executionOutcomeAdapterFactory.fromConnectorSuccess({
  producer: "connector_runtime",
  domain: connectorDomain,
  capability: goalType,
  synthesizedAnswer: synthesis.response
})
```

**PRODUCER C — LLM Reasoning (fallback):**
```typescript
executionOutcomeAdapterFactory.fromLLMReasoning({
  answer: plan.response,
  confidence: 0.7
})
```

O LLM só executa quando `!hasHighConfidenceCandidate` (nenhum candidato com `confidence >= 0.7`).

## 12.4 ConnectorResultSynthesizer

**Arquivo:** `src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts`

**EF-44 — Verified Execution Layer:**

Implementado para evitar que o sistema confabule sucesso a partir de erros:

```typescript
// Detecta steps que completaram mas retornaram apenas erros
const completedSteps = result.steps.filter((s) => {
  if (s.status !== "completed" || s.output === null) return false;
  const out = s.output as Record<string, unknown>;
  const keys = Object.keys(out);
  // Se TODOS os campos são error-like → rejeita como falha
  const isErrorOnly = keys.length > 0 && keys.every(k =>
    ["error", "message", "code", "status", "reason"].includes(k.toLowerCase())
  );
  if (isErrorOnly) return false;
  return true;
});
```

**Se completedSteps.length === 0 após filtro:**
- Extrai mensagem de erro do output da step
- Traduz para mensagem amigável em português
- Retorna `handled: true, response: mensagem de erro`
- Nunca passa para o LLM com dados inválidos

## 12.5 Contexto de Execução

```typescript
const _pipelineConnCtx = Object.freeze({
  userId:      _pipelineUserId,        // de base44.auth.me()
  workspaceId: getActiveWorkspaceId(), // → "default" (CORRIGIDO 2026-07-22)
  sessionId:   session.id,
  goalId:      goalBridgeResult.goal.id,
  origin:      "pipeline",
});
```

---

# 13. CERTIFICAÇÕES

## EF-39 — Memory Store

**Objetivo:** Implementação e certificação do Memory Store oficial.  
**Arquivo principal:** `src/lib/knowledge-store/memory/MemoryStore.ts`  
**Status:** Done

Subsprints:
- EF-39.3: Certification do EF-39
- EF-39.8: Drive Debug Panel (`src/pages/DriveDebugPanel.jsx`)
- EF-39.9: EF-399 Validation

---

## EF-40 — Shadow Mode Architecture

**Objetivo:** Implementar UCME Shadow Mode para diagnóstico paralelo sem impacto na resposta do usuário.

**Arquitetura Shadow Mode:**
```
Pipeline recebe resposta legacy normalmente
  ↓
UCME executa EM PARALELO (fire-and-forget, void)
  → runMemoryPipeline()
  → detectSkills()
  → detectGoal()
  → MemoryContextProviderFactory.execute()
  ↓ (nunca bloqueia, nunca afeta resposta)
Relatórios de diagnóstico gerados em background
```

**Arquivo:** `src/lib/memory-context/MemoryContextProviderFactory.ts`

**EF-40.6 — UCME Shadow Mode:**
```typescript
if (MemoryContextProviderFactory.getMode() === "SHADOW") {
  void (async () => {
    try {
      // ... execução shadow sem await
    } catch { /* shadow nunca bloqueia nunca */ }
  })();
}
```

Subsprints:
- EF-40.1: Component Origin Audit
- EF-40.2: Official Library Flow
- EF-40.3: EOA Certification
- EF-40.4 a 40.5: SprintEF403-404
- EF-40.6: UCME Shadow Mode
- EF-40.7 / 40.7a: SprintEF407/407a
- EF-40.8 / 40.8B: SprintEF408/408B

---

## EF-41 — Unified Execution Result Set (UERS)

**Objetivo:** Armazenar o conjunto completo de outputs de connectors para resolução de referências ordinais ("o primeiro", "o próximo").

**Problema resolvido:** Sem o ResultSet, "abra o segundo" não tinha como saber qual era o segundo item.

**Componentes:**
- `ExecutionResultSet` — tipo imutável com items navegáveis
- `ExecutionResultSetBuilder` — constrói ResultSet a partir de outputs brutos
- `RuntimeContextLayer.setResultSet()` — persiste
- `RuntimeContextLayer.getResultSet()` — recupera
- `resolveOrdinalIndex()` — resolve ordinais para índices
- `getSelectedItem()` — retorna item selecionado

**Fluxo:**
```
ConnectorResultSynthesizer recebe connectorData
  ↓
executionResultSetBuilder.build(connectorData)
  ↓ (via globalThis singleton)
runtimeContextLayer.setResultSet(resultSet)
  ↓
[usuário: "abra o primeiro"]
  ↓
ExecutionIntentManager.consume()
  ↓
resolveOrdinalIndex(resultSet, "abra o primeiro") → index 0
  ↓
getSelectedItem(resultSet) → { displayName: "repo-1", reference: {...} }
  ↓
artifact.owner = reference.owner
artifact.repo = reference.name
```

---

## EF-42 — Runtime Introspection Framework (RIF)

**Objetivo:** Responder perguntas sobre o estado interno do Runtime sem usar Connector, LLM ou Planner.

**Arquivo:** `src/lib/runtime-introspection/RuntimeIntrospectionRouter.ts`

**Problema resolvido:** Perguntas como "o GitHub está conectado?" eram roteadas para o LLM que confabulava respostas sem consultar o estado real.

**Como funciona:**
```
Mensagem: "o GitHub está conectado?"
  ↓
RuntimeIntrospectionRouter.intercept(message)
  → detecta query de status de runtime
  → consulta ConversationStore/RuntimeContextLayer
  → retorna resposta baseada em dados reais
  ↓ (sem LLM, sem Connector, sem Planner)
ResponseCandidate com resposta real
```

**Capabilities de runtime:**
- `runtime.connector.status` — status de connector específico
- `runtime.connector.list` — lista conectores disponíveis
- `runtime.context.dump` — estado atual do runtime

**EF-43B — RuntimeContext como fonte única de verdade:**
- Toda consulta de status operacional deve passar pelo RuntimeContext
- Conectores nunca são consultados apenas para verificar estado
- LLM nunca infere status de conectores

---

## EF-43 — Standardized ESM-compatible Imports

**Objetivo:** Eliminar `require()` em ambiente ESM que causava TDZ (Temporal Dead Zone) errors.

**Problema:** `require()` em módulos ESM (Vite/Deno) causa `ReferenceError` em runtime.

**Solução:** Substituição de todos os `require()` por imports estáticos ou `await import()`.

**Subsprints:**

### EF-43A — RuntimeContext globalThis Singleton
**Problema:** `ExecutionIntentManager.consume()` não conseguia acessar `RuntimeContextLayer` sem importação circular.  
**Solução:** Acesso via `(globalThis as any)["__RUNTIME_CONTEXT_LAYER__"]` — bypassa importação estática.

### EF-43B — RuntimeContext como Fonte de Verdade
**Problema:** Duas fontes de verdade: LLM inferia status de conectores (incorreto) vs RuntimeContext (correto).  
**Solução:** Adicionado `runtime.connector.status` capability que lê diretamente do `ConversationStore`.

### EF-43C — ExecutionResultSet Preservation Fix

**Problema:** `currentResultSet` sempre null após execução de connector.

**Root Cause:** `runtimeContextLayer.update()` — chamado pelo Pipeline **depois** da síntese — sobrescrevia o estado com `currentResultSet: null`, destruindo o ResultSet salvo pelo Synthesizer.

**Sequência do bug:**
```
1. ConnectorResultSynthesizer.synthesize()
   → executionResultSetBuilder.build(connectorData)
   → runtimeContextLayer.setResultSet(resultSet)  ← salva
   → retorna synthesis.connectorData

2. ConversationPipeline (após síntese):
   → runtimeContextLayer.update({...})
   → cria next = {..., currentResultSet: null}  ← SOBRESCREVE!
   → persiste
```

**Fix:**
```typescript
// EF-43C: preserve the ResultSet already written by ConnectorResultSynthesizer
const existingState = this.get();
const preservedRS = existingState.currentResultSet; // ← lê antes
const next: RuntimeContextState = {
  ...
  currentResultSet: preservedRS, // ← preserva!
  ...
};
```

---

## EF-44 — Verified Execution Layer

**Objetivo:** Garantir que respostas reflitam com precisão o sucesso ou falha das operações subjacentes. Proibir confabulação de sucesso a partir de erros.

**Problema:** O sistema respondia "Encontrei o arquivo" ou "Li todos os arquivos" mesmo quando o conector retornava `{ error: "requires workspaceId" }`.

**Root Cause dual:**
1. `ConnectorResultSynthesizer` não filtrava outputs que eram apenas erros
2. O workspaceId incorreto (`"default-workspace"`) causava `NOT_CONFIGURED` que era tratado incorretamente

**Implementação em `ConnectorResultSynthesizer.ts`:**

**1. Filtragem de steps com erro:**
```typescript
const completedSteps = result.steps.filter((s) => {
  if (s.status !== "completed" || s.output === null) return false;
  const out = s.output as Record<string, unknown>;
  const keys = Object.keys(out);
  const isErrorOnly = keys.every(k =>
    ["error", "message", "code", "status", "reason"].includes(k.toLowerCase())
  );
  if (isErrorOnly) return false;
  return true;
});
```

**2. Extração e tradução de erros embeddados:**
```typescript
function _buildErrorResponseFromMessage(errorMsg: string): string {
  const e = errorMsg.toLowerCase();
  if (e.includes("workspaceid") || e.includes("workspace_id")) {
    return "Nao foi possivel acessar o arquivo: configuracao de workspace ausente...";
  }
  // ... outros casos
}
```

**3. Prompt LLM reforçado:**
```
REGRAS OBRIGATORIAS (EF-44 — Verified Execution Layer):
- NUNCA afirmar que encontrou, leu, baixou ou acessou dados se os dados
  estiverem vazios, forem uma mensagem de erro, ou não contiverem informações reais.
- Se o output contiver apenas campos "error", "message" ou "reason" →
  reportar o problema claramente ao usuário.
- NUNCA inventar ou inferir dados não presentes no JSON.
```

---

# 14. DÍVIDAS TÉCNICAS

## DT-01 — Duplicação de ConnectorRegistry (5 implementações)

**Origem:** Crescimento orgânico sem canonical declarado  
**Impacto:** Alto — desenvolvedores podem usar implementação errada  
**Prioridade:** Alta  
**Recomendação:** ADR-005 Alternativa D — declarar canonical temporário + EF-16 futuro

---

## DT-02 — Memory Engine Legado (47 arquivos JS)

**Origem:** Implementação pré-EF que nunca foi integrada ao produto  
**Impacto:** Médio — bundle desnecessário + confusão semântica  
**Prioridade:** Média  
**Recomendação:** ADR-006 — Deprecar Fase 1 imediatamente

---

## DT-03 — Goal Runtime v0.1 (21 cenários, precisa de 28)

**Origem:** Implementado antes do padrão EF formal  
**Impacto:** Médio — fundação sub-certificada para 4 módulos downstream  
**Prioridade:** Alta  
**Recomendação:** ADR-002 — Promover para v1.0 antes de INT-03

---

## DT-04 — Intent Layer ainda usa LLM

**Origem:** Implementação pré-EF em `memoryPipeline.js`  
**Impacto:** Alto — latência + custo não-determinístico  
**Prioridade:** Alta  
**Recomendação:** ADR-001 — Implementar EF-22 Determinístico

---

## DT-05 — Semântica dupla de "plan"

**Origem:** Dois objetos com nome `plan` e semânticas incompatíveis  
**Impacto:** Alto — risco de confusão em INT-03  
**Prioridade:** Alta  
**Recomendação:** ADR-003 — Renomear analytics para `executionMetrics`

---

## DT-06 — Capability Runtime usa Registry interno em vez de EF-14

**Origem:** Implementação isolada antes da consolidação de registries  
**Impacto:** Alto — triplicação de Capability Registry  
**Prioridade:** Alta  
**Recomendação:** ADR-004 — Auditar + substituir pelo EF-14 oficial

---

## DT-07 — ConversationStore acesso direto por múltiplos componentes

**Origem:** Crescimento orgânico antes do RuntimeContextLayer  
**Impacto:** Médio — estado distribuído sem fonte única de verdade  
**Prioridade:** Média  
**Recomendação:** Migrar gradualmente para RuntimeContextLayer como única interface

---

## DT-08 — Two classes `ConnectorRegistry` com mesmo nome em paths diferentes

**Origem:** Identificado na Auditoria EOA 2026-07-21  
**Arquivos:**  
- `src/lib/connector-router/ConnectorRegistry.ts`  
- `src/lib/connector-runtime/ConnectorRegistry.ts`  
**Impacto:** Médio — risco de importação incorreta  
**Prioridade:** Baixa  
**Recomendação:** Renomear uma das duas (ex: `UCRConnectorRegistry`)

---

## DT-09 — workspaceId multi-workspace não implementado

**Origem:** ACTIVE_WORKSPACE_ID é fixo em "default"  
**Impacto:** Baixo hoje — bloqueante para multi-workspace real  
**Prioridade:** Baixa (fora do escopo atual)  
**Recomendação:** Documentar como limitação conhecida; não resolver agora

---

# 15. INVENTÁRIO DE CÓDIGO

## 15.1 src/lib/ — Diretórios Principais

| Diretório | Classificação | Responsabilidade |
|---|---|---|
| `reasoning/` | Legado | Utilitários pré-EF: goalDetector, contextBuilder, capabilityOrchestrator, memorySynthesizer, memoryReasoningPlanner |
| `memory-engine/` | Legado/Obsoleto | 47 arquivos JS — não usado pelo produto |
| `memory-engine-v1/` | Oficial (EF-12) | Memory Engine oficial certificado (28 cenários) |
| `goal-runtime-v01/` | Oficial v0.1 | Goal Runtime (21 cenários — promoção pendente) |
| `planning-engine/` | Oficial (EF-07) | Planning Engine |
| `decision-engine/` | Oficial (EF-06) | Decision Engine |
| `reflection-engine/` | Oficial (EF-08) | Reflection Engine |
| `self-evaluation-engine/` | Oficial (EF-09) | Self Evaluation Engine |
| `knowledge-engine/` | Oficial (EF-10) | Knowledge Engine |
| `learning-engine/` | Oficial (EF-11) | Learning Engine |
| `retrieval-engine/` | Oficial (EF-13) | Retrieval Engine |
| `capability-registry/` | Oficial (EF-14) | Capability Registry — canonical |
| `goal-registry-service/` | Oficial (EF-02) | Goal Registry Service |
| `goal-scheduler/` | Oficial (EF-03) | Goal Scheduler |
| `goal-execution-queue/` | Oficial (EF-04) | Goal Execution Queue |
| `execution-dispatcher/` | Oficial (EF-05) | Execution Dispatcher |
| `connector-runtime/connectors/` | Oficial/Adapter | Connectors: GoogleDrive, Gmail, Calendar, GitHub, Base44 |
| `google-drive/` | Foundation | GWS Foundation para Drive |
| `gmail/` | Foundation | Gmail Foundation |
| `google-calendar/` | Foundation | Calendar Foundation |
| `connector-runtime-provider/` | Oficial | ConnectorRuntimeProvider + ConnectorResultSynthesizer |
| `runtime-context/` | Experimental | RuntimeContextLayer (reversível) |
| `execution-intent/` | Experimental | ExecutionIntent (reversível) |
| `execution-result-set/` | Oficial (EF-41) | ExecutionResultSet + Builder |
| `response-arbiter/` | Oficial (EOA) | ResponseArbiter + ExecutionOutcome architecture |
| `conversation-platform/` | Oficial | ConversationPipeline v2 + Store + Streaming + Persistence |
| `planning-engine-e022/` | Oficial | ConversationPlanningEngine (produção) |
| `conversation-goal-bridge/` | Oficial | ConversationGoalBridge |
| `primary-conversation-router/` | Oficial | PrimaryConversationRouter |
| `runtime-engine/` | Oficial | ConversationRuntimeEngine |
| `runtime-introspection/` | Experimental (EF-42) | RuntimeIntrospectionRouter (reversível) |
| `knowledge-fusion-engine/` | Oficial (Sprint 8.12) | KnowledgeFusionEngine |
| `unified-context/` | Oficial (Sprint 8.11) | UnifiedContextBuilder |
| `audit/` | Diagnóstico | DriveAuditStore (AUDIT_MODE flag) |
| `runtime-trace/` | Observabilidade | RuntimeTraceStore |
| `ef492/` | Diagnóstico | RuntimePipelineInstrument |
| `workspace/` | Core | WorkspaceContext.js — fonte do workspaceId |
| `connectors/registry.js` | Canonical temp. | Connector Registry (ADR-005) |

## 15.2 src/pages/ — Páginas de Certificação

| Página | Rota | Propósito |
|---|---|---|
| `SprintEF43CPage.jsx` | `/sprint-ef43c` | Documentação do fix EF-43C |
| `SprintEF44Page.jsx` | `/sprint-ef44` | Documentação do fix EF-44 |
| `EOACertificationPage.jsx` | `/eoa-certification` | 38 testes EOA |
| `SprintMVP01Page.jsx` | `/sprint-mvp01` | MVP Certification |
| `SprintEPICDPage.jsx` | `/sprint-epic-d` | EPIC-D Observability |
| `DriveDebugPanel.jsx` | `/drive-debug` | Debug Drive connector |
| `DriveAuditPanel.jsx` | `/drive-audit` | Auditoria Drive |
| `GitHubDebugPanel.jsx` | `/github-debug` | Debug GitHub connector |
| `RuntimeTracePage.jsx` | `/runtime-trace` | Runtime Trace |
| `SprintM19AuditPage.jsx` | `/sprint-m19-audit` | M1.9 Audit |
| `SprintM110AuditPage.jsx` | `/sprint-m110-audit` | M1.10 Audit |
| `TokenLifecycleTestPage.jsx` | `/token-lifecycle-tests` | Token lifecycle |

---

# 16. LINHA DO TEMPO

## 2026-07-09
- Foundation: 14 módulos EF certificados (329 cenários)
- Arquitetura v0.1 estabelecida

## 2026-07-10
- **Foundation v1.0.0 declarada como Frozen Baseline**
- MV, MPS, MAS, MES, MCF, MCIS, MGIS, MDS aprovados
- MRI v1.0 com 25 testes automatizados
- MQCCS + MPEGS operacionais
- Sprint INT-01: CognitivePipelineAdapter scaffold

## 2026-07-11
- Sprint ARC-01: Estratégia de unificação documentada
- Sprint ARC-02: Validação arquitetural + risk register
- Sprint SPR-ADR-01: 7 ADRs formais produzidas (ADR-001 a ADR-007)
- Sprint SPR-FREEZE-01: **Architecture Freeze v2.0**
- Decision Log: 7 DAPs aguardando aprovação humana

## 2026-07-11 a 2026-07-20
- Desenvolvimento das Sprints Phase600, Phase700
- Google Workspace integration (Drive, Gmail, Calendar)
- GitHub integration
- Sprint 8.11: UnifiedContextBuilder
- Sprint 8.12: KnowledgeFusionEngine
- Sprints EF-39, EF-40, EF-40.x

## 2026-07-21
- **Auditoria Execution Outcome Architecture — APPROVED WITH RECOMMENDATIONS**
- ConversationPipeline v2 com EOA integrado
- Sprints EF-41, EF-41A, EF-42, EF-43, EF-43A, EF-43B, EF-43C, EF-44
- MVP-01 e EPIC-D certificados

## 2026-07-22
- **Correção crítica do workspaceId** em `ConversationPipeline.ts`
- `session.project_id ?? "default-workspace"` → `getActiveWorkspaceId()`
- Diagnóstico completo: portão de autenticação em `GoogleDriveConnector.execute()` (linhas ~205-249) retornava `NOT_CONFIGURED` antes de qualquer `_dispatch()`
- Drive.files.list, drive.files.search, drive.downloadFile operacionais

---

# APÊNDICE A — Dead Ends Confirmados (Não Retry)

Os seguintes experimentos foram tentados e falharam — **não retry**:

1. **Caracteres acentuados em TypeScript literals** → syntax errors no build, rollback para ASCII puro
2. **`?raw` imports Vite para Markdown** → falha, sem plugin configurado
3. **WorkingMemoryEngine como singleton estático** → TDZ/boot errors, migrado para lazy async factories
4. **Manual boundary tracking em listas** → drift insustentável, substituído por SourceCodeAnalyzer
5. **Patches arquiteturais automáticos** → muito arriscado, ABV refatorado para strictly read-only
6. **`drive.files.get` direto do Planner** → falha sem contextual file resolution
7. **Delimitadores complexos em TypeScript** → parsing errors
8. **Connector validation simulada (NC-02)** → refatorado para checks explícitos
9. **`getLastReport()` para IDs de reflexão (NC-04)** → refatorado para IDs de Runtime snapshots
10. **STAGE_META/OWNER/CONTRACTS no RuntimeTrace** → regras arquiteturais não pertencem à infra de observação
11. **Mixed logical operators `?? com ||` sem parênteses** → falha TypeScript
12. **executionIds independentes dentro do RuntimeEngine** → perda de correlação, rollback
13. **Signal collision GoalRegistry: drive.openDocument vs github.getFile** → roteamento incorreto
14. **GitHubSemanticProvider** → ambiguidade para queries genéricas
15. **GitHub Code Search API para repos privados** → 0 resultados por latência de índice
16. **Implicit Intent Reinterpretation** → perda de contexto, substituído por ExecutionIntent tracking
17. **GoalBridge matchBySignals vs RuntimeContextLayer continuity** → corrigido priorizando RuntimeContextLayer
18. **resultPaths como lista genérica em CurrentArtifact** → fragmentação, substituído por ExecutionResultSet
19. **`require()` em ambiente ESM** → ReferenceError, substituído por imports estáticos
20. **Mistura ESM import estático com CommonJS require() em dependências circulares** → TDZ, singletons via globalThis

---

# APÊNDICE B — Arquivos Críticos

| Arquivo | Papel |
|---|---|
| `src/lib/conversation-platform/ConversationPipeline.ts` | Orquestrador principal |
| `src/lib/connector-runtime/connectors/GoogleDriveConnector.ts` | Drive Adapter (portão auth) |
| `src/lib/google-drive/GoogleDriveConnector.ts` | Drive Foundation |
| `src/lib/connector-runtime-provider/ConnectorResultSynthesizer.ts` | EF-44 Verified Execution |
| `src/lib/runtime-context/RuntimeContextLayer.ts` | Estado operacional central |
| `src/lib/execution-intent/ExecutionIntent.ts` | Continuidade de execução |
| `src/lib/execution-result-set/ExecutionResultSet.ts` | Resultados navegáveis (EF-41) |
| `src/lib/execution-result-set/ExecutionResultSetBuilder.ts` | Construção do ResultSet |
| `src/lib/response-arbiter/ResponseArbiter.ts` | Árbitro determinístico |
| `src/lib/response-arbiter/ExecutionOutcomeAdapterFactory.ts` | Factory principal EOA |
| `src/lib/workspace/WorkspaceContext.js` | Fonte do workspaceId |
| `src/lib/planning-engine-e022/ConversationPlanningEngine.ts` | Planner produção |
| `src/lib/conversation-goal-bridge/ConversationGoalBridge.ts` | Goal derivation |
| `src/lib/primary-conversation-router/PrimaryConversationRouter.ts` | Router primário |

---

*Documento gerado em 2026-07-22 | MemoryOS — Documentação Completa e Oficial v1.0*
*Fonte: Auditoria completa de todos os arquivos de documentação, ADRs, histórico de sprints e código-fonte do projeto.*