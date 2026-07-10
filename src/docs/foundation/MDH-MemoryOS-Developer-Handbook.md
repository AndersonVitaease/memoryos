# MDH — MemoryOS Developer Handbook
## Official Engineering Guide

**Version:** 1.0  
**Status:** Official Handbook  
**Date:** 2026-07-10  
**Foundation:** v1.0.0  

---

## Capítulo 1 — Visão Geral

### O que é o MemoryOS

O MemoryOS é uma camada de memória permanente e inteligente projetada para preservar o conhecimento de longo prazo do usuário — permitindo que ele converse naturalmente com sua própria história, sem precisar gerenciar arquivos, chats ou resumos manuais.

É o **sistema operacional da memória humana**.

### Filosofia

| Princípio | Descrição |
|---|---|
| **Permanência** | Nenhum conhecimento é perdido |
| **Continuidade** | Toda sessão conhece o passado |
| **Transparência** | Toda decisão é rastreável |
| **Segurança** | Nenhuma ação de alto risco sem aprovação |
| **Evolução** | A arquitetura cresce por RFC, nunca por impulso |

### Engineering First

A partir da Foundation v1.0, o projeto entra na fase **Engineering First**:

- **Antes:** definição arquitetural, especificações, governança
- **Agora:** implementação real, validação pelo MRI, certificação pelo MQCCS

Toda feature nova começa com uma RFC. Toda RFC aprovada gera um ADR. Todo ADR implementado passa pelo MRI e pelo MQCCS antes de entrar em release.

### Como a Foundation Está Organizada

```
foundation/
├── README.md          ← Entrada principal
├── FOUNDATION.md      ← Declaração oficial
├── CHANGELOG.md       ← Histórico de versões
├── docs/              ← 13 especificações oficiais
├── rfc/               ← RFCs oficiais
├── adr/               ← ADR Index
├── templates/         ← Templates para contribuidores
└── journey/           ← Roadmap, Sprints, Milestones
```

---

## Capítulo 2 — Estrutura do Repositório

```
memoryos/
│
├── foundation/        ← Documentação oficial (imutável sem RFC)
│   ├── docs/          ← Especificações (MV, MPS, MAS, MDS…)
│   ├── rfc/           ← Request for Comments
│   ├── adr/           ← Architectural Decision Records
│   └── templates/     ← Templates oficiais
│
├── core/              ← Engines centrais (TypeScript)
│   ├── memory/        ← WorkingMemoryEngine
│   ├── event-bus/     ← EventBus
│   ├── audit/         ← AuditTrail
│   ├── security/      ← SecurityGate
│   ├── execution/     ← ExecutionEngine
│   └── journey/       ← JourneyManager
│
├── runtime/           ← Ciclo de vida de execução (MRS)
│   ├── session/       ← Gerenciamento de sessão
│   ├── context/       ← Persistência de contexto
│   └── tiering/       ← active → historical → archived
│
├── sdk/               ← SDKs oficiais (MDPS)
│   ├── core-sdk/      ← SDK do Core
│   ├── connector-sdk/ ← SDK para Connectors
│   └── specialist-sdk/← SDK para Specialists
│
├── connectors/        ← Connectors oficiais
│   ├── http/          ← HttpConnector
│   ├── email/         ← EmailConnector
│   └── ...
│
├── specialists/       ← Specialists oficiais
│   ├── general/       ← GeneralSpecialist
│   ├── government/    ← GovernmentSpecialist
│   └── ...
│
├── knowledge/         ← Knowledge Packages
│
├── mri/               ← Reference Implementation + testes
│   ├── core/          ← Engines de referência
│   ├── connectors/    ← Connectors de referência
│   ├── specialists/   ← Specialists de referência
│   ├── journeys/      ← Journeys de referência
│   └── tests/         ← Suite de 25+ testes
│
├── mqccs/             ← Pipeline de certificação
│   ├── compliance/    ← Validação de contratos
│   ├── performance/   ← Benchmarks
│   └── pipeline/      ← Orquestrador
│
└── examples/          ← Exemplos completos end-to-end
```

### Responsabilidades

