# MDPS — MemoryOS Developer Platform Specification
## Official SDK, Extension Platform & Ecosystem Specification

**Versão:** 1.0  
**Status:** Documento Oficial da Plataforma de Desenvolvimento — Aprovado  
**Data:** 2026-07-10  
**Tipo:** Especificação de Ecossistema  
**Complementa:** MV · MPS · MAS · MDS 1.0–1.6 · MRS · MCS · MDIS · MIES · MCF · MDS Arch. Principles

---

## Declaração

Este documento define oficialmente **como desenvolvedores externos expandem o MemoryOS**.

| Documento | Define |
|---|---|
| **MV** | A visão estratégica |
| **MPS** | O que o produto representa |
| **MAS** | Como o sistema é construído |
| **MDS** | Como implementá-lo |
| **MRS** | Como funciona em runtime |
| **MCS** | O que é o Core e seus limites |
| **MDIS** | Como a plataforma raciocina e decide |
| **MIES** | Como a inteligência evolui continuamente |
| **MDPS** | Como terceiros desenvolvem para o MemoryOS |

**Não altera:** Core · Runtime · Roadmap · Arquitetura  
**Define:** O ecossistema oficial de desenvolvimento.

---

# CAPÍTULO 1 — FILOSOFIA DA PLATAFORMA

## O MemoryOS é uma plataforma extensível por design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FILOSOFIA DA PLATAFORMA — MDPS v1.0                     │
│                                                                             │
│  O Core do MemoryOS foi projetado para permanecer PEQUENO e ESTÁVEL.       │
│                                                                             │
│  Toda especialização ocorre FORA do Core, através de extensões oficiais.   │
│                                                                             │
│  O ecossistema cresce; o Core não.                                         │
│                                                                             │
│  Princípios fundamentais:                                                  │
│                                                                             │
│    OPEN EXTENSION ARCHITECTURE                                             │
│      Qualquer desenvolvedor pode criar extensões compatíveis               │
│                                                                             │
│    INTERFACE FIRST                                                         │
│      Toda extensão se conecta ao Core via Interface — nunca diretamente    │
│                                                                             │
│    LOW COUPLING                                                            │
│      Extensões não conhecem implementações de outras extensões             │
│                                                                             │
│    HIGH COHESION                                                           │
│      Cada extensão tem responsabilidade única e bem definida               │
│                                                                             │
│    BACKWARD COMPATIBILITY                                                  │
│      Extensões publicadas nunca quebram silenciosamente                    │
│                                                                             │
│    SECURITY FIRST                                                          │
│      Toda extensão executa em sandbox com permissões mínimas               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# CAPÍTULO 2 — ECOSSISTEMA

