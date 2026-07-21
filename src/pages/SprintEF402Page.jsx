/**
 * SprintEF402Page.jsx — SPRINT EF-40.2
 * Architectural Observability Unification Certification
 * Evidence-only. No inferences. No opinions.
 */

import React, { useState } from "react";

const MEMBERSHIP = [
  { c: "ConversationPipeline", f: "ConversationPipeline.ts", ok: true, ev: "Header: 'ConversationPipeline.ts — v2 (Execution Outcome Architecture)' + 'MDS v2.0 compliant'. Imports ExecutionOutcomeAdapterFactory, ResponseArbiter. Appears at position [1] in MEMORYOS-ARCHITECTURE-v2.0.md PATH A pipeline." },
  { c: "ExecutionDispatcher", f: "ExecutionDispatcher.ts", ok: true, ev: "Header: 'Sprint E-02.3A'. Contract EF-05 in OFFICIAL-CONTRACTS.md: 'Official · Frozen'. Listed at position [14] in MEMORYOS-ARCHITECTURE-v2.0.md PATH B." },
  { c: "OfficialRuntimeBridge", f: "OfficialRuntimeBridge.ts", ok: true, ev: "Header: 'Sprint M-04'. Comment: 'This bridge is the ONLY connector execution adapter for cognitive components'. Comment: 'MDS v2.0 compliant'. Called by RepositoryKnowledgeBuilder (comment P-01)." },
  { c: "ConnectorInvocationService", f: "ConnectorInvocationService.ts", ok: false, ev: "No mention in MEMORYOS-ARCHITECTURE-v2.0.md or OFFICIAL-CONTRACTS.md. OfficialRuntimeBridge.ts header: 'ConnectorInvocationService.invoke() is NO LONGER the execution path'. Explicitly marked for replacement by Sprint M-04." },
  { c: "RepositoryAnalyzer", f: "RepositoryAnalyzer.ts", ok: false, ev: "No mention in MEMORYOS-ARCHITECTURE-v2.0.md. No contract in OFFICIAL-CONTRACTS.md. CDLTypes domain. Called only by DevelopmentLoopOrchestrator. No MDS v2.0 annotation in header." },
  { c: "RepositoryKnowledgeBuilder", f: "RepositoryKnowledgeBuilder.ts", ok: false, ev: "Header: 'EF-60.1 / 60.3 / ... Phase 6.0.0 · 2026-07-14'. EF-60 series NOT in MEMORYOS-ARCHITECTURE-v2.0.md (frozen 2026-07-11) or OFFICIAL-CONTRACTS.md. Comment P-01 notes migration in progress for input path only." },
  { c: "ApplicationAnalyzer", f: "ApplicationAnalyzer.ts", ok: false, ev: "No mention in MEMORYOS-ARCHITECTURE-v2.0.md or OFFICIAL-CONTRACTS.md. CDLTypes domain. Called only by DevelopmentLoopOrchestrator. No MDS v2.0 annotation." },
  { c: "KnowledgeReconstructionEngine", f: "KnowledgeReconstructionEngine.ts", ok: false, ev: "Header: 'EF-36A · Project Independence · Foundation v1.0'. EF-36 series absent from MEMORYOS-ARCHITECTURE-v2.0.md and OFFICIAL-CONTRACTS.md. No contract defined." },
  { c: "IdentityResolutionEngine", f: "IdentityResolutionEngine.ts", ok: false, ev: "Header: 'EF-36E · Project Independence · Foundation v1.0'. EF-36 series absent from official documentation. No contract. No MDS v2.0 annotation." },
  { c: "ProjectReconstructionEngine", f: "ProjectReconstructionEngine.ts", ok: false, ev: "Header: 'EF-36F · Project Independence · Foundation v1.0'. EF-36 absent. Comment: 'Orchestrates existing engines only'. No contract." },
  { c: "CognitiveLearningEngine", f: "CognitiveLearningEngine.ts", ok: false, ev: "Header: 'Beta-03.2 · 2026-07-13'. No EF number in ARCHITECTURE-v2.0.md scope. No contract in OFFICIAL-CONTRACTS.md. No response-arbiter imports." },
  { c: "KnowledgeGraphBridge", f: "KnowledgeGraphBridge.ts", ok: true, ev: "Header: 'Sprint M-03'. Comment: 'This is the OFFICIAL second writer of KnowledgeGraphStore'. Comment: 'MDS v2.0 compliant'. Called from ConversationPipeline in live path." },
  { c: "ExecutionOutcomeFactory", f: "ExecutionOutcomeFactory.ts", ok: true, ev: "Part of response-arbiter module. Referenced in AUDIT-ExecutionOutcome-Architecture-2026-07-21.md as official. Called by ExecutionOutcomeAdapterFactory which is called by ConversationPipeline." },
  { c: "ExecutionOutcomeAdapter", f: "ExecutionOutcomeAdapter.ts", ok: true, ev: "Part of response-arbiter module. Header: 'SRP: ponto de entrada publico para adaptacao de ExecutionOutcome'. Referenced in AUDIT doc as official. Delegates to AdapterRegistry." },
  { c: "ResponseCandidate", f: "ResponseCandidate.ts", ok: true, ev: "Part of response-arbiter module. Referenced in AUDIT-ExecutionOutcome-Architecture-2026-07-21.md dependency graph. Imported by ExecutionOutcomeDomainAdapter and ResponseArbiter." },
  { c: "ResponseArbiter", f: "ResponseArbiter.ts", ok: true, ev: "Header: 'MDS v2.0 compliant'. Called by ConversationPipeline. AUDIT-ExecutionOutcome-Architecture-2026-07-21.md: 'INTEGRAÇÃO AO ConversationPipeline: AUTORIZADA'." },
];

