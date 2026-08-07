# MDS v1.5 — Knowledge Architecture — Arquitetura Definitiva do Conhecimento

**Versão:** 1.5  
**Status:** Revisão Oficial — Adenda ao MDS v1.4  
**Data:** 2026-07-09  
**Tipo:** Arquitetura Definitiva do Domínio de Conhecimento  
**Alinhamento:** MAS 1.0 · MCF 1.0 · MCIS 1.0 · MGIS 1.0 · MDS 1.0 · v1.1 · v1.2 · v1.3 · v1.4

---

## Declaração de Revisão

Esta revisão estabelece o **modelo semântico unificado de conhecimento** do MemoryOS. Todo conhecimento aprendido, importado, inferido, publicado ou utilizado passa a ser representado por um grafo semântico estruturado em ontologias, relacionamentos, domínios e inferências.

**Não remove** nenhuma seção. **Não altera** nenhuma decisão anterior. **Apenas complementa.**

---

# REVISÃO 1 — KNOWLEDGE ARCHITECTURE

---

## 1.1 Visão Geral

```
┌──────────────────────────────────────────────────────────────────────────────┐
│               KNOWLEDGE ARCHITECTURE — MDS v1.5                             │
└──────────────────────────────────────────────────────────────────────────────┘

CONSUMIDORES DO CONHECIMENTO
  Memory   Learning   Planner  GoalEngine  CapabilityIntel  Marketplace  Specialists
    │          │          │        │               │               │           │
    └──────────┴──────────┴────────┴───────────────┴───────────────┴───────────┘
                                   │  Knowledge API
                          ┌────────▼────────┐
                          │  KnowledgeGraph │  ← grafo semântico central
                          │     Engine      │
                          └────────┬────────┘
              ┌────────────────────┼──────────────────┐
              ▼                    ▼                  ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │   Ontology       │  │  Relationship    │  │  Domain Knowledge│
   │   Engine         │  │  Engine          │  │  Engine          │
   └──────────────────┘  └──────────────────┘  └──────────────────┘
              │                    │                  │
              └────────────────────┼──────────────────┘
                                   │
              ┌────────────────────┼──────────────────┐
              ▼                    ▼                  ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  Knowledge       │  │  Semantic Search │  │  Knowledge       │
   │  Reasoning Eng.  │  │  Engine          │  │  Federation Eng. │
   └──────────────────┘  └──────────────────┘  └──────────────────┘
              │
   ┌──────────┴──────────┐
   ▼                     ▼
┌──────────────┐  ┌──────────────────┐
│  Knowledge   │  │  Knowledge       │
│  Quality Eng.│  │  Governance Eng. │
└──────────────┘  └──────────────────┘
```

## 1.2 Modelo Unificado de Conhecimento

```typescript
// packages/core/knowledge/knowledge-model.ts

export interface KnowledgeNode {
  nodeId:          string;             // "kn:uuid"
  identity:        KnowledgeIdentity;
  content:         KnowledgeContent;
  ontology:        KnowledgeOntology;
  relationships:   KnowledgeRelationship[];
  provenance:      KnowledgeProvenance;
  governance:      KnowledgeGovernance;
  quality:         KnowledgeQuality;
  lifecycle:       KnowledgeLifecycle;
  metadata:        KnowledgeMetadata;
}

export interface KnowledgeIdentity {
  nodeId:          string;
  canonicalName:   string;             // nome canônico único
  aliases:         string[];           // sinônimos e nomes alternativos
  fingerprint:     string;             // hash SHA-256 do conteúdo canônico
  globalId:        string;             // ID estável entre versões
  version:         string;             // semver
  previousId?:     string;             // nodeId da versão anterior
}

export interface KnowledgeContent {
  type:            KnowledgeNodeType;
  domain:          string;             // "FINANCE.TAX", "HEALTH.SYMPTOMS"
  value:           unknown;
  summary:         string;             // resumo em linguagem natural
  embedding?:      number[];           // vetor semântico (gerado assincronamente)
  language:        string;             // "pt-BR", "en-US"
}

export enum KnowledgeNodeType {
  CONCEPT      = "CONCEPT",          // conceito abstrato
  ENTITY       = "ENTITY",           // entidade concreta (pessoa, empresa)
  FACT         = "FACT",             // fato verificável
  RULE         = "RULE",             // regra ou política
  PROCESS      = "PROCESS",          // processo ou workflow
  EVENT        = "EVENT",            // evento que ocorreu
  PREFERENCE   = "PREFERENCE",       // preferência de usuário/org
  HABIT        = "HABIT",            // hábito comportamental
  PREDICTION   = "PREDICTION",       // predição inferida
  INFERENCE    = "INFERENCE",        // inferência lógica
  HYPOTHESIS   = "HYPOTHESIS",       // hipótese não confirmada
  OBSERVATION  = "OBSERVATION",      // observação bruta
}

export interface KnowledgeOntology {
  class:           string;             // classe ontológica principal
  superClasses:    string[];           // hierarquia de herança
  subClasses:      string[];
  properties:      OntologyProperty[];
  constraints:     OntologyConstraint[];
  taxonomy:        string[];           // caminho na taxonomia: ["ROOT","FINANCE","TAX","INCOME"]
  semanticCategory: string;
}

export interface KnowledgeProvenance {
  origin:          KnowledgeOrigin;
  evidence:        KnowledgeEvidence[];
  confidenceScore: number;             // 0.0–1.0
  qualityScore:    number;             // 0.0–1.0
  trustScore:      number;             // 0.0–1.0 (composto)
  sources:         string[];           // IDs dos artefatos de origem
}

export interface KnowledgeLifecycle {
  status:          KnowledgeNodeStatus;
  createdAt:       string;
  updatedAt:       string;
  validatedAt?:    string;
  publishedAt?:    string;
  deprecatedAt?:   string;
  archivedAt?:     string;
  expiresAt?:      string;
  retentionPolicy: RetentionPolicy;
  history:         KnowledgeHistoryEntry[];
}

export enum KnowledgeNodeStatus {
  DRAFT      = "DRAFT",
  VALIDATED  = "VALIDATED",
  CERTIFIED  = "CERTIFIED",
  PUBLISHED  = "PUBLISHED",
  DEPRECATED = "DEPRECATED",
  ARCHIVED   = "ARCHIVED",
}

export interface KnowledgeMetadata {
  tags:            string[];
  domain:          string;
  subDomain:       string;
  language:        string;
  region?:         string;
  orgId?:          string;
  userId?:         string;
  projectId?:      string;
  schemaVersion:   string;
}
```

## 1.3 Diagrama C4 — Knowledge Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│              Knowledge Domain [Container Group]                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  KnowledgeGraphEngine [Container]                                       ││
│  │  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐   ││
│  │  │ Graph Store  │  │ Index (Vector +  │  │ Traversal Engine       │   ││
│  │  │ (Neo4j/PG)   │  │ Keyword)         │  │ (BFS/DFS/Semantic)     │   ││
│  │  └──────────────┘  └──────────────────┘  └────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ OntologyEngine  │  │ RelationshipEng.│  │ DomainKnowledgeEngine       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ ReasoningEngine │  │ SemanticSearch  │  │ FederationEngine            │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │ QualityEngine   │  │ GovernanceEng.  │                                  │
│  └─────────────────┘  └─────────────────┘                                  │
│                                                                              │
│  Persistência: Neo4j (grafo) · PostgreSQL (metadados) · Redis (cache)      │
│  Vetores: pgvector / Qdrant                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# REVISÃO 2 — KNOWLEDGE GRAPH ENGINE

---

## 2.1 Interface Principal

```typescript
// packages/core/knowledge/graph/knowledge-graph-engine.ts

export interface IKnowledgeGraphEngine {
  // CRUD de nós
  createNode(node: Omit<KnowledgeNode, "nodeId">): Promise<KnowledgeNode>;
  updateNode(nodeId: string, patch: Partial<KnowledgeNode>): Promise<KnowledgeNode>;
  deleteNode(nodeId: string): Promise<void>;
  getNode(nodeId: string): Promise<KnowledgeNode | null>;

  // CRUD de arestas
  link(from: string, to: string, rel: KnowledgeRelationship): Promise<void>;
  unlink(from: string, to: string, relType: RelationshipType): Promise<void>;

  // Traversal
  traverse(start: string, options: TraversalOptions): Promise<TraversalResult>;
  neighbors(nodeId: string, depth?: number): Promise<KnowledgeNode[]>;
  shortestPath(from: string, to: string): Promise<KnowledgeNode[]>;
  subgraph(roots: string[], depth: number): Promise<KnowledgeSubgraph>;

  // Busca
  search(query: GraphSearchQuery): Promise<GraphSearchResult>;
  findByFingerprint(fingerprint: string): Promise<KnowledgeNode | null>;
  findByCanonicalName(name: string, domain?: string): Promise<KnowledgeNode[]>;

  // Contexto
  getContext(nodeId: string, contextDepth: number): Promise<KnowledgeContext>;
  getDomain(domain: string): Promise<DomainKnowledgeGraph>;

  // Proveniência
  getProvenance(nodeId: string): Promise<ProvenanceChain>;
  getHistory(nodeId: string): Promise<KnowledgeHistoryEntry[]>;

  // Index
  reindex(nodeId: string): Promise<void>;
  buildEmbedding(nodeId: string): Promise<number[]>;
}

export interface TraversalOptions {
  direction:    "OUTBOUND" | "INBOUND" | "ANY";
  relTypes?:    RelationshipType[];
  maxDepth:     number;
  filter?:      (node: KnowledgeNode) => boolean;
  algorithm:    "BFS" | "DFS" | "SEMANTIC";
  limit?:       number;
}

export interface TraversalResult {
  nodes:        KnowledgeNode[];
  edges:        KnowledgeRelationship[];
  depth:        number;
  pathCount:    number;
}

export interface KnowledgeSubgraph {
  nodes:        KnowledgeNode[];
  edges:        KnowledgeRelationship[];
  rootIds:      string[];
  density:      number;    // edges / (nodes * (nodes-1))
  domains:      string[];
}

export interface GraphSearchQuery {
  text?:        string;
  domain?:      string;
  type?:        KnowledgeNodeType;
  minConfidence?: number;
  relatedTo?:   string;   // nodeId
  embedding?:   number[];
  limit:        number;
  offset:       number;
  mode:         "SEMANTIC" | "KEYWORD" | "HYBRID" | "GRAPH";
}

export interface GraphSearchResult {
  nodes:        Array<KnowledgeNode & { score: number; explanation: string }>;
  total:        number;
  queryId:      string;
  durationMs:   number;
}
```