## Tipos de Extensão Suportados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXTENSION TYPES — MDPS v1.0                        │
├──────────────────────────┬──────────────────────────┬──────────────────────┤
│ Tipo                     │ Responsabilidade         │ Interface            │
├──────────────────────────┼──────────────────────────┼──────────────────────┤
│ Connector                │ Integrar sistema externo  │ IConnector           │
│ Specialist               │ Conhecimento de domínio   │ ISpecialist          │
│ Knowledge Package        │ Base de conhecimento      │ IKnowledgeProvider   │
│ Policy                   │ Regra de negócio          │ IPolicyProvider      │
│ UI Extension             │ Componente de interface   │ IUIExtension         │
│ Event Subscriber         │ Consumir eventos do Bus   │ IEventSubscriber     │
│ Event Publisher          │ Publicar eventos no Bus   │ IEventPublisher      │
│ Workflow Template        │ Jornada reutilizável       │ IWorkflowTemplate    │
│ Prompt Template          │ Prompt reutilizável        │ IPromptTemplate      │
│ Capability Provider      │ Nova capability para       │ ICapabilityProvider  │
│                          │ o Negotiation Engine       │                      │
└──────────────────────────┴──────────────────────────┴──────────────────────┘
```

## Responsabilidades por Tipo

**Connector** — Integra o MemoryOS a um sistema externo (Gmail, Shopify, Gov.br). Implementa `execute()`, `rollback()`, `validate()` e `healthCheck()`. Nunca contém lógica de negócio.

**Specialist** — Fornece conhecimento especializado de um domínio (Jurídico, Médico, Fiscal). Recebe contexto do Core, retorna `KnowledgePackage`. Nunca toma decisões — apenas informa.

**Knowledge Package** — Biblioteca de conhecimento pré-estruturado para um domínio. Ontologias, fatos, regras, termos técnicos. Carregado no Knowledge Graph Engine.

**Policy** — Regra de negócio configurável que governa comportamento (ApprovalPolicy, RetentionPolicy). Implementada fora do Core, injetada pelo Governance Engine.

**UI Extension** — Componente visual que se integra à interface do MemoryOS. Executa em sandbox isolado. Acessa dados apenas via APIs públicas.

**Event Subscriber** — Reage a eventos do Universal Event Bus sem interferir no fluxo principal. Usado para integrações assíncronas e side effects.

**Event Publisher** — Publica eventos externos no Event Bus. Usado para webhooks de entrada e triggers de sistemas externos.

**Workflow Template** — Jornada pré-definida para um caso de uso recorrente (Onboarding, Declaração Fiscal). Reutilizável por múltiplos usuários.

**Prompt Template** — Template de prompt reutilizável com variáveis contextuais. Versionado e auditável.

**Capability Provider** — Declara uma nova capability para o Capability Negotiation Engine. Pode ser implementada por um Connector ou Specialist.

---

# CAPÍTULO 3 — CONNECTOR SDK

## Estrutura de um Connector

```typescript
// Estrutura obrigatória de um Connector
interface ConnectorManifest {
  connectorId:    string;         // "com.empresa.gmail"
  name:           string;         // "Gmail Connector"
  version:        string;         // "1.0.0" (semver)
  author:         string;
  license:        string;
  capabilities:   Capability[];
  permissions:    Permission[];
  events: {
    publishes:    string[];       // eventos que este Connector publica
    subscribes:   string[];       // eventos que este Connector consome
  };
  compatibility: {
    memoryOsVersion: string;      // ">=1.0.0"
    sdkVersion:      string;      // ">=1.0.0"
  };
  security: {
    sandboxed:    boolean;        // sempre true
    secretsRef:   string[];       // chaves necessárias (sem valores)
  };
}
```

## Lifecycle de um Connector

```
REGISTERED → VALIDATED → CERTIFIED → PUBLISHED → ACTIVE → DEPRECATED → RETIRED

  REGISTERED:   Manifesto submetido ao Registry
  VALIDATED:    Schema e segurança verificados
  CERTIFIED:    Aprovado pela Certification Pipeline
  PUBLISHED:    Disponível no Marketplace
  ACTIVE:       Em uso por usuários
  DEPRECATED:   Nova versão disponível — aviso emitido
  RETIRED:      Removido do Marketplace
```

## Implementação Mínima

```typescript
class MyConnector implements IConnector {
  connectorId = "com.empresa.my-connector";
  capabilityId = "my.capability";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    // 1. Validar input
    const validation = this.validate(input);
    if (!validation.valid) throw new ConnectorError(validation.error);

    // 2. Executar (via Provider Adapter — nunca diretamente)
    const result = await this.providerAdapter.call(input, ctx);

    // 3. Retornar resultado padronizado
    return {
      connectorId:  this.connectorId,
      capabilityId: this.capabilityId,
      status:       "success",
      outputData:   result,
      executionRef: ctx.executionId,
      auditData:    { timestamp: new Date().toISOString() }
    };
  }

  async rollback(executionRef: unknown, ctx: ExecutionContext): Promise<RollbackResult> {
    // Implementar desfazimento da ação quando possível
    return { status: "rolled_back", executionRef };
  }

  validate(input: unknown): ValidationResult {
    // Validar schema do input sem chamar APIs externas
    return { valid: true };
  }

  async healthCheck(): Promise<HealthResult> {
    // Verificar disponibilidade do sistema externo
    return { status: "healthy", latencyMs: 0 };
  }

  getMetadata(): ConnectorMetadata {
    return {
      connectorId:   this.connectorId,
      capabilityId:  this.capabilityId,
      supportsRollback: true,
      estimatedLatencyMs: 500,
      version: "1.0.0"
    };
  }
}
```

## Regras de implementação

| Regra | Descrição |
|---|---|
| **Sandbox** | Connector executa em isolamento — sem acesso ao filesystem ou rede direta |
| **Secrets** | Credenciais via `ctx.secrets.get("KEY")` — nunca hardcoded |
| **Timeout** | Todo `execute()` deve respeitar `ctx.timeoutMs` |
| **Retry** | Connector declara `isRetryable(error)` — nunca implementa retry internamente |
| **Auditoria** | `auditData` obrigatório no resultado |
| **Rollback** | Declarar `supportsRollback: true` apenas se implementado completamente |

---

# CAPÍTULO 4 — SPECIALIST SDK

## Como criar um Specialist

```typescript
interface SpecialistManifest {
  specialistId:   string;         // "com.empresa.legal-specialist"
  name:           string;         // "Legal Specialist"
  domain:         string;         // "legal"
  subdomain?:     string;         // "contracts", "labor", etc.
  version:        string;
  author:         string;
  expertise:      ExpertiseDeclaration[];
  languages:      string[];        // ["pt-BR", "en-US"]
  compatibility: {
    memoryOsVersion: string;
    knowledgePackages: string[];   // dependências de KnowledgePkg
  };
}
```

## Declaração de Expertise

```typescript
interface ExpertiseDeclaration {
  topic:          string;          // "Contratos de trabalho CLT"
  confidence:     number;          // 0.0–1.0 — nível de especialização
  sources:        string[];        // "CLT 2024", "TST Jurisprudência"
  limitations:    string[];        // "Não cobre contratos internacionais"
}
```

## Ciclo de um Specialist

```
1. Recebe SpecialistRequest {
     query, context, workingMemory,
     identityContext, journeyId
   }
          ↓