| Diretório | Responsabilidade | Quem pode alterar |
|---|---|---|
| `foundation/` | Documentação imutável | Via RFC aprovada |
| `core/` | Engines centrais | Via RFC + ADR |
| `runtime/` | Ciclo de vida | Via RFC + ADR |
| `sdk/` | SDKs públicos | Via RFC + ADR |
| `connectors/` | Conectores externos | Contributor + RFC |
| `specialists/` | Especialistas de domínio | Contributor + RFC |
| `knowledge/` | Pacotes de conhecimento | Contributor + RFC |
| `mri/` | Validação de referência | Core Team |
| `mqccs/` | Certificação | Core Team |
| `examples/` | Demonstrações | Qualquer contributor |

---

## Capítulo 3 — Como Desenvolver

### Fluxo Oficial

```
1. Identificar necessidade
       ↓
2. Verificar RFC/ADR existente
       ↓
3. Abrir RFC (se necessário)
       ↓
4. Aguardar discussão (14d)
       ↓
5. RFC aprovada → criar ADR
       ↓
6. Implementar seguindo ADR
       ↓
7. Escrever testes no MRI
       ↓
8. Validar com MRI (100% pass)
       ↓
9. Certificar com MQCCS (≥85%)
       ↓
10. Pull Request
       ↓
11. Code Review
       ↓
12. Merge + Release
```

### Como Criar uma Feature

```bash
# 1. Verificar se existe RFC/ADR
cat foundation/adr/ADR-INDEX.md

# 2. Criar branch
git checkout -b feat/RFC-NNN-nome-da-feature

# 3. Implementar
# (ver padrões no Cap. 4)

# 4. Testes
# (ver Cap. 5)

# 5. Validar
npm run mri:validate

# 6. Certificar
npm run mqccs:certify

# 7. PR
```

### Como Abrir uma RFC

1. Copie `foundation/templates/RFC_TEMPLATE.md`
2. Nomeie como `RFC-NNN-titulo-da-rfc.md`
3. Preencha todos os campos obrigatórios
4. Abra issue com prefixo `[RFC]`
5. Aguarde mínimo 14 dias de discussão
6. Votação pelo Core Team

### Como Criar um ADR

1. RFC deve estar aprovada
2. Copie `foundation/templates/ADR_TEMPLATE.md`
3. Nomeie como `ADR-NNN-titulo.md`
4. Adicione ao `adr/ADR-INDEX.md`
5. Referencie a RFC de origem

---

## Capítulo 4 — Padrões de Código

### Naming Conventions

```typescript
// Interfaces: prefixo I, PascalCase
interface IConnector { ... }
interface ISpecialist { ... }

// Classes: PascalCase
class HttpConnector implements IConnector { ... }

// Engines: sufixo Engine
class WorkingMemoryEngine { ... }
class ExecutionEngine { ... }

// IDs: kebab-case
connectorId = "http-connector"
specialistId = "general-specialist"

// Eventos: domínio.entidade.ação
"execution.step.completed"
"journey.status.changed"
"memory.item.stored"

// Arquivos: camelCase para TS, kebab-case para configs
WorkingMemoryEngine.ts
connector-sdk.json
```

### Interfaces First

```typescript
// ✅ CORRETO — expor apenas interface
export interface IConnector {
  connectorId: string;
  execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult>;
  getMetadata(): ConnectorMetadata;
}

// ❌ ERRADO — expor implementação concreta no SDK público
export class HttpConnector { ... }
```

### Engines

```typescript
// Todo Engine deve:
// 1. Injetar dependências no construtor (não instanciar internamente)
// 2. Retornar tipos bem definidos (nunca `any`)
// 3. Emitir eventos pelo EventBus
// 4. Registrar ações no AuditTrail

class MyEngine {
  constructor(
    private readonly audit: AuditTrail,
    private readonly eventBus: EventBus,
  ) {}
}
```

### Logging

```typescript
// Use AuditTrail para ações do sistema
await audit.record({
  action:    "step.completed",
  userId:    ctx.userId,
  sessionId: ctx.sessionId,
  outcome:   "success",
  details:   { stepId: step.stepId },
});

// Use EventBus para comunicação entre engines
await eventBus.publish({
  type:         "execution.completed",
  sourceEngine: "ExecutionEngine",
  priority:     "NORMAL",
  payload:      result,
});
```

