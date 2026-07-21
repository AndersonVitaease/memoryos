/**
 * ComponentOriginAuditPage.jsx
 * Auditoria de origem dos componentes fora da pipeline conversacional oficial.
 * Evidence-only. Nenhuma inferência.
 */

import React, { useState } from "react";

const VERDICTS = {
  A: { label: "Pertenceu à Pipeline A", color: "bg-blue-900/50 text-blue-300 border-blue-700" },
  B: { label: "Criado APÓS substituição da Pipeline A", color: "bg-amber-900/50 text-amber-300 border-amber-700" },
  C: { label: "Nunca pertenceu a nenhuma pipeline conversacional", color: "bg-zinc-800 text-zinc-400 border-zinc-600" },
  UNKNOWN: { label: "NÃO HÁ EVIDÊNCIA SUFICIENTE", color: "bg-red-950/60 text-red-400 border-red-800" },
};

const COMPONENTS = [
  {
    name: "RepositoryAnalyzer",
    file: "src/lib/cognitive-dev-loop/RepositoryAnalyzer.ts",
    sprint: "Beta-03.1 · 2026-07-13",
    verdict: "C",
    reasoning: "O header do arquivo declara explicitamente 'Cognitive Development Loop — Beta-03.1'. O módulo usa GitHubConnector diretamente para analisar metadados de repositório (repos.get, branches.list, commits.list). Nenhuma referência a ConversationPipeline, PrimaryConversationRouter, ConversationGoalBridge, UCME, ResponseArbiter, ou qualquer outro componente da pipeline conversacional. Nunca foi importado por nenhum arquivo da pipeline conversacional.",
    evidence: [
      "RepositoryAnalyzer.ts line 1-7: header — 'Cognitive Development Loop / Beta-03.1 · 2026-07-13'",
      "RepositoryAnalyzer.ts line 9: import { GitHubConnector } from '../connector-runtime/connectors/GitHubConnector' — conexão direta ao conector, sem passar pelo PlanningEngine",
      "RepositoryAnalyzer.ts line 13: CTX = { executionId: 'cdl_repo_analysis' } — id fixo de CDL, nunca gerado por ConversationPipeline",
      "CDLTypes.ts lines 1-7: 'CDLTypes.ts — Cognitive Development Loop Types / Beta-03.1' — domínio próprio isolado",
      "ConversationPipeline.ts: nenhuma importação de RepositoryAnalyzer",
      "DevelopmentLoopOrchestrator.ts: consumidor primário identificado — módulo de desenvolvimento autônomo, fora do loop conversacional",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de que RepositoryAnalyzer existia antes de Beta-03.1 (2026-07-13). Não há referências a versões anteriores, sem ADR de migração, sem comentário de refatoração.",
  },
  {
    name: "RepositoryKnowledgeBuilder",
    file: "src/lib/project-knowledge/RepositoryKnowledgeBuilder.ts",
    sprint: "EF-60.1 / 60.3-60.9 · 2026-07-14",
    verdict: "C",
    reasoning: "Header declara 'EF-60.1 / Phase 6.0.0'. Usa officialRuntimeBridge como intermediário para invocar GitHub (via P-01 migration — comentário 'P-01: CIS dependency eliminated'). A migração P-01 substituiu uma dependência direta ao CIS (ConnectorInvocationService), NÃO à ConversationPipeline. O módulo constrói um grafo de conhecimento de código-fonte de repositório — uma capacidade de análise estática, não uma capacidade conversacional.",
    evidence: [
      "RepositoryKnowledgeBuilder.ts line 2: 'EF-60.1 / 60.3 / 60.4 / 60.5 / 60.6 / 60.7 / 60.8 / 60.9'",
      "RepositoryKnowledgeBuilder.ts line 21-22: comentário 'P-01: CIS dependency eliminated. RKB now routes all connector calls through the official pipeline (OfficialRuntimeBridge → PlanningEngine → RuntimeEngine → UCR → GitHubConnector)'",
      "RepositoryKnowledgeBuilder.ts line 22: import { officialRuntimeBridge } from '../cognitive-connector/OfficialRuntimeBridge' — usa bridge, NÃO ConversationPipeline diretamente",
      "RepositoryKnowledgeBuilder.ts line 8-12: restrições arquiteturais declaradas no header — 'NEVER modifies Connector Runtime, GitHub Connector, CCG, CTP, Composer'",
      "RepositoryKnowledgeBuilder.ts line 94-95: comentário 'P-01: routes through officialRuntimeBridge' — migração de CIS → bridge, não de pipeline conversacional",
      "ConversationPipeline.ts: nenhuma importação de RepositoryKnowledgeBuilder",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de EF-60.1. O comentário 'P-01: CIS dependency eliminated' confirma que a dependência anterior era CIS — uma dependência de conector, não de pipeline conversacional.",
  },
  {
    name: "ApplicationAnalyzer",
    file: "src/lib/cognitive-dev-loop/ApplicationAnalyzer.ts",
    sprint: "Beta-03.1 · 2026-07-13",
    verdict: "C",
    reasoning: "Header declara 'Cognitive Development Loop — Beta-03.1'. Usa Base44Connector diretamente (auth.me, workspace.info, projects.list, sessions.list, entities.count). Escopo exclusivo: analisar o estado atual da aplicação Base44 para o Cognitive Development Loop — não para responder perguntas de usuário. Nunca foi importado por pipeline conversacional.",
    evidence: [
      "ApplicationAnalyzer.ts line 1-7: header — 'Cognitive Development Loop / Beta-03.1 · 2026-07-13'",
      "ApplicationAnalyzer.ts line 9: import { Base44Connector } from '../connector-runtime/connectors/Base44Connector' — dependência direta ao conector",
      "ApplicationAnalyzer.ts line 13: CTX = { executionId: 'cdl_app_analysis' } — execução identificada como CDL, fora do pipeline conversacional",
      "CDLTypes.ts line 68-88: ApplicationAnalysis interface — modelo de dados do CDL, sem equivalente em ConversationPipeline ou ResponseArbiter",
      "ConversationPipeline.ts: nenhuma importação de ApplicationAnalyzer",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de Beta-03.1. Criado como parte do Cognitive Development Loop, um subsistema autônomo.",
  },
  {
    name: "KnowledgeReconstructionEngine",
    file: "src/lib/knowledge-reconstruction/KnowledgeReconstructionEngine.ts",
    sprint: "EF-36A · 2026-07-13",
    verdict: "C",
    reasoning: "Header declara 'EF-36A · Project Independence · Foundation v1.0'. É um motor de reconstrução offline: recebe IKnowledgeSource[], faz scan, load, merge, conflict detection, graph building, timeline, snapshots e report. Não tem path de execução que passe por ConversationPipeline ou qualquer router conversacional. Seus consumidores confirmados são: CognitivePlanner (CDL) e ProjectReconstructionEngine — ambos fora do pipeline conversacional.",
    evidence: [
      "KnowledgeReconstructionEngine.ts line 1-15: header — 'EF-36A · Project Independence · Foundation v1.0'",
      "KnowledgeReconstructionEngine.ts line 17-27: imports — KnowledgeGraph, TimelineBuilder, ConflictDetector, ProvenanceTracker — todos módulos de análise offline",
      "KnowledgeReconstructionEngine.ts line 68-188: reconstruct() — pipeline offline de 8 fases (scan, load, merge, conflict, graph, timeline, snapshot, report)",
      "CognitivePlanner.ts line 144: knowledgeDependencies: ['KnowledgeReconstructionEngine', 'KnowledgeFusionEngine', 'IdentityResolutionEngine'] — referenciado como dependência do CDL",
      "ConversationPipeline.ts: nenhuma importação de KnowledgeReconstructionEngine",
      "ProjectReconstructionEngine.ts line 8-12: 'EF-36F — PIPELINE: ProviderKnowledge[] → KnowledgeFusionEngine → IdentityResolutionEngine → ...' — consumidor confirmado, fora do pipeline conversacional",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de EF-36A. Não há ADR, comentário ou migração que vincule este componente à pipeline conversacional em qualquer versão.",
  },
  {
    name: "IdentityResolutionEngine",
    file: "src/lib/identity-resolution/IdentityResolutionEngine.ts",
    sprint: "EF-36E · 2026-07-13",
    verdict: "C",
    reasoning: "Header declara 'EF-36E · Project Independence · Foundation v1.0'. Recebe FusedEntity[] da KnowledgeFusionEngine (EF-36D) e gera CanonicalEntity[] com resolução de aliases, versões e conflitos de identidade semântica. Escopo puramente offline de fusão de conhecimento. Consumidor primário confirmado: ProjectReconstructionEngine.",
    evidence: [
      "IdentityResolutionEngine.ts line 1-20: header — 'EF-36E · Project Independence · Foundation v1.0 · 2026-07-13'",
      "IdentityResolutionEngine.ts line 17-20: regras arquiteturais — 'Provider-agnostic: consumes FusedEntity, no provider logic / Does not modify KRE, KFE, or Connector Runtime'",
      "IdentityResolutionEngine.ts line 22-23: imports — FusedEntity, FusedRelationship, FusedTimelineEvent de knowledge-fusion — domínio de fusão de conhecimento offline",
      "ProjectReconstructionEngine.ts line 23: import { IdentityResolutionEngine } from '../identity-resolution/IdentityResolutionEngine' — consumidor confirmado",
      "ProjectReconstructionEngine.ts line 5-9: header — 'EF-36F — PIPELINE: ProviderKnowledge[] → KnowledgeFusionEngine (EF-36D) → IdentityResolutionEngine (EF-36E) → ...'",
      "ConversationPipeline.ts: nenhuma importação de IdentityResolutionEngine",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de EF-36E. A sequência EF-36A → 36D → 36E → 36F confirma criação dentro do sprint de Project Independence — domínio isolado.",
  },
  {
    name: "ProjectReconstructionEngine",
    file: "src/lib/project-reconstruction/ProjectReconstructionEngine.ts",
    sprint: "EF-36F · 2026-07-13",
    verdict: "C",
    reasoning: "Header declara 'EF-36F · Project Independence · Foundation v1.0'. Orquestra KnowledgeFusionEngine → IdentityResolutionEngine → CoverageCalculator → MissingKnowledgeDetector → ArchitectureValidator. Escopo: reconstrução offline de um projeto a partir de múltiplos providers de conhecimento. Header lista regra explícita: 'Does not modify KRE, KFE, or IRE'. Nenhum consumidor conversacional identificado.",
    evidence: [
      "ProjectReconstructionEngine.ts line 1-19: header — 'EF-36F · Project Independence · Foundation v1.0 · 2026-07-13' + PIPELINE declarada",
      "ProjectReconstructionEngine.ts line 16-18: regras — 'Orchestrates existing engines only / Provider-agnostic / Does not modify KRE, KFE, or IRE'",
      "ProjectReconstructionEngine.ts line 21-26: imports — KnowledgeFusionEngine, IdentityResolutionEngine, CoverageCalculator, MissingKnowledgeDetector, ArchitectureValidator — todos domínio offline",
      "ProjectReconstructionEngine.ts line 47: reconstruct(providers, projectName) — entrada é ProviderKnowledge[], saída é ReconstructedProject — sem interface com ConversationPipeline",
      "ConversationPipeline.ts: nenhuma importação de ProjectReconstructionEngine",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de EF-36F. Criado no mesmo sprint de EF-36A/E como culminação da pipeline offline de reconstrução.",
  },
  {
    name: "CognitiveLearningEngine",
    file: "src/lib/cognitive-learning-engine/CognitiveLearningEngine.ts",
    sprint: "Beta-03.2 · 2026-07-13",
    verdict: "C",
    reasoning: "Header declara 'Beta-03.2 · 2026-07-13'. Orquestra ciclo de aprendizado: Observe → Compare → Learn → Adjust → Recommend → Integrate. Recebe ExecutionPlan + ExecutionRecord (tipos do CDL) e produz LearningSession. Header contém regras explícitas: 'NEVER executes connector operations / NEVER mutates history / APPEND-ONLY knowledge model'. Consumidor: DevelopmentLoopOrchestrator — fora do pipeline conversacional.",
    evidence: [
      "CognitiveLearningEngine.ts line 1-11: header — 'Beta-03.2 · 2026-07-13' + regras explícitas: 'NEVER executes connector operations'",
      "CognitiveLearningEngine.ts line 13: import type { ExecutionPlan, ExecutionRecord } from '../cognitive-dev-loop/CDLTypes' — entrada é CDL, não pipeline conversacional",
      "CognitiveLearningEngine.ts line 33: learn(plan: ExecutionPlan, record: ExecutionRecord) — interface com CDLTypes, nunca com ConversationPipeline",
      "CognitiveLearningEngine.ts line 80-97: session montada com executionId = record.id — vem do CDL, não de ConversationPipeline.executionId",
      "ConversationPipeline.ts: nenhuma importação de CognitiveLearningEngine",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de Beta-03.2. Criado como parte do Cognitive Development Loop, subsistema de aprendizado autônomo.",
  },
  {
    name: "CognitivePlanner (CDL)",
    file: "src/lib/cognitive-dev-loop/CognitivePlanner.ts",
    sprint: "Beta-03.1 · 2026-07-13",
    verdict: "C",
    reasoning: "Header declara 'Beta-03.1'. Gera ExecutionPlan a partir de RepositoryAnalysis + ApplicationAnalysis. O plano produzido é consumido pelo DevelopmentLoopOrchestrator para execução assistida de desenvolvimento de software — não para resposta conversacional. Os PlanStep[] produzidos usam connector: 'github' | 'base44' | 'knowledge' | 'none' — tipagem CDL, incompatível com GoalType da ConversationPipeline.",
    evidence: [
      "CognitivePlanner.ts line 1-9: header — 'Beta-03.1 · 2026-07-13' + 'Does NOT modify anything — plan only'",
      "CognitivePlanner.ts line 11: import type { RepositoryAnalysis, ApplicationAnalysis, ExecutionPlan, PlanStep, ... } from './CDLTypes' — tipos do CDL",
      "CognitivePlanner.ts line 144: knowledgeDependencies: ['KnowledgeReconstructionEngine', 'KnowledgeFusionEngine', 'IdentityResolutionEngine'] — dependências CDL declaradas no plano gerado",
      "CDLTypes.ts line 100-107: PlanStep.connector type = 'github' | 'base44' | 'knowledge' | 'none' — tipagem exclusiva do CDL, sem overlap com ExecutionPlan da ConversationPipeline",
      "ConversationPipeline.ts: nenhuma importação de CognitivePlanner (CDL)",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de Beta-03.1. CognitivePlanner (CDL) é distinto de ConversationPlanningEngine — são módulos diferentes com propósitos diferentes.",
  },
  {
    name: "DevelopmentLoopOrchestrator",
    file: "src/lib/cognitive-dev-loop/DevelopmentLoopOrchestrator.ts",
    sprint: "Beta-03.1 · 2026-07-13",
    verdict: "C",
    reasoning: "Orquestra o loop completo CDL: RepositoryAnalyzer → ApplicationAnalyzer → CognitivePlanner → approval → execução assistida → KnowledgeReconstructionEngine → CognitiveLearningEngine. Loop completamente fora do ConversationPipeline. Expõe uma interface de execução de desenvolvimento, não de conversação.",
    evidence: [
      "CDLTypes.ts line 200-210: LoopPhase type = 'repository_analysis' | 'application_analysis' | 'cognitive_planning' | 'user_approval' | 'assisted_execution' | 'repository_update' | 'knowledge_update' | 'loop_validation' — fases do CDL, nenhuma corresponde a fases conversacionais",
      "CDLTypes.ts line 219-234: CognitiveDevelopmentLoopReport — contém repositoryAnalysis, applicationAnalysis, executionPlan, executionRecord, knowledgeUpdate — modelo exclusivo do CDL",
      "CognitivePlanner.ts line 143-145: knowledgeDependencies declaradas incluem KnowledgeReconstructionEngine — consumidor confirmado",
      "ConversationPipeline.ts: nenhuma importação de DevelopmentLoopOrchestrator",
    ],
    pipelineA_evidence: "NÃO HÁ EVIDÊNCIA de existência antes de Beta-03.1.",
  },
];

const ALL_VERDICT_COUNTS = {
  A: COMPONENTS.filter(c => c.verdict === "A").length,
  B: COMPONENTS.filter(c => c.verdict === "B").length,
  C: COMPONENTS.filter(c => c.verdict === "C").length,
  UNKNOWN: COMPONENTS.filter(c => c.verdict === "UNKNOWN").length,
};

export default function ComponentOriginAuditPage() {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const visible = filter === "ALL" ? COMPONENTS : COMPONENTS.filter(c => c.verdict === filter);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 text-sm font-mono">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs bg-violet-900/50 text-violet-300 border border-violet-700 px-2 py-0.5 rounded">COMPONENT ORIGIN AUDIT</span>
            <span className="text-xs text-zinc-500">2026-07-21 · Evidence-only</span>
          </div>
          <h1 className="text-xl font-bold text-white">Auditoria de Origem — Componentes Fora da Pipeline Oficial</h1>
          <p className="text-zinc-500 text-xs mt-1">
            Para cada componente: pertenceu à Pipeline A · criado após substituição · nunca pertenceu a nenhuma pipeline conversacional
          </p>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {Object.entries(VERDICTS).map(([key, v]) => (
            <button
              key={key}
              onClick={() => setFilter(filter === key ? "ALL" : key)}
              className={`px-3 py-2 rounded border text-xs font-bold text-left transition-opacity ${v.color} ${filter !== "ALL" && filter !== key ? "opacity-30" : ""}`}
            >
              <div>{v.label}</div>
              <div className="text-lg font-black mt-0.5">{ALL_VERDICT_COUNTS[key]}</div>
            </button>
          ))}
        </div>

        {/* Global conclusion */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-5 text-xs">
          <div className="text-white font-bold mb-2">Conclusão Global</div>
          <p className="text-zinc-400 leading-relaxed">
            Todos os <span className="text-white font-semibold">{COMPONENTS.length} componentes auditados</span> pertencem ao veredicto <span className="text-zinc-300 font-semibold">C — Nunca pertenceram a nenhuma pipeline conversacional</span>.
            Nenhum deles tem evidência de existência antes do sprint em que foi criado, e nenhum é importado por ConversationPipeline.ts, PrimaryConversationRouter, ConversationGoalBridge, ou qualquer outro componente da pipeline oficial.
            Todos foram criados em sprints específicos do Cognitive Development Loop (CDL — Beta-03.x) ou do Project Independence Sprint (EF-36A/E/F, EF-60.x) — domínios completamente separados do pipeline conversacional.
          </p>
        </div>

        {/* Filter label */}
        {filter !== "ALL" && (
          <div className="mb-3 text-xs text-zinc-500">
            Filtrando: <span className="text-white">{VERDICTS[filter]?.label}</span>
            <button className="ml-2 text-violet-400 hover:text-violet-300" onClick={() => setFilter("ALL")}>[limpar filtro]</button>
          </div>
        )}

        {/* Components */}
        <div className="space-y-2">
          {visible.map((comp, idx) => {
            const v = VERDICTS[comp.verdict];
            const globalIdx = COMPONENTS.indexOf(comp);
            return (
              <div key={comp.name} className={`border rounded-lg overflow-hidden border-zinc-800`}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 text-left bg-zinc-900"
                  onClick={() => setOpen(open === globalIdx ? null : globalIdx)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{comp.name}</div>
                      <div className="text-zinc-600 text-xs">{comp.sprint}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${v.color}`}>{v.label}</span>
                    <span className="text-zinc-600">{open === globalIdx ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open === globalIdx && (
                  <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 pb-4 pt-3 space-y-4">

                    {/* File */}
                    <div className="text-xs">
                      <span className="text-zinc-600">Arquivo: </span>
                      <span className="text-violet-400">{comp.file}</span>
                    </div>

                    {/* Verdict banner */}
                    <div className={`rounded border px-3 py-2 text-xs font-bold ${v.color}`}>
                      VEREDICTO: {v.label}
                    </div>

                    {/* Reasoning */}
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Raciocínio</div>
                      <div className="text-xs text-zinc-300 leading-relaxed">{comp.reasoning}</div>
                    </div>

                    {/* Pipeline A check */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                      <div className="text-xs text-zinc-500 mb-1">Pergunta: Pertenceu à Pipeline A?</div>
                      <div className="text-xs text-zinc-400 leading-relaxed">{comp.pipelineA_evidence}</div>
                    </div>

                    {/* Evidence */}
                    <div>
                      <div className="text-xs text-zinc-500 mb-2">Evidências diretas no código</div>
                      <div className="space-y-1">
                        {comp.evidence.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
                            <span className="text-zinc-400 break-words">{e}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary table */}
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 text-xs font-bold text-white">Tabela de Resumo</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2 text-zinc-500 font-normal">Componente</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-normal">Sprint de Criação</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-normal">Veredicto</th>
                  <th className="text-left px-4 py-2 text-zinc-500 font-normal">Importado por ConversationPipeline?</th>
                </tr>
              </thead>
              <tbody>
                {COMPONENTS.map(c => (
                  <tr key={c.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-4 py-2 text-white font-semibold">{c.name}</td>
                    <td className="px-4 py-2 text-zinc-500">{c.sprint}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${VERDICTS[c.verdict].color}`}>C</span>
                    </td>
                    <td className="px-4 py-2 text-red-400">NÃO</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}