2. Consulta KnowledgeGraph para fatos do domínio
          ↓
3. Aplica ontologia do domínio
          ↓
4. Gera KnowledgePackage {
     facts: Fact[],
     reasoning: ReasoningStep[],
     recommendations: Recommendation[],
     confidence: number,
     sources: Source[],
     limitations: string[]
   }
          ↓
5. Retorna ao Federation Engine (nunca ao usuário diretamente)
```

## Cooperação com outros Specialists

```typescript
// Specialist NÃO chama outro Specialist diretamente
// Specialist NÃO conhece outros Specialists

// CORRETO: Specialist publica resultado no Event Bus
eventBus.publish("specialist.knowledge.available", {
  specialistId: this.specialistId,
  domain: this.domain,
  knowledgePackage: result,
  journeyId: ctx.journeyId
});

// CORRETO: Federation Engine combina os resultados
// ERRADO: Specialist chama outro Specialist via import
```

---

# CAPÍTULO 5 — KNOWLEDGE PACKAGE SDK

## Estrutura de um Knowledge Package

```typescript
interface KnowledgePackageManifest {
  packageId:      string;          // "com.empresa.brazilian-labor-law"
  name:           string;          // "Brazilian Labor Law 2024"
  domain:         string;          // "legal"
  version:        string;          // "2024.1.0"
  author:         string;
  license:        string;
  sources:        OfficialSource[]; // fontes verificáveis
  language:       string;
  validUntil?:    string;          // data de validade (ISO 8601)
  dependencies:   string[];        // outros packages necessários
  compatibility: {
    memoryOsVersion: string;
    ontologyVersion: string;
  };
}

interface OfficialSource {
  name:    string;    // "CLT — Consolidação das Leis do Trabalho"
  url?:    string;    // URL oficial
  date:    string;    // data da versão
  type:    "law" | "regulation" | "jurisprudence" | "standard" | "other";
}
```

## Estrutura de Conteúdo

```typescript
interface KnowledgePackageContent {
  nodes:         KnowledgeNode[];    // fatos, conceitos, regras
  relationships: KnowledgeEdge[];    // relações entre nós
  ontology:      OntologyDefinition; // termos, sinônimos, aliases
  rules:         BusinessRule[];     // regras aplicáveis
  examples:      Example[];          // casos de uso reais
}
```

## Versionamento e Atualização

```
PUBLICADO → EM USO → ATUALIZADO → VERSÃO ANTERIOR DEPRECATED → MIGRAÇÃO → APOSENTADO

  Toda atualização publica changelog.
  Versão anterior fica ativa por 90 dias após nova versão.
  Nós substituídos têm replacedBy preenchido.
  Histórico de versões preservado para auditoria.
```

---

# CAPÍTULO 6 — POLICY SDK

## Como criar uma Policy

```typescript
interface PolicyManifest {
  policyId:       string;          // "com.empresa.approval-policy"
  name:           string;          // "High-Value Approval Policy"
  type:           PolicyType;      // "approval" | "retention" | "access" | "compliance"
  priority:       number;          // 1–100 (maior = maior prioridade)
  version:        string;
  author:         string;
  scope:          PolicyScope;     // "user" | "organization" | "platform"
  conditions:     PolicyCondition[];
  actions:        PolicyAction[];
  overrideable:   boolean;         // pode ser sobrescrita por outra Policy?
}
```

## Implementação de uma Policy

```typescript
class MyApprovalPolicy implements IPolicyProvider {
  policyId = "com.empresa.financial-approval";

