# AUDITORIA ARQUITETURAL — Execution Outcome Architecture
# Sprint: Architectural Consolidation & Integration Readiness
# Data: 2026-07-21
# Status: DOCUMENTO TÉCNICO OFICIAL

---

## 1. DIAGRAMA COMPLETO DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONVERSATION PIPELINE                               │
│                     (ConversationPipeline.ts)                               │
│                                                                             │
│  LLM Path          Connector Path         Static Analysis      Gateway      │
│  (llm_reasoning)   (connector_runtime)    (static_analysis)   (cog_gateway) │
└────────┬───────────────────┬──────────────────────┬──────────────┬──────────┘
         │                   │                      │              │
         ▼                   ▼                      ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ExecutionOutcomeAdapterFactory                           │
│  fromLLMReasoning()  fromConnectorSuccess()  fromConnectorFailure()         │
│                    fromInput()  (caminho generico)                           │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │  orquestra os dois passos abaixo
              ┌──────────────────┴────────────────────┐
              │                                       │
              ▼                                       ▼
┌─────────────────────────┐           ┌───────────────────────────────────────┐
│  ExecutionOutcomeFactory│           │       ExecutionOutcomeAdapter         │
│  .create()              │           │  .adapt(outcome, hint)                │
│  .createSuccess()       │           │       ↓                               │
│  .createFailure()       │           │  resolve via Registry                 │
│                         │           │       ↓                               │
│  Garante invariants:    │           │  delega ao DomainAdapter              │
│  - id único             │           └───────────────────────────────────────┘
│  - durationMs calculado │                         │
│  - confidence clampada  │                         │
│  - cost normalizado     │                         │
│  - success/error coeso  │                         │
└────────────┬────────────┘                         │
             │                                      │
             ▼                                      │
┌─────────────────────────┐                         │
│     ExecutionOutcome    │ ◄───────────────────────┘
│  (tipo imutável)        │       |
│  - id                   │       ▼
│  - producer             │  ┌───────────────────────────────────────────────┐
│  - domain               │  │      ExecutionOutcomeAdapterRegistry          │
│  - capability           │  │  .resolve(outcome)                            │
│  - success / errorType  │  │       ↓                                       │
│  - payload              │  │  percorre registrations (último = prioridade) │
│  - confidence           │  │  testa .domains.includes() + .supports()      │
│  - executionCost        │  └──────────────────┬────────────────────────────┘
│  - metadata             │                     │
└─────────────────────────┘                     │
                                                ▼
                          ┌─────────────────────────────────────────┐
                          │       IExecutionOutcomeDomainAdapter     │
                          │  (interface — Dependency Inversion)      │
                          ├──────────────────────────────────────────┤
                          │  [builtin]  GeneralAdapter               │
                          │             domains: general, memory     │
                          │  [builtin]  UnknownAdapter               │
                          │             domains: unknown (fallback)  │
                          │  [futuro]   GitHubAdapter                │
                          │  [futuro]   DriveAdapter                 │
                          │  [futuro]   GmailAdapter                 │
                          │  [futuro]   CalendarAdapter              │
                          └──────────────────────┬───────────────────┘
                                                 │  .adapt(outcome, hint)
                                                 │  encapsula:
                                                 │  - PRODUCER_SOURCE_MAP
                                                 │  - DOMAIN_TO_EXPLICIT
                                                 │  - extractAnswer()
                                                 │  - handled/answer/error resolution
                                                 ▼
                          ┌─────────────────────────────────────────┐
                          │       createResponseCandidate()          │
                          │  (ResponseCandidate.ts)                  │
                          │  - id                                    │
                          │  - source                                │
                          │  - explicitDomain                        │
                          │  - confidence                            │
                          │  - handled                               │
                          │  - executionSucceeded                    │
                          │  - executionCost                         │
                          │  - answer                                │
                          └──────────────────────┬───────────────────┘
                                                 │
                                                 ▼
                          ┌─────────────────────────────────────────┐
                          │          ResponseArbiter                 │
                          │  .arbitrate(candidates[], context)       │
                          │                                          │
                          │  1. DOMAIN_MATCH                         │
                          │  2. HANDLED_HIGH_CONFIDENCE              │
                          │  3. HANDLED_ANY                          │
                          │  4. NULL_FALLBACK                        │
                          └──────────────────────┬───────────────────┘
                                                 │
                                                 ▼
                                      ArbitrationResult.selected
                                       → Resposta Final ao Usuário