### Errors

```typescript
// Nunca engolir erros silenciosamente
// Propague com contexto suficiente

throw new Error(`Connector '${connectorId}' not registered in ExecutionEngine`);

// ConnectorResult em caso de falha controlada
return {
  status:    "failure",
  errorCode: "VALIDATION_ERROR",
  errorMsg:  `Missing required field: ${field}`,
  auditLog:  [`validation failed at ${new Date().toISOString()}`],
};
```

### Versionamento

- `MAJOR.MINOR.PATCH` (semver)
- PATCH: correções sem breaking change
- MINOR: novas features retrocompatíveis
- MAJOR: breaking changes (exige RFC crítica)

---

## Capítulo 5 — Testes

### Estrutura de Testes

```typescript
// Todo componente deve ter testes em mri/tests/
// Estrutura padrão:

async function testMyComponent(): Promise<TestResult> {
  const start = Date.now();
  try {
    // Arrange
    const component = new MyComponent(...deps);

    // Act
    const result = await component.doSomething(input);

    // Assert
    if (!result.expectedField) throw new Error("Missing expectedField");

    return { name: "MyComponent: descrição do teste", passed: true, duration: Date.now() - start };
  } catch (e) {
    return { name: "MyComponent: descrição do teste", passed: false, error: String(e), duration: Date.now() - start };
  }
}
```

### Tipos de Teste

| Tipo | Onde | Ferramenta | Mínimo |
|---|---|---|---|
| Unitário | `mri/tests/` | MRI Test Runner | 3 por componente |
| Integração | `mri/journeys/` | Journey Runner | 1 por feature |
| Performance | `mqccs/performance/` | Benchmark Runner | p95 < 500ms |
| Segurança | `mri/tests/` | SecurityGate Tests | 100% pass |
| Contrato | `mqccs/compliance/` | Compliance Validator | 100% pass |

### MRI — Validação de Referência

```bash
# Executar suite completa
npm run mri:validate

# Score esperado: 100% (25/25 testes)
# Qualquer falha bloqueia o release
```

### MQCCS — Certificação

```bash
# Executar pipeline de certificação
npm run mqccs:certify

# Score mínimo para release: 85%
# Score para "Official" status: 95%
```

---

## Capítulo 6 — Observabilidade

### AuditTrail

```typescript
// Registre toda ação significativa
await audit.record({
  action:    "connector.execute",   // domínio.entidade.ação
  userId:    ctx.userId,
  sessionId: ctx.sessionId,
  journeyId: ctx.journeyId,
  stepId:    ctx.stepId,
  outcome:   "success" | "failure" | "blocked",
  details:   { /* dados relevantes */ },
});

// AuditTrail é IMUTÁVEL — append-only
// Nunca modifique ou delete registros
```

### EventBus

```typescript
// Subscribe para monitorar eventos
eventBus.subscribe("execution.*", (event) => {
  console.log(`[${event.type}] ${event.sourceEngine}`, event.payload);
});

// Prioridades disponíveis
// CRITICAL > HIGH > NORMAL > LOW
```

### Health Checks

```typescript
// Todo Connector deve implementar healthCheck
async healthCheck(): Promise<{ status: "healthy" | "degraded" | "down" }> {
  try {
    await this.pingDependency();
    return { status: "healthy" };
  } catch {
    return { status: "degraded" };
  }
}
```

### Métricas Importantes

| Métrica | Target p50 | Target p95 | Target p99 |
|---|---|---|---|
| WorkingMemory store | < 5ms | < 10ms | < 20ms |
| EventBus publish | < 2ms | < 5ms | < 10ms |
| Connector execute | < 200ms | < 500ms | < 1000ms |
| Specialist process | < 100ms | < 300ms | < 500ms |

---

## Capítulo 7 — Segurança

### SecurityGate — Uso Obrigatório

```typescript
// Sempre avalie pelo SecurityGate antes de executar ação externa
const gate = security.evaluate({
  userId:          ctx.userId,
  sessionId:       ctx.sessionId,
  action:          "connector.execute",
  resource:        connectorId,
  estimatedImpact: "HIGH",   // LOW | MEDIUM | HIGH | CRITICAL
  isReversible:    false,
});

if (!gate.authorized) {
  // Bloquear execução
  throw new Error(gate.reason);
}

if (gate.requiresApproval) {
  // Pausar e aguardar aprovação humana
  return { requiresApproval: true };
}

// Só executa aqui
```