  evaluate(ctx: PolicyContext): PolicyResult {
    // Verificar se a ação requer aprovação
    if (ctx.action.estimatedValue > 10000) {
      return {
        requiresApproval: true,
        approvalLevel:    "manager",
        reason:           "Valor acima do limite automático (R$ 10.000)",
        riskLevel:        "HIGH"
      };
    }
    return { requiresApproval: false };
  }
}
```

## Prioridade de Policies

```
SecurityPolicy         (prioridade 100 — nunca sobrescrita)
GovernancePolicy       (prioridade 90)
CompliancePolicy       (prioridade 80)
OrganizationalPolicy   (prioridade 70)
UserPolicy             (prioridade 60)
DefaultPolicy          (prioridade 10)
```

---

# CAPÍTULO 7 — WORKFLOW SDK

## Como criar um Workflow Template

```typescript
interface WorkflowTemplate {
  templateId:     string;          // "com.empresa.declaracao-ir"
  name:           string;          // "Declaração IR 2024"
  domain:         string;
  version:        string;
  steps:          WorkflowStep[];
  conditions:     WorkflowCondition[];
  events: {
    onStart:      EventTrigger[];
    onComplete:   EventTrigger[];
    onError:      EventTrigger[];
    onPause:      EventTrigger[];
  };
  humanApprovals: ApprovalGate[];
  rollbackPlan:   RollbackStep[];
}

interface WorkflowStep {
  stepId:         string;
  name:           string;
  type:           "connector" | "specialist" | "human" | "condition";
  capabilityId?:  string;
  specialistId?:  string;
  required:       boolean;
  parallel:       boolean;
  dependsOn:      string[];        // stepIds anteriores
  timeoutMs:      number;
  retryPolicy:    RetryPolicy;
}
```

## Condições e Ramificações

```
step_1 completado
          ↓
condition_1: resultado.valor > 1000?
  ├── true  → step_2a (aprovação manual)
  └── false → step_2b (aprovação automática)
          ↓
step_3 (ambos os caminhos convergem aqui)
```

---

# CAPÍTULO 8 — EXTENSION MANIFEST

## Manifesto Oficial Completo

```json
{
  "extensionId":   "com.empresa.nome-extensao",
  "name":          "Nome da Extensão",
  "type":          "connector",
  "version":       "1.0.0",
  "author": {
    "name":        "Nome do Autor",
    "email":       "autor@empresa.com",
    "url":         "https://empresa.com"
  },
  "license":       "MIT",
  "description":   "Descrição clara e completa do que a extensão faz.",
  "capabilities":  ["capability.name.action"],
  "permissions": [
    "read:user_context",
    "write:working_memory",
    "publish:events"
  ],
  "events": {
    "publishes":   ["extension.action.completed"],
    "subscribes":  ["execution.step.started"]
  },
  "secrets":       ["API_KEY", "CLIENT_SECRET"],
  "dependencies": {
    "extensions":  ["com.empresa.outra-extensao@^1.0.0"],
    "knowledgePkgs": ["com.empresa.ontologia@^2.0.0"]
  },
  "compatibility": {
    "memoryOsVersion": ">=1.0.0",
    "sdkVersion":      ">=1.0.0"
  },
  "security": {
    "sandboxed":         true,
    "supportsRollback":  true,
    "dataClassification": "general"
  },
  "quality": {
    "testCoverage":    95,
    "hasHealthCheck":  true,
    "hasObservability":true,
    "docsUrl":         "https://docs.empresa.com/extensao"
  }
}
```

---

# CAPÍTULO 9 — CERTIFICATION

## Níveis de Certificação

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CERTIFICATION LEVELS — MDPS v1.0                     │
├──────────────────┬──────────────────────────────────────────────────────────┤
│ COMMUNITY        │ Qualquer desenvolvedor · auto-publicação · sem revisão  │
│                  │ manual · badge "Community"                              │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ VERIFIED         │ Revisão automática de segurança + testes · badge verde  │
│                  │ · habilitado para Enterprise                            │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ ENTERPRISE       │ Revisão manual de segurança e performance · SLA garantido│
│                  │ · habilitado para dados críticos                        │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ OFFICIAL         │ Desenvolvido ou aprovado pela equipe MemoryOS · Core-   │
│                  │ level trust · Implementação de referência               │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

## Pipeline de Certificação

```
Extensão submetida
          ↓
STATIC ANALYSIS
  ├── Validação do manifesto (schema)
  ├── Verificação de imports proibidos (APIs diretas)
  ├── Detecção de hardcoded secrets
  └── Lint + formatação

SECURITY SCAN
  ├── Dependency vulnerability scan (OWASP)
  ├── SAST (Static Application Security Testing)
  ├── Permission analysis (least privilege)
  └── Supply chain security check