## 2.2 Implementação do Graph Engine

```typescript
@Injectable()
export class KnowledgeGraphEngine implements IKnowledgeGraphEngine {
  constructor(
    private readonly graphStore:    GraphStore,          // Neo4j ou PostgreSQL JSON
    private readonly vectorStore:   VectorStore,         // pgvector / Qdrant
    private readonly keywordIndex:  KeywordIndex,        // Elasticsearch / pg_trgm
    private readonly cache:         CacheService,
    private readonly eventBus:      UniversalEventBus,
    private readonly embeddingGen:  EmbeddingGenerator,
  ) {}

  async createNode(data: Omit<KnowledgeNode, "nodeId">): Promise<KnowledgeNode> {
    const nodeId     = generateId("kn");
    const fingerprint = this.computeFingerprint(data.content);
    const existing   = await this.findByFingerprint(fingerprint);
    if (existing) return existing;   // idempotente por conteúdo

    const node: KnowledgeNode = {
      ...data,
      nodeId,
      identity: { ...data.identity, nodeId, fingerprint, version: "1.0.0" },
      lifecycle: { ...data.lifecycle, status: KnowledgeNodeStatus.DRAFT, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), history: [] },
    };

    await this.graphStore.create(node);
    this.buildEmbeddingAsync(node);   // assíncrono — não bloqueia

    await this.eventBus.publish("knowledge.created", {
      nodeId, type: node.content.type, domain: node.content.domain,
      canonicalName: node.identity.canonicalName,
    });

    this.cache.invalidatePattern(`knowledge:domain:${node.content.domain}*`);
    return node;
  }

  async traverse(start: string, opts: TraversalOptions): Promise<TraversalResult> {
    const cacheKey = `traverse:${start}:${JSON.stringify(opts)}`;
    const cached   = await this.cache.get<TraversalResult>(cacheKey);
    if (cached) return cached;

    let result: TraversalResult;
    switch (opts.algorithm) {
      case "BFS":      result = await this.bfsTraversal(start, opts); break;
      case "DFS":      result = await this.dfsTraversal(start, opts); break;
      case "SEMANTIC": result = await this.semanticTraversal(start, opts); break;
      default:         result = await this.bfsTraversal(start, opts);
    }

    await this.cache.set(cacheKey, result, { ttl: 300 });
    return result;
  }

  private async semanticTraversal(start: string, opts: TraversalOptions): Promise<TraversalResult> {
    const root = await this.getNode(start);
    if (!root || !root.content.embedding) return { nodes: [], edges: [], depth: 0, pathCount: 0 };

    // Encontrar nós semanticamente similares via vetor
    const similar = await this.vectorStore.nearest(root.content.embedding, {
      limit:  opts.limit ?? 20,
      filter: { domain: root.content.domain },
    });

    // Enriquecer com arestas do grafo
    const nodeIds    = similar.map(s => s.nodeId);
    const nodes      = await Promise.all(nodeIds.map(id => this.getNode(id)));
    const validNodes = nodes.filter(Boolean) as KnowledgeNode[];
    const edges      = await this.graphStore.getEdgesBetween(nodeIds);

    return { nodes: validNodes, edges, depth: 1, pathCount: validNodes.length };
  }
}
```

---

# REVISÃO 3 — KNOWLEDGE RELATIONSHIP ENGINE

---

## 3.1 Tipos de Relacionamento

```typescript
// packages/core/knowledge/relationships/knowledge-relationship-engine.ts

export enum RelationshipType {
  // Estruturais
  PARENT_OF         = "PARENT_OF",
  CHILD_OF          = "CHILD_OF",
  PART_OF           = "PART_OF",
  HAS_PART          = "HAS_PART",
  // Dependência
  DEPENDS_ON        = "DEPENDS_ON",
  REQUIRED_BY       = "REQUIRED_BY",
  USES              = "USES",
  USED_BY           = "USED_BY",
  CONSUMES          = "CONSUMES",
  PRODUCES          = "PRODUCES",
  // Semântica
  RELATED_TO        = "RELATED_TO",
  EQUIVALENT_TO     = "EQUIVALENT_TO",
  CONTRADICTS       = "CONTRADICTS",
  SUPPORTS          = "SUPPORTS",
  SPECIALIZES       = "SPECIALIZES",
  GENERALIZES       = "GENERALIZES",
  // Posse e Localização
  BELONGS_TO        = "BELONGS_TO",
  LOCATED_IN        = "LOCATED_IN",
  CREATED_BY        = "CREATED_BY",
  OWNED_BY          = "OWNED_BY",
  MANAGED_BY        = "MANAGED_BY",
  // Temporal
  PRECEDED_BY       = "PRECEDED_BY",
  FOLLOWED_BY       = "FOLLOWED_BY",
  CONCURRENT_WITH   = "CONCURRENT_WITH",
  TRIGGERED_BY      = "TRIGGERED_BY",
  // Causal
  CAUSES            = "CAUSES",
  CAUSED_BY         = "CAUSED_BY",
  PREVENTS          = "PREVENTS",
  ENABLES           = "ENABLES",
  // Confiança e Contexto
  VALIDATED_BY      = "VALIDATED_BY",
  CONTRADICTED_BY   = "CONTRADICTED_BY",
  DERIVED_FROM      = "DERIVED_FROM",
  BASED_ON          = "BASED_ON",
  IN_CONTEXT_OF     = "IN_CONTEXT_OF",
}

export interface KnowledgeRelationship {
  edgeId:          string;
  fromNodeId:      string;
  toNodeId:        string;
  type:            RelationshipType;
  properties:      RelationshipProperties;
  provenance:      EdgeProvenance;
  createdAt:       string;
}

export interface RelationshipProperties {
  weight:          number;        // 0.0–1.0 — força do relacionamento
  confidence:      number;        // 0.0–1.0
  bidirectional:   boolean;
  context?:        string;        // contexto em que o relacionamento é válido
  validFrom?:      string;
  validUntil?:     string;        // relacionamento temporário
  description?:    string;
}

export interface EdgeProvenance {
  inferredBy?:     "LEARNING" | "REASONING" | "HUMAN" | "SPECIALIST" | "MARKETPLACE";
  sourceId?:       string;
  confidence:      number;
  createdAt:       string;
}

@Injectable()
export class KnowledgeRelationshipEngine {
  async link(
    from:  string,
    to:    string,
    type:  RelationshipType,
    props: Partial<RelationshipProperties> = {}
  ): Promise<KnowledgeRelationship> {
    const existing = await this.findEdge(from, to, type);
    if (existing) return this.updateEdgeWeight(existing, props); // idempotente

    const rel: KnowledgeRelationship = {
      edgeId:    generateId("ke"),
      fromNodeId: from, toNodeId: to, type,
      properties: { weight: props.weight ?? 0.5, confidence: props.confidence ?? 0.7, bidirectional: props.bidirectional ?? false, ...props },
      provenance: { inferredBy: "REASONING", confidence: props.confidence ?? 0.7, createdAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
    };

    await this.graphStore.createEdge(rel);
    if (props.bidirectional) await this.graphStore.createEdge({ ...rel, edgeId: generateId("ke"), fromNodeId: to, toNodeId: from });

    await this.eventBus.publish("knowledge.linked", { edgeId: rel.edgeId, from, to, type, confidence: rel.properties.confidence });
    return rel;
  }

  async findConflicts(nodeId: string): Promise<ConflictingRelationship[]> {
    const edges = await this.graphStore.getEdgesFrom(nodeId);
    const contradicts = edges.filter(e => e.type === RelationshipType.CONTRADICTS);
    return contradicts.map(e => ({ edge: e, severity: this.computeSeverity(e) }));
  }

  private computeSeverity(edge: KnowledgeRelationship): "LOW" | "MEDIUM" | "HIGH" {
    if (edge.properties.confidence >= 0.85) return "HIGH";
    if (edge.properties.confidence >= 0.60) return "MEDIUM";
    return "LOW";
  }

  // Inferir relacionamentos a partir do grafo (regras de composição)
  async inferRelationships(nodeId: string): Promise<InferredRelationship[]> {
    const inferred: InferredRelationship[] = [];

    // Regra transitiva: se A DEPENDS_ON B e B DEPENDS_ON C → A DEPENDS_ON C
    const directDeps = await this.graphStore.getEdgesFrom(nodeId, RelationshipType.DEPENDS_ON);
    for (const dep of directDeps) {
      const transitiveDeps = await this.graphStore.getEdgesFrom(dep.toNodeId, RelationshipType.DEPENDS_ON);
      for (const t of transitiveDeps) {
        inferred.push({
          from: nodeId, to: t.toNodeId, type: RelationshipType.DEPENDS_ON,
          confidence: dep.properties.confidence * t.properties.confidence,
          rule: "TRANSITIVITY",
        });
      }
    }

    return inferred;
  }
}
```

