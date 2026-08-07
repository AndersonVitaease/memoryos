# MCIS-Registry — Registries, Grafos, Taxonomia e Discovery Automático

**Versão:** 1.0  
**Status:** Oficial  
**Parte:** 2 de 4 do MCIS

---

## 1. Capability Registry

O Capability Registry é o catálogo central de todas as capacidades disponíveis no ecossistema.

### 1.1 Contrato do Capability Registry

```typescript
interface CapabilityRegistry {
  // Registro
  register(capability: ConnectorCapabilityDescriptor): void;
  unregister(capabilityId: string): void;
  
  // Busca
  findBySemanticVerb(verb: SemanticVerb): ConnectorCapabilityDescriptor[];
  findByOntologyDomain(domain: OntologyDomain): ConnectorCapabilityDescriptor[];
  findByNaturalQuery(query: string): RankedCapability[];
  findSimilar(capabilityId: string): SimilarCapability[];
  
  // Composição
  findComposable(
    capabilityIds: string[]
  ): ComposabilityResult;
  
  // Compatibilidade
  checkCompatibility(
    capabilityA: string,
    capabilityB: string
  ): CompatibilityResult;
}

interface ConnectorCapabilityDescriptor {
  capabilityId: string;           // ID único sequencial
  connectorId: string;
  name: string;                   // Ex: "SEND_EMAIL"
  displayName: string;            // Ex: "Enviar E-mail"
  
  // Ontologia
  ontologyDomain: OntologyDomain;
  semanticVerb: SemanticVerb;
  semanticObject: string;         // O que o verbo age sobre: "EMAIL_MESSAGE"
  
  // Composição
  composableWith: string[];       // IDs de capabilities compativeis
  requiresCapabilities: string[]; // Capabilities que devem existir antes
  producesCapabilities: string[]; // Capabilities que este habilita
  
  // Contratos
  inputContract: InputContract;
  outputContract: OutputContract;
  
  // Restrições
  constraints: CapabilityConstraint[];
  
  // Métricas
  metrics: CapabilityMetrics;
  
  // Semântica
  keywords: string[];
  synonyms: string[];             // Ex: ["enviar email", "mandar mensagem", "reply"]
  
  // Cache e performance
  cacheable: boolean;
  estimatedCostMs: number;
  estimatedTokenCost: number;     // Para capacidades que usam IA
}
```

---

## 2. Capability Graph

O Capability Graph representa as relações de composição, dependência e equivalência entre capacidades de todos os Connectors.

### 2.1 Estrutura do Grafo

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CAPABILITY GRAPH                               │
└─────────────────────────────────────────────────────────────────────┘

Nós = Capabilities
Arestas = Relações

Tipos de aresta:
  ──COMPOSES──►     Capacidade A pode ser composta com B
  ──REQUIRES──►     Capacidade A requer que B exista
  ──PRODUCES──►     Capacidade A habilita/produz B
  ──EQUIVALENT──►   A e B fazem a mesma coisa (providers diferentes)
  ──ALTERNATIVE──►  B é alternativa a A quando A não está disponível
  ──CONFLICTS──►    A e B não podem ser usadas juntas

Exemplo — Gmail + Google Calendar:

  SEARCH_EMAILS ──PRODUCES──► READ_EMAIL
       │
       └──COMPOSES──► EXTRACT_CALENDAR_INVITE
                            │
                            └──COMPOSES──► CREATE_CALENDAR_EVENT
                                               │
                                               └──COMPOSES──► SEND_INVITE_EMAIL
```

### 2.2 Interface do Capability Graph

```typescript
interface CapabilityGraph {
  // Adicionar relação
  addEdge(
    from: string,
    to: string,
    relation: CapabilityRelation,
    weight?: number
  ): void;

  // Navegação
  getNeighbors(capabilityId: string): CapabilityNeighbor[];
  getComposablePath(
    from: string,
    to: string
  ): CapabilityPath[];

  // Descoberta de workflows
  discoverWorkflows(
    goal: string
  ): DiscoveredWorkflow[];

  // Similaridade
  getSimilarity(
    capA: string,
    capB: string
  ): number; // 0.0 a 1.0

  // Análise
  findEquivalents(capabilityId: string): string[];
  findAlternatives(capabilityId: string): RankedAlternative[];
  findConflicts(capabilityIds: string[]): ConflictResult[];
}
```

### 2.3 Exemplo — Grafo Gmail + Shopify + Bling

```
SHOPIFY.GET_ORDER ──PRODUCES──► order_data
       │
       └──COMPOSES──► BLING.CREATE_INVOICE(order_data)
                            │
                            ├──PRODUCES──► invoice_pdf
                            │
                            └──COMPOSES──► GMAIL.SEND_EMAIL(
                                             to: order.customer_email,
                                             attachment: invoice_pdf
                                           )
                                           