const CALLERS = [
  { c: "ConversationPipeline", by: "ChatInterface (useConversation.js)", inst: "globalThis singleton _CXP_PIPELINE_", out: "ChatPage (UI streaming)", deps: "ExecutionOutcomeAdapterFactory · ResponseArbiter · ConversationPlanningEngine · runtimeTraceStore · getRealRuntimeEngine" },
  { c: "ExecutionDispatcher", by: "ConversationRuntimeEngine", inst: "ConversationRuntimeEngine constructor via ICapabilityExecutor injection", out: "ConversationRuntimeEngine (StepResult → ExecutionResult)", deps: "ICapabilityExecutor (interface) · connectorMetrics" },
  { c: "OfficialRuntimeBridge", by: "RepositoryKnowledgeBuilder · ConversationCognitiveGateway · LiveCognitivePipeline", inst: "globalThis singleton __OFFICIAL_RUNTIME_BRIDGE__", out: "RepositoryKnowledgeBuilder (treeInv.data) · CCG · LCP", deps: "ConversationPlanningEngine · getRealRuntimeEngine" },
  { c: "ConnectorInvocationService", by: "CDL certification pages (SprintM15, Sprint812, etc.) · Legacy cognitive flows", inst: "new ConnectorInvocationService() in page components", out: "CDL certification pages (_history, report)", deps: "GitHubConnector · Base44Connector · GoogleConnector" },
  { c: "RepositoryAnalyzer", by: "DevelopmentLoopOrchestrator", inst: "new RepositoryAnalyzer() in DevelopmentLoopOrchestrator constructor", out: "DevelopmentLoopOrchestrator (repoAnalysis) · CDL pages", deps: "GitHubConnector (direct instantiation)" },
  { c: "RepositoryKnowledgeBuilder", by: "GitHubQueryRouter · CDL pages · RKBInstrumented wrapper", inst: "new RepositoryKnowledgeBuilder() in callers", out: "KnowledgeGraphStore NOT connected from live pipeline · GitHubQueryRouter answer synthesis", deps: "officialRuntimeBridge" },
  { c: "ApplicationAnalyzer", by: "DevelopmentLoopOrchestrator", inst: "new ApplicationAnalyzer() in DevelopmentLoopOrchestrator constructor", out: "DevelopmentLoopOrchestrator (appAnalysis) · CDL pages", deps: "Base44Connector" },
  { c: "KnowledgeReconstructionEngine", by: "CDL certification pages (Phase641, Phase642, SourceAudit pages)", inst: "new KnowledgeReconstructionEngine() in page components", out: "Certification pages (ReconstructionReport display)", deps: "IKnowledgeSource impls · KnowledgeGraph · TimelineBuilder · ConflictDetector · ProvenanceTracker" },
  { c: "IdentityResolutionEngine", by: "ProjectReconstructionEngine", inst: "new IdentityResolutionEngine() in ProjectReconstructionEngine constructor", out: "ProjectReconstructionEngine (canonicals, identityReport)", deps: "AliasDetector · VersionResolver · IdentityGraph · IRConflictDetector" },
  { c: "ProjectReconstructionEngine", by: "Phase641Page · Phase641aPage (certification pages)", inst: "new ProjectReconstructionEngine() in page components", out: "Certification pages (ProjectReconstructionReport display)", deps: "KnowledgeFusionEngine · IdentityResolutionEngine · CoverageCalculator · MissingKnowledgeDetector · ArchitectureValidator" },
  { c: "CognitiveLearningEngine", by: "CDL certification pages (SprintC040, Phase643, etc.)", inst: "new CognitiveLearningEngine() in page components", out: "Certification pages (CLEReport display)", deps: "OutcomeEvaluator · LearningRecordFactory · ConfidenceManager · RecommendationEngine · KnowledgeIntegrator" },
  { c: "KnowledgeGraphBridge", by: "ConversationPipeline (when kfmModel.totalEntities > 0)", inst: "globalThis singleton __KGB_BRIDGE__", out: "KnowledgeGraphStore via KnowledgeGraphStore.set()", deps: "KnowledgeGraphStore · UnifiedKnowledgeModel (KFETypes)" },
  { c: "ExecutionOutcomeFactory", by: "ExecutionOutcomeAdapterFactory", inst: "globalThis singleton __EXECUTION_OUTCOME_FACTORY__", out: "ExecutionOutcomeAdapter via AdapterFactory", deps: "ExecutionOutcomeTypes" },
  { c: "ExecutionOutcomeAdapter", by: "ExecutionOutcomeAdapterFactory", inst: "globalThis singleton __EXECUTION_OUTCOME_ADAPTER__", out: "ExecutionOutcomeAdapterFactory (AdaptationResult with candidate)", deps: "ExecutionOutcomeAdapterRegistry" },
  { c: "ResponseCandidate", by: "IExecutionOutcomeDomainAdapter.adapt() via createResponseCandidate()", inst: "createResponseCandidate() factory function", out: "ResponseArbiter.arbitrate(candidates[])", deps: "none" },
  { c: "ResponseArbiter", by: "ConversationPipeline (responseArbiter.arbitrate(candidates, arbContext))", inst: "globalThis singleton __RESPONSE_ARBITER__", out: "ConversationPipeline (arbResult.selected.answer → finalResponse → user)", deps: "ResponseCandidate" },
];