---

# REVISÃO 4 — ONTOLOGY ENGINE

---

## 4.1 Interfaces e Domínios

```typescript
// packages/core/knowledge/ontology/ontology-engine.ts

export interface DomainOntology {
  ontologyId:    string;
  domain:        string;
  version:       string;
  classes:       OntologyClass[];
  properties:    OntologyProperty[];
  constraints:   OntologyConstraint[];
  taxonomy:      TaxonomyTree;
  aliases:       AliasMap;
  synonyms:      SynonymMap;
  canonicalNames: CanonicalNameMap;
  inherits?:     string[];        // ontologias pai (herança)
  createdAt:     string;
  updatedAt:     string;
}

export interface OntologyClass {
  classId:       string;
  name:          string;
  canonicalName: string;
  description:   string;
  superClass?:   string;
  properties:    string[];        // OntologyProperty IDs
  constraints:   string[];
  examples:      string[];
  isAbstract:    boolean;
}

export interface OntologyProperty {
  propertyId:    string;
  name:          string;
  type:          "STRING" | "NUMBER" | "BOOLEAN" | "DATE" | "REFERENCE" | "ARRAY";
  required:      boolean;
  description:   string;
  validation?:   string;          // regex ou expressão
  defaultValue?: unknown;
  range?:        string;          // OntologyClass ID (para REFERENCE)
}

export interface OntologyConstraint {
  constraintId:  string;
  type:          "UNIQUENESS" | "RANGE" | "PATTERN" | "DEPENDENCY" | "CARDINALITY";
  description:   string;
  expression:    string;
  severity:      "ERROR" | "WARNING" | "INFO";
}

export interface TaxonomyTree {
  root:          TaxonomyNode;
}

export interface TaxonomyNode {
  name:          string;
  path:          string;          // "ROOT/FINANCE/TAX/INCOME"
  children:      TaxonomyNode[];
  classId?:      string;
}

export type AliasMap    = Record<string, string>;    // alias → canonicalName
export type SynonymMap  = Record<string, string[]>;  // canonicalName → synonyms[]
export type CanonicalNameMap = Record<string, string>; // qualquer nome → canonical

export interface OntologyValidationResult {
  valid:         boolean;
  errors:        OntologyError[];
  warnings:      string[];
  coverage:      number;          // % de nós do domínio com classe ontológica
}

@Injectable()
export class OntologyEngine {
  private readonly ontologies = new Map<string, DomainOntology>();

  async register(ontology: DomainOntology): Promise<void> {
    this.validateOntology(ontology);
    this.ontologies.set(ontology.domain, ontology);
    await this.eventBus.publish("knowledge.updated", {
      type: "ONTOLOGY_REGISTERED", domain: ontology.domain, version: ontology.version,
    });
  }

  async classify(node: KnowledgeNode): Promise<OntologyClass | null> {
    const ontology = this.ontologies.get(node.content.domain);
    if (!ontology) return null;
    return ontology.classes.find(c => this.matches(node, c)) ?? null;
  }

  resolveCanonical(name: string, domain: string): string {
    const ontology = this.ontologies.get(domain);
    if (!ontology) return name;
    return ontology.canonicalNames[name.toLowerCase()] ?? name;
  }

  resolveAliases(name: string, domain: string): string[] {
    const ontology = this.ontologies.get(domain);
    if (!ontology) return [name];
    const canonical = this.resolveCanonical(name, domain);
    return ontology.synonyms[canonical] ?? [canonical];
  }

  async validate(node: KnowledgeNode): Promise<OntologyValidationResult> {
    const ontology = this.ontologies.get(node.content.domain);
    if (!ontology) return { valid: true, errors: [], warnings: ["Domain ontology not found"], coverage: 0 };

    const cls    = await this.classify(node);
    const errors: OntologyError[] = [];

    if (cls) {
      // Verificar propriedades obrigatórias
      cls.properties.forEach(pid => {
        const prop = ontology.properties.find(p => p.propertyId === pid);
        if (prop?.required && !this.hasProperty(node, prop.name)) {
          errors.push({ type: "MISSING_REQUIRED_PROPERTY", property: prop.name, message: `Propriedade obrigatória ausente: ${prop.name}` });
        }
      });
    }

    return { valid: errors.filter(e => e.type !== "WARNING").length === 0, errors, warnings: [], coverage: cls ? 1.0 : 0.0 };
  }

  // Evoluir ontologia — cria nova versão preservando a anterior
  async evolve(domain: string, patch: Partial<DomainOntology>, reason: string): Promise<DomainOntology> {
    const current = this.ontologies.get(domain);
    if (!current) throw new OntologyNotFoundError(domain);

    const next: DomainOntology = {
      ...current,
      ...patch,
      version:   this.bumpVersion(current.version),
      updatedAt: new Date().toISOString(),
    };

    await this.archiveVersion(domain, current);
    this.ontologies.set(domain, next);
    await this.eventBus.publish("knowledge.updated", { type: "ONTOLOGY_EVOLVED", domain, from: current.version, to: next.version, reason });
    return next;
  }
}
```

---

# REVISÃO 5 — DOMAIN KNOWLEDGE ENGINE

---

## 5.1 Interface de Domínio

```typescript
// packages/core/knowledge/domain/domain-knowledge-engine.ts

export interface KnowledgeDomain {
  domainId:      string;
  name:          string;
  code:          string;           // "FINANCE", "HEALTH", "ECOMMERCE"
  ontology:      DomainOntology;
  specialists:   string[];         // SpecialistIds
  policies:      DomainPolicy[];
  goals:         string[];         // GoalTemplate IDs
  capabilities:  string[];         // Connector capability IDs
  connectors:    string[];         // ConnectorIds
  knowledgeBase: DomainKnowledgeBase;
  memory:        DomainMemoryConfig;
  versioning:    DomainVersioning;
  lifecycle:     DomainLifecycle;
}

export interface DomainKnowledgeBase {
  domainId:      string;
  nodeCount:     number;
  edgeCount:     number;
  lastUpdated:   string;
  coverageScore: number;           // 0.0–1.0
  topConcepts:   string[];         // canonicalNames mais referenciados
  domains:       string[];         // subdomínios
}

export const OFFICIAL_DOMAINS: Record<string, Partial<KnowledgeDomain>> = {
  HEALTHCARE: {
    name: "Healthcare", code: "HEALTHCARE",
    specialists: ["medical-specialist", "pharmacy-specialist"],
    goals: ["diagnose", "prescribe", "schedule-appointment", "monitor-health"],
  },
  FINANCE: {
    name: "Finance", code: "FINANCE",
    specialists: ["finance-specialist", "tax-specialist", "investment-specialist"],
    goals: ["analyze-portfolio", "calculate-tax", "pay-bill", "generate-report"],
  },
  ECOMMERCE: {
    name: "E-commerce", code: "ECOMMERCE",
    specialists: ["product-specialist", "pricing-specialist"],
    goals: ["process-order", "manage-inventory", "handle-return", "analyze-sales"],
  },
  MARKETPLACE: {
    name: "Marketplace", code: "MARKETPLACE",
    specialists: ["marketplace-specialist"],
    goals: ["publish-connector", "evaluate-connector", "monetize-workflow"],
  },
  LOGISTICS: {
    name: "Logistics", code: "LOGISTICS",
    specialists: ["logistics-specialist", "routing-specialist"],
    goals: ["track-shipment", "optimize-route", "manage-warehouse"],
  },
  MARKETING: {
    name: "Marketing", code: "MARKETING",
    specialists: ["marketing-specialist", "analytics-specialist"],
    goals: ["create-campaign", "analyze-audience", "generate-report"],
  },
  LEGAL: {
    name: "Legal", code: "LEGAL",
    specialists: ["legal-specialist", "contract-specialist"],
    goals: ["review-contract", "check-compliance", "generate-document"],
  },
  EDUCATION: {
    name: "Education", code: "EDUCATION",
    specialists: ["education-specialist", "curriculum-specialist"],
    goals: ["create-lesson", "evaluate-student", "generate-curriculum"],
  },
  TRAVEL: {
    name: "Travel", code: "TRAVEL",
    specialists: ["travel-specialist"],
    goals: ["book-flight", "find-hotel", "plan-itinerary"],
  },
  ASTRONOMY: {
    name: "Astronomy", code: "ASTRONOMY",
    specialists: ["astronomy-specialist"],
    goals: ["calculate-orbit", "identify-object", "predict-event"],
  },
};

@Injectable()
export class DomainKnowledgeEngine {
  async getDomain(code: string): Promise<KnowledgeDomain | null> {
    return this.domainStore.get(code);
  }

  async addToDomain(nodeId: string, domainCode: string): Promise<void> {
    const domain = await this.getDomain(domainCode);
    if (!domain) throw new DomainNotFoundError(domainCode);

    await this.graphEngine.link(nodeId, domain.domainId, RelationshipType.BELONGS_TO, { confidence: 1.0 });
    await this.domainStore.incrementNodeCount(domainCode);
  }

  async getDomainKnowledgeBase(code: string): Promise<DomainKnowledgeBase> {
    const cacheKey = `domain:kb:${code}`;
    const cached   = await this.cache.get<DomainKnowledgeBase>(cacheKey);
    if (cached) return cached;

    const stats = await this.graphStore.getDomainStats(code);
    const kb: DomainKnowledgeBase = {
      domainId:      code,
      nodeCount:     stats.nodeCount,
      edgeCount:     stats.edgeCount,
      lastUpdated:   stats.lastUpdated,
      coverageScore: this.computeCoverage(stats),
      topConcepts:   stats.topConcepts,
      domains:       stats.subDomains,
    };

    await this.cache.set(cacheKey, kb, { ttl: 600 });
    return kb;
  }
}
```

