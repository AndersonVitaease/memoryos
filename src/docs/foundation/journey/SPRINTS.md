# SPRINTS.md
## MemoryOS — Sprint History

---

## Fase Foundation (Sprints 1–20)

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

---

## Fase Engineering First (Sprints 21+)

| Sprint | Foco | Status |
|---|---|---|
| INT-01 | Cognitive Pipeline Integration — CognitivePipelineAdapter v1.0 | ✅ Done |
| S21 | Core Complete (KnowledgeGraph + Decision produção) | ✅ Done |
| S22 | Runtime Complete (Context Persistence + Tiering) | ✅ Done |
| S23 | Core SDK v1.0 | ✅ Done |
| S24 | Connector SDK + Specialist SDK + Knowledge Package SDK | ✅ Done |
| S25 | Specialist SDK + 3 Specialists | Planned |
| S26 | Knowledge Packages v1.0 | Planned |
| S27 | Marketplace Alpha | Planned |
| S28 | Developer Portal | Planned |
| S29 | Beta Preparation | Planned |
| S30 | Beta Launch | Planned |

---

## Watch Engine (WE-01 — WE-04)

| Sprint | Foco | Entregável | Status |
|---|---|---|---|
| WE-01 | Foundation de Dados | Entidades Watch/WatchExecution/PendingWatchAction + WatchRegistry + WatchTypes | ✅ Done |
| WE-02 | Motor de Execucao | WatchEvaluator + WatchScheduler (backend, 5-min cron, multi-tick) + ConnectorGateway (Token Bucket + Circuit Breaker) | ✅ Done |
| WE-03 | Resiliencia e Entrega Garantida | WatchOutbox (Durable Outbox) + WatchStateTracker + Missed Recovery + Circuit Breaker + Providers reais (Gmail, Calendar) | ✅ Done |
| WE-04 | Inteligencia e Governanca | WatchPlannerBridge (deteccao de intencao) + WatchDeduplicator + Dashboard (/sprint-we01) + UI polling no ChatPage | ✅ Done |

---

## Microsoft Graph Provider Router (MS-PR-01 — MS-PR-04)

| Sprint | Foco | Entregável | Status |
|---|---|---|---|
| MS-PR-01 | Tipos + Registry | `MicrosoftProviderTypes.ts` + `MicrosoftProviderRegistry.ts` (singleton HMR-safe) | ✅ Done |
| MS-PR-02 | OfficialGraphProvider | Re-home do shell atual; paridade das 32 operations; shell delega ao router | ✅ Done |
| MS-PR-03 | Stubs MCP + REST/SDK | `McpMicrosoftProvider` + `RestSdkProvider` interface-conformes (`isAvailable()=false`) | ✅ Done |
| MS-PR-04 | Base44OutlookProvider (opcional) | Segundo provider de verdade via App-User Connector; resolve dilema OAuth | Planned |

> **Documentação:** RFC-007 + ADR-014 (Fase 0 concluída em 2026-08-04). Emenda circunscrita a ADR-013. MS-EXP-05 (MicrosoftWatchProvider) desvinculado, permanece opcional.

---

## Execution Intelligence Engine (EI-01 — EI-07)