const ARCHS = [
  { name: "A — Official Conversational Pipeline", color: "emerald", desc: "Live execution path. MDS v2.0 compliant. Called on every user message.", steps: ["ChatInterface", "ConversationPipeline._runPipeline()", "ConversationGoalBridge.derive()", "ConversationPlanningEngine.plan()", "ConversationRuntimeEngine → ExecutionDispatcher", "ICapabilityExecutor → UCR → Connector", "ConnectorResultSynthesizer", "ExecutionOutcomeAdapterFactory", "ExecutionOutcomeFactory + ExecutionOutcome", "ExecutionOutcomeAdapter + Registry + DomainAdapter", "ResponseCandidate", "ResponseArbiter", "→ user answer"], ev: "ConversationPipeline.ts imports ExecutionOutcomeAdapterFactory, ResponseArbiter. All components annotated MDS v2.0 compliant." },
  { name: "B — Cognitive Development Loop (CDL)", color: "amber", desc: "Offline analysis. Called from CDL/certification pages. Not connected to live pipeline.", steps: ["CDL Pages (Phase641, Phase643, SprintC040, SprintM15)", "DevelopmentLoopOrchestrator.analyze()", "RepositoryAnalyzer → RepositoryAnalysis", "ApplicationAnalyzer → ApplicationAnalysis", "DevelopmentLoopOrchestrator.generatePlan() → ExecutionPlan (CDLTypes)", "DevelopmentLoopOrchestrator.executeApprovedPlan() → ExecutionRecord", "CognitiveLearningEngine.learn() → LearningSession", "[No connection to ResponseArbiter or ExecutionOutcome]"], ev: "DevelopmentLoopOrchestrator.ts: no imports from response-arbiter/. CognitiveLearningEngine.ts: no imports from response-arbiter/. CDLTypes.ExecutionRecord is a different type from ExecutionOutcome." },
  { name: "C — Knowledge Reconstruction (EF-36)", color: "blue", desc: "Static knowledge reconstruction. Certification pages only. No live path connection.", steps: ["Certification pages (Phase641aPage, Phase642Page)", "KnowledgeReconstructionEngine.reconstruct() → ReconstructionReport", "IKnowledgeSource.load() → KnowledgeItem[]", "KnowledgeGraph.addNode/addEdge()", "ConflictDetector.detect()", "IdentityResolutionEngine.resolve() → IdentityReport", "ProjectReconstructionEngine.reconstruct() → ProjectReconstructionReport", "[No connection to ResponseArbiter or ExecutionOutcome]"], ev: "KnowledgeReconstructionEngine.ts: zero imports from response-arbiter/. IdentityResolutionEngine.ts: zero imports from response-arbiter/. ProjectReconstructionEngine.ts: zero imports from response-arbiter/." },
  { name: "D — Repository Knowledge Graph (EF-60)", color: "violet", desc: "GitHub structural graph. Input migrated to official pipeline via OfficialRuntimeBridge. Output (ProjectKnowledgeGraph) stored in this._graph — never flows to KnowledgeGraphBridge from live pipeline.", steps: ["GitHubQueryRouter or CDL pages", "RepositoryKnowledgeBuilder.build(owner, repo)", "officialRuntimeBridge.invoke('github','repository.tree') [INPUT via official path]", "officialRuntimeBridge.invoke('github','files.get') per file", "parseSourceFile() → ArchEntity", "buildRelationships() → ArchRelationship", "this._graph = ProjectKnowledgeGraph [STORED IN INSTANCE]", "[KnowledgeGraphBridge receives kfmModel from ConversationPipeline, NOT this._graph]"], ev: "RepositoryKnowledgeBuilder.ts line 261: this._graph = graph. KnowledgeGraphBridge.ts: persist(model: UnifiedKnowledgeModel) — input is UnifiedKnowledgeModel not ProjectKnowledgeGraph. ConversationPipeline.ts lines 314-331: knowledgeGraphBridge.persist(kfmModel) — kfmModel from KnowledgeFusionEngine." },
  { name: "E — Legacy Connector Invocation (CIS)", color: "red", desc: "Pre-M04 path. Explicitly marked for elimination by Sprint M-04 (OfficialRuntimeBridge). Still active in certification pages.", steps: ["CDL Certification pages (SprintM15, SprintM19, Sprint812)", "ConnectorInvocationService.invoke()", "GitHubConnector.execute() / Base44Connector.execute()", "CognitiveInvocationRecord stored in _history[]", "[No connection to ExecutionOutcomeAdapter]", "[No connection to ResponseArbiter]"], ev: "OfficialRuntimeBridge.ts header: 'ConnectorInvocationService.invoke() is NO LONGER the execution path for cognitive queries'. Comment: 'All LCP and CCG calls should migrate to invokeGuarded() over invoke()'." },
  { name: "F — Debug / Audit Instrumentation", color: "zinc", desc: "Passive observability. AUDIT_MODE flag. Read-only probes. No execution semantics.", steps: ["ConversationPipeline (conditional: if AUDIT_MODE)", "DriveAuditStore.beginTrace() / .record()", "DriveAuditPanel (display only)", "GitHubAuditStore.record()", "GitHubDebugPanel (display only)", "runtimeTraceStore.beginTrace() / .recordStep()", "RuntimeTracePage (display only)"], ev: "ConversationPipeline.ts: 'const { driveAuditStore, AUDIT_MODE } = await import; if (AUDIT_MODE) {...}'. Audit stores are independent of ResponseArbiter and ExecutionOutcome." },
];

const DUPES = [
  { a: "ConnectorInvocationService.invoke()", b: "OfficialRuntimeBridge.invoke()", dup: true, ev: "Both accept (connectorId, operation, parameters) and return {success, data, error, durationMs}. OfficialRuntimeBridge.ts header: 'ConnectorInvocationService.invoke() is NO LONGER the execution path'. OfficialRuntimeBridge routes via PlanningEngine; CIS calls connectors directly. Functional duplicate; ORB is the official replacement." },
  { a: "ConnectorRegistry (connector-router/)", b: "ConnectorRegistry (connector-runtime/)", dup: true, ev: "Both are classes named ConnectorRegistry with register(), get(), list(), count(). Confirmed in AUDIT-ExecutionOutcome-Architecture-2026-07-21.md Q1: 'Existem duas classes ConnectorRegistry com o mesmo nome em paths diferentes'. Pre-existing naming conflict." },
  { a: "ExecutionDispatcher (execution-dispatcher/)", b: "ExecutionDispatcher (runtime-engine/)", dup: false, ev: "Different EF modules. execution-dispatcher/ implements EF-05 contract (Goal→Queue dispatch, PATH B). runtime-engine/ExecutionDispatcher.ts dispatches step-level connector calls for ConversationRuntimeEngine. Different interfaces, different responsibilities." },
  { a: "RepositoryKnowledgeBuilder._graph", b: "KnowledgeGraphStore (set by KnowledgeGraphBridge)", dup: true, ev: "Both are ProjectKnowledgeGraph objects. KnowledgeGraphBridge.ts header: 'The first writer is RepositoryKnowledgeBuilder'. Both share PKBTypes interface. RKB._graph stored in class instance; KGS stores via static KnowledgeGraphStore.set(). Different callers, same type — same-type parallel storage." },
  { a: "CognitiveLearningEngine", b: "LearningEngine (EF-11)", dup: false, ev: "LearningEngine EF-11 contract: learn(knowledge: Knowledge[]) → Learning[]. CognitiveLearningEngine Beta-03.2: learn(plan: ExecutionPlan, record: ExecutionRecord) → LearningSession. Different input/output types, different EF series. NOT functional duplicates." },
  { a: "KnowledgeFusionEngine (knowledge-fusion-engine/)", b: "KnowledgeFusionEngine (knowledge-fusion/)", dup: true, ev: "Two directories both containing a class named KnowledgeFusionEngine. knowledge-fusion/KnowledgeFusionEngine.ts imported by ProjectReconstructionEngine. knowledge-fusion-engine/KnowledgeFusionEngine.ts imported by ConversationPipeline. Same class name, overlapping domain purpose." },
];