---

# REVISÃO 6 — KNOWLEDGE REASONING ENGINE

---

## 6.1 Interface e Modelos de Inferência

```typescript
// packages/core/knowledge/reasoning/knowledge-reasoning-engine.ts

export interface IKnowledgeReasoningEngine {
  infer(context: ReasoningContext): Promise<ReasoningResult>;
  validate(hypothesis: KnowledgeNode): Promise<HypothesisValidation>;
  explain(nodeId: string): Promise<ReasoningTrace>;
}

export interface ReasoningContext {
  seedNodeIds:    string[];         // nós de partida
  domain:         string;
  depth:          number;           // profundidade máxima de inferência
  strategy:       ReasoningStrategy;
  userId?:        string;
  orgId?:         string;
  minConfidence:  number;
}

export enum ReasoningStrategy {
  DEDUCTION  = "DEDUCTION",        // do geral para o específico (regras → conclusão)
  INDUCTION  = "INDUCTION",        // do específico para o geral (exemplos → regra)
  ABDUCTION  = "ABDUCTION",        // melhor explicação possível
  ANALOGY    = "ANALOGY",          // por semelhança com outros domínios
  MULTI_STEP = "MULTI_STEP",       // cadeia de raciocínio multi-etapa
  CROSS_DOMAIN = "CROSS_DOMAIN",   // raciocínio cruzando domínios
}

export interface ReasoningResult {
  reasoningId:    string;
  strategy:       ReasoningStrategy;
  inferences:     InferredFact[];
  hypotheses:     KnowledgeNode[];
  confidence:     number;
  trace:          ReasoningTrace;
  conflicts:      ConflictingKnowledge[];
  durationMs:     number;
  createdAt:      string;
}

export interface InferredFact {
  nodeId:         string;
  type:           KnowledgeNodeType;
  domain:         string;
  statement:      string;           // linguagem natural
  confidence:     number;
  evidence:       string[];         // nodeIds que suportam esta inferência
  rule:           string;           // regra que gerou a inferência
  isNew:          boolean;          // ainda não existe no grafo?
}

export interface ReasoningTrace {
  steps: Array<{
    step:        number;
    action:      string;           // "DEDUCED", "INDUCED", "ABDUCED", "ANALOGIZED"
    fromNodes:   string[];
    toNode:      string;
    rule:        string;
    confidence:  number;
    durationMs:  number;
  }>;
  totalSteps:    number;
  totalDuration: number;
  finalConfidence: number;
}

export interface HypothesisValidation {
  hypothesis:    KnowledgeNode;
  valid:         boolean;
  confidence:    number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  recommendation: "ACCEPT" | "REJECT" | "INVESTIGATE";
}

@Injectable()
export class KnowledgeReasoningEngine implements IKnowledgeReasoningEngine {
  async infer(ctx: ReasoningContext): Promise<ReasoningResult> {
    const t0 = Date.now();
    const seeds = await Promise.all(ctx.seedNodeIds.map(id => this.graphEngine.getNode(id)));
    const validSeeds = seeds.filter(Boolean) as KnowledgeNode[];

    let inferences: InferredFact[] = [];
    const trace: ReasoningTrace = { steps: [], totalSteps: 0, totalDuration: 0, finalConfidence: 0 };

    switch (ctx.strategy) {
      case ReasoningStrategy.DEDUCTION:
        inferences = await this.deduce(validSeeds, ctx, trace); break;
      case ReasoningStrategy.INDUCTION:
        inferences = await this.induce(validSeeds, ctx, trace); break;
      case ReasoningStrategy.ABDUCTION:
        inferences = await this.abduce(validSeeds, ctx, trace); break;
      case ReasoningStrategy.MULTI_STEP:
        inferences = await this.multiStep(validSeeds, ctx, trace, ctx.depth); break;
      case ReasoningStrategy.CROSS_DOMAIN:
        inferences = await this.crossDomain(validSeeds, ctx, trace); break;
      default:
        inferences = await this.deduce(validSeeds, ctx, trace);
    }

    const qualified = inferences.filter(i => i.confidence >= ctx.minConfidence);

    // Persistir inferências como nós do tipo INFERENCE
    const persisted = await Promise.all(
      qualified.filter(i => i.isNew).map(inf => this.graphEngine.createNode({
        identity: { canonicalName: inf.statement, aliases: [], fingerprint: "", globalId: "", version: "1.0.0" },
        content:  { type: KnowledgeNodeType.INFERENCE, domain: ctx.domain, value: inf, summary: inf.statement, language: "pt-BR" },
        ontology: { class: "Inference", superClasses: [], subClasses: [], properties: [], constraints: [], taxonomy: ["ROOT", ctx.domain, "INFERENCE"], semanticCategory: "INFERENCE" },
        relationships: inf.evidence.map(eid => ({
          edgeId: generateId("ke"), fromNodeId: "", toNodeId: eid,
          type: RelationshipType.DERIVED_FROM,
          properties: { weight: inf.confidence, confidence: inf.confidence, bidirectional: false },
          provenance: { inferredBy: "REASONING", confidence: inf.confidence, createdAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
        })),
        provenance:  { origin: { sourceType: LearningSource.SYSTEM, sourceId: "reasoning", userId: ctx.userId ?? "system", orgId: ctx.orgId ?? "system", extractedAt: new Date().toISOString(), confidence: inf.confidence }, evidence: [], confidenceScore: inf.confidence, qualityScore: 0.8, trustScore: 0.75, sources: inf.evidence },
        governance:  { owner: ctx.userId ?? "system", visibility: "PRIVATE", permissions: [], compliance: [], retentionDays: 180 },
        quality:     { accuracy: inf.confidence, freshness: 1.0, consistency: 0.9, coverage: 0.5, completeness: 0.7, trust: inf.confidence, evidenceScore: inf.evidence.length * 0.2, confidenceScore: inf.confidence, popularityScore: 0, usageScore: 0, relevanceScore: 0.8 },
        lifecycle:   { status: KnowledgeNodeStatus.VALIDATED, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), history: [], retentionPolicy: { days: 180, action: "ARCHIVE" } },
        metadata:    { tags: ["inferred"], domain: ctx.domain, subDomain: "INFERENCE", language: "pt-BR", schemaVersion: "1.5" },
      }))
    );

    await this.eventBus.publish("knowledge.inferred", {
      reasoningId: generateId("rsn"), strategy: ctx.strategy,
      inferencesCount: qualified.length, newCount: persisted.length,
      minConfidence: ctx.minConfidence,
    });

    return {
      reasoningId: generateId("rsn"), strategy: ctx.strategy,
      inferences: qualified, hypotheses: [], confidence: trace.finalConfidence,
      trace, conflicts: [], durationMs: Date.now() - t0,
      createdAt: new Date().toISOString(),
    };
  }

  private async deduce(seeds: KnowledgeNode[], ctx: ReasoningContext, trace: ReasoningTrace): Promise<InferredFact[]> {
    const rules  = await this.ruleStore.getForDomain(ctx.domain);
    const inferred: InferredFact[] = [];

    for (const rule of rules) {
      const matches = seeds.filter(s => this.ruleMatches(rule, s));
      if (matches.length > 0) {
        const fact = this.applyRule(rule, matches);
        if (fact) {
          inferred.push(fact);
          trace.steps.push({ step: trace.steps.length + 1, action: "DEDUCED", fromNodes: matches.map(m => m.nodeId), toNode: "", rule: rule.id, confidence: fact.confidence, durationMs: 0 });
        }
      }
    }

    trace.finalConfidence = inferred.length ? inferred.reduce((a, f) => a + f.confidence, 0) / inferred.length : 0;
    return inferred;
  }
}
```

---

# REVISÃO 7 — SEMANTIC SEARCH ENGINE

---

## 7.1 Interface e Modos de Busca