Workflow descoberto automaticamente:
  "Processar pedido e enviar NF-e ao cliente"
  Steps: GET_ORDER → CREATE_INVOICE → SEND_EMAIL
  Connectors: ShopifyConnector, BlingConnector, GmailConnector
  Estimativa: 3.2 segundos | Custo: baixo
```

---

## 3. Entity Registry

```typescript
interface EntityRegistry {
  register(entity: ConnectorEntityDescriptor): void;
  findByType(entityType: string): ConnectorEntityDescriptor[];
  findByConnector(connectorId: string): ConnectorEntityDescriptor[];
  getSchema(entityId: string): JSONSchema;
  mapEntities(
    sourceEntityId: string,
    targetEntityId: string
  ): EntityMapping;
}

interface ConnectorEntityDescriptor {
  entityId: string;
  connectorId: string;
  entityName: string;             // Ex: "EmailMessage"
  ontologyType: string;           // Ex: "COMMUNICATION.MESSAGING.EMAIL_MESSAGE"
  schema: JSONSchema;             // Schema completo da entidade
  
  // Operações suportadas sobre esta entidade
  operations: EntityOperation[];  // CREATE, READ, UPDATE, DELETE, SEARCH, LIST
  
  // Relacionamentos com outras entidades
  relationships: EntityRelationship[];
  
  // Mapeamento para entidades de outros Connectors
  equivalentEntities: EquivalentEntity[];
  // Ex: EmailMessage ↔ SlackMessage (ambos são "mensagens")
}
```

---

## 4. Action Registry

```typescript
interface ActionRegistry {
  register(action: ConnectorActionDescriptor): void;
  findByConnector(connectorId: string): ConnectorActionDescriptor[];
  findByVerb(verb: SemanticVerb): ConnectorActionDescriptor[];
  getInputContract(actionId: string): InputContract;
  getOutputContract(actionId: string): OutputContract;
}

interface ConnectorActionDescriptor {
  actionId: string;
  connectorId: string;
  name: string;                   // Ex: "SEND_EMAIL"
  semanticVerb: SemanticVerb;
  
  // Contratos formais (ver MCIS-Contracts)
  inputContract: InputContract;
  outputContract: OutputContract;
  
  // Comportamento
  idempotent: boolean;
  transactional: boolean;
  reversible: boolean;
  reverseAction?: string;         // Ex: SEND_EMAIL não tem; DELETE_EMAIL → RESTORE_EMAIL
  
  // Restrições
  requiresAuth: boolean;
  requiredPermissions: string[];
  rateLimitPerMinute?: number;
  
  // Composição
  canRunInParallel: boolean;
  dependsOn: string[];            // Actions que devem rodar antes
  triggers: string[];             // Events que este action emite
}
```

---

## 5. Event Registry

```typescript
interface EventRegistry {
  register(event: ConnectorEventDescriptor): void;
  findByConnector(connectorId: string): ConnectorEventDescriptor[];
  findByOntologyDomain(domain: OntologyDomain): ConnectorEventDescriptor[];
  subscribe(
    eventType: string,
    handler: EventHandler
  ): UnsubscribeFn;
}

interface ConnectorEventDescriptor {
  eventId: string;
  connectorId: string;
  eventType: string;              // Ex: "connector.gmail.email_received"
  ontologyDomain: OntologyDomain;
  
  // Quando este evento é emitido
  trigger: string;                // Descrição do trigger
  
  // Payload do evento
  payloadSchema: JSONSchema;
  
  // Entidades relacionadas
  relatedEntities: string[];      // IDs de entidades no EntityRegistry
  
  // Workflows que este evento pode iniciar
  canTriggerWorkflows: string[];
}
```

---

## 6. Workflow Registry

```typescript
interface WorkflowRegistry {
  register(workflow: ConnectorWorkflowDescriptor): void;
  discover(goal: string): DiscoveredWorkflow[];
  findByCapabilities(capabilityIds: string[]): WorkflowMatch[];
  getOptimal(
    goal: string,
    constraints: WorkflowConstraints
  ): OptimalWorkflow;
}

interface ConnectorWorkflowDescriptor {
  workflowId: string;
  name: string;
  description: string;
  ontologyGoal: string;

  // Steps do workflow
  steps: WorkflowStep[];

  // Connectors necessários
  requiredConnectors: string[];
  optionalConnectors: string[];

  // Métricas estimadas
  estimatedDurationMs: number;
  estimatedCost: WorkflowCost;

  // Condições
  preConditions: WorkflowCondition[];
  postConditions: WorkflowCondition[];

  // Variações
  alternativeWorkflows: string[];
  canRunInParallel: boolean;
}