### Níveis de Risco

| Nível | Exemplos | Aprovação Humana |
|---|---|---|
| LOW | Leitura de dados | Não |
| MEDIUM | Escrita reversível | Não (mas auditado) |
| HIGH | Escrita irreversível | Sim |
| CRITICAL | Exclusão permanente | Sim + confirmação explícita |

### Identity Context

```typescript
// Sempre isole por identityContext
// Nunca compartilhe contexto entre usuários
const items = memory.getByContext(userId, identityContext);
// identityContext separa: pessoal, empresa, projeto, etc.
```

### Least Privilege

```typescript
// Connector deve solicitar apenas as permissões necessárias
getMetadata() {
  return {
    requiredPermissions: ["read:contacts"], // mínimo necessário
    // NÃO: ["read:*", "write:*"]
  };
}
```

---

## Capítulo 8 — Connectors

### Como Desenvolver um Connector

```typescript
import type { IConnector, ConnectorResult, ExecutionContext } from "@memoryos/core";

export class MyConnector implements IConnector {
  readonly connectorId = "my-connector";
  readonly version     = "1.0.0";

  // 1. Validar input ANTES de qualquer chamada externa
  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    const validated = this.validate(input);
    if (!validated.ok) {
      return { status: "failure", errorMsg: validated.error, auditLog: [] };
    }

    // 2. Executar com timeout
    const result = await Promise.race([
      this.callExternalService(validated.data),
      this.timeout(ctx.timeoutMs),
    ]);

    // 3. Retornar resultado padronizado
    return {
      status:      "success",
      outputData:  result,
      auditLog:    [`executed at ${new Date().toISOString()}`],
      resourceRef: `ref:${ctx.executionId}:${ctx.stepId}`,
    };
  }

  // 4. Implementar rollback se isReversible=true
  async rollback(prev: unknown, ctx: ExecutionContext): Promise<void> {
    // desfazer ação
  }

  async healthCheck() { return { status: "healthy" as const }; }
  getMetadata() { return { connectorId: this.connectorId, version: this.version, capabilities: [], riskLevel: "LOW" as const, isReversible: true }; }

  private timeout(ms: number) {
    return new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  }
  private validate(input: unknown): { ok: boolean; data?: any; error?: string } {
    if (!input) return { ok: false, error: "input is required" };
    return { ok: true, data: input };
  }
  private async callExternalService(data: any) { return data; }
}
```

### Checklist do Connector

```
□ Implementa IConnector completamente
□ Valida input antes de chamar serviço externo
□ Tem timeout em todas as chamadas
□ rollback implementado (se isReversible=true)
□ healthCheck funcional
□ getMetadata() completo
□ 3+ testes no MRI
□ Score MQCCS ≥ 85%
□ RFC aprovada (se novo connector oficial)
□ README com exemplos de uso
```

### Erros Comuns

```typescript
// ❌ ERRADO — sem timeout
const result = await fetch(url);

// ✅ CORRETO — com AbortController
const controller = new AbortController();
setTimeout(() => controller.abort(), ctx.timeoutMs);
const result = await fetch(url, { signal: controller.signal });

// ❌ ERRADO — lançar exceção diretamente
throw new Error("failed");

// ✅ CORRETO — retornar ConnectorResult de falha
return { status: "failure", errorCode: "FETCH_ERROR", errorMsg: e.message, auditLog: [] };
```

---

## Capítulo 9 — Specialists

### Quando Criar um Specialist

Crie um Specialist quando:
- O domínio tem vocabulário especializado
- A lógica de processamento é diferente do GeneralSpecialist
- Há fontes de conhecimento específicas do domínio
- O `canHandle()` pode ser determinístico

Reutilize o GeneralSpecialist quando:
- A query é genérica
- Não há vocabulário especializado
- O domínio já está coberto

### Como Desenvolver