AUTOMATED TESTS
  ├── Unit tests (cobertura ≥ 80%)
  ├── Integration tests com ConnectorSimulator
  ├── Health Check funcional
  └── Rollback test (se supportsRollback=true)

PERFORMANCE TEST (Verified+)
  ├── Latência P95 < 2000ms
  ├── Memory usage < 100MB
  └── No memory leaks

MANUAL REVIEW (Enterprise+)
  ├── Code review por engenheiro certificado
  ├── Security review por especialista
  └── Compatibility review com versões anteriores

RESULTADO
  ├── APROVADO → badge atribuído → publicação autorizada
  └── REPROVADO → relatório de falhas → prazo para correção
```

## Critérios Mínimos por Nível

| Critério | Community | Verified | Enterprise | Official |
|---|---|---|---|---|
| Manifesto válido | ✓ | ✓ | ✓ | ✓ |
| Sem secrets hardcoded | ✓ | ✓ | ✓ | ✓ |
| Health Check | - | ✓ | ✓ | ✓ |
| Cobertura de testes | - | ≥ 80% | ≥ 90% | ≥ 95% |
| Documentação | básica | completa | completa | referência |
| Security scan | - | automático | manual | manual |
| SLA garantido | - | - | ✓ | ✓ |
| Revisão manual | - | - | ✓ | ✓ |

---

# CAPÍTULO 10 — MARKETPLACE

## Publicação

```
Extensão certificada
          ↓
Submeter ao Marketplace CLI:
  memorios publish --extension ./dist/my-extension.zip
          ↓
Marketplace verifica:
  ├── Certificação válida?
  ├── Manifesto consistente?
  ├── Versão não duplicada?
  └── Autor autenticado?
          ↓
Publicada → disponível em < 5 minutos
```

## Estrutura de Listagem

```typescript
interface MarketplaceListing {
  extensionId:   string;
  name:          string;
  description:   string;
  type:          ExtensionType;
  certification: CertificationLevel;
  version:       string;
  author:        AuthorInfo;
  stats: {
    downloads:   number;
    activeUsers: number;
    rating:      number;        // 1.0–5.0
    reviewCount: number;
  };
  versions:      VersionHistory[];
  tags:          string[];
  pricing:       "free" | "freemium" | "paid";
}
```

## Atualização e Remoção

```
ATUALIZAÇÃO:
  Submeter nova versão → pipeline de certificação
  Versão anterior permanece ativa por 30 dias
  Usuários notificados da nova versão disponível

REMOÇÃO:
  Autor solicita remoção → aviso de 30 dias para usuários ativos
  Versão permanece disponível para usuários já instalados por 90 dias
  Após 90 dias → listagem removida, pacote arquivado
  Registros de auditoria preservados indefinidamente
```

---

# CAPÍTULO 11 — SECURITY REQUIREMENTS

## Requisitos de Segurança Obrigatórios

```
SANDBOX
  Toda extensão executa em processo isolado
  Sem acesso direto ao filesystem do host
  Sem acesso à rede além das APIs declaradas no manifesto
  CPU e memória limitados por tipo de extensão

LEAST PRIVILEGE
  Solicitar apenas as permissões mínimas necessárias
  Permissões não utilizadas = reprovação na certificação
  Permissions declaradas no manifesto e verificadas em runtime

PERMISSION MODEL
  read:user_context       — acesso ao contexto do usuário
  read:working_memory     — leitura da Working Memory
  write:working_memory    — escrita na Working Memory
  read:knowledge_graph    — consulta ao Knowledge Graph
  write:knowledge_graph   — escrita no Knowledge Graph (requer Enterprise+)
  publish:events          — publicar eventos no Event Bus
  subscribe:events        — consumir eventos do Event Bus
  execute:connector       — chamar outro Connector (declarado)
  read:audit_trail        — leitura do AuditTrail próprio

SECRETS
  Nunca armazenados no código
  Acessados via ctx.secrets.get("SECRET_NAME")
  Rotacionados sem necessidade de redeploy
  Auditados a cada acesso

ENCRYPTION
  Dados em trânsito: TLS 1.3+
  Dados em repouso: AES-256
  Secrets: criptografados com chave por extensão

CODE SIGNING
  Todo pacote assinado digitalmente pelo autor
  Assinatura verificada antes da execução
  Hash do pacote registrado no AuditTrail

SUPPLY CHAIN SECURITY
  Dependências verificadas contra CVE database
  Dependências transitivas auditadas
  Lock file obrigatório (sem versões flutuantes)
```

---

# CAPÍTULO 12 — COMPATIBILITY

## Semantic Versioning para Extensões

```
MAJOR.MINOR.PATCH

  MAJOR: breaking change na interface ou comportamento
  MINOR: nova feature backward compatible
  PATCH: bugfix sem mudança de interface