```typescript
// packages/core/knowledge/search/semantic-search-engine.ts

export interface ISemanticSearchEngine {
  search(query: SearchQuery): Promise<SearchResult>;
  explain(queryId: string): Promise<SearchExplanation>;
}

export interface SearchQuery {
  text?:         string;
  embedding?:    number[];
  nodeIds?:      string[];         // busca por relacionamento a estes nós
  domain?:       string;
  type?:         KnowledgeNodeType;
  relType?:      RelationshipType; // buscar nós relacionados por este tipo
  minConfidence?: number;
  minRelevance?: number;
  temporal?:     { from: string; to: string };
  userId?:       string;
  orgId?:        string;
  mode:          SearchMode;
  limit:         number;
  offset:        number;
}

export enum SearchMode {
  SEMANTIC    = "SEMANTIC",       // busca por embedding (cosseno)
  KEYWORD     = "KEYWORD",        // busca textual com índice invertido
  HYBRID      = "HYBRID",         // semantic + keyword (RRF fusion)
  GRAPH       = "GRAPH",          // traversal de grafo a partir de seed nodes
  ENTITY      = "ENTITY",         // busca por entidade (canonicalName + aliases)
  RELATIONSHIP = "RELATIONSHIP",  // busca por tipo de relacionamento
  TEMPORAL    = "TEMPORAL",       // busca por faixa temporal
}

export interface SearchResult {
  queryId:       string;
  mode:          SearchMode;
  items:         SearchHit[];
  total:         number;
  durationMs:    number;
  explanation:   SearchExplanation;
}

export interface SearchHit {
  node:          KnowledgeNode;
  score:         number;           // 0.0–1.0
  relevance:     number;           // 0.0–1.0
  confidence:    number;           // 0.0–1.0
  explanation:   string;           // por que este resultado?
  matchedOn:     ("SEMANTIC" | "KEYWORD" | "GRAPH" | "ENTITY")[];
  highlight?:    string;           // trecho destacado para KEYWORD
}

export interface SearchExplanation {
  queryId:       string;
  mode:          SearchMode;
  textProcessed?: string;
  embeddingDim?:  number;
  graphDepth?:    number;
  domainFilter?:  string;
  fusionMethod?:  "RRF" | "LINEAR";
  rankingFactors: RankingFactor[];
}

export interface RankingFactor {
  name:          string;
  weight:        number;
  description:   string;
}

@Injectable()
export class SemanticSearchEngine implements ISemanticSearchEngine {
  async search(query: SearchQuery): Promise<SearchResult> {
    const t0      = Date.now();
    const queryId = generateId("srch");

    let hits: SearchHit[] = [];

    switch (query.mode) {
      case SearchMode.SEMANTIC:
        hits = await this.semanticSearch(query); break;
      case SearchMode.KEYWORD:
        hits = await this.keywordSearch(query); break;
      case SearchMode.HYBRID:
        hits = await this.hybridSearch(query); break;
      case SearchMode.GRAPH:
        hits = await this.graphSearch(query); break;
      case SearchMode.ENTITY:
        hits = await this.entitySearch(query); break;
      case SearchMode.TEMPORAL:
        hits = await this.temporalSearch(query); break;
      default:
        hits = await this.hybridSearch(query);
    }

    // Filtros pós-busca
    if (query.minConfidence) hits = hits.filter(h => h.confidence >= query.minConfidence!);
    if (query.minRelevance)  hits = hits.filter(h => h.relevance  >= query.minRelevance!);

    return {
      queryId, mode: query.mode,
      items:      hits.slice(query.offset, query.offset + query.limit),
      total:      hits.length,
      durationMs: Date.now() - t0,
      explanation: this.buildExplanation(queryId, query),
    };
  }

  private async hybridSearch(query: SearchQuery): Promise<SearchHit[]> {
    const [semantic, keyword] = await Promise.all([
      this.semanticSearch({ ...query, mode: SearchMode.SEMANTIC }),
      this.keywordSearch({ ...query, mode: SearchMode.KEYWORD }),
    ]);

    // Reciprocal Rank Fusion
    const scores = new Map<string, number>();
    const k = 60;
    semantic.forEach((h, i) => scores.set(h.node.nodeId, (scores.get(h.node.nodeId) ?? 0) + 1 / (k + i + 1)));
    keyword.forEach( (h, i) => scores.set(h.node.nodeId, (scores.get(h.node.nodeId) ?? 0) + 1 / (k + i + 1)));

    const allNodes = new Map<string, SearchHit>();
    [...semantic, ...keyword].forEach(h => allNodes.set(h.node.nodeId, h));

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nodeId, score]) => ({ ...allNodes.get(nodeId)!, score, matchedOn: ["SEMANTIC", "KEYWORD"] }));
  }
}
```

---

# REVISÃO 8 — KNOWLEDGE FEDERATION ENGINE

---

## 8.1 Interface e Fontes

```typescript
// packages/core/knowledge/federation/knowledge-federation-engine.ts

export enum FederationSource {
  INTERNAL    = "INTERNAL",         // MemoryEngine + LearningEngine
  EXTERNAL    = "EXTERNAL",         // APIs públicas e bases de dados externas
  MARKETPLACE = "MARKETPLACE",      // Connectors do Marketplace
  SPECIALIST  = "SPECIALIST",       // Specialist Knowledge Packages
  ENTERPRISE  = "ENTERPRISE",       // Base de conhecimento da empresa
  USER        = "USER",             // Conhecimento pessoal do usuário
  CONNECTOR   = "CONNECTOR",        // Dados trazidos por Connectors
  PUBLIC_API  = "PUBLIC_API",       // APIs públicas (Wikipedia, Wikidata, etc.)
}

export interface FederationQuery {
  topic:         string;
  domain:        string;
  sources:       FederationSource[];
  minConfidence: number;
  maxResults:    number;
  mergeDuplicates: boolean;
  resolveConflicts: boolean;
  userId?:       string;
  orgId?:        string;
}

export interface FederatedKnowledge {
  queryId:       string;
  topic:         string;
  merged:        KnowledgeNode[];
  conflicts:     ConflictingKnowledge[];
  sourceBreakdown: Record<FederationSource, number>;
  confidence:    number;
  durationMs:    number;
}

export interface ConflictingKnowledge {
  topic:         string;
  nodes:         KnowledgeNode[];
  resolution:    ConflictResolutionStrategy;
  winner:        string;          // nodeId vencedor
  rationale:     string;
}

export enum ConflictResolutionStrategy {
  HIGHEST_CONFIDENCE = "HIGHEST_CONFIDENCE",
  MOST_RECENT        = "MOST_RECENT",
  MOST_EVIDENCE      = "MOST_EVIDENCE",
  ENTERPRISE_WINS    = "ENTERPRISE_WINS",   // conhecimento da empresa tem prioridade
  SPECIALIST_WINS    = "SPECIALIST_WINS",   // specialist tem prioridade
  KEEP_ALL           = "KEEP_ALL",          // preserva todos com flag de conflito
}

export const SOURCE_PRIORITY: Record<FederationSource, number> = {
  ENTERPRISE:  100,
  SPECIALIST:   90,
  INTERNAL:     80,
  CONNECTOR:    70,
  MARKETPLACE:  60,
  USER:         50,
  PUBLIC_API:   40,
  EXTERNAL:     30,
};

@Injectable()
export class KnowledgeFederationEngine {
  async federate(query: FederationQuery): Promise<FederatedKnowledge> {
    const t0      = Date.now();
    const queryId = generateId("fed");

    // Buscar em todas as fontes em paralelo
    const results = await Promise.allSettled(
      query.sources.map(src => this.fetchFromSource(src, query))
    );

    const nodes: KnowledgeNode[] = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => (r as PromiseFulfilledResult<KnowledgeNode[]>).value);

    // Deduplicar por fingerprint
    const unique = query.mergeDuplicates
      ? this.deduplicate(nodes)
      : nodes;

    // Resolver conflitos
    const { resolved, conflicts } = query.resolveConflicts
      ? this.resolveConflicts(unique)
      : { resolved: unique, conflicts: [] };

    await this.eventBus.publish("knowledge.merged", {
      queryId, topic: query.topic, total: resolved.length,
      sources: query.sources, conflicts: conflicts.length,
    });

    return {
      queryId, topic: query.topic, merged: resolved, conflicts,
      sourceBreakdown: this.buildBreakdown(resolved),
      confidence: resolved.reduce((a, n) => a + n.provenance.confidenceScore, 0) / Math.max(resolved.length, 1),
      durationMs: Date.now() - t0,
    };
  }

  private resolveConflicts(nodes: KnowledgeNode[]): { resolved: KnowledgeNode[]; conflicts: ConflictingKnowledge[] } {
    const byFingerprint = new Map<string, KnowledgeNode[]>();
    nodes.forEach(n => {
      const key = n.content.domain + ":" + n.identity.canonicalName;
      const arr = byFingerprint.get(key) ?? [];
      arr.push(n);
      byFingerprint.set(key, arr);
    });

    const resolved: KnowledgeNode[] = [];
    const conflicts: ConflictingKnowledge[] = [];

    byFingerprint.forEach((group, key) => {
      if (group.length === 1) { resolved.push(group[0]); return; }

      // Resolver por prioridade de fonte
      const winner = group.sort((a, b) => {
        const pa = SOURCE_PRIORITY[a.provenance.origin.sourceType as unknown as FederationSource] ?? 0;
        const pb = SOURCE_PRIORITY[b.provenance.origin.sourceType as unknown as FederationSource] ?? 0;
        return pb - pa;
      })[0];

      resolved.push(winner);
      conflicts.push({
        topic: key, nodes: group, winner: winner.nodeId,
        resolution: ConflictResolutionStrategy.HIGHEST_CONFIDENCE,
        rationale: `Fonte ${winner.provenance.origin.sourceType} tem prioridade ${SOURCE_PRIORITY[winner.provenance.origin.sourceType as unknown as FederationSource]}`,
      });
    });

    return { resolved, conflicts };
  }
}
```