```typescript
export class FinancialSpecialist implements ISpecialist {
  readonly specialistId = "financial-specialist";
  readonly domain       = "financial";
  readonly capabilities = ["tax-analysis", "investment", "budget"];

  canHandle(query: string): boolean {
    const keywords = ["imposto", "investimento", "orçamento", "renda", "despesa"];
    return keywords.some(k => query.toLowerCase().includes(k));
  }

  async process(query: string, context: KnowledgeContext): Promise<SpecialistResult> {
    // 1. Identificar intenção específica do domínio
    const intent = this.detectIntent(query);

    // 2. Recuperar conhecimento relevante
    const knowledge = context.knowledgeProvider.getByDomain(this.domain, intent);

    // 3. Gerar resposta com raciocínio explícito
    return {
      specialistId: this.specialistId,
      response:     this.generateResponse(intent, knowledge),
      confidence:   0.90,
      reasoning:    [`Detectou intent: ${intent}`, `Consultou ${knowledge.length} nós`],
      sources:      knowledge.map(k => k.nodeId),
      recommendations: [],
    };
  }

  private detectIntent(query: string): string { return "general"; }
  private generateResponse(intent: string, knowledge: any[]): string { return ""; }
  getMetadata() { return { specialistId: this.specialistId, domain: this.domain, version: "1.0.0", languages: ["pt-BR"], expertise: { tax: 0.9 } }; }
}
```

### Como Testar

```typescript
// Teste o canHandle() com queries positivas E negativas
assert(specialist.canHandle("qual meu imposto de renda?") === true);
assert(specialist.canHandle("qual a previsão do tempo?") === false);

// Teste o process() com queries reais do domínio
const result = await specialist.process("analise meu orçamento", mockContext);
assert(result.confidence > 0.7);
assert(result.reasoning.length > 0);
```

---

## Capítulo 10 — Knowledge Packages

### Como Estruturar

```typescript
// Mínimo 10 nodes por pacote
// Confidence ≥ 0.8 para todos os nodes
// Relations entre nodes do mesmo domínio

const brazilianGovPackage: KnowledgePackage = {
  packageId: "br-government-v1",
  domain:    "government",
  version:   "1.0.0",
  language:  "pt-BR",
  nodes: [
    {
      nodeId:     "cpf-001",
      type:       "concept",
      domain:     "government",
      title:      "CPF — Cadastro de Pessoas Físicas",
      content:    "O CPF é o documento de identificação fiscal do cidadão brasileiro...",
      tags:       ["cpf", "documento", "fiscal", "brasil"],
      relations:  [{ nodeId: "cnpj-001", relation: "similar_to" }],
      confidence: 0.98,
      source:     "receita-federal-oficial",
      version:    "1.0",
    },
    // ... mais nodes
  ],
  metadata: { author: "MemoryOS Core Team", rfc: "RFC-NNN", createdAt: "2026-07-10", description: "Pacote de conhecimento sobre serviços governamentais brasileiros" },
};
```

### Como Versionar

- `MAJOR` quando o schema de um node muda
- `MINOR` quando novos nodes são adicionados
- `PATCH` quando o conteúdo de um node é corrigido

### Como Validar

```bash
# Todo Knowledge Package deve passar por validação de schema
npm run knowledge:validate br-government-v1

# E ser testado com o Specialist correspondente
npm run specialist:test government-specialist --with-package br-government-v1
```

---

## Capítulo 11 — Performance

### Cache

```typescript
// Use WorkingMemory como cache de sessão
// TTL recomendado: 30 minutos para dados de usuário
await memory.store({
  key:             `user:${userId}:preferences`,
  value:           preferences,
  ttl:             30 * 60 * 1000, // 30min em ms
  identityContext: identityContext,
});

// Sempre verifique cache antes de chamar Connectors externos
const cached = memory.get(`user:${userId}:preferences`, identityContext);
if (cached) return cached;
```

### Async e Paralelismo

```typescript
// Execute steps independentes em paralelo
const [result1, result2] = await Promise.all([
  connector1.execute(input1, ctx),
  connector2.execute(input2, ctx),
]);

// Use PlanStep.parallel = true no ExecutionEngine para steps sem dependência
```

### Retry e Circuit Breaker

```typescript
// Retry com backoff exponencial
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await sleep(Math.pow(2, i) * 100); // 100ms, 200ms, 400ms
    }
  }
  throw new Error("unreachable");
}
```

