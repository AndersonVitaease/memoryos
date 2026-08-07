# MEMORY-SCHEMA.md
# MemoryOS — Schema Oficial de Memory
**Sprint SPR-GOV-01 · Engineering First**
Date: 2026-07-11
Version: 1.0
Status: OFFICIAL · FROZEN

---

## Schema Completo

```typescript
// Memory é completamente imutável após criação.
// Object.freeze() é aplicado pelo Memory Engine.
// Nenhum campo pode ser alterado após store().

interface Memory {
  // ── Identidade (imutável) ────────────────────────────────────────────
  readonly id: string                     // UUID v4, gerado pelo Memory Engine
  readonly createdAt: string              // ISO8601 UTC

  // ── Proveniência (imutável) ──────────────────────────────────────────
  readonly sourceLearningId: string       // ID do Learning que gerou esta Memory
  readonly sourceKnowledgeId: string      // ID do Knowledge (via Learning)
  readonly sourceEvaluationId: string     // ID do SelfEvaluation (via Knowledge)
  readonly pipelineIntegrity: string      // hash SHA-256 da cadeia de proveniência

  // ── Classificação (mirror de Learning — imutável) ────────────────────
  readonly memoryType: MemoryType         // espelho de Learning.learningType
  readonly memoryScore: number            // espelho de Learning.learningScore (>= 70)
  readonly importance: MemoryImportance   // espelho de Learning.importance
  readonly confidence: number             // espelho de Learning.confidence (0.0-1.0)

  // ── Conteúdo (transformado de Learning — imutável) ───────────────────
  readonly content: string                // conteúdo principal da memória
  readonly summary: string                // resumo em 1-2 frases
  readonly evidence: MemoryEvidence       // evidências estruturadas

  // ── Indexação ────────────────────────────────────────────────────────
  readonly tags: string[]                 // tags para recuperação
  readonly keywords: string[]             // palavras-chave para busca full-text
  readonly domain: string                 // domínio semântico (ex: "technical", "personal")

  // ── Relacionamentos ──────────────────────────────────────────────────
  readonly relations: MemoryRelation[]    // relações com outras Memories (v1.0: empty)
  readonly dependencies: string[]         // IDs de Memories das quais esta depende (v1.0: empty)
  readonly conflicts: string[]            // IDs de Memories conflitantes (v1.0: empty)

  // ── Ciclo de Vida ─────────────────────────────────────────────────────
  readonly status: MemoryStatus           // ACTIVE | ARCHIVED
  readonly archivedAt?: string            // preenchido quando ARCHIVED
  readonly archivedReason?: string        // motivo do arquivamento

  // ── Ownership ────────────────────────────────────────────────────────
  readonly userId: string                 // usuário dono da memória
  readonly projectId?: string             // escopo de projeto (opcional)
  readonly sessionId?: string             // sessão de origem

  // ── Versionamento ────────────────────────────────────────────────────
  readonly memoryVersion: string          // versão do Memory Engine que criou
  readonly architectureVersion: string    // versão da arquitetura (ex: "2.0")
  readonly schemaVersion: number          // versão deste schema (ex: 1)

  // ── Forward-Compatibility (v1.0: null — reservados para Sprint 24+) ──
  readonly memoryFingerprint: null        // Sprint 24: fingerprint semântico
  readonly memoryEmbedding: null          // Sprint 24: vetor de embedding
  readonly memoryVector: null             // Sprint 24: vetor normalizado
  readonly memoryCluster: null            // Sprint 24: cluster semântico
  readonly memoryRelations: null          // Sprint 24: relações semânticas
  readonly memoryOpportunities: null      // Sprint 24: oportunidades de conexão
  readonly futureCapabilities: null       // Sprint 24+: capabilities futuras
  readonly futureConnectors: null         // Sprint 24+: connectors futuros
}
```

---

## Tipos de Memória

```typescript
type MemoryType =
  | "LESSON"          // lição aprendida
  | "BEST_PRACTICE"   // melhor prática identificada
  | "WARNING"         // alerta ou antipadrão
  | "RULE"            // regra de negócio ou técnica
  | "PATTERN"         // padrão identificado
  | "ANTI_PATTERN"    // antipadrão identificado
  | "OBSERVATION"     // observação relevante

type MemoryImportance = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

type MemoryStatus = "ACTIVE" | "ARCHIVED"
```

---

## MemoryEvidence

```typescript
interface MemoryEvidence {
  readonly insights: string[]             // insights diretos (transformados de Learning)
  readonly patterns: string[]             // padrões observados
  readonly recommendations: string[]      // recomendações acionáveis
  readonly sourceQuotes?: string[]        // citações do conteúdo original (v1.0: optional)
}
```

---

## MemoryRelation

```typescript
interface MemoryRelation {
  readonly targetMemoryId: string
  readonly relationType: "supports"|"contradicts"|"extends"|"specializes"|"references"
  readonly strength: number               // 0.0-1.0
  readonly createdAt: string
}
// Nota: relations[] está vazio em v1.0. Populado na Sprint 24+.
```

---

## Memory Gate — Regras de Admissão