---

# REVISÃO 9 — KNOWLEDGE QUALITY ENGINE

---

```typescript
// packages/core/knowledge/quality/knowledge-quality-engine.ts

export interface KnowledgeQuality {
  accuracy:      number;           // 0.0–1.0 — o quão correto é o conhecimento
  freshness:     number;           // 0.0–1.0 — o quão atual é
  consistency:   number;           // 0.0–1.0 — não contradiz o corpus
  coverage:      number;           // 0.0–1.0 — cobre os domínios relevantes
  completeness:  number;           // 0.0–1.0 — tem todos os campos esperados
  trust:         number;           // 0.0–1.0 — confiança na origem
  evidenceScore: number;           // 0.0–1.0 — suportado por evidências diretas
  confidenceScore: number;         // 0.0–1.0 — score de confiança
  popularityScore: number;         // 0.0–1.0 — frequência de uso
  usageScore:    number;           // 0.0–1.0 — frequência de reutilização
  relevanceScore: number;          // 0.0–1.0 — relevância para o domínio atual
  overallScore:  number;           // score composto
}

@Injectable()
export class KnowledgeQualityEngine {
  async evaluate(node: KnowledgeNode): Promise<KnowledgeQuality> {
    const [freshness, consistency, usage, relevance] = await Promise.all([
      this.computeFreshness(node),
      this.computeConsistency(node),
      this.usageStore.getScore(node.nodeId),
      this.computeRelevance(node),
    ]);

    const accuracy       = node.provenance.confidenceScore;
    const completeness   = this.computeCompleteness(node);
    const trust          = node.provenance.trustScore;
    const evidenceScore  = Math.min(node.provenance.evidence.filter(e => e.type === "DIRECT").length * 0.25, 1.0);
    const popularityScore = Math.min(node.provenance.evidence.length * 0.1, 1.0);

    const overallScore = (
      accuracy       * 0.20 +
      freshness      * 0.15 +
      consistency    * 0.15 +
      completeness   * 0.10 +
      trust          * 0.15 +
      evidenceScore  * 0.10 +
      relevance      * 0.10 +
      usage          * 0.05
    );

    return {
      accuracy, freshness, consistency, coverage: relevance,
      completeness, trust, evidenceScore, confidenceScore: accuracy,
      popularityScore, usageScore: usage, relevanceScore: relevance,
      overallScore,
    };
  }

  private computeFreshness(node: KnowledgeNode): number {
    const ageMs   = Date.now() - new Date(node.lifecycle.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 1)  return 1.00;
    if (ageDays <= 7)  return 0.90;
    if (ageDays <= 30) return 0.75;
    if (ageDays <= 90) return 0.50;
    if (ageDays <= 180) return 0.25;
    return 0.10;
  }
}
```

---

# REVISÃO 10 — KNOWLEDGE GOVERNANCE ENGINE

---

```typescript
// packages/core/knowledge/governance/knowledge-governance-engine.ts

export interface KnowledgeGovernance {
  owner:         string;           // userId ou orgId
  visibility:    KnowledgeVisibility;
  permissions:   KnowledgePermission[];
  compliance:    ComplianceTag[];
  retentionDays: number;
  approvalStatus?: ApprovalStatus;
  certifiedBy?:  string;
  certifiedAt?:  string;
  auditLog:      GovernanceAuditEntry[];
}

export enum KnowledgeVisibility {
  PRIVATE    = "PRIVATE",          // somente o dono
  ORG        = "ORG",              // toda a organização
  DOMAIN     = "DOMAIN",           // usuários do mesmo domínio
  PUBLIC     = "PUBLIC",           // todos os usuários da plataforma
  MARKETPLACE = "MARKETPLACE",     // publicado no Marketplace
}

export interface KnowledgePermission {
  principalId:   string;           // userId, orgId ou roleId
  principalType: "USER" | "ORG" | "ROLE" | "SPECIALIST";
  actions:       KnowledgeAction[];
  grantedBy:     string;
  grantedAt:     string;
  expiresAt?:    string;
}

export enum KnowledgeAction {
  READ    = "READ",
  WRITE   = "WRITE",
  DELETE  = "DELETE",
  SHARE   = "SHARE",
  CERTIFY = "CERTIFY",
  ARCHIVE = "ARCHIVE",
}

export type ComplianceTag = "LGPD" | "GDPR" | "HIPAA" | "SOC2" | "ISO27001" | "PCI_DSS";

export enum ApprovalStatus {
  PENDING   = "PENDING",
  APPROVED  = "APPROVED",
  REJECTED  = "REJECTED",
  CERTIFIED = "CERTIFIED",
}

export interface RetentionPolicy {
  days:    number;
  action:  "ARCHIVE" | "DELETE" | "ANONYMIZE";
}

@Injectable()
export class KnowledgeGovernanceEngine {
  async checkPermission(nodeId: string, userId: string, action: KnowledgeAction): Promise<boolean> {
    const node = await this.graphEngine.getNode(nodeId);
    if (!node) return false;
    if (node.governance.owner === userId) return true;

    const perm = node.governance.permissions.find(p =>
      p.principalId === userId && p.actions.includes(action) &&
      (!p.expiresAt || new Date(p.expiresAt) > new Date())
    );
    return !!perm;
  }

  async certify(nodeId: string, certifierId: string): Promise<void> {
    const hasPermission = await this.checkPermission(nodeId, certifierId, KnowledgeAction.CERTIFY);
    if (!hasPermission) throw new KnowledgePermissionError(nodeId, certifierId, KnowledgeAction.CERTIFY);

    await this.graphEngine.updateNode(nodeId, {
      governance: { certifiedBy: certifierId, certifiedAt: new Date().toISOString(), approvalStatus: ApprovalStatus.CERTIFIED } as any,
      lifecycle: { status: KnowledgeNodeStatus.CERTIFIED } as any,
    });
    await this.eventBus.publish("knowledge.certified", { nodeId, certifierId, certifiedAt: new Date().toISOString() });
  }

  async applyRetention(): Promise<void> {
    const expired = await this.graphStore.findExpired();
    for (const node of expired) {
      switch (node.lifecycle.retentionPolicy.action) {
        case "ARCHIVE":    await this.archive(node.nodeId); break;
        case "DELETE":     await this.graphEngine.deleteNode(node.nodeId); break;
        case "ANONYMIZE":  await this.anonymize(node.nodeId); break;
      }
    }
  }

  async deleteUserKnowledge(userId: string): Promise<number> {
    const nodes = await this.graphStore.findByOwner(userId);
    await Promise.all(nodes.map(n => this.graphEngine.deleteNode(n.nodeId)));
    await this.eventBus.publish("knowledge.deleted", { userId, count: nodes.length, reason: "USER_DELETION_REQUEST" });
    return nodes.length;
  }
}
```

---

# REVISÃO 11 — KNOWLEDGE EVENTS

---

```typescript
// packages/shared/events/knowledge-events-v1.5.ts

/** knowledge.created — KnowledgeGraphEngine */
export interface KnowledgeCreatedEvent {
  nodeId: string; type: KnowledgeNodeType; domain: string;
  canonicalName: string; confidence: number; createdAt: string;
}

/** knowledge.updated — KnowledgeGraphEngine, OntologyEngine */
export interface KnowledgeUpdatedEvent {
  nodeId: string; version: string; fromVersion?: string;
  changedFields: string[]; updatedAt: string;
}

/** knowledge.deleted — KnowledgeGovernanceEngine */
export interface KnowledgeDeletedEvent {
  nodeId?: string; userId?: string; count?: number;
  reason: string; deletedAt: string;
}

/** knowledge.linked — KnowledgeRelationshipEngine */
export interface KnowledgeLinkedEvent {
  edgeId: string; from: string; to: string;
  type: RelationshipType; confidence: number; linkedAt: string;
}

/** knowledge.unlinked — KnowledgeRelationshipEngine */
export interface KnowledgeUnlinkedEvent {
  from: string; to: string; type: RelationshipType; unlinkedAt: string;
}

/** knowledge.reasoned — KnowledgeReasoningEngine */
export interface KnowledgeReasonedEvent {
  reasoningId: string; strategy: ReasoningStrategy;
  inferencesCount: number; newCount: number; confidence: number; reasonedAt: string;
}

/** knowledge.inferred — KnowledgeReasoningEngine (por inferência nova) */
export interface KnowledgeInferredEvent {
  reasoningId: string; nodeId: string; domain: string;
  confidence: number; rule: string; inferredAt: string;
}

/** knowledge.merged — KnowledgeFederationEngine */
export interface KnowledgeMergedEvent {
  queryId: string; topic: string; total: number;
  sources: FederationSource[]; conflicts: number; mergedAt: string;
}

/** knowledge.split — KnowledgeConsolidationEngine (divisão de nó ambíguo) */
export interface KnowledgeSplitEvent {
  originalId: string; newIds: string[]; reason: string; splitAt: string;
}

/** knowledge.validated — KnowledgeValidationEngine */
export interface KnowledgeValidatedEvent {
  nodeId: string; score: number; checks: number;
  passed: boolean; validatedAt: string;
}

/** knowledge.certified — KnowledgeGovernanceEngine */
export interface KnowledgeCertifiedEvent {
  nodeId: string; certifierId: string; certifiedAt: string;
}

/** knowledge.deprecated — KnowledgeEvolutionEngine */
export interface KnowledgeDeprecatedEvent {
  nodeId: string; replacedBy?: string; reason: string; deprecatedAt: string;
}

/** knowledge.archived — KnowledgeGovernanceEngine, KnowledgeEvolutionEngine */
export interface KnowledgeArchivedEvent {
  nodeId: string; reason: string; archivedAt: string;
}
```