interface WorkflowStep {
  stepId: string;
  order: number;
  connectorId: string;
  action: string;
  inputMapping: DataMapping;      // Como mapear output do step anterior → input deste
  outputMapping: DataMapping;
  optional: boolean;
  onFailure: "ABORT" | "SKIP" | "FALLBACK";
  fallbackStepId?: string;
}
```

---

## 7. Permission Registry e Constraint Registry

```typescript
interface PermissionRegistry {
  register(permission: ConnectorPermissionDescriptor): void;
  checkRequired(
    userId: string,
    capabilityId: string
  ): PermissionCheckResult;
  getGranted(userId: string): string[];
  filterByPermissions(
    capabilities: string[],
    userId: string
  ): string[];
}

interface ConstraintRegistry {
  register(constraint: ConnectorConstraintDescriptor): void;
  evaluate(
    capabilityId: string,
    context: ExecutionContext
  ): ConstraintEvaluationResult;
  getActive(connectorId: string): ConnectorConstraintDescriptor[];
}

interface ConnectorConstraintDescriptor {
  constraintId: string;
  connectorId: string;
  type: ConstraintType;
  
  // Ex de tipos:
  // RATE_LIMIT: maxCalls por minuto/hora/dia
  // TIME_WINDOW: só pode ser chamado em horários específicos
  // DATA_VOLUME: limite de dados por período
  // GEO_RESTRICTION: só pode ser usado em certas regiões
  // DEPENDENCY: só pode rodar após outro connector
  // MUTUAL_EXCLUSION: não pode rodar junto com X
  
  value: unknown;
  severity: "HARD" | "SOFT";     // HARD = bloqueia; SOFT = avisa
  message: string;                // Mensagem ao Core quando violada
}
```

---

## 8. Dependency Registry

```typescript
interface DependencyRegistry {
  register(dependency: ConnectorDependencyDescriptor): void;
  resolve(
    connectorId: string
  ): DependencyResolutionResult;
  getGraph(): DependencyGraph;
  detectCircular(): CircularDependency[];
}

interface ConnectorDependencyDescriptor {
  connectorId: string;
  
  // Outros Connectors que devem estar disponíveis
  requiredConnectors: ConnectorDependency[];
  
  // Capacidades que devem existir (independente do Connector)
  requiredCapabilities: CapabilityDependency[];
  
  // Serviços internos do MemoryOS necessários
  requiredServices: ServiceDependency[];
  // Ex: ["MEMORY_ENGINE", "POLICY_ENGINE", "EVENT_BUS"]
  
  // Versão mínima de dependências
  versionConstraints: VersionConstraint[];
}
```

---

## 9. Context Requirements e Memory Requirements

```typescript
interface ContextRequirements {
  // Dados de contexto que o Connector precisa receber para funcionar
  requiredContextFields: ContextField[];
  // Ex: GmailConnector requer: userId, userEmail, sessionId
  
  optionalContextFields: ContextField[];
  
  // O Connector pode operar sem usuário? (modo sistema)
  supportsSystemContext: boolean;
  
  // Requer contexto de projeto específico?
  requiresProjectContext: boolean;
}

interface MemoryRequirements {
  // O Connector precisa ler algo da memória do usuário antes de executar?
  readsFromMemory: MemoryReadRequirement[];
  // Ex: GmailConnector pode precisar do email do usuário armazenado
  
  // O Connector propõe atualizações de memória após execução?
  writesToMemory: MemoryWriteRequirement[];
  
  // Qual camada de memória?
  memoryTier: "ACTIVE" | "HISTORICAL" | "ARCHIVED" | "ANY";
  
  // TTL dos dados em memória (para controle do Memory Engine)
  retentionPolicy: MemoryRetentionPolicy;
}
```

---

## 10. Auto Registration — Hot Plug / Hot Remove / Hot Update

### 10.1 Hot Plug

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOT PLUG — FLUXO COMPLETO                    │
└─────────────────────────────────────────────────────────────────┘

  Novo Connector detectado (instalação, restart, novo nó)
         │
         ▼
  1. MCIS Registry Engine recebe notificação
         │
         ▼
  2. Connector.initialize() executado
         │
         ▼
  3. Connector.describe() → ConnectorSelfDescription
         │
         ▼
  4. Auto Validation:
     ├── Manifesto válido? (MCF)
     ├── SelfDescription completo? (MCIS)
     ├── Assinatura digital válida?
     └── sdkCompatibility ok?
         │
         ▼
  5. Auto Registration nos Registries:
     ├── CapabilityRegistry.register(capabilities[])
     ├── EntityRegistry.register(entities[])
     ├── ActionRegistry.register(actions[])
     ├── EventRegistry.register(events[])
     └── WorkflowRegistry.register(workflows[])
         │
         ▼
  6. Atualização do Capability Graph
     └── Novas arestas de composição adicionadas
         │
         ▼
  7. Auto Version Negotiation
     └── Verificar conflitos com versões existentes
         │
         ▼
  8. Auto Dependency Resolution
     └── Todas as dependências satisfeitas?
         │
         ▼
  9. Evento emitido: CONNECTOR_HOT_PLUGGED
         │
         ▼
  10. Connector disponível imediatamente para o Core
      SEM reinicialização do sistema
```