Exemplos:
  1.0.0 → 1.0.1  Bugfix — atualização automática segura
  1.0.0 → 1.1.0  Nova feature — atualização segura com opt-in
  1.0.0 → 2.0.0  Breaking change — migração necessária
```

## Regras de Compatibilidade

| Regra | Descrição |
|---|---|
| **Additive only** | Novas versões apenas adicionam campos opcionais |
| **Deprecation period** | Campo removido: deprecated por ≥ 2 versões menores |
| **Migration guide** | Breaking changes exigem guia de migração publicado |
| **Compatibility window** | Versão anterior suportada por ≥ 90 dias |
| **memoryOsVersion** | Sempre declarar versão mínima compatível |
| **Graceful degradation** | Extensão deve funcionar mesmo com features opcionais ausentes |

## Checklist de Breaking Change

```
É breaking change se:
  ✓ Remove campo obrigatório de input
  ✓ Altera tipo de campo existente
  ✓ Muda semântica de capability
  ✓ Remove capability declarada
  ✓ Altera formato do output
  ✓ Muda Permission requerida
  ✓ Remove suporte a versão do SDK
```

---

# CAPÍTULO 13 — QUALITY STANDARDS

## Requisitos Mínimos de Qualidade

```
PERFORMANCE
  execute()      P95 < 2000ms  (Verified+)
  healthCheck()  P99 < 500ms
  validate()     P99 < 10ms    (síncrono, sem I/O)
  rollback()     P95 < 5000ms

COBERTURA DE TESTES
  Community:   sem requisito mínimo (recomendado ≥ 50%)
  Verified:    ≥ 80% de cobertura de statements
  Enterprise:  ≥ 90% + testes de integração
  Official:    ≥ 95% + testes de contrato

DOCUMENTAÇÃO OBRIGATÓRIA
  README.md:         visão geral, instalação, exemplo rápido
  CHANGELOG.md:      histórico de versões (formato keepachangelog.com)
  API Reference:     todas as capabilities documentadas
  Examples/:         pelo menos 1 exemplo funcional por capability

OBSERVABILIDADE
  Logs estruturados (JSON):  toda operação registrada
  Metrics:  latência, erros, chamadas por capability
  Tracing:  propagação de executionId em toda operação
  Health Check:  status, latência, dependências

HEALTH CHECK FORMAT
  {
    "status":       "healthy" | "degraded" | "unhealthy",
    "latencyMs":    number,
    "dependencies": [{ "name": string, "status": string }],
    "version":      string,
    "timestamp":    string
  }
```

---

# CAPÍTULO 14 — DEVELOPER EXPERIENCE

## MemoryOS CLI

```bash
# Instalação
npm install -g @memoryos/cli

# Criar nova extensão
memorios create connector --template github
memorios create specialist --domain legal
memorios create knowledge-package --domain medical

# Desenvolvimento local
memorios dev             # modo watch com hot reload
memorios simulate        # simular execução no ConnectorSimulator
memorios test            # executar bateria de testes

# Certificação e publicação
memorios lint            # verificar conformidade com MDPS
memorios certify         # submeter para certificação
memorios publish         # publicar no Marketplace

# Debug
memorios logs --extension my-extension --tail
memorios trace --execution-id exec-123
memorios replay --execution-id exec-123  # reproduzir execução para debug
```

## Templates e Geradores

```
memorios create connector --template blank
  → estrutura mínima com IConnector implementado

memorios create connector --template oauth2
  → template com fluxo OAuth2 completo

memorios create connector --template webhook-inbound
  → template para receber webhooks de sistemas externos

memorios create specialist --template domain-expert
  → template completo com KnowledgeGraph integration

memorios create knowledge-package --template ontology
  → template com OntologyDefinition + nodes + rules
```

## Ambientes e Mocks

```typescript
// ConnectorSimulator — testar sem APIs reais
import { ConnectorSimulator } from "@memoryos/testing";

const simulator = ConnectorSimulator.create({
  connector: new MyConnector(),
  scenarios: [
    { name: "success", input: mockInput, response: mockOutput },
    { name: "timeout", input: mockInput, delay: 30000 },
    { name: "error",   input: mockInput, error: "API_UNAVAILABLE" }
  ]
});

const result = await simulator.run("success");

// MockSpecialist — testar sem Specialist real
import { MockSpecialist } from "@memoryos/testing";