```

---

## 2. FLUXO COMPLETO — PASSO A PASSO

```
Pipeline
  │
  ├─ [LLM path]
  │    executionOutcomeAdapterFactory.fromLLMReasoning({ answer, durationMs })
  │
  ├─ [Connector path]
  │    executionOutcomeAdapterFactory.fromConnectorSuccess({ domain, capability, payload, synthesizedAnswer })
  │
  └─ [Failure path]
       executionOutcomeAdapterFactory.fromConnectorFailure({ domain, errorType, errorMessage })
                │
                ▼
         ExecutionOutcomeFactory.create(input)
           → valida invariants
           → gera id, calcula durationMs, normaliza cost/confidence
           → retorna ExecutionOutcome (Object.freeze())
                │
                ▼
         ExecutionOutcomeAdapter.adapt(outcome, hint)
           → valida outcome.id e outcome.producer
           → ExecutionOutcomeAdapterRegistry.resolve(outcome)
               → percorre registrations do mais recente ao mais antigo
               → first match: .domains.includes(outcome.domain) && .supports(outcome)
               → fallback: UnknownAdapter
                │
                ▼
         IExecutionOutcomeDomainAdapter.adapt(outcome, hint)
           → resolve source (PRODUCER_SOURCE_MAP)
           → resolve explicitDomain (DOMAIN_TO_EXPLICIT)
           → resolve answer (hint.synthesizedAnswer ?? extractAnswer(payload))
           → resolve handled/executionSucceeded
           → createResponseCandidate(...)
           → retorna AdaptationResult (Object.freeze())
                │
                ▼
         ResponseCandidate (Object.freeze())
                │
                ▼
         ResponseArbiter.arbitrate([...candidates], context)
           → filtra handled
           → DOMAIN_MATCH (preferredDomain + executionSucceeded)
           → HANDLED_HIGH_CONFIDENCE (confidence >= 0.7)
           → HANDLED_ANY (melhor confidence)
           → NULL_FALLBACK
           → retorna ArbitrationResult (Object.freeze())
                │
                ▼
         selected.answer → exibido ao usuário
```

---

## 3. MAPA COMPLETO DE DEPENDÊNCIAS

```
ExecutionOutcomeTypes          ← nenhuma dependência interna
       ▲
       │  importado por
       ├─ ExecutionOutcome          (re-export)
       ├─ ExecutionOutcomeFactory
       ├─ ExecutionOutcomeAdapterTypes
       ├─ ExecutionOutcomeDomainAdapter
       └─ ExecutionOutcomeAdapterRegistry

ExecutionOutcomeAdapterTypes   ← depende de ExecutionOutcomeTypes + ResponseCandidate
       ▲
       │  importado por
       ├─ ExecutionOutcomeAdapterRegistryTypes
       ├─ ExecutionOutcomeDomainAdapter
       └─ ExecutionOutcomeAdapter

ResponseCandidate              ← nenhuma dependência interna
       ▲
       │  importado por
       ├─ ExecutionOutcomeAdapterTypes
       ├─ ExecutionOutcomeDomainAdapter
       └─ ResponseArbiter

ExecutionOutcomeDomainAdapter  ← depende de ExecutionOutcomeTypes
                                            + ExecutionOutcomeAdapterTypes
                                            + ExecutionOutcomeAdapterRegistryTypes
                                            + ResponseCandidate
       ▲
       │  importado por
       └─ ExecutionOutcomeAdapterRegistry