const MODELS = [
  { n: "ExecutionOutcome", cat: "Execution", type: "Normalized, immutable result of a single capability execution. Producer-agnostic.", overlap: "None — unique role" },
  { n: "BridgeInvocationResult", cat: "Execution (Intermediate)", type: "Raw bridge result before ExecutionOutcome wrapping. Same fields (success/data/error/durationMs) but not frozen, not passed to adapter.", overlap: "Partial with ExecutionOutcome. Precedes it in flow but never converted by OfficialRuntimeBridge itself." },
  { n: "StepResult", cat: "Execution (Step-level)", type: "Single step output from ExecutionDispatcher. Contains stepId/connector/capability/status/output/error/startedAt/finishedAt/durationMs.", overlap: "Partial with ExecutionOutcome. StepResult feeds ExecutionResult → synthesizer → ExecutionOutcomeAdapterFactory." },
  { n: "CognitiveInvocationRecord", cat: "Telemetry (Legacy)", type: "Audit record for CIS calls. Contains executionId, correlationId, operation, status, durationMs, knowledgeEntryId, timelineEventId.", overlap: "Overlaps with ExecutionOutcome purpose (tracking connector execution) but different schema, no connection to ResponseArbiter." },
  { n: "RepositoryAnalysis", cat: "Diagnostic", type: "GitHub repository health report. Contains commitCount, branchCount, totalFiles, languages, durationMs, errors.", overlap: "No overlap with ExecutionOutcome. Different domain." },
  { n: "ApplicationAnalysis", cat: "Diagnostic", type: "Base44 application state snapshot. Contains userId, projectCount, sessionCount, entityCounts, durationMs.", overlap: "No overlap with ExecutionOutcome." },
  { n: "ReconstructionReport", cat: "Diagnostic", type: "Knowledge reconstruction audit from KRE. Contains graphNodes, graphEdges, confidenceScore, coverage, sourcesSummary, errors.", overlap: "No overlap with ExecutionOutcome." },
  { n: "IdentityReport", cat: "Diagnostic", type: "Identity resolution result from IRE. Contains canonicalEntitiesCreated, aliasesDetected, overallConfidence, errors.", overlap: "No overlap with ExecutionOutcome." },
  { n: "LearningSession", cat: "Result", type: "CognitiveLearningEngine output. Contains startedAt, completedAt, durationMs, executionId, learningRecords, recommendations, errors.", overlap: "Conceptual overlap with ExecutionOutcome (tracks execution outcome) but different schema. No adapter converts LearningSession to ExecutionOutcome." },
  { n: "ProjectKnowledgeGraph", cat: "Result", type: "Structural knowledge graph from RKB and KGB. Contains entities[], relationships[], modules[], layers, circularDeps, coverage.", overlap: "Same type produced by two writers (RKB and KGB). Not an ExecutionOutcome." },
  { n: "ResponseCandidate", cat: "Response (Normalized)", type: "Normalized candidate for ResponseArbiter. Downstream of ExecutionOutcome.", overlap: "No overlap — downstream product of ExecutionOutcome transformation." },
  { n: "ArbitrationResult", cat: "Response (Final)", type: "ResponseArbiter output. Terminal result — never consumed by another model.", overlap: "No overlap." },
];

const DOCS = [
  { d: "MEMORYOS-ARCHITECTURE-v2.0.md", f: "Defines 22 official EF modules (EF-01..14, EF-15, EF-20..25). RepositoryAnalyzer, ApplicationAnalyzer, KRE, IRE, PRE, CLE — NONE appear. ConversationPipeline [1], ExecutionDispatcher [14] DO appear. Frozen at SPR-FREEZE-01 2026-07-11.", ok: true },
  { d: "OFFICIAL-CONTRACTS.md", f: "Defines EF-01..14. ExecutionDispatcher = EF-05 Official Frozen. No contract for RepositoryAnalyzer, ApplicationAnalyzer, KRE, IRE, PRE, CLE. Status Official Frozen for EF-01..14.", ok: true },
  { d: "AUDIT-ExecutionOutcome-Architecture-2026-07-21.md", f: "Certifies ExecutionOutcome architecture: 'APPROVED WITH RECOMMENDATIONS'. States: 'INTEGRAÇÃO AO ConversationPipeline: AUTORIZADA'. Defines dependency graph for Architecture A only. Does NOT reference Layer B engines.", ok: true },
  { d: "MDS-v2.0-Chapter-1.md P6+P7", f: "P6 — Auditabilidade: Toda operação importante deve ser rastreável. P7 — Reprodutibilidade: Uma execução deve poder ser reproduzida. Layer B engines produce no runtimeTrace — VIOLATE P6 and P7 per MDS.", ok: false },
  { d: "KnowledgeGraphBridge.ts (comments)", f: "Header: 'The first writer is RepositoryKnowledgeBuilder (structural/file-level graph). This bridge writes the CONVERSATIONAL knowledge graph.' Two-writer pattern is INTENTIONALLY DOCUMENTED.", ok: true },
  { d: "OfficialRuntimeBridge.ts (comments)", f: "Header Sprint M-04: 'ConnectorInvocationService.invoke() is NO LONGER the execution path for cognitive queries.' Comment: 'All LCP and CCG calls should migrate to invokeGuarded()'. CIS explicitly documented as legacy/deprecated execution path.", ok: true },
  { d: "RepositoryKnowledgeBuilder.ts (comments)", f: "Comment line 21-22: 'P-01: CIS dependency eliminated. RKB now routes all connector calls through the official pipeline (OfficialRuntimeBridge → PlanningEngine → RuntimeEngine → UCR → GitHubConnector).' Input path migrated; output path not yet.", ok: true },
  { d: "MEMORYOS-ARCHITECTURE-v2.0.md P6", f: "P6 — Migrações por Substituição Incremental: 'Nenhum componente do produto é removido antes que seu substituto EF esteja integrado e validado no produto.' Explains CIS coexistence with OfficialRuntimeBridge — migration incomplete.", ok: true },
  { d: "MEMORYOS-ARCHITECTURE-v2.0.md P7", f: "P7 — Nenhuma Decisão Automática: 'Qualquer mudança estrutural na arquitetura requer ADR com aprovação humana explícita.' No ADR exists connecting CDL/EF-36/EF-60 engines to ExecutionOutcome. Therefore their disconnection is architecturally valid under current governance.", ok: true },
];

const CONTRACTS = [
  { e: "RepositoryAnalyzer", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "No interface file. No contract in OFFICIAL-CONTRACTS.md. No response-arbiter imports. No runtimeTraceStore calls." },
  { e: "RepositoryKnowledgeBuilder", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "EF-60 not in OFFICIAL-CONTRACTS.md. No interface for ProjectKnowledgeGraph producer. No response-arbiter imports. console.log only." },
  { e: "ApplicationAnalyzer", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "No contract. No interface. No runtimeTraceStore. CDL domain only." },
  { e: "KnowledgeReconstructionEngine", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "EF-36A not in OFFICIAL-CONTRACTS.md. IKnowledgeSource is KRE-internal. No response-arbiter imports." },
  { e: "IdentityResolutionEngine", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "EF-36E not in official contracts. No interface exported beyond IRTypes. No response-arbiter imports." },
  { e: "ProjectReconstructionEngine", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "EF-36F not in official contracts. Comment: 'Orchestrates existing engines only'. No response-arbiter imports." },
  { e: "CognitiveLearningEngine", contract: false, adapter: false, factory: false, trace: false, req: false, ev: "Beta-03.2 label. Not in official contracts. No response-arbiter imports. No runtimeTraceStore calls." },
];