### Timeout

```typescript
// Sempre use ctx.timeoutMs (vem do PlanStep)
// Default recomendado por tipo de operação:
const TIMEOUTS = {
  memory:     1_000,  // 1s
  specialist: 5_000,  // 5s
  connector:  30_000, // 30s
  journey:    120_000, // 2min
};
```

---

## Capítulo 12 — Debugging

### Journey

```typescript
// Verifique o estado da Journey
const journey = journeyManager.get(journeyId);
console.log(journey.status);   // active | paused | blocked | completed
console.log(journey.events);   // histórico completo de eventos
console.log(journey.context);  // dados acumulados
```

### Execution

```typescript
// Verifique StepResults do ExecutionResult
for (const step of executionResult.stepResults) {
  console.log(`Step ${step.stepId}: ${step.status}`);
  if (step.status === "failed") {
    console.error(`Error: ${step.error}`);
  }
}
```

### AuditTrail

```typescript
// Consulte o AuditTrail para rastrear o que aconteceu
const records = audit.query({
  sessionId:   ctx.sessionId,
  executionId: executionResult.executionId,
});
// Cada record tem: action, outcome, timestamp, details
```

### Connector

```typescript
// Verifique healthCheck antes de investigar erros
const health = await connector.healthCheck();
if (health.status !== "healthy") {
  console.error("Connector degraded or down");
}

// Verifique auditLog do ConnectorResult
console.log(result.auditLog);
```

---

## Capítulo 13 — Common Mistakes

### Anti-patterns

```typescript
// ❌ Core conhecendo implementação concreta
class ExecutionEngine {
  private httpConnector = new HttpConnector(); // ERRADO
}
// ✅ Correto — injeção de IConnector
class ExecutionEngine {
  registerConnector(connector: IConnector): void { ... }
}

// ❌ Ação de alto risco sem SecurityGate
await connector.execute(dangerousInput, ctx); // ERRADO sem gate

// ✅ Correto
const gate = security.evaluate({ estimatedImpact: "HIGH", ... });
if (!gate.authorized) return;
await connector.execute(input, ctx);

// ❌ Modificar AuditTrail
audit.records[0].outcome = "success"; // IMPOSSÍVEL e ERRADO

// ❌ Compartilhar contexto entre usuários
const items = memory.getAll(); // ERRADO — retorna de todos os usuários
// ✅ Correto
const items = memory.getByContext(userId, identityContext);

// ❌ RFC retroativa
// "Já implementei — vou abrir a RFC agora" — ERRADO
// A RFC vem ANTES da implementação

// ❌ Criar especificação sem necessidade de implementação
// A fase Foundation está encerrada — toda evolução passa por RFC
```

### Erros de Naming

```typescript
// ❌
class manage_http {}        // snake_case
class httpconnector {}      // lowercase
const ConnectorId = "x";   // variável com maiúscula
interface Connector {}      // interface sem prefixo I

// ✅
class HttpConnector {}
interface IConnector {}
const connectorId = "x";
```

---

## Capítulo 14 — Engineering Principles

| Princípio | Descrição | Exemplo |
|---|---|---|
| **Interfaces First** | Exporte interfaces, não implementações | `IConnector` não `HttpConnector` |
| **Composition over Inheritance** | Prefira composição | Engine injeta dependências |
| **Event Driven** | Comunicação via EventBus | Não chame engines diretamente |
| **Small Components** | Componentes focados e pequenos | 1 arquivo = 1 responsabilidade |
| **Low Coupling** | Core não conhece Connectors | Injeção de dependência |
| **High Cohesion** | Tudo relacionado junto | Por domínio, não por tipo |
| **Security First** | SecurityGate é obrigatório | Antes de toda ação externa |
| **Engineering First** | Implemente antes de especificar | RFC → ADR → Código, nunca ao contrário |
| **Audit Everything** | Toda ação é registrada | AuditTrail em todo Engine |
| **Human in the Loop** | Alto risco = aprovação humana | Approval gates no SecurityGate |

---

## Capítulo 15 — Getting Started (30 minutos)

### Minuto 0–5: Entender o Projeto