const mockLegal = MockSpecialist.create({
  specialistId: "com.empresa.legal",
  domain:       "legal",
  responses: {
    "contrato trabalhista": { facts: [...], confidence: 0.9 }
  }
});
```

---

# CAPÍTULO 15 — REFERENCE IMPLEMENTATIONS

## Implementações Oficiais de Referência

```
STATUS: Referência arquitetural para a comunidade.
Estas implementações demonstram os padrões esperados do MDPS.
```

| Extensão | Tipo | Domínio | Complexidade |
|---|---|---|---|
| **GitHub Connector** | Connector | DevOps | Média |
| **Gov.br Connector** | Connector | Governo | Alta |
| **Shopify Connector** | Connector | E-commerce | Alta |
| **Google Drive Connector** | Connector | Produtividade | Média |
| **OpenAI Provider Adapter** | Provider Adapter | AI | Média |
| **Base44 Provider Adapter** | Provider Adapter | Plataforma | Baixa |
| **Tourism Connector** | Connector | Turismo | Alta |
| **Legal Specialist** | Specialist | Jurídico | Alta |
| **Brazilian Tax Specialist** | Specialist | Tributário | Alta |
| **Brazilian Labor Law Pkg** | Knowledge Package | Jurídico | Alta |

## O que cada referência demonstra

**GitHub Connector** — OAuth2, webhooks, paginação, rate limiting, rollback via API REST.

**Gov.br Connector** — Autenticação por certificado digital, integração com múltiplos serviços governamentais, fallback entre sistemas.

**Shopify Connector** — Webhooks de entrada + saída, multitenancy, tratamento de eventos de e-commerce.

**Google Drive Connector** — OAuth2 com refresh token, file streaming, permissões granulares.

**OpenAI Provider Adapter** — Streaming de resposta, retry com backoff, cost tracking, model selection.

**Legal Specialist** — KnowledgeGraph integration, federation, limitações explícitas, fontes oficiais.

---

# CAPÍTULO 16 — GOVERNANCE

## Processo de Aprovação de Extensões Oficiais

```
Proposta de nova extensão
          ↓
RFC (Request for Comments) publicado
  └── período de comentários: 14 dias
          ↓
Revisão de Arquitetura
  ├── Alinha com MCS? (não contamina o Core)
  ├── Alinha com MDIS? (integra com Decision Pipeline)
  ├── Alinha com MRS? (respeita o Runtime)
  └── Existe alternativa mais simples?
          ↓
ADR criado (se impacto arquitetural)
          ↓
Code Review (mínimo 2 revisores certificados)
          ↓
Security Review (equipe de segurança)
          ↓
Compatibility Review (garantir backward compat.)
          ↓
Certification Pipeline
          ↓
Publicação no Marketplace como "Official"
```

## Responsabilidades de Governança

| Papel | Responsabilidade |
|---|---|
| **Autor da Extensão** | Implementar conforme MDPS, manter versões ativas |
| **Revisor Certificado** | Code review + compatibility check |
| **Security Reviewer** | Análise de segurança e supply chain |
| **Arquiteto** | Validar alinhamento com MCS e MDPS |
| **Marketplace Admin** | Aprovar publicação, monitorar qualidade |

---

# CAPÍTULO 17 — ECOSYSTEM EVOLUTION

## Como o ecossistema evolui

```
NOVAS CATEGORIAS DE EXTENSÃO
  Identificada por: uso recorrente não coberto pelos tipos atuais
  Processo: RFC → discussão 30 dias → ADR → MDPS atualizado
  Aprovação: maioria dos arquitetos + revisão de segurança

APIS APOSENTADAS
  1. API marcada como deprecated no SDK
  2. Warning em todos os logs de uso
  3. Documentação de migração publicada
  4. Janela de migração: ≥ 6 meses
  5. API removida com MAJOR version bump

COMPATIBILIDADE DE LONGO PRAZO
  MemoryOS garante suporte a SDKs por ≥ 2 anos após lançamento
  Extensões publicadas no Marketplace permanecem funcionais
    por ≥ 2 versões MAJOR do MemoryOS
  Toda breaking change documentada em MIGRATION_GUIDE.md
  Ferramenta de migração automática fornecida quando possível