const NATURE = [
  { claim: "MIGRATION IN PROGRESS", ev: "OfficialRuntimeBridge.ts Sprint M-04 header: 'ConnectorInvocationService.invoke() is NO LONGER the execution path'. RepositoryKnowledgeBuilder comment P-01: 'CIS dependency eliminated. RKB now routes all connector calls through the official pipeline'. These are documented active migration steps." },
  { claim: "SEPARATE DOMAIN (not migration)", ev: "KRE, IRE, PRE, CLE are EF-36 series. DevelopmentLoopOrchestrator and CognitiveLearningEngine are Beta-03.x. Neither series has a stated intent to connect to ResponseArbiter. They serve different runtime contexts (offline analysis, CDL)." },
  { claim: "POST-FREEZE CREATION WITHOUT ADR", ev: "Architecture v2.0 frozen 2026-07-11. RepositoryKnowledgeBuilder: created 2026-07-14 (EF-60). CognitiveLearningEngine: 2026-07-13 (Beta-03.2). Both created AFTER freeze. ARCHITECTURE-v2.0.md P7: 'Qualquer mudanca estrutural na arquitetura requer ADR com aprovacao humana'. No ADR for connecting these to ExecutionOutcome." },
  { claim: "COEXISTENCE JUSTIFIED BY P6", ev: "ARCHITECTURE-v2.0.md P6: 'Nenhum componente do produto e removido antes que seu substituto EF esteja integrado e validado no produto.' CIS coexistence with OfficialRuntimeBridge is justified. CDL/EF-36 coexistence is separate — they are not replacements but new additions." },
];

const ARCH_COLS = {
  emerald: { bg: "bg-emerald-950/30 border-emerald-800/50", step: "text-emerald-400", badge: "bg-emerald-900/60 text-emerald-300 border-emerald-700" },
  amber:   { bg: "bg-amber-950/30 border-amber-800/50",   step: "text-amber-400",   badge: "bg-amber-900/60 text-amber-300 border-amber-700" },
  blue:    { bg: "bg-blue-950/30 border-blue-800/50",     step: "text-blue-400",    badge: "bg-blue-900/60 text-blue-300 border-blue-700" },
  violet:  { bg: "bg-violet-950/30 border-violet-800/50", step: "text-violet-400",  badge: "bg-violet-900/60 text-violet-300 border-violet-700" },
  red:     { bg: "bg-red-950/30 border-red-800/50",       step: "text-red-400",     badge: "bg-red-900/60 text-red-300 border-red-700" },
  zinc:    { bg: "bg-zinc-800/30 border-zinc-700",        step: "text-zinc-400",    badge: "bg-zinc-700 text-zinc-300 border-zinc-600" },
};

const TABS = [
  { id: "membership", label: "Step 1 — Membership" },
  { id: "callers",    label: "Step 2 — Caller Graph" },
  { id: "archs",     label: "Step 3 — Architectures" },
  { id: "dupes",     label: "Steps 4-5 — Duplicates" },
  { id: "docs",      label: "Step 6 — Documentation" },
  { id: "contracts", label: "Steps 7-8 — Contracts" },
  { id: "nature",    label: "Step 9 — Nature" },
  { id: "map",       label: "Steps 10-12 — Map" },
  { id: "cert",      label: "Certification" },
];