| Sprint | Foco | Entregável | Status |
|---|---|---|---|
| EI-01 | Reversibility Metadata | Campo `capabilityReversibility` (tipo `Reversibility = safe \| reversible \| irreversible`) em `ConnectorTypes.ts` + declarado nos 8 connectors com capabilities nao-safe (Gmail, Drive, Memori, Email, FileSystem, Database, WhatsApp, MicrosoftGraph). 3 read-only (Calendar, GitHub, OpenRouter) omitidos — default `safe` cobre. Nada le o campo ainda. | ✅ Done |
| EI-02 | Tipos + Runtime Facade | `src/lib/execution-intelligence/ExecutionTypes.ts` (contratos uniformes: ExecutionRequest, PreparedExecution, SafetyDecision, ExecutionOutcome, ExecutionContext, ExecutionStage) + `Runtime.ts` com `ExecutionRuntime.processCapability()` (pass-through puro hoje — resolve connector no registry, le reversibility do metadata, chama `connector.execute()`, mapeia para ExecutionOutcome). Nenhum caller o chama. | ✅ Done |
| EI-03 | Safety Gate | `src/lib/execution-intelligence/SafetyGate.ts` (stateless, puro): le `reversibility` — `safe`/`reversible` aprovam; `irreversible` + `confirmedByUser` aprova; `irreversible` sem confirmacao → `needs_confirmation` com resumo generico. `Runtime.processCapability` chama `guard()` antes do dispatch; se nao aprovado, retorna sem despachar. `ExecutionOutcome.error` renomeado para `message`. | ✅ Done |
| EI-04 | Migracao gradual de callers (Option C — prep) | Refator da Facade para delegar ao `ConversationRuntimeEngine` existente (build 1-step plan → `engine.execute()` → map `ExecutionResult`→`ExecutionOutcome`; preserva metricas/eventos/timeout/status do UCRBridge). `index.ts` com `getExecutionRuntime()` wired ao engine/registry reais (lazy). `ExecutionOutcome.result`→`output` + `executionId`/`durationMs`; `ExecutionRequest.context`→`ConnectorExecutionContext` + `executionId?`. ZERO callers migrados — primeira migracao de caller vivo deferida para apos EI-05/EI-07 (gate com contexto real p/ nao quebrar automation). | ✅ Done (prep) |
| EI-05 | Execution Intelligence pass-through | `ExecutionIntelligence.ts` stateless (prepare() → PreparedExecution identico: enrichedParams=request.params, gaps=[], risks=[]; contador de instrumentation). Runtime chama Intelligence ANTES do Safety Gate; `SafetyGate.guard` agora consome `PreparedExecution` (assinatura mudou de request→prepared; summary usa enrichedParams). Plan do Runtime usa `prepared.enrichedParams`. `index.ts` re-exporta `ExecutionIntelligence`. Zero impacto em producao (nenhum caller vivo). | ✅ Done |
| EI-06 | Investigators genericos | `investigators/InvestigatorTypes.ts` (Investigator + InvestigationFinding) + `InvestigatorRegistry.ts` (singleton HMR-safe, register/deactivate/activate, resolve por appliesTo) + `GenericFieldValidator.ts` (campos obrigatorios nao-vazios) + `DateFormatValidator.ts` (formatos YYYY-MM-DD / DD/MM/YYYY / YYYY-MM-DDTHH:mm / HH:mm). `ExecutionIntelligence.prepare()` roda investigators ativos aplicaveis e agrega gaps+risks (single pass, sync). Registry vazio por design = paridade EI-05. `SafetyGate._summarize` anexa gaps ao resumo de needs_confirmation. Sem iteracao, sem LLM, sem chamadas cross-connector. Cada investigator registravel/desativavel (Open/Closed). | ✅ Done |
| EI-07 | Investigators de dominio + iteracao balanceada | `investigators/TravelInvestigator.ts` (passagem aerea: valida campos, normaliza DD/MM/YYYY→YYYY-MM-DD, default passengerType) + `investigators/EmailInvestigator.ts` (envio: valida to/subject/body, detecta "to" sem "@", trim). `InvestigatorTypes` estendido (paramPatches, cost, provides/requires, investigate async). `InvestigatorRegistry` com topo-sort (Kahn) + deteccao de ciclo (registro rejeita grafo ciclico). `ExecutionIntelligence.prepare()` vira **async com iteracao balanceada**: resolve investigators ativos em ordem topologica, agrega gaps/risks, mergeia paramPatches, reitera se params mudaram. 3 travas: Convergence Budget (maxIterations=5), API/LLM Budget (maxLlm=3, maxApi=4; cost reportado pelos investigators), Dependency Graph aciclico (registry). `ExecutionTypes` ganha `IntelligenceBudget` + `DEFAULT_BUDGET`. `Runtime` awaita prepare. `registerDefaults.ts` registra Travel+Email no load do wiring (side-effect import em index.ts). Deterministicos (sem LLM/cross-connector). Zero impacto em producao (nenhum caller vivo; registry vazio ate wiring carregar). | ✅ Done |

> **Documentação:** RFC-008 + ADR-015 (documentacao concluida em 2026-08-04). Filosofia: produzir a melhor execucao possivel, nao apenas impedir erros. Separacao Intelligence × Safety Gate. Dispatcher privado (bypass impossivel por construcao). Cadeia direta hoje; Pipeline generica so quando 4º estagio concreto aparecer (regra de disparo). Reusa padrao "shell fino + modulos internos" vivo em MicrosoftGraphConnector e WhatsAppConnector. EI-07 e onde o valor diferencial real aparece.

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*