---

# REVISÃO 12 — OBSERVABILIDADE

---

```typescript
export function setupKnowledgeMetrics(meter: Meter) {
  return {
    // Volume e crescimento
    knowledgeGrowth: meter.createCounter("knowledge_nodes_total",
      { description: "Total de nós no grafo de conhecimento" }),          // Labels: domain, type
    knowledgeDensity: meter.createObservableGauge("knowledge_graph_density",
      { description: "Densidade do grafo (edges / nodes²)" }),
    graphConnectivity: meter.createObservableGauge("knowledge_graph_connectivity",
      { description: "% de nós com pelo menos 1 aresta" }),

    // Ontologia
    ontologyCoverage: meter.createObservableGauge("knowledge_ontology_coverage",
      { description: "% de nós com classe ontológica definida" }),         // Labels: domain
    ontologyCompliance: meter.createObservableGauge("knowledge_ontology_compliance",
      { description: "% de nós conformes com as regras da ontologia" }),

    // Relacionamentos
    relationshipAccuracy: meter.createObservableGauge("knowledge_relationship_accuracy",
      { description: "% de relacionamentos confirmados como corretos retrospectivamente" }),
    conflictRate: meter.createObservableGauge("knowledge_conflict_rate",
      { description: "% de nós com pelo menos 1 contradição ativa" }),

    // Inferência
    inferenceAccuracy: meter.createObservableGauge("knowledge_inference_accuracy",
      { description: "% de inferências confirmadas como corretas (rolling 30d)" }),
    inferenceSpeed: meter.createHistogram("knowledge_inference_duration_ms",
      { unit: "ms", boundaries: [10, 25, 50, 100, 250, 500, 1000] }),

    // Busca Semântica
    searchAccuracy: meter.createObservableGauge("knowledge_search_accuracy",
      { description: "% de buscas cujo top-3 continha o resultado esperado" }),
    searchLatency: meter.createHistogram("knowledge_search_duration_ms",
      { unit: "ms", boundaries: [5, 10, 25, 50, 100, 250, 500] }),

    // Qualidade
    knowledgeFreshness: meter.createObservableGauge("knowledge_freshness_score",
      { description: "Freshness médio do corpus (0–1)" }),
    knowledgeReuse: meter.createObservableGauge("knowledge_reuse_rate",
      { description: "Média de reutilizações por nó por mês" }),
    knowledgeQuality: meter.createObservableGauge("knowledge_quality_score",
      { description: "Score de qualidade médio do corpus" }),

    // Evolução e Complexidade
    knowledgeEvolution: meter.createCounter("knowledge_versions_total",
      { description: "Total de versões criadas no grafo" }),
    knowledgeComplexity: meter.createObservableGauge("knowledge_graph_complexity",
      { description: "Profundidade média da taxonomia no grafo" }),
  };
}
```

## 12.1 KPIs Oficiais

| KPI | Meta | Warning | Critical |
|---|---|---|---|
| Knowledge Growth | > 100 nós/dia | < 10/dia | = 0/dia |
| Graph Connectivity | > 80% | < 60% | < 40% |
| Ontology Coverage | > 85% | < 70% | < 50% |
| Relationship Accuracy | > 80% | < 65% | < 50% |
| Inference Accuracy | > 75% | < 60% | < 45% |
| Semantic Search Accuracy | > 80% | < 65% | < 50% |
| Knowledge Freshness | > 70% | < 50% | < 30% |
| Knowledge Reuse | > 5x/mês | < 2x/mês | < 1x/mês |
| Knowledge Quality | > 0.75 | < 0.60 | < 0.45 |
| Conflict Rate | < 5% | > 10% | > 20% |
| Search P95 | < 100ms | > 250ms | > 500ms |
| Inference P95 | < 250ms | > 500ms | > 1000ms |

---

# REVISÃO 13 — CHECKLIST OFICIAL

---

```
CHECKLIST OFICIAL — KNOWLEDGE ARCHITECTURE — MDS v1.5
═══════════════════════════════════════════════════════════════════════════════

KNOWLEDGE MODEL
  [ ] KnowledgeNode com todos os campos: identity, content, ontology, relationships,
      provenance, governance, quality, lifecycle, metadata
  [ ] KnowledgeNodeType com 12 tipos implementados
  [ ] KnowledgeNodeStatus com 6 estados e transições válidas
  [ ] KnowledgeIdentity com fingerprint SHA-256 e globalId estável
  [ ] KnowledgeProvenance com confidenceScore, qualityScore e trustScore

KNOWLEDGE GRAPH ENGINE
  [ ] KnowledgeGraphEngine com CRUD completo de nós e arestas
  [ ] Idempotência por fingerprint (createNode não duplica por conteúdo)
  [ ] Traversal BFS, DFS e Semantic implementados
  [ ] Semantic traversal usando vector store
  [ ] subgraph() com density calculada
  [ ] GraphSearchQuery com 4 modes (SEMANTIC, KEYWORD, HYBRID, GRAPH)
  [ ] Cache por TraversalOptions com TTL 300s
  [ ] Embedding gerado assincronamente (não bloqueia createNode)
  [ ] Evento knowledge.created publicado

KNOWLEDGE RELATIONSHIP ENGINE
  [ ] 36 RelationshipTypes implementados
  [ ] Relacionamentos bidirecionais automáticos
  [ ] Idempotência por (from, to, type)
  [ ] inferRelationships() com regra de transitividade
  [ ] findConflicts() com severity classificada
  [ ] Evento knowledge.linked publicado
  [ ] Evento knowledge.unlinked publicado

ONTOLOGY ENGINE
  [ ] DomainOntology com classes, properties, constraints, taxonomy
  [ ] AliasMap, SynonymMap e CanonicalNameMap por domínio
  [ ] register() com validação obrigatória
  [ ] classify() assinalando classe ao nó
  [ ] resolveCanonical() e resolveAliases() funcionais
  [ ] validate() com hard-fail para propriedades obrigatórias
  [ ] evolve() criando nova versão e arquivando a anterior
  [ ] Evento knowledge.updated (ONTOLOGY_REGISTERED, ONTOLOGY_EVOLVED)

DOMAIN KNOWLEDGE ENGINE
  [ ] 10 domínios oficiais definidos em OFFICIAL_DOMAINS
  [ ] DomainKnowledgeBase com nodeCount, edgeCount, coverageScore
  [ ] addToDomain() vinculando nó ao domínio via BELONGS_TO
  [ ] getDomainKnowledgeBase() com cache TTL 600s

KNOWLEDGE REASONING ENGINE
  [ ] 6 ReasoningStrategies implementadas
  [ ] DEDUCTION com ruleStore por domínio
  [ ] MULTI_STEP com profundidade configurável
  [ ] CROSS_DOMAIN cruzando grafos de domínios diferentes
  [ ] Inferências persistidas como KnowledgeNodeType.INFERENCE
  [ ] ReasoningTrace com step-by-step auditável
  [ ] HypothesisValidation com recommendation (ACCEPT/REJECT/INVESTIGATE)
  [ ] Evento knowledge.reasoned publicado
  [ ] Evento knowledge.inferred publicado por nova inferência

SEMANTIC SEARCH ENGINE
  [ ] 7 SearchModes implementados
  [ ] Hybrid Search com Reciprocal Rank Fusion (RRF, k=60)
  [ ] Entity Search usando canonicalName + aliases da OntologyEngine
  [ ] Temporal Search com filtro de faixa de data
  [ ] SearchExplanation com rankingFactors e fusionMethod
  [ ] Filtros pós-busca por minConfidence e minRelevance

KNOWLEDGE FEDERATION ENGINE
  [ ] 8 FederationSources com SOURCE_PRIORITY definida
  [ ] Deduplicação por (domain + canonicalName)
  [ ] ConflictResolution com 6 estratégias
  [ ] ENTERPRISE_WINS tem prioridade 100
  [ ] Resultado com sourceBreakdown por fonte
  [ ] Evento knowledge.merged publicado

KNOWLEDGE QUALITY ENGINE
  [ ] 11 dimensões de qualidade avaliadas
  [ ] overallScore com pesos documentados
  [ ] computeFreshness com 6 faixas de tempo
  [ ] usageScore integrado ao usageStore

KNOWLEDGE GOVERNANCE ENGINE
  [ ] 5 níveis de KnowledgeVisibility
  [ ] KnowledgePermission com expiresAt
  [ ] 6 KnowledgeActions (READ, WRITE, DELETE, SHARE, CERTIFY, ARCHIVE)
  [ ] certify() com verificação de permissão
  [ ] applyRetention() para ARCHIVE/DELETE/ANONYMIZE
  [ ] deleteUserKnowledge() para direito ao esquecimento (LGPD)
  [ ] Evento knowledge.certified publicado
  [ ] Evento knowledge.deleted publicado

EVENTOS (13 eventos)
  [ ] knowledge.created, updated, deleted
  [ ] knowledge.linked, unlinked
  [ ] knowledge.reasoned, inferred, merged, split
  [ ] knowledge.validated, certified, deprecated, archived
  [ ] Idempotência garantida por nodeId em todos os eventos

OBSERVABILIDADE
  [ ] knowledge_nodes_total por domain e type
  [ ] knowledge_graph_density calculado diariamente
  [ ] knowledge_ontology_coverage por domain
  [ ] knowledge_inference_accuracy rolling 30d
  [ ] knowledge_search_accuracy e latência instrumentados
  [ ] Alertas configurados para todos os KPIs críticos
  [ ] Dashboard "Knowledge Graph Overview" criado

CONTRATOS E SCHEMAS
  [ ] KnowledgeNode com schema Zod completo
  [ ] KnowledgeRelationship com schema Zod
  [ ] SearchQuery e SearchResult com schema Zod
  [ ] FederatedKnowledge com schema Zod
  [ ] Backward compatibility garantida

COMPLIANCE
  [ ] PII isolado por userId + orgId
  [ ] deleteUserKnowledge() implementado e testado
  [ ] ComplianceTag por nó (LGPD, GDPR, HIPAA, SOC2)
  [ ] ApprovalStatus para nós que requerem aprovação humana
  [ ] Audit log imutável em KnowledgeGovernance.auditLog

ESCALABILIDADE
  [ ] KnowledgeGraphEngine stateless → escala horizontal
  [ ] GraphStore com sharding por domain
  [ ] VectorStore com particionamento por orgId
  [ ] Cache por TraversalOptions e DomainKnowledgeBase
  [ ] FederationEngine com retry por fonte
  [ ] ReasoningEngine com limite de profundidade configurável
```