export default function SprintEF402Page() {
  const [tab, setTab] = useState("membership");
  const [open, setOpen] = useState(null);

  const officialCount = MEMBERSHIP.filter(m => m.ok).length;
  const nonOfficialCount = MEMBERSHIP.filter(m => !m.ok).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 text-sm font-mono">
      <div className="max-w-7xl mx-auto">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded">SPRINT EF-40.2</span>
            <span className="text-xs text-zinc-500">2026-07-21 · Architectural Observability Unification</span>
          </div>
          <h1 className="text-xl font-bold text-white">Architectural Observability Unification Certification</h1>
          <p className="text-zinc-500 text-xs mt-1">Evidence-only · 12 audit steps · No inferences · No opinions</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            [officialCount, "Official Architecture", "text-emerald-400 bg-emerald-950/40 border-emerald-800/50"],
            [nonOfficialCount, "Outside Official Scope", "text-red-400 bg-red-950/40 border-red-800/50"],
            ["6", "Parallel Architectures", "text-amber-400 bg-amber-950/40 border-amber-800/50"],
            ["5", "Distinct Execution Models", "text-zinc-300 bg-zinc-900 border-zinc-800"],
          ].map(([n, label, cls]) => (
            <div key={label} className={`border rounded-lg p-3 text-center ${cls}`}>
              <div className="text-2xl font-bold">{n}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mb-6 border-b border-zinc-800 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs rounded-t whitespace-nowrap font-semibold flex-shrink-0 transition-colors ${tab === t.id ? "bg-zinc-800 text-white border-t border-l border-r border-zinc-700" : "text-zinc-500 hover:text-zinc-300"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* STEP 1 */}
        {tab === "membership" && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-3">Membership = presence in MEMORYOS-ARCHITECTURE-v2.0.md, OFFICIAL-CONTRACTS.md, or explicit MDS v2.0 annotation in source header.</div>
            {MEMBERSHIP.map((m, i) => (
              <div key={m.c} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 text-left"
                  onClick={() => setOpen(open === i ? null : i)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-zinc-600 w-5 flex-shrink-0">{i + 1}</span>
                    <span className="font-semibold text-white truncate">{m.c}</span>
                    <span className="text-zinc-600 text-xs hidden md:block">{m.f}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${m.ok ? "bg-emerald-900/60 text-emerald-300 border-emerald-700" : "bg-red-950/60 text-red-300 border-red-800"}`}>
                      {m.ok ? "OFFICIAL" : "NOT OFFICIAL"}
                    </span>
                    <span className="text-zinc-600">{open === i ? "▲" : "▼"}</span>
                  </div>
                </button>
                {open === i && (
                  <div className="px-4 pb-3 pt-2 border-t border-zinc-800 text-xs text-zinc-400 break-words">{m.ev}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* STEP 2 */}
        {tab === "callers" && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 mb-3">Derived from import statements and instantiation patterns in source files only.</div>
            {CALLERS.map((c, i) => (
              <div key={c.c} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 text-left"
                  onClick={() => setOpen(open === `c${i}` ? null : `c${i}`)}>
                  <span className="font-semibold text-white">{c.c}</span>
                  <span className="text-zinc-600">{open === `c${i}` ? "▲" : "▼"}</span>
                </button>
                {open === `c${i}` && (
                  <div className="px-4 pb-3 pt-2 border-t border-zinc-800 text-xs space-y-1.5">
                    {[["Called by", c.by], ["Instantiated by", c.inst], ["Output consumed by", c.out], ["Depends on", c.deps]].map(([label, val]) => (
                      <div key={label} className="flex gap-2 items-start">
                        <span className="text-zinc-600 w-36 flex-shrink-0">{label}:</span>
                        <span className="text-zinc-300 flex-1 break-words">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* STEP 3 */}
        {tab === "archs" && (
          <div className="space-y-4">
            <div className="text-xs text-zinc-500 mb-3">6 distinct architectures identified from import chains and call graphs.</div>
            {ARCHS.map(a => {
              const col = ARCH_COLS[a.color];
              return (
                <div key={a.name} className={`border rounded-lg p-4 ${col.bg}`}>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${col.badge}`}>ARCHITECTURE {a.name}</span>
                  </div>
                  <p className="text-zinc-400 text-xs mb-3">{a.desc}</p>
                  <div className="space-y-0.5 mb-3">
                    {a.steps.map((s, j) => (
                      <div key={j} className="flex items-start gap-2 text-xs">
                        <span className={`flex-shrink-0 ${col.step}`}>{j === 0 ? "▶" : "↓"}</span>
                        <span className={s.startsWith("[") ? "text-zinc-600 italic" : "text-zinc-300 break-words"}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-zinc-500 bg-zinc-950/50 rounded p-2 break-words">{a.ev}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* STEP 4-5 */}
        {tab === "dupes" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-white font-bold mb-3">Step 4 — Functional Duplicates</h3>
              <div className="space-y-3">
                {DUPES.map((d, i) => (
                  <div key={i} className={`bg-zinc-900 border rounded-lg p-4 ${d.dup ? "border-amber-800/50" : "border-zinc-800"}`}>
                    <div className="flex items-start gap-3 mb-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${d.dup ? "bg-amber-900/60 text-amber-300 border-amber-700" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>{d.dup ? "DUPLICATE" : "DIFFERENT"}</span>
                      <span className="text-emerald-400 text-xs break-words">{d.a}</span>
                      <span className="text-zinc-600">vs</span>
                      <span className="text-blue-400 text-xs break-words">{d.b}</span>
                    </div>
                    <div className="text-xs text-zinc-500 break-words">{d.ev}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-white font-bold mb-3">Step 5 — Data Model Classification</h3>
              <div className="space-y-2">
                {MODELS.map(m => (
                  <div key={m.n} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs">
                    <div className="flex items-start gap-3 mb-1 flex-wrap">
                      <span className="font-semibold text-white">{m.n}</span>
                      <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded text-xs">{m.cat}</span>
                    </div>
                    <div className="text-zinc-400 mb-1">{m.type}</div>
                    <div className="text-zinc-600">Overlap: {m.overlap}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 6 */}
        {tab === "docs" && (
          <div className="space-y-3">
            <div className="text-xs text-zinc-500 mb-3">Files read: MEMORYOS-ARCHITECTURE-v2.0.md · OFFICIAL-CONTRACTS.md · AUDIT-ExecutionOutcome-Architecture-2026-07-21.md · MDS-v2.0-Chapter-1.md · source file headers and inline comments.</div>
            {DOCS.map((d, i) => (
              <div key={i} className={`bg-zinc-900 border rounded-lg p-4 ${d.ok ? "border-zinc-800" : "border-red-800/50"}`}>
                <div className="flex items-start gap-3 mb-2 flex-wrap">
                  <span className="text-violet-400 font-semibold text-xs">{d.d}</span>
                  {!d.ok && <span className="bg-red-950/60 text-red-300 border border-red-800 px-2 py-0.5 rounded text-xs font-bold">MDS VIOLATION</span>}
                </div>
                <div className="text-xs text-zinc-400 break-words">{d.f}</div>
              </div>
            ))}
          </div>
        )}

        {/* STEP 7-8 */}
        {tab === "contracts" && (
          <div className="space-y-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs">
              <h3 className="text-white font-bold mb-3">Step 7 — Should Cognitive Engines produce ExecutionOutcome?</h3>
              <div className="text-zinc-400 space-y-2">
                <p><span className="text-amber-300">Evidence from interfaces:</span> IKnowledgeSource returns KnowledgeLoadResult — not ExecutionOutcome. IExecutionOutcomeDomainAdapter requires ExecutionOutcome as input. No interface in KRE/IRE/PRE/CLE directories extends IExecutionOutcomeDomainAdapter or references ExecutionOutcomeInput.</p>
                <p><span className="text-amber-300">Evidence from contracts:</span> OFFICIAL-CONTRACTS.md defines no contract requiring cognitive engines to produce ExecutionOutcome. EF-05 (ExecutionDispatcher) is for PATH B Goal dispatching — NOT for cognitive analysis engines.</p>
                <p><span className="text-amber-300">Evidence from factories:</span> ExecutionOutcomeAdapterFactory methods: fromLLMReasoning · fromConnectorSuccess · fromConnectorFailure. No method: fromRepositoryAnalysis · fromLearningSession · fromReconstructionReport. These overloads were never created.</p>
                <p><span className="text-amber-300">Conclusion from evidence:</span> No contract, interface, import, or factory method requires Layer B engines to produce ExecutionOutcome. The architecture documents do not state this requirement. The absence is an unaddressed gap, not a stated contract violation.</p>
              </div>
            </div>
            <div>
              <h3 className="text-white font-bold mb-3">Step 8 — Contract Analysis per Engine</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      {["Engine", "Contract", "Adapter", "Factory", "RuntimeTrace", "Doc Req."].map(h => (
                        <th key={h} className={`px-3 py-2 text-zinc-400 ${h === "Engine" ? "text-left" : "text-center"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CONTRACTS.map(c => (
                      <tr key={c.e} className="border-b border-zinc-800 hover:bg-zinc-900/50">
                        <td className="px-3 py-2 text-white font-semibold">{c.e}</td>
                        {[c.contract, c.adapter, c.factory, c.trace, c.req].map((v, j) => (
                          <td key={j} className="px-3 py-2 text-center">
                            <span className={v ? "text-emerald-400" : "text-red-400"}>{v ? "✓" : "✗"}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 space-y-1">
                {CONTRACTS.map(c => (
                  <div key={c.e} className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs text-zinc-500 break-words">{c.e}: {c.ev}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 9 */}
        {tab === "nature" && (
          <div className="space-y-4">
            <div className="text-xs text-zinc-500 mb-3">Classification from source file headers, comments, documentation, sprint labels only. No assumptions.</div>
            {NATURE.map((n, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <div className="text-amber-300 font-bold text-sm mb-2">{n.claim}</div>
                <div className="text-xs text-zinc-400 break-words">{n.ev}</div>
              </div>
            ))}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs">
              <h3 className="text-white font-bold mb-3">Synthesis</h3>
              <div className="text-zinc-400 space-y-2">
                <p><span className="text-emerald-300">ConnectorInvocationService (Architecture E):</span> MIGRATION IN PROGRESS — explicitly documented as legacy by Sprint M-04. Coexistence justified by P6.</p>
                <p><span className="text-amber-300">RepositoryKnowledgeBuilder, KRE, IRE, PRE (Architectures C, D):</span> SEPARATE DOMAIN — created after v2.0 freeze for offline analysis/certification without ADR connecting them to ExecutionOutcome. Per P7: connection would require ADR.</p>
                <p><span className="text-blue-300">CognitiveLearningEngine, ApplicationAnalyzer, RepositoryAnalyzer (Architecture B):</span> SEPARATE DOMAIN (CDL) — different runtime context from live conversational pipeline. No integration with ResponseArbiter was stated as a requirement.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 10-12 */}
        {tab === "map" && (
          <div className="space-y-5 text-xs">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-white font-bold mb-4">Step 10 — Full Architecture Map</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-3">
                  <div className="text-emerald-400 font-bold mb-2">ARCHITECTURE A — Official (Live)</div>
                  {["ChatInterface", "ConversationPipeline", "ConversationGoalBridge", "ConversationPlanningEngine", "ConversationRuntimeEngine", "ExecutionDispatcher", "ICapabilityExecutor → Connector", "ConnectorResultSynthesizer", "ExecutionOutcomeAdapterFactory", "ExecutionOutcome", "ExecutionOutcomeAdapter", "ResponseCandidate", "ResponseArbiter", "→ User answer"].map((s, i) => (
                    <div key={i} className="flex items-start gap-1 text-xs"><span className="text-emerald-600 flex-shrink-0">{i === 0 ? "▶" : "↓"}</span><span className="text-emerald-200">{s}</span></div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    { arch: "B — CDL", col: "amber", steps: ["DevelopmentLoopOrchestrator", "RepositoryAnalyzer → RepositoryAnalysis", "ApplicationAnalyzer → ApplicationAnalysis", "CognitiveLearningEngine → LearningSession", "→ CDL Pages only"] },
                    { arch: "C — EF-36", col: "blue", steps: ["KnowledgeReconstructionEngine → ReconstructionReport", "IdentityResolutionEngine → IdentityReport", "ProjectReconstructionEngine → ProjectReconstructionReport", "→ Certification Pages only"] },
                    { arch: "D — EF-60 (Hybrid input)", col: "violet", steps: ["RepositoryKnowledgeBuilder", "officialRuntimeBridge [INPUT only]", "this._graph = ProjectKnowledgeGraph", "→ KGS NOT via live pipeline"] },
                    { arch: "E — CIS (Legacy)", col: "red", steps: ["ConnectorInvocationService", "Direct connector calls", "CognitiveInvocationRecord → _history", "→ Certification pages only"] },
                  ].map(a => {
                    const col = ARCH_COLS[a.col];
                    return (
                      <div key={a.arch} className={`border rounded-lg p-3 ${col.bg}`}>
                        <div className={`font-bold mb-1 ${col.badge.split(" ")[1]}`}>ARCHITECTURE {a.arch}</div>
                        {a.steps.map((s, i) => (
                          <div key={i} className="flex items-start gap-1 text-xs"><span className={`flex-shrink-0 ${col.step}`}>{i === 0 ? "▶" : "↓"}</span><span className="text-zinc-300">{s}</span></div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 bg-red-950/20 border border-red-800/50 rounded p-3 text-red-300 font-bold text-center">
                ARCHITECTURES A and B/C/D/E NEVER CONVERGE — NO SHARED EXECUTION MODEL OR RESPONSE CHAIN
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-white font-bold mb-3">Step 11 — Convergence Points</h3>
              <div className="space-y-2">
                {[
                  { q: "Single Runtime?", yes: true, ev: "ConnectorRuntimeProvider.ts: ONE ConversationRuntimeEngine singleton via getRealRuntimeEngine(). Architectures B/C/D/E do NOT use this runtime." },
                  { q: "Single Pipeline?", yes: false, ev: "ConversationPipeline is the single live pipeline. But Architectures B/C/D/E have own orchestration (DevelopmentLoopOrchestrator, ProjectReconstructionEngine, RepositoryKnowledgeBuilder.build()) — independent pipelines." },
                  { q: "Single Execution Model?", yes: false, ev: "5 execution models: ExecutionOutcome (A), CDLTypes.ExecutionRecord (B), ReconstructionReport (C), ProjectKnowledgeGraph (D), CognitiveInvocationRecord (E)." },
                  { q: "Single Response Model?", yes: false, ev: "Architecture A: ResponseCandidate → ResponseArbiter → answer. Architectures B/C/D/E produce domain reports consumed by UI pages only — never by ResponseArbiter." },
                ].map(r => (
                  <div key={r.q} className={`rounded-lg p-3 border text-xs ${r.yes ? "bg-emerald-950/20 border-emerald-800/50" : "bg-red-950/20 border-red-800/50"}`}>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`font-bold ${r.yes ? "text-emerald-400" : "text-red-400"}`}>{r.yes ? "YES" : "NO"}</span>
                      <span className="text-white font-semibold">{r.q}</span>
                    </div>
                    <div className="text-zinc-400">{r.ev}</div>
                  </div>
                ))}
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-xs">
                  <div className="text-amber-300 font-bold mb-1">Meeting Point between Architectures</div>
                  <div className="text-zinc-400">KnowledgeGraphStore is the only shared storage type (Architecture A via KnowledgeGraphBridge, Architecture D via RKB._graph). However their callers (ConversationPipeline vs CDL pages) never converge. The live pipeline calls KnowledgeGraphBridge with kfmModel (from KnowledgeFusionEngine), not with RKB._graph. CONCLUSION: ARCHITECTURES INDEPENDENT.</div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs">
              <h3 className="text-white font-bold mb-3">Step 12 — Why do parallel architectures coexist?</h3>
              <div className="text-zinc-400 space-y-2">
                <p><span className="text-emerald-300">Evidence A — P6 (Migration Policy):</span> MEMORYOS-ARCHITECTURE-v2.0.md P6: 'Nenhum componente do produto e removido antes que seu substituto EF esteja integrado e validado no produto.' Explains CIS coexistence with OfficialRuntimeBridge (migration incomplete).</p>
                <p><span className="text-amber-300">Evidence B — Post-Freeze Creation:</span> v2.0 frozen 2026-07-11. RepositoryKnowledgeBuilder: 2026-07-14 (EF-60, Phase 6.0.0). CognitiveLearningEngine: 2026-07-13 (Beta-03.2). Designed for different contexts (offline analysis, CDL) without being included in v2.0 scope.</p>
                <p><span className="text-blue-300">Evidence C — No ADR for Connection:</span> ARCHITECTURE-v2.0.md P7: 'Qualquer mudanca estrutural na arquitetura requer ADR com aprovacao humana explicita.' No ADR in src/docs/foundation/adr/ connects KRE, IRE, PRE, CLE, RepositoryAnalyzer, ApplicationAnalyzer to ExecutionOutcome pipeline. Disconnection is architecturally valid under current governance.</p>
                <p><span className="text-violet-300">Evidence D — Two-Writer KnowledgeGraph (Intentional):</span> KnowledgeGraphBridge.ts: 'The first writer is RepositoryKnowledgeBuilder. This bridge writes the CONVERSATIONAL knowledge graph.' The disconnect between them in the live pipeline is a consequence of RKB output not being routed through kfmModel — the two-writer intent is documented but the wiring in the live path is absent.</p>
              </div>
            </div>
          </div>
        )}

        {/* CERTIFICATION */}
        {tab === "cert" && (
          <div className="space-y-5">
            <div className="bg-amber-950/40 border-2 border-amber-700 rounded-xl p-6 text-center">
              <div className="text-xs text-amber-400 font-semibold mb-2">SPRINT EF-40.2 · ARCHITECTURAL OBSERVABILITY UNIFICATION CERTIFICATION</div>
              <div className="text-3xl font-bold text-amber-300 mb-2">PARALLEL ARCHITECTURES DETECTED</div>
              <div className="text-xs text-zinc-500 mt-1">Evidence-only · Source code + documentation inspection · 2026-07-21</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs space-y-4">
              <div>
                <div className="text-emerald-400 font-semibold mb-1">CONFIRMED — Official Architecture Integrity</div>
                <ul className="text-zinc-400 space-y-0.5 ml-3">
                  <li>+ Architecture A (ConversationPipeline) is coherent, documented, MDS v2.0 compliant</li>
                  <li>+ ConversationPipeline → ExecutionOutcome → ResponseArbiter chain is complete and operational</li>
                  <li>+ CIS → ORB migration is explicitly documented (Sprint M-04 header)</li>
                  <li>+ KnowledgeGraphBridge two-writer pattern is intentionally documented</li>
                  <li>+ Coexistence of CIS with ORB is justified by P6 (incremental migration)</li>
                  <li>+ No ADR is required for B/C/D disconnection since they are separate domains added after freeze</li>
                </ul>
              </div>
              <div>
                <div className="text-red-400 font-semibold mb-1">DETECTED — Parallel Architecture Evidence</div>
                <ul className="text-zinc-400 space-y-0.5 ml-3">
                  <li>- 5 distinct execution models coexist with no unification contract</li>
                  <li>- 7 engines produce zero connection to ResponseArbiter or runtimeTraceStore</li>
                  <li>- Architectures B (CDL), C (EF-36), D (EF-60) created after v2.0 freeze without connecting to official ExecutionOutcome layer</li>
                  <li>- RKB._graph (ProjectKnowledgeGraph) never flows to KnowledgeGraphBridge from live pipeline</li>
                  <li>- Two classes named ConnectorRegistry in different paths (pre-existing, confirmed in AUDIT doc Q1)</li>
                  <li>- Two KnowledgeFusionEngine classes in different directories</li>
                  <li>- MDS v2.0 P6 (Auditabilidade) and P7 (Reprodutibilidade) are unimplemented for Layer B engines</li>
                </ul>
              </div>
              <div className="border-t border-zinc-800 pt-3 text-zinc-400">
                <span className="text-amber-300 font-semibold">Classification PARALLEL ARCHITECTURES DETECTED — Rationale: </span>
                Six coexisting architectures share no common execution model, no common observability contract, and no common response arbitration. Architecture A is the only fully official, MDS v2.0 compliant, and live-connected architecture. Architectures B, C, D were created after the v2.0 freeze for separate runtime contexts (CDL, offline analysis, certification) without ADR connecting them to ExecutionOutcome — their parallel existence is not an active contract violation (no contract forbids it per P7), but it IS parallel coexistence with no convergence point. The coexistence is NOT "ARCHITECTURE CONSISTENT" (multiple execution models) and NOT "ARCHITECTURE TRANSITION IN PROGRESS" (B/C/D are not migrations of A — they are separate capabilities). The classification is <strong>PARALLEL ARCHITECTURES DETECTED</strong>.
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 text-xs">
              <h3 className="text-white font-bold mb-3">All 12 Deliverables</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {[
                  ["1. Architectural map", true, "6 architectures mapped — Steps 3 and 10"],
                  ["2. Official execution chain", true, "Architecture A — 14 steps — Step 3"],
                  ["3. Cognitive chain", true, "Architecture B CDL — Step 3"],
                  ["4. Observability chain", true, "Architecture F Debug — Step 3"],
                  ["5. Response chain", true, "ResponseCandidate → ResponseArbiter — Step 2"],
                  ["6. Duplicate components", true, "4 duplicates identified — Step 4"],
                  ["7. Duplicate models", true, "12 models classified — Step 5"],
                  ["8. Contracts found", true, "EF-01..14 + AUDIT doc — Steps 6-8"],
                  ["9. Dependencies", true, "Caller graph per component — Step 2"],
                  ["10. Full flow between architectures", true, "Architecture map — Step 10"],
                  ["11. Integration evidence", true, "Architecture A fully integrated — Step 11"],
                  ["12. Separation evidence", true, "Architectures B-E: zero ResponseCandidate output"],
                ].map(([name, done, note]) => (
                  <div key={name} className={`flex items-start gap-2 p-2 rounded border text-xs ${done ? "border-emerald-800/50 bg-emerald-950/20" : "border-red-800/50 bg-red-950/20"}`}>
                    <span className={done ? "text-emerald-400 flex-shrink-0" : "text-red-400 flex-shrink-0"}>{done ? "✓" : "✗"}</span>
                    <div>
                      <div className={`font-semibold ${done ? "text-emerald-300" : "text-red-300"}`}>{name}</div>
                      <div className="text-zinc-500">{note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}