```bash
# Leia nesta ordem:
cat foundation/README.md          # Visão geral
cat foundation/FOUNDATION.md      # Declaração oficial
cat foundation/adr/ADR-INDEX.md   # Decisões já tomadas
```

### Minuto 5–10: Executar Localmente

```bash
git clone https://github.com/memoryos/memoryos
cd memoryos
npm install
npm run mri:validate   # deve mostrar 25/25 tests passing
```

### Minuto 10–18: Criar um Connector

```typescript
// 1. Copie o template
cp foundation/templates/CONNECTOR_TEMPLATE.md connectors/my-connector/README.md

// 2. Implemente em connectors/my-connector/index.ts
export class MyConnector implements IConnector {
  readonly connectorId = "my-connector";
  readonly version     = "1.0.0";

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    return { status: "success", outputData: { ok: true }, auditLog: [], resourceRef: "" };
  }

  async healthCheck() { return { status: "healthy" as const }; }
  getMetadata() { return { connectorId: this.connectorId, version: this.version, capabilities: ["ping"], riskLevel: "LOW" as const, isReversible: true }; }
}
```

### Minuto 18–24: Criar um Specialist

```typescript
// connectors/my-specialist/index.ts
export class MySpecialist implements ISpecialist {
  readonly specialistId = "my-specialist";
  readonly domain       = "my-domain";
  readonly capabilities = ["answer-questions"];

  canHandle(query: string): boolean {
    return query.includes("meu domínio");
  }

  async process(query: string, ctx: KnowledgeContext): Promise<SpecialistResult> {
    return {
      specialistId: this.specialistId,
      response:     `Processado: ${query}`,
      confidence:   0.85,
      reasoning:    ["Query identificada no domínio"],
      sources:      [],
      recommendations: [],
    };
  }

  getMetadata() { return { specialistId: this.specialistId, domain: this.domain, version: "1.0.0", languages: ["pt-BR"], expertise: {} }; }
}
```

### Minuto 24–28: Executar Testes

```bash
npm run mri:validate          # validação de referência
npm run mqccs:certify         # certificação de qualidade
# Score esperado: ≥ 85%
```

### Minuto 28–30: Abrir uma RFC

```bash
cp foundation/templates/RFC_TEMPLATE.md foundation/rfc/RFC-002-meu-titulo.md
# Preencha os campos
# Abra issue com [RFC] no título
```

---

## Capítulo 16 — Checklist de Pull Request

```
PRÉ-IMPLEMENTAÇÃO
□ Existe RFC aprovada para esta mudança?
□ Existe ADR correspondente?
□ A mudança está dentro do escopo da RFC?

CÓDIGO
□ Naming conventions seguidas?
□ Interfaces exportadas (não classes concretas)?
□ Nenhuma dependência circular?
□ SecurityGate usado para ações externas?
□ AuditTrail registrado para ações significativas?

TESTES
□ Testes unitários escritos no MRI?
□ MRI suite: 100% passing?
□ MQCCS score ≥ 85%?
□ Testes de performance dentro dos targets?

SEGURANÇA
□ SecurityGate avaliado para risco?
□ Identity Context respeitado?
□ Nenhuma credencial hardcoded?
□ Permissões mínimas necessárias?

DOCUMENTAÇÃO
□ README atualizado?
□ CHANGELOG atualizado?
□ Exemplos incluídos?
□ Tipos TypeScript documentados?

COMPATIBILIDADE
□ Retrocompatível com versão anterior?
□ Se breaking: RFC crítica aprovada?
□ Grace period de depreciação definido?
```

---

## Referências

| Documento | Onde Encontrar |
|---|---|
| Foundation v1.0 | `foundation/FOUNDATION.md` |
| RFC Process | `foundation/templates/RFC_TEMPLATE.md` |
| ADR Index | `foundation/adr/ADR-INDEX.md` |
| MRI Tests | `mri/tests/mri.test.ts` |
| MQCCS Pipeline | `mqccs/pipeline/certificationPipeline.js` |
| Connector Template | `foundation/templates/CONNECTOR_TEMPLATE.md` |
| Specialist Template | `foundation/templates/SPECIALIST_TEMPLATE.md` |

---

*MDH — MemoryOS Developer Handbook v1.0 — Official — 2026-07-10*