---

# REVISÃO 14 — TABELA DE RESPONSABILIDADE

---

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│         TABELA DE RESPONSABILIDADE — KNOWLEDGE ARCHITECTURE — MDS v1.5                         │
├──────────────────────────────┬──────────────────────────────────────────────────────────────────┤
│ Componente                   │ Especificação                                                    │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ KnowledgeGraphEngine         │ R: Grafo semântico central — CRUD de nós e arestas              │
│                              │ E: KnowledgeNode, GraphSearchQuery, TraversalOptions            │
│                              │ S: KnowledgeNode, TraversalResult, KnowledgeSubgraph            │
│                              │ D: GraphStore, VectorStore, KeywordIndex, EmbeddingGenerator    │
│                              │ P: knowledge.created, knowledge.updated                         │
│                              │ C: —                                                             │
│                              │ Escala: Stateless, horizontal; GraphStore sharding por domain   │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ KnowledgeRelationshipEngine  │ R: Gerenciar as 36 arestas tipadas do grafo                     │
│                              │ E: (fromId, toId, RelationshipType, properties)                 │
│                              │ S: KnowledgeRelationship, InferredRelationship[]                │
│                              │ D: GraphStore                                                    │
│                              │ P: knowledge.linked, knowledge.unlinked                         │
│                              │ C: —                                                             │
│                              │ Escala: Stateless, horizontal                                    │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ OntologyEngine               │ R: Gerir ontologias por domínio; classificar e validar nós      │
│                              │ E: DomainOntology, KnowledgeNode                                │
│                              │ S: OntologyClass, OntologyValidationResult, DomainOntology      │
│                              │ D: OntologyStore (em memória + PostgreSQL para persistência)    │
│                              │ P: knowledge.updated (ONTOLOGY_REGISTERED, ONTOLOGY_EVOLVED)    │
│                              │ C: knowledge.created (para classificar novos nós)               │
│                              │ Escala: In-memory por instância; sync via broadcast no cluster  │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ DomainKnowledgeEngine        │ R: Gerir Knowledge Bases por domínio de negócio                 │
│                              │ E: DomainCode, nodeId                                           │
│                              │ S: KnowledgeDomain, DomainKnowledgeBase                        │
│                              │ D: GraphStore, KnowledgeGraphEngine, DomainStore               │
│                              │ P: —                                                             │
│                              │ C: knowledge.created (para incrementar contadores)              │
│                              │ Escala: Stateless, cache TTL 600s por domínio                  │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ KnowledgeReasoningEngine     │ R: Inferir novo conhecimento via regras e estratégias           │
│                              │ E: ReasoningContext (seedNodes, domain, strategy, depth)        │
│                              │ S: ReasoningResult com InferredFact[] e ReasoningTrace          │
│                              │ D: KnowledgeGraphEngine, RuleStore, VectorStore                 │
│                              │ P: knowledge.reasoned, knowledge.inferred                       │
│                              │ C: knowledge.created, knowledge.updated (reavaliação)           │
│                              │ Escala: Stateless; limitar por maxDepth para evitar loops       │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ SemanticSearchEngine         │ R: Busca semântica, keyword, híbrida e de grafo                 │
│                              │ E: SearchQuery (text, embedding, domain, type, mode)            │
│                              │ S: SearchResult com SearchHit[] ranqueados e explanation        │
│                              │ D: VectorStore, KeywordIndex, KnowledgeGraphEngine              │
│                              │ P: —                                                             │
│                              │ C: —                                                             │
│                              │ Escala: Stateless, horizontal; VectorStore sharding por orgId  │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ KnowledgeFederationEngine    │ R: Integrar conhecimento de múltiplas fontes                    │
│                              │ E: FederationQuery (topic, domain, sources, minConfidence)      │
│                              │ S: FederatedKnowledge com resolved[] e conflicts[]              │
│                              │ D: InternalStore, ExternalAPIs, MarketplaceAPI, SpecialistBus  │
│                              │ P: knowledge.merged                                             │
│                              │ C: —                                                             │
│                              │ Escala: Worker pool; retry por fonte; timeout por source       │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ KnowledgeQualityEngine       │ R: Avaliar 11 dimensões de qualidade por nó                    │
│                              │ E: KnowledgeNode                                                │
│                              │ S: KnowledgeQuality com overallScore                           │
│                              │ D: UsageStore, KnowledgeGraphEngine (para consistency)         │
│                              │ P: —                                                             │
│                              │ C: knowledge.published (avalia após publicação)                 │
│                              │ Escala: Stateless, horizontal                                   │
├──────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ KnowledgeGovernanceEngine    │ R: Permissões, compliance, retenção e auditoria                 │
│                              │ E: nodeId, userId, KnowledgeAction, ComplianceTag              │
│                              │ S: boolean (checkPermission), DeletionResult, AuditLog         │
│                              │ D: GraphStore, KnowledgeGraphEngine                            │
│                              │ P: knowledge.certified, knowledge.deleted, knowledge.archived  │
│                              │ C: —                                                             │
│                              │ Escala: Stateless; auditLog append-only em store dedicado      │
└──────────────────────────────┴──────────────────────────────────────────────────────────────────┘
```

---

# DECLARAÇÃO FINAL — MDS v1.5

---

Esta revisão estabelece a **arquitetura definitiva do domínio de conhecimento do MemoryOS**.

Todo conhecimento passa a ser representado por um modelo semântico unificado:

| Atributo | Componente |
|---|---|
| **Identidade única** | KnowledgeIdentity — canonicalName + fingerprint + globalId |
| **Relacionamentos explícitos** | KnowledgeRelationshipEngine — 36 RelationshipTypes |
| **Ontologia** | OntologyEngine — classes, taxonomia, aliases, canonical names |
| **Contexto** | KnowledgeContext — domínio, usuário, org, região, horário |
| **Origem** | KnowledgeProvenance — origin, evidence, trustScore |
| **Evidências** | KnowledgeEvidence — DIRECT/INFERRED/CONFIRMED/CORROBORATED |
| **Versionamento** | KnowledgeLifecycle — semver + histórico imutável |
| **Governança** | KnowledgeGovernanceEngine — visibility, permissions, compliance, LGPD |
| **Inferência** | KnowledgeReasoningEngine — 6 estratégias, trace auditável |
| **Evolução** | KnowledgeEvolutionEngine (MDS v1.4) — EvolutionType, rollback |
| **Auditoria** | GovernanceAuditLog + ReasoningTrace + KnowledgeTimeline |
| **Reutilização** | SemanticSearchEngine + KnowledgeFederationEngine |

A arquitetura de conhecimento torna-se a base oficial para: Memory Engine, Learning Engine, Planner, Goal Engine, Capability Intelligence, Marketplace, Specialists, Recommendation Engine, Prediction Engine e Voice Engine.

Todos os componentes permanecem **desacoplados, orientados a eventos, altamente escaláveis e compatíveis com MAS, MCF, MCIS, MGIS e todas as revisões anteriores do MDS**.

---

**MDS v1.5 — Knowledge Architecture — Arquitetura Definitiva do Conhecimento**  
**Data:** 2026-07-09 · **Adenda ao:** MDS v1.4 · **Série:** MDS v1.0 → v1.1 → v1.2 → v1.3 → v1.4 → v1.5