### 10.2 Hot Remove

```
Connector removido (desinstalação, falha, manutenção)
       │
       ▼
1. MCIS Registry Engine notificado
       │
       ▼
2. Verificar workflows em andamento que usam este Connector
   ├── Nenhum: continuar
   └── Existem: aguardar conclusão (grace period: 30s) ou redirecionar
       │
       ▼
3. Remover dos Registries
4. Remover arestas do Capability Graph
5. Identificar capabilities órfãs
6. Ativar alternatives (Capability Graph: ALTERNATIVE edges)
7. Evento: CONNECTOR_HOT_REMOVED
```

### 10.3 Hot Update

```
Nova versão do Connector disponível
       │
       ▼
1. Auto Version Negotiation:
   ├── MINOR/PATCH: update transparente (backward compatible)
   └── MAJOR: período de coexistência (v1 + v2 simultâneos)
       │
       ▼
2. Nova describe() comparada com anterior:
   ├── Novas capabilities: adicionadas ao Capability Graph
   ├── Capabilities removidas: verificar impacto + alternativas
   └── Capabilities modificadas: versionar contratos
       │
       ▼
3. Rolling update (MCF-Lifecycle §10)
4. Registries atualizados atomicamente
5. Evento: CONNECTOR_HOT_UPDATED
```

---

## 11. Auto Validation e Auto Certification

```typescript
interface AutoValidation {
  // Validação estrutural (síncrona)
  validateStructure(
    description: ConnectorSelfDescription
  ): ValidationResult;
  
  // Validação semântica
  validateSemantics(
    description: ConnectorSelfDescription
  ): SemanticValidationResult;
  
  // Validação de contratos
  validateContracts(
    description: ConnectorSelfDescription
  ): ContractValidationResult;
  
  // Validação de segurança (MCF-Security)
  validateSecurity(
    description: ConnectorSelfDescription,
    manifest: ConnectorManifest
  ): SecurityValidationResult;
}

interface AutoCertification {
  // Executa testes de certificação automaticamente
  runCertificationSuite(
    connector: MemoryOSConnector
  ): Promise<CertificationResult>;
  
  // Verifica compliance com MCIS
  checkMCISCompliance(
    description: ConnectorSelfDescription
  ): ComplianceResult;
  
  // Verifica compliance com MCF
  checkMCFCompliance(
    connector: MemoryOSConnector
  ): ComplianceResult;
}
```

---

## 12. Auto Version Negotiation

```typescript
interface VersionNegotiation {
  // Verifica compatibilidade entre versões
  negotiate(
    requiredVersion: string,       // ">=1.0.0"
    availableVersions: string[]    // ["1.0.0", "1.2.0", "2.0.0"]
  ): NegotiationResult;
  
  // Seleciona melhor versão disponível
  selectBest(
    constraint: string,
    available: ConnectorVersion[]
  ): ConnectorVersion;
  
  // Verifica se há breaking changes
  hasBreakingChanges(
    fromVersion: string,
    toVersion: string
  ): BreakingChangeAnalysis;
}
```

---

## 13. Auto Dependency Resolution

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTO DEPENDENCY RESOLUTION                         │
└─────────────────────────────────────────────────────────────────┘

Dado: ShopifyConnector requer BlingConnector (para NF-e)
       │
       ▼
DependencyRegistry.resolve("ShopifyConnector")
       │
       ▼
┌─ BlingConnector disponível? ─────┐
│  ✅ SIM: continuar               │
│  ❌ NÃO: buscar alternativas     │
│     ├── QuickBooksConnector?     │
│     ├── ContaAzulConnector?      │
│     └── Nenhuma: DEPENDENCY_UNMET│
└──────────────────────────────────┘
       │
       ▼
Verificar versão:
  BlingConnector v2.1.0 requerido
  BlingConnector v2.3.0 instalado → compatível (minor update)
       │
       ▼
Grafo de dependências verificado:
  Nenhuma dependência circular detectada
       │
       ▼
Resultado: RESOLVED ✅
```

---

**Documento Oficial:** MCIS-Registry  
**Versão:** 1.0 · **Status:** Aprovado  
**Parte:** 2 de 4 do MCIS