```

---

# CAPÍTULO 18 — PRINCÍPIOS IMUTÁVEIS

## O que toda extensão deve respeitar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PRINCÍPIOS IMUTÁVEIS — MDPS v1.0                      │
│                                                                             │
│  RESPEITAR O CORE (MCS)                                                    │
│    ✗ Extensão nunca modifica comportamento do Core                        │
│    ✗ Extensão nunca bypassa interfaces oficiais                           │
│    ✓ Extensão usa apenas APIs públicas documentadas                       │
│                                                                             │
│  RESPEITAR O RUNTIME (MRS)                                                 │
│    ✓ Extensão segue todos os lifecycles definidos no MRS                  │
│    ✓ Extensão respeita timeouts e retry policies                          │
│    ✓ Extensão propaga executionId em toda operação                        │
│                                                                             │
│  RESPEITAR A GOVERNANÇA (MCS + MDIS)                                       │
│    ✓ Toda ação auditada                                                   │
│    ✓ Permissões mínimas declaradas e respeitadas                          │
│    ✓ Human Approval respeitado quando requerido                           │
│                                                                             │
│  RESPEITAR A INTELIGÊNCIA (MDIS + MIES)                                    │
│    ✓ Extensão contribui para o Learning Engine (quando permitido)         │
│    ✓ Extensão não inventa fatos — declara limitações explicitamente       │
│    ✓ Extensão publica KnowledgePackage com fontes verificáveis            │
│                                                                             │
│  NENHUMA EXTENSÃO PODE:                                                    │
│    ✗ Comprometer a estabilidade da plataforma                             │
│    ✗ Acessar dados de outros usuários                                     │
│    ✗ Executar fora do sandbox                                             │
│    ✗ Remover ou reduzir auditoria                                         │
│    ✗ Bypassa o Security Gate                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Checklist de Conformidade

## Obrigatório antes de publicar qualquer extensão

```
CHECKLIST — MDPS v1.0 — EXTENSÃO
═══════════════════════════════════════════════════════════════════════════════

MANIFESTO
  [ ] extensionId no formato com.empresa.nome?
  [ ] Versão semver válida?
  [ ] Capabilities declaradas corretamente?
  [ ] Permissions mínimas (sem excess)?
  [ ] Secrets listados (sem valores hardcoded)?
  [ ] Compatibilidade com memoryOsVersion declarada?

SEGURANÇA
  [ ] Sem imports de APIs externas fora do declarado no manifesto?
  [ ] Sem secrets hardcoded?
  [ ] Secrets acessados via ctx.secrets.get()?
  [ ] sandbox: true no manifesto?
  [ ] Supply chain: dependências sem CVEs conhecidos?

QUALIDADE
  [ ] Health Check implementado e funcional?
  [ ] Cobertura de testes ≥ threshold do nível de certificação?
  [ ] Documentação (README + CHANGELOG + API Reference)?
  [ ] Exemplo funcional incluído?

OBSERVABILIDADE
  [ ] Logs estruturados em JSON?
  [ ] executionId propagado em toda operação?
  [ ] auditData incluído em todo resultado?

ROLLBACK
  [ ] supportsRollback declarado corretamente?
  [ ] rollback() implementado se supportsRollback=true?
  [ ] rollback() testado?

COMPATIBILIDADE
  [ ] Versão anterior preservada por ≥ 90 dias?
  [ ] Breaking change declarada como MAJOR?
  [ ] Migration guide publicado (se breaking change)?

CERTIFICAÇÃO
  [ ] Pipeline de certificação executado?
  [ ] Todos os checks aprovados?
  [ ] Badge de certificação correto?

SE QUALQUER ITEM ESTIVER DESMARCADO → NÃO PUBLICAR.
```

---

# Declaração Final

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  O MemoryOS foi concebido para crescer através de um ecossistema           │
│  aberto, seguro e governado.                                               │
│                                                                             │
│  O Core permanece PEQUENO, ESTÁVEL e REUTILIZÁVEL.                        │
│                                                                             │
│  Toda inovação ocorre através de EXTENSÕES.                                │
│                                                                             │
│  A qualidade da plataforma depende da qualidade do ecossistema.           │
│                                                                             │
│  Por isso, toda extensão segue os padrões definidos neste documento.      │
│                                                                             │
│  Desenvolvedores externos que seguirem o MDPS poderão criar extensões     │
│  compatíveis com o MemoryOS sem necessidade de alterar o Core —           │
│  hoje, amanhã e durante muitos anos.                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Mapa Completo de Documentos Oficiais

```
MV    → Visão estratégica
MPS   → O que o produto representa
MAS   → Como é construído
MDS   → Como implementar (v1.0–v1.6 + Arch. Principles)
MRS   → Como funciona em runtime
MCS   → O que é o Core e seus limites
MDIS  → Como a plataforma raciocina e decide
MIES  → Como a inteligência evolui continuamente
MDPS  → Como desenvolvedores externos expandem o MemoryOS  ← este documento
```

---

**MDPS — MemoryOS Developer Platform Specification v1.0**  
**Data:** 2026-07-10 · **Complementa:** MV · MPS · MAS · MDS 1.0–1.6 · MRS · MCS · MDIS · MIES · MCF