ExecutionOutcomeAdapterRegistry ← depende de ExecutionOutcomeTypes
                                             + ExecutionOutcomeAdapterRegistryTypes
                                             + ExecutionOutcomeDomainAdapter
       ▲
       │  importado por
       └─ ExecutionOutcomeAdapter

ExecutionOutcomeAdapter        ← depende de ExecutionOutcomeAdapterTypes
                                            + ExecutionOutcomeTypes
                                            + ExecutionOutcomeAdapterRegistry
       ▲
       │  importado por
       └─ ExecutionOutcomeAdapterFactory

ExecutionOutcomeAdapterFactory ← depende de ExecutionOutcomeTypes
                                            + ExecutionOutcomeAdapterTypes
                                            + ExecutionOutcomeFactory
                                            + ExecutionOutcomeAdapter
       ▲
       │  importado por (futuro)
       └─ ConversationPipeline

ResponseArbiter                ← depende apenas de ResponseCandidate
       ▲
       │  importado por (futuro)
       └─ ConversationPipeline
```

**Grafo de dependências — acíclico confirmado.** Nenhuma dependência circular.

---

## 4. MAPA DE RESPONSABILIDADES

| Componente | Responsabilidade única |
|---|---|
| `ExecutionOutcomeTypes` | Contratos de dados puros (tipos, interfaces, enums) |
| `ExecutionOutcome` | Ponto de entrada público — re-export dos tipos |
| `ExecutionOutcomeFactory` | Criação, validação e normalização de ExecutionOutcome |
| `ExecutionOutcomeAdapterTypes` | Contratos da camada de adaptação |
| `ExecutionOutcomeAdapterRegistryTypes` | Contratos do sistema de registro |
| `ExecutionOutcomeDomainAdapter` | Implementações builtin (General, Unknown) + shared helpers |
| `ExecutionOutcomeAdapterRegistry` | Catálogo e resolução de adapters por domínio |
| `ExecutionOutcomeAdapter` | Orquestrador: valida → resolve via Registry → delega |
| `ExecutionOutcomeAdapterFactory` | Atalho de alto nível: input bruto → Outcome → Candidate |
| `ResponseCandidate` | Contrato imutável do candidato de resposta + factory function |
| `ResponseArbiter` | Seleção determinística do melhor candidato |

---

## 5. ANÁLISE DE ACOPLAMENTO

### Acoplamento aferente (quantos módulos dependem de cada componente)

| Componente | Dependentes | Avaliação |
|---|---|---|
| `ExecutionOutcomeTypes` | 5 | ALTO — esperado, é contrato raiz |
| `ResponseCandidate` | 4 | ALTO — esperado, contrato de saída |
| `ExecutionOutcomeAdapterTypes` | 3 | MÉDIO — adequado |
| `ExecutionOutcomeDomainAdapter` | 1 | BAIXO — ótimo |
| `ExecutionOutcomeAdapterRegistry` | 1 | BAIXO — ótimo |
| `ExecutionOutcomeAdapter` | 1 | BAIXO — ótimo |
| `ResponseArbiter` | 0 (ainda) | ZERO — pronto para integração |

### Acoplamento eferente (de quantos módulos cada componente depende)

| Componente | Dependências | Avaliação |
|---|---|---|
| `ExecutionOutcomeTypes` | 0 | ZERO — perfeito |
| `ResponseCandidate` | 0 | ZERO — perfeito |
| `ResponseArbiter` | 1 (`ResponseCandidate`) | MÍNIMO — ótimo |
| `ExecutionOutcomeFactory` | 1 (`ExecutionOutcomeTypes`) | MÍNIMO — ótimo |
| `ExecutionOutcomeAdapter` | 2 | BAIXO — adequado |
| `ExecutionOutcomeAdapterFactory` | 4 | MÉDIO — aceitável para orchestrator |

**Conclusão:** Acoplamento global dentro de limites saudáveis. Nenhum componente ultrapassa 4 dependências eferentes.

---

## 6. ANÁLISE DE COESÃO

| Componente | Coesão | Observação |
|---|---|---|
| `ExecutionOutcomeFactory` | ALTA | Todo método cria/normaliza ExecutionOutcome |
| `ExecutionOutcomeAdapterRegistry` | ALTA | Todo método opera sobre a tabela de adapters |
| `ExecutionOutcomeDomainAdapter` | MÉDIA-ALTA | `extractAnswer()` e `buildResult()` são compartilhados pelos dois adapters builtin |
| `ExecutionOutcomeAdapterFactory` | MÉDIA | Orquestra dois subsistemas — aceitável para facade/orchestrator |
| `ResponseArbiter` | ALTA | Todo método seleciona candidatos por prioridade |

**RISCO IDENTIFICADO — Coesão de `ExecutionOutcomeDomainAdapter`:**
`extractAnswer()`, `PRODUCER_SOURCE`, e `DOMAIN_TO_EXPLICIT` são helpers compartilhados entre `GeneralAdapter` e `UnknownAdapter` no mesmo arquivo. À medida que `GitHubAdapter`, `DriveAdapter` etc. forem criados como **arquivos separados**, esses helpers serão duplicados ou precisarão de extração para um módulo utilitário compartilhado.

**Recomendação R1:** Extrair os shared helpers para `ExecutionOutcomeAdapterHelpers.ts` (ou similar) antes de implementar os domain adapters específicos.

---

## 7. ANÁLISE DE EXTENSIBILIDADE

### Adição de novo conector (ex: Slack, WhatsApp, Notion, Jira, MCP)

**Passos necessários:**
1. Criar `SlackOutcomeAdapter implements IExecutionOutcomeDomainAdapter`
2. `executionOutcomeAdapterRegistry.register(new SlackOutcomeAdapter())`
3. Adicionar `"slack"` ao `ExecutionDomain` union (1 linha em `ExecutionOutcomeTypes.ts`)
4. Adicionar `"slack"` ao `ExplicitDomain` union (1 linha em `ResponseCandidate.ts`)

**Arquivos existentes alterados:** 2 (apenas adicionar um valor ao union type — não quebra nenhum consumidor existente por ser aditivo)

**Arquivos novos:** 1

**RESULTADO: Extensibilidade ALTA. Open/Closed confirmado.**

### Adição de novo Pipeline (ex: AgentPipeline, VoicePipeline)

O novo pipeline simplesmente chama `executionOutcomeAdapterFactory.fromInput()` ou os atalhos existentes. Nenhum arquivo do subsistema precisa mudar.

### Adição de novo Agente

Agentes produzem `ExecutionOutcome` com `producer: "cognitive_gateway"` ou um novo valor de `ExecutionProducer`. A camada de adaptação absorve sem alteração.

---

## 8. ANÁLISE DE TESTABILIDADE

| Componente | Testabilidade | Motivo |
|---|---|---|
| `ExecutionOutcomeFactory` | EXCELENTE | Função pura, sem dependências externas |
| `ExecutionOutcomeAdapterRegistry` | EXCELENTE | `.clear()` disponível, sem singletons injetados |
| `IExecutionOutcomeDomainAdapter` | EXCELENTE | Interface pura — mock trivial |
| `GeneralAdapter / UnknownAdapter` | EXCELENTE | Funções puras, sem estado |
| `ExecutionOutcomeAdapter` | BOA | Depende do Registry singleton — testável via `registry.register(mockAdapter)` |
| `ExecutionOutcomeAdapterFactory` | BOA | Depende de dois singletons — requer override ou test doubles |
| `ResponseArbiter` | EXCELENTE | Função pura, sem dependências |

**RISCO IDENTIFICADO — Testabilidade do `ExecutionOutcomeAdapter` e `ExecutionOutcomeAdapterFactory`:**
Ambos dependem de singletons globais (`executionOutcomeAdapterRegistry`, `executionOutcomeFactory`). Testes de unidade precisam manipular o estado global via `registry.clear()` e `registry.register()`.

**Recomendação R2:** Disponibilizar construtores que aceitem injeção de dependências (registry como parâmetro opcional), mantendo o singleton como default. Isso elimina o acoplamento a globalThis em testes.

---

## 9. RESPOSTAS ÀS QUESTÕES DA AUDITORIA

### Q1. Existe duplicação entre `ExecutionOutcomeAdapterRegistry` e algum Registry existente?

**Resposta: NÃO há duplicação funcional, mas existe sobreposição conceitual.**

O sistema possui:
- `ConnectorRegistry` (connector-router) — registra `IConnector` por `connectorId` (string)
- `ConnectorRegistry` (connector-runtime) — registra `IConnector` por `id`, lança erro em duplicata
- `CapabilityRegistry` — registra capabilities por nome
- `GoalCapabilityRegistry` — mapeia `GoalType` → `CapabilityDescriptor[]`

Nenhum desses registra adapters de **transformação de output**. O `ExecutionOutcomeAdapterRegistry` é o único que mapeia `ExecutionDomain → IExecutionOutcomeDomainAdapter`.

**Porém:** Existem **duas classes** `ConnectorRegistry` com o mesmo nome em paths diferentes (`connector-router/` e `connector-runtime/`). Isso é um problema pré-existente no MemoryOS que não compete com a nova arquitetura, mas é um risco de importação incorreta.

### Q2. `ExecutionOutcomeAdapterRegistry` deveria ser um Registry próprio ou especialização de outro?

**Resposta: Registry próprio — correto como está.**

Os registries existentes (`ConnectorRegistry`, `GoalCapabilityRegistry`) operam em camadas completamente diferentes:
- `ConnectorRegistry` → execução de ações
- `GoalCapabilityRegistry` → planejamento de goals

`ExecutionOutcomeAdapterRegistry` opera na camada de **transformação de output** — uma responsabilidade nova, sem precedente nos registries existentes. Herdá-lo de qualquer registry atual violaria LSP (comportamentos incompatíveis) e criaria acoplamento desnecessário.

### Q3. `ExecutionOutcomeDomainAdapter` deveria permanecer independente?

**Resposta: SIM, mas com ressalva.**

O arquivo atual agrupa `GeneralAdapter`, `UnknownAdapter`, `extractAnswer()`, `PRODUCER_SOURCE`, e `DOMAIN_TO_EXPLICIT` — helpers que serão necessários em TODOS os adapters futuros. Quando `GitHubAdapter.ts` for criado como arquivo separado, esses helpers precisarão ser importados de algum lugar.

**Recomendação R3:** Antes de criar os adapters específicos, extrair os shared helpers para `ExecutionOutcomeAdapterShared.ts`. Os `GeneralAdapter` e `UnknownAdapter` continuam em `ExecutionOutcomeDomainAdapter.ts` mas importam os helpers do arquivo compartilhado.

### Q4. `ResponseArbiter` realmente precisa conhecer `ResponseCandidate` ou poderia arbitrar diretamente `ExecutionOutcome`?

**Resposta: `ResponseCandidate` é necessário e correto — não substituir por `ExecutionOutcome`.**

Razões:
1. `ExecutionOutcome` representa resultado técnico bruto (payload, errorType, executionCost estrutural). O Arbiter não tem contexto para comparar payloads heterogêneos de GitHub vs Gmail vs LLM.
2. `ResponseCandidate` representa uma resposta **normalizada e comparável** — confidence em [0,1], `handled` como booleano, `answer` como string. O Arbiter compara apenas esses campos.
3. Se o Arbiter recebesse `ExecutionOutcome` diretamente, precisaria conhecer a lógica de extração de answer de cada conector — violando SRP e OCP.

**A separação `ExecutionOutcome → ResponseCandidate` é a abstração correta.**

### Q5. Existe alguma camada desnecessária?

**Resposta: `ExecutionOutcomeAdapterFactory` pode ser considerada conveniente, não essencial.**

É um facade que combina `ExecutionOutcomeFactory` + `ExecutionOutcomeAdapter`. O Pipeline poderia chamar ambos diretamente sem o factory. Porém, o factory elimina código boilerplate repetitivo em cada produtor, o que é vantajoso.

**Avaliação: MANTER — reduz risco de erros por repetição, sem adicionar responsabilidade nova.**

### Q6. Existe alguma responsabilidade mal posicionada?

**Resposta: SIM — dois casos.**

**Caso A:** `synthesizedAnswer` no `AdaptationHint`

O hint permite que o caller passe uma resposta já sintetizada (gerada pelo `ConnectorResultSynthesizer`). Isso significa que a responsabilidade de sintetizar a resposta **permanece no Pipeline** e o Adapter apenas empacota. Isso é correto — o Adapter não deve chamar LLM.

Porém, quando `synthesizedAnswer` está presente, o `extractAnswer()` é completamente bypassado. Isso implica que `extractAnswer()` só é relevante para casos onde o caller não sintetizou a resposta. Esse cenário é legítimo (ex: LLM puro, onde o answer é trivialmente o texto).

**Avaliação: ACEITÁVEL.** Nenhuma ação imediata necessária.

**Caso B:** `AdaptationHint.sourceOverride`

Permite ao caller substituir o `ResponseSource` calculado a partir de `outcome.producer`. Isso é uma válvula de escape útil, mas expõe que o mapeamento `producer → source` pode estar incompleto ou errado em algum caso. Se o mapeamento estivesse sempre correto, `sourceOverride` seria desnecessário.

**Avaliação: RISCO BAIXO.** O override é defensivo e explícito. Não viola nenhum princípio, mas deve ser monitorado — um uso frequente indica que o mapeamento precisa ser revisado.

### Q7. Violações de SOLID

| Princípio | Status | Observação |
|---|---|---|
| **SRP** | ✅ APROVADO | Cada classe tem uma responsabilidade claramente delimitada |
| **OCP** | ✅ APROVADO | Novos adapters são registrados sem modificar o Registry ou o Adapter genérico |
| **LSP** | ✅ APROVADO | `GeneralAdapter` e `UnknownAdapter` são substituíveis por qualquer `IExecutionOutcomeDomainAdapter` |
| **ISP** | ⚠️ ATENÇÃO | `IExecutionOutcomeDomainAdapter` expõe `domains`, `supports()` e `adapt()`. Adapters que cobrem múltiplos domains precisam implementar `supports()` com lógica OR — aceitável, mas pode crescer |
| **DIP** | ✅ APROVADO | `ExecutionOutcomeAdapter` depende de `IExecutionOutcomeDomainAdapter` (abstração), não de `GeneralAdapter` diretamente |

**Violação ISP potencial:** Se futuramente um adapter precisar de `initialize()`, `teardown()`, ou `validate()`, a interface precisará crescer. Considerar sub-interfaces desde já (ex: `IStatefulDomainAdapter extends IExecutionOutcomeDomainAdapter`).

**Recomendação R4:** Manter `IExecutionOutcomeDomainAdapter` enxuta. Se adapters stateful forem necessários, criar interface derivada — nunca aumentar a interface base.

### Q8. Dependências circulares

**Resultado: NENHUMA dependência circular detectada.**

O grafo de dependências é um DAG estrito:
```
Types → Factory
Types → AdapterTypes → Adapter → Registry → DomainAdapter → ResponseCandidate
Types → AdapterFactory → Factory + Adapter
```
Nenhum módulo importa a si mesmo ou cria ciclo.

### Q9. A arquitetura suporta nativamente os conectores listados?

| Conector | Suporte | Ação necessária |
|---|---|---|
| GitHub | ✅ | `domain: "github"` já em `ExecutionDomain` |
| Drive | ✅ | `domain: "google_drive"` já em `ExecutionDomain` |
| Gmail | ✅ | `domain: "gmail"` já em `ExecutionDomain` |
| Calendar | ✅ | `domain: "google_calendar"` já em `ExecutionDomain` |
| Slack | ⚠️ | Adicionar `"slack"` ao union `ExecutionDomain` + `ExplicitDomain` |
| WhatsApp | ⚠️ | Adicionar `"whatsapp"` ao union |
| Notion | ⚠️ | Adicionar `"notion"` ao union |
| Jira | ⚠️ | Adicionar `"jira"` ao union |
| MCP | ⚠️ | Adicionar `"mcp"` ao union |
| Novos Connectors | ✅ | Padrão: add domain ao union + implementar adapter + register |
| Novos Agentes | ✅ | Agentes usam `producer: "cognitive_gateway"` — sem alteração |
| Novos Pipelines | ✅ | Chamam `AdapterFactory` diretamente — sem alteração |

### Q10. Existe alguma abstração criada cedo demais?

**Resposta: SIM — `ExecutionOutcomeAdapterFactory.fromConnectorSuccess()` e `fromConnectorFailure()`**

Esses atalhos foram criados antes de existir qualquer integração real com o Pipeline. Eles embutem defaults (ex: `confidence: { score: 0.95 }`) que podem não refletir a realidade de cada conector.

**Avaliação: RISCO BAIXO.** Os defaults são sobrescrevíveis via `fromInput()`. Os atalhos são conveniência, não autoridade. Porém, se os defaults estiverem errados para algum conector específico, podem produzir `confidence` incorreto na arbitragem.

**Recomendação R5:** Ao integrar ao Pipeline, validar se os defaults de confidence dos atalhos condizem com o comportamento observado de cada produtor. Ajustar se necessário.

### Q11. Existe alguma abstração faltando?

**Resposta: SIM — duas ausências relevantes.**

**Ausência A: `IExecutionOutcomeAdapterRegistryObserver`**
Não há mecanismo para observar quando adapters são registrados/removidos. Isso impede logs de diagnóstico e testes que verificam se todos os adapters esperados foram registrados na inicialização do sistema.

**Recomendação R6:** Adicionar `onRegister(callback)` e `onUnregister(callback)` ao Registry em sprint futura.

**Ausência B: Shared helpers como módulo explícito**
`extractAnswer()`, `PRODUCER_SOURCE`, e `DOMAIN_TO_EXPLICIT` vivem em `ExecutionOutcomeDomainAdapter.ts`. Quando adapters específicos (GitHub, Drive) forem criados em arquivos separados, esses helpers serão necessários lá também.

**Recomendação R3 (reforçada):** Extrair para `ExecutionOutcomeAdapterShared.ts` antes das implementações específicas.

---

## 10. RISCOS ENCONTRADOS

| ID | Risco | Severidade | Probabilidade | Recomendação |
|---|---|---|---|---|
| R1 | Shared helpers duplicados em futuros adapters | MÉDIA | ALTA | Extrair `ExecutionOutcomeAdapterShared.ts` |
| R2 | Singletons globais dificultam testes de unidade isolados | BAIXA | MÉDIA | Injeção de dependência opcional nos construtores |
| R3 | Defaults de confidence nos atalhos do AdapterFactory podem ser incorretos | BAIXA | MÉDIA | Validar ao integrar ao Pipeline |
| R4 | `IExecutionOutcomeDomainAdapter` pode crescer além do necessário | BAIXA | BAIXA | Criar interfaces derivadas para adapters stateful |
| R5 | Duas classes `ConnectorRegistry` com o mesmo nome em paths diferentes | MÉDIA | ALTA | Risco pré-existente — renomear uma das duas em sprint de cleanup |
| R6 | Sem observabilidade de registro de adapters | BAIXA | BAIXA | Adicionar callbacks de observação ao Registry |
| R7 | `domains` como `readonly ExecutionDomain[]` requer que o union type seja atualizado para cada novo conector | BAIXA | ALTA | Normal e esperado — documentar como padrão de extensão |

---

## 11. SUGESTÕES DE SIMPLIFICAÇÃO (ordenadas por prioridade)

### P1 — Extrair shared helpers (antes das próximas implementações)

**Ação:** Criar `ExecutionOutcomeAdapterShared.ts` com `extractAnswer()`, `PRODUCER_SOURCE`, `DOMAIN_TO_EXPLICIT`, e `buildResult()`.

**Impacto:** Elimina duplicação futura. Custo: 1 arquivo novo + ajuste de imports em `ExecutionOutcomeDomainAdapter.ts`.

### P2 — Injeção de dependência opcional

**Ação:** Permitir que `ExecutionOutcomeAdapter` e `ExecutionOutcomeAdapterFactory` recebam registry/factory como parâmetro opcional do construtor.

```typescript
constructor(private readonly registry = executionOutcomeAdapterRegistry) {}
```

**Impacto:** Melhora isolamento em testes. Sem quebra de API existente.

### P3 — Expandir `ExecutionDomain` para conectores futuros

**Ação:** Adicionar `"slack" | "whatsapp" | "notion" | "jira" | "mcp"` ao union desde já.

**Impacto:** Zero — é aditivo. Previne que adapters futuros precisem alterar tipos.

### P4 — Renomear uma das `ConnectorRegistry` (cleanup pré-existente)

**Ação:** Renomear `src/lib/connector-router/ConnectorRegistry.ts` para `UCRConnectorRegistry` ou similar.

**Impacto:** Elimina risco de importação incorreta. Afeta apenas imports internos ao subsistema.

---

## 12. CERTIFICAÇÃO FORMAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║            EXECUTION OUTCOME ARCHITECTURE — CERTIFICAÇÃO FORMAL             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   Status:   APPROVED WITH RECOMMENDATIONS                                   ║
║                                                                              ║
║   Data:     2026-07-21                                                       ║
║   Versão:   v1.0                                                             ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   APROVADO:                                                                  ║
║                                                                              ║
║   ✅  Sem dependências circulares                                            ║
║   ✅  Todos os contratos imutáveis (Object.freeze em todos os níveis)        ║
║   ✅  SRP respeitado em todos os componentes                                 ║
║   ✅  OCP confirmado — novos adapters sem modificação do Registry            ║
║   ✅  DIP confirmado — Adapter depende de interface, não implementação       ║
║   ✅  LSP confirmado — adapters são substituíveis                            ║
║   ✅  Sem chamadas de rede em nenhum componente da camada                    ║
║   ✅  Sem efeitos colaterais observáveis externamente                        ║
║   ✅  Fluxo determinístico: mesmo input → mesmo output                       ║
║   ✅  Suporte nativo a GitHub, Drive, Gmail, Calendar                        ║
║   ✅  Extensível para Slack, WhatsApp, Notion, Jira, MCP sem redesign        ║
║   ✅  ResponseArbiter corretamente desacoplado de ExecutionOutcome           ║
║   ✅  Testabilidade alta na maioria dos componentes                          ║
║   ✅  Nenhuma abstração prematura bloqueante                                 ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   RECOMENDAÇÕES PRÉ-INTEGRAÇÃO (não bloqueantes):                           ║
║                                                                              ║
║   R1  Extrair shared helpers para ExecutionOutcomeAdapterShared.ts          ║
║       ANTES de implementar GitHubAdapter, DriveAdapter, GmailAdapter        ║
║                                                                              ║
║   R2  Adicionar injeção de dependência opcional nos construtores             ║
║       de ExecutionOutcomeAdapter e ExecutionOutcomeAdapterFactory            ║
║                                                                              ║
║   R3  Validar defaults de confidence dos atalhos do AdapterFactory          ║
║       contra comportamento real de cada produtor ao integrar ao Pipeline     ║
║                                                                              ║
║   R4  Expandir ExecutionDomain com conectores futuros de forma aditiva      ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   INTEGRAÇÃO AO ConversationPipeline:  AUTORIZADA                           ║
║                                                                              ║
║   A arquitetura está madura para integração.                                ║
║   As recomendações acima não bloqueiam a integração —                       ║
║   podem ser endereçadas em paralelo ou em sprint imediatamente              ║
║   posterior à integração.                                                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
``