```
Learning → Memory Engine → Memory Gate Check
                               │
         ┌─────────────────────┴──────────────────────┐
         │                                             │
   Gate PASSA                                   Gate FALHA
(learningScore >= 70 AND status == "ACTIVE")   (caso contrário)
         │                                             │
         ▼                                             ▼
   Memory CRIADA                              Memory REJEITADA
   (status: ACTIVE)                     (event: memory.rejected.v1)
```

**Threshold:** `learningScore >= 70` (configurável via ADR futura, não hardcoded no contrato).
**Status check:** `Learning.status == "ACTIVE"` é obrigatório. Learnings ARCHIVED ou SUPERSEDED não geram Memory.

---

## Mirror Principle

Memory espelha scores de Learning sem recalculação:

| Campo Memory | Origem | Transformação |
|---|---|---|
| `memoryType` | `Learning.learningType` | mirror direto |
| `memoryScore` | `Learning.learningScore` | mirror direto |
| `importance` | `Learning.importance` | mirror direto |
| `confidence` | `Learning.confidence` | mirror direto |
| `evidence.insights` | `Learning.insights` | transform (array) |
| `evidence.patterns` | `Learning.patterns` | transform (array) |
| `evidence.recommendations` | `Learning.recommendations` | transform (array) |
| `content` | `Learning.pattern` | mirror/extend |
| `tags` | `Learning.applications` | transform (tags) |

---

## Imutabilidade Total

| Operação | Permitida? |
|---|---|
| `Memory.create()` | ✅ Sim — somente pelo Memory Engine |
| `Memory.read()` | ✅ Sim — pelo Retrieval Engine |
| `Memory.update()` | ❌ Nunca — violação da Constituição (M-02) |
| `Memory.delete()` | ❌ Nunca — use archive() |
| `Memory.archive()` | ✅ Sim — transição explícita com auditoria |

---

## Estratégia de Indexação

### v1.0 (atual)

| Índice | Campo | Tipo | Uso |
|---|---|---|---|
| `idx_memory_user` | `userId` | B-Tree | Filtrar memórias por usuário |
| `idx_memory_project` | `projectId` | B-Tree | Filtrar por projeto |
| `idx_memory_type` | `memoryType` | B-Tree | Filtrar por tipo |
| `idx_memory_importance` | `importance` | B-Tree | Ordenar por importância |
| `idx_memory_score` | `memoryScore` | B-Tree | Ordenar por score |
| `idx_memory_created` | `createdAt` | B-Tree | Ordenar cronológico |
| `idx_memory_tags` | `tags` | GIN/Array | Busca por tags |
| `idx_memory_keywords` | `keywords` | GIN/FullText | Busca full-text |

### v2.0 (Sprint 24+ — forward-compat fields)

| Campo reservado | Uso futuro | Sprint |
|---|---|---|
| `memoryEmbedding` | Vetor semântico para ANN search | 24 |
| `memoryVector` | Vetor normalizado para similaridade | 24 |
| `memoryCluster` | Cluster semântico para grouping | 24 |
| `memoryFingerprint` | Hash semântico para deduplicação | 24 |

---

## TTL (Time To Live)

Memory não tem TTL por padrão (Constituição M-08). Estratégias de lifecycle:

| Estratégia | Acionador | Ação |
|---|---|---|
| **Sem TTL** | — | Memory permanece ACTIVE indefinidamente |
| **Arquivamento Manual** | Chamada explícita a `archive()` | Status → ARCHIVED |
| **Arquivamento por Projeto** | Projeto arquivado | Todas as Memories do projeto → ARCHIVED |
| **Supersedição** | Nova Memory com mesma semântica | Memory antiga pode ser ARCHIVED com `archivedReason: "superseded"` |

---

## Ownership e Controle de Acesso

| Nível | Acesso |
|---|---|
| **userId** | Acessa apenas suas próprias Memories |
| **projectId** | Acessa Memories do projeto (se membro) |
| **system** | Acesso read-only para módulos cognitivos via EF-13 |
| **admin** | Acesso total para auditoria |

---

## Validation Rules

| Campo | Regra |
|---|---|
| `id` | UUID v4, único |
| `sourceLearningId` | Deve existir no Learning store |
| `memoryScore` | >= 70 (enforced pelo Memory Gate) |
| `confidence` | 0.0-1.0 |
| `memoryType` | Um dos valores MemoryType válidos |
| `importance` | Um dos valores MemoryImportance válidos |
| `content` | non-empty, max 10.000 chars |
| `summary` | non-empty, max 500 chars |
| `tags` | máximo 30 tags, cada tag max 50 chars |
| `keywords` | máximo 50 keywords |
| `pipelineIntegrity` | SHA-256 hex string, 64 chars |
| `schemaVersion` | número inteiro > 0 |
| `status` | "ACTIVE" ou "ARCHIVED" |

---

## Histórico de Versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 2026-07-11 | Criação — SPR-GOV-01 |

## Referências

- DOMAIN-MODEL.md
- OFFICIAL-CONTRACTS.md — EF-12, EF-13
- STATE-MACHINES.md — Memory State Machine
- MEMORYOS-CONSTITUTION.md — Artigo II

---

*SPR-GOV-01 · 2026-07-11 · MemoryOS Architecture v2.0 · OFFICIAL · FROZEN*