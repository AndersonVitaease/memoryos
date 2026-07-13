/**
 * RealProjectValidator.ts — EF-36G Real Project Reconstruction
 * EF-36G · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Wires up the full KRE → KFE → IRE → PRE pipeline using the REAL
 * MemoryOS knowledge providers (no synthetic data).
 *
 * PIPELINE:
 *   OfficialLibrarySource (always available, static catalog)
 *   GitHubKnowledgeSource (available when VITE_GITHUB_TOKEN is set)
 *   ConversationKnowledgeSource (available when conversations are loaded)
 *
 *   → KnowledgeReconstructionEngine.reconstruct()
 *   → KnowledgeFusionEngine.fuse()
 *   → IdentityResolutionEngine.resolve()
 *   → ProjectReconstructionEngine.reconstruct()
 *
 * NO new engines, NO new providers.
 * Orchestration only.
 */

import { KnowledgeReconstructionEngine } from "../knowledge-reconstruction/KnowledgeReconstructionEngine";
import { OfficialLibrarySource } from "../knowledge-reconstruction/sources/OfficialLibrarySource";
import { GitHubKnowledgeSource } from "../knowledge-reconstruction/sources/GitHubKnowledgeSource";
import { ConversationKnowledgeSource } from "../knowledge-reconstruction/sources/conversation/ConversationKnowledgeSource";
import { ChatGPTConversationProvider } from "../knowledge-reconstruction/sources/conversation/ChatGPTConversationProvider";
import { ProjectReconstructionEngine } from "./ProjectReconstructionEngine";
import type { ProviderKnowledge } from "../knowledge-fusion/KnowledgeFusionEngine";
import type { ProjectReconstructionReport } from "./PRTypes";
import type { ReconstructionReport } from "../knowledge-reconstruction/KRETypes";

// ── Source availability record ────────────────────────────────────────────────

export interface SourceAvailability {
  id: string;
  name: string;
  status: "available" | "degraded" | "unavailable";
  details: string;
  itemsLoaded: number;
  errors: string[];
}

// ── Certification ─────────────────────────────────────────────────────────────

export type CertificationVerdict = "PASS" | "WARNING" | "FAIL";

export interface CertificationItem {
  criterion: string;
  verdict: CertificationVerdict;
  value: string;
  explanation: string;
}

export interface ProjectCertification {
  id: string;
  generatedAt: number;
  projectName: string;
  overallVerdict: CertificationVerdict;
  items: readonly CertificationItem[];
  independenceAnswer: string;
  independenceEvidence: readonly string[];
  summary: string;
}

// ── Cognitive Q&A ─────────────────────────────────────────────────────────────

export interface CognitiveAnswer {
  question: string;
  answer: string;
  confidence: number;
  sources: string[];
}

// ── Full EF-36G Report ────────────────────────────────────────────────────────

export interface EF36GReport {
  runAt: number;
  durationMs: number;
  kreReport: ReconstructionReport | null;
  projectReport: ProjectReconstructionReport;
  sourceAvailability: SourceAvailability[];
  cognitiveAnswers: CognitiveAnswer[];
  certification: ProjectCertification;
}

// ── Validator ─────────────────────────────────────────────────────────────────

export class RealProjectValidator {
  private kreEngine = new KnowledgeReconstructionEngine();
  private preEngine = new ProjectReconstructionEngine();
  private convProvider = new ChatGPTConversationProvider();
  private lastReport: EF36GReport | null = null;

  /** Load ChatGPT export conversations.json content */
  loadConversations(jsonData: unknown): { loaded: number; errors: string[] } {
    return this.convProvider.loadFromRawJson(jsonData);
  }

  async run(projectName = "MemoryOS"): Promise<EF36GReport> {
    const t0 = Date.now();
    const sourceAvailability: SourceAvailability[] = [];

    // ── Register providers into KRE ──────────────────────────────────────────
    this.kreEngine = new KnowledgeReconstructionEngine();
    this.preEngine = new ProjectReconstructionEngine();

    const officialSource = new OfficialLibrarySource();
    const githubSource = new GitHubKnowledgeSource({ maxFilesPerRepo: 30, maxCommitsPerRepo: 15 });
    const convSource = new ConversationKnowledgeSource({ provider: this.convProvider });

    this.kreEngine.registerSource(officialSource);
    this.kreEngine.registerSource(githubSource);
    this.kreEngine.registerSource(convSource);

    // ── Run KRE reconstruction ────────────────────────────────────────────────
    const kreReport = await this.kreEngine.reconstruct();

    // ── Collect per-source availability ───────────────────────────────────────
    for (const summary of kreReport.sourcesSummary) {
      const src = this.kreEngine.getSource(summary.sourceId);
      const h = src ? await src.health() : { status: "unavailable" as const, details: "Unknown source" };
      sourceAvailability.push({
        id: summary.sourceId,
        name: summary.name,
        status: h.status,
        details: h.details,
        itemsLoaded: summary.itemsLoaded,
        errors: kreReport.errors.filter(e => e.includes(summary.sourceId)),
      });
    }
    // Add any sources that were registered but not in the summary (health only)
    const summaryIds = new Set(kreReport.sourcesSummary.map(s => s.sourceId));
    for (const src of [officialSource, githubSource, convSource]) {
      if (!summaryIds.has(src.id)) {
        const h = await src.health();
        sourceAvailability.push({
          id: src.id, name: src.name,
          status: h.status, details: h.details,
          itemsLoaded: 0, errors: [],
        });
      }
    }

    // ── Build ProviderKnowledge[] for KFE + PRE ───────────────────────────────
    const allItems = this.kreEngine.listItems();
    const allRels = this.kreEngine.listRelationships();

    // Group items and relationships by provider
    const byProvider = new Map<string, ProviderKnowledge>();
    for (const item of allItems) {
      const sid = item.provenance.sourceId;
      if (!byProvider.has(sid)) {
        byProvider.set(sid, {
          sourceId: sid,
          sourceName: item.provenance.sourceName,
          items: [],
          relationships: [],
          timelineEvents: [],
        });
      }
      byProvider.get(sid)!.items.push(item);
    }
    for (const rel of allRels) {
      const sid = rel.provenance.sourceId;
      if (byProvider.has(sid)) {
        byProvider.get(sid)!.relationships.push(rel);
      }
    }
    // Add KRE timeline events
    const kreTimeline = this.kreEngine.timeline;
    const timelineEvts = kreTimeline.getAll();
    for (const evt of timelineEvts) {
      const sid = evt.provenance.sourceId;
      if (byProvider.has(sid)) {
        byProvider.get(sid)!.timelineEvents.push(evt as any);
      }
    }

    const providers = Array.from(byProvider.values());

    // ── Run PRE (which runs KFE + IRE internally) ─────────────────────────────
    const projectReport = this.preEngine.reconstruct(providers, projectName);

    // ── Cognitive Q&A ─────────────────────────────────────────────────────────
    const cognitiveAnswers = this._answerCognitiveQuestions(projectReport);

    // ── Certification ──────────────────────────────────────────────────────────
    const certification = this._certify(projectReport, sourceAvailability, kreReport);

    const report: EF36GReport = {
      runAt: t0,
      durationMs: Date.now() - t0,
      kreReport,
      projectReport,
      sourceAvailability,
      cognitiveAnswers,
      certification,
    };
    this.lastReport = report;
    return report;
  }

  // ── Cognitive Q&A ────────────────────────────────────────────────────────────

  private _answerCognitiveQuestions(projectReport: ProjectReconstructionReport): CognitiveAnswer[] {
    const p = projectReport.project;
    const ire = this.preEngine.getIdentityEngine();
    const kfe = this.preEngine.getFusionEngine();

    const canonicals = ire.listCanonicals();
    const snapshot = kfe.getLatestSnapshot();

    const answers: CognitiveAnswer[] = [];

    // Q1: Current architecture
    const archItems = [...p.adrs, ...p.rfcs, ...canonicals.filter(e => e.entityType === "architecture").map(e => e.canonicalName)];
    answers.push({
      question: "What is the current architecture?",
      answer: archItems.length > 0
        ? `Architecture is governed by ${p.adrs.length} ADR(s), ${p.rfcs.length} RFC(s). Key items: ${archItems.slice(0, 5).join(", ")}${archItems.length > 5 ? ` (+${archItems.length - 5} more)` : ""}.`
        : "Architecture documentation not yet reconstructed from available providers.",
      confidence: p.coverage.byArchitecture,
      sources: p.providersUsed.filter(Boolean),
    });

    // Q2: Current sprint
    const sprintItems = canonicals.filter(e => e.entityType === "sprint");
    const latestSprint = sprintItems.sort((a, b) => b.resolvedAt - a.resolvedAt)[0];
    answers.push({
      question: "What is the current sprint?",
      answer: latestSprint
        ? `Latest sprint detected: "${latestSprint.canonicalName}" (confidence: ${(latestSprint.confidence * 100).toFixed(0)}%).`
        : snapshot?.activeSprint
          ? `Active sprint from KRE snapshot: "${snapshot.activeSprint}".`
          : "No sprint information found in the current knowledge sources.",
      confidence: latestSprint ? latestSprint.confidence : 0.3,
      sources: latestSprint ? [...latestSprint.sources] : [],
    });

    // Q3: Implemented connectors
    const connectors = canonicals.filter(e => e.entityType === "connector" || e.canonicalName.toLowerCase().includes("connector"));
    answers.push({
      question: "Which connectors are implemented?",
      answer: connectors.length > 0
        ? `${connectors.length} connector(s) detected: ${connectors.slice(0, 6).map(c => c.canonicalName).join(", ")}${connectors.length > 6 ? ` (+${connectors.length - 6})` : ""}.`
        : "No connectors explicitly identified. Check architecture documentation.",
      confidence: connectors.length > 0 ? 0.75 : 0.2,
      sources: [...new Set(connectors.flatMap(c => [...c.sources]))].slice(0, 3),
    });

    // Q4: Pending work
    const pendingItems = p.missingKnowledge.items.filter(i => i.severity !== "low");
    const highRisks = p.risks.slice(0, 3);
    answers.push({
      question: "What is the pending work?",
      answer: pendingItems.length > 0 || highRisks.length > 0
        ? `${pendingItems.length} missing knowledge item(s): ${pendingItems.slice(0, 3).map(i => i.description).join("; ")}. ${highRisks.length > 0 ? `Risks: ${highRisks.join("; ")}.` : ""}`
        : "No pending work or risks detected in available knowledge.",
      confidence: 0.7,
      sources: p.providersUsed,
    });

    // Q5: Project risks
    answers.push({
      question: "What are the project risks?",
      answer: p.risks.length > 0
        ? `${p.risks.length} risk(s) identified: ${p.risks.slice(0, 4).join("; ")}.`
        : `No critical risks detected. Architecture consistency: ${p.architectureConsistency.passed}/${p.architectureConsistency.total} checks passed.`,
      confidence: 0.65,
      sources: p.providersUsed,
    });

    // Q6: Architecture evolution
    const versionedItems = canonicals.filter(e => e.versionHistory.length > 1);
    answers.push({
      question: "How has the architecture evolved?",
      answer: versionedItems.length > 0
        ? `${versionedItems.length} versioned item(s) found. Most complex: "${versionedItems.sort((a, b) => b.versionHistory.length - a.versionHistory.length)[0]?.canonicalName}" with ${versionedItems[0]?.versionHistory.length} versions.`
        : `No multi-version items detected. ${p.totalEntities} canonical entities reconstructed from ${p.providersUsed.length} source(s).`,
      confidence: versionedItems.length > 0 ? 0.8 : 0.4,
      sources: [...new Set(versionedItems.flatMap(e => [...e.sources]))].slice(0, 3),
    });

    // Q7: Knowledge sources
    answers.push({
      question: "What are the knowledge sources?",
      answer: `${p.providersUsed.length} provider(s) active: ${p.providersUsed.join(", ")}. Total entities: ${p.totalEntities}. Relationships: ${p.totalRelationships}. Timeline events: ${p.timelineEventCount}.`,
      confidence: p.providersUsed.length >= 2 ? 0.95 : 0.7,
      sources: p.providersUsed,
    });

    return answers;
  }

  // ── Certification ─────────────────────────────────────────────────────────────

  private _certify(
    pr: ProjectReconstructionReport,
    sources: SourceAvailability[],
    kreReport: ReconstructionReport | null,
  ): ProjectCertification {
    const p = pr.project;
    const items: CertificationItem[] = [];

    // C1: Pipeline completed
    const allStagesDone = pr.pipelineStages.every(s => s.status === "complete" || s.status === "skipped");
    items.push({
      criterion: "End-to-end pipeline completed",
      verdict: allStagesDone ? "PASS" : "WARNING",
      value: `${pr.pipelineStages.filter(s => s.status === "complete").length}/${pr.pipelineStages.length} stages complete`,
      explanation: allStagesDone ? "All pipeline stages executed without error." : `${pr.pipelineStages.filter(s => s.status === "error").map(s => s.stage).join(", ")} stage(s) failed.`,
    });

    // C2: At least one knowledge provider available
    const availSources = sources.filter(s => s.status === "available" || s.status === "degraded");
    items.push({
      criterion: "Knowledge providers available",
      verdict: availSources.length === 0 ? "FAIL" : availSources.length < sources.length ? "WARNING" : "PASS",
      value: `${availSources.length}/${sources.length} available`,
      explanation: availSources.length === 0
        ? "No knowledge providers could supply data — reconstruction is impossible without sources."
        : availSources.length < sources.length
          ? `${sources.filter(s => s.status === "unavailable").map(s => s.name).join(", ")} unavailable — knowledge coverage reduced.`
          : "All registered knowledge providers are available.",
    });

    // C3: Entities reconstructed
    const entitiesOk = p.totalEntities >= 5;
    items.push({
      criterion: "Canonical entities reconstructed (>=5)",
      verdict: p.totalEntities === 0 ? "FAIL" : entitiesOk ? "PASS" : "WARNING",
      value: `${p.totalEntities} entities`,
      explanation: p.totalEntities === 0
        ? "No canonical entities generated — identity resolution produced no output."
        : entitiesOk
          ? `${p.totalEntities} canonical entities reconstructed.`
          : `Only ${p.totalEntities} entities — limited knowledge breadth.`,
    });

    // C4: Architecture coverage
    const archCov = p.coverage.byArchitecture;
    items.push({
      criterion: "Architecture coverage",
      verdict: archCov >= 0.5 ? "PASS" : archCov > 0 ? "WARNING" : "FAIL",
      value: `${(archCov * 100).toFixed(0)}%`,
      explanation: archCov >= 0.5
        ? "Architecture entities are corroborated across multiple sources."
        : archCov > 0
          ? "Architecture coverage below 50% — most arch items are single-sourced."
          : "No architecture entities found — architecture is undocumented.",
    });

    // C5: ADRs present
    items.push({
      criterion: "ADRs reconstructed",
      verdict: p.adrs.length >= 1 ? "PASS" : "WARNING",
      value: `${p.adrs.length} ADR(s)`,
      explanation: p.adrs.length >= 1
        ? `${p.adrs.length} Architecture Decision Record(s) found.`
        : "No ADRs reconstructed — decisions may be undocumented.",
    });

    // C6: RFCs present
    items.push({
      criterion: "RFCs reconstructed",
      verdict: p.rfcs.length >= 1 ? "PASS" : "WARNING",
      value: `${p.rfcs.length} RFC(s)`,
      explanation: p.rfcs.length >= 1
        ? `${p.rfcs.length} RFC(s) found.`
        : "No RFCs reconstructed — proposals may be undocumented.",
    });

    // C7: Overall confidence
    const conf = p.confidence;
    items.push({
      criterion: "Overall confidence >= 0.7",
      verdict: conf >= 0.7 ? "PASS" : conf >= 0.5 ? "WARNING" : "FAIL",
      value: `${(conf * 100).toFixed(0)}%`,
      explanation: conf >= 0.7
        ? "Reconstruction confidence meets the minimum threshold."
        : conf >= 0.5
          ? `Confidence at ${(conf * 100).toFixed(0)}% — below ideal 70% threshold.`
          : `Low confidence (${(conf * 100).toFixed(0)}%) — unreliable reconstruction.`,
    });

    // C8: Missing knowledge is manageable
    const critical = p.missingKnowledge.bySeverity.high;
    items.push({
      criterion: "No critical missing knowledge",
      verdict: critical === 0 ? "PASS" : critical <= 3 ? "WARNING" : "FAIL",
      value: `${critical} high-severity missing item(s)`,
      explanation: critical === 0
        ? "No high-severity knowledge gaps."
        : `${critical} high-severity missing item(s): ${p.missingKnowledge.items.filter(i => i.severity === "high").slice(0, 2).map(i => i.description).join("; ")}.`,
    });

    // C9: Architecture consistency
    const ac = p.architectureConsistency;
    items.push({
      criterion: "Architecture consistency (>=6/8 checks)",
      verdict: ac.passed >= 6 ? "PASS" : ac.passed >= 4 ? "WARNING" : "FAIL",
      value: `${ac.passed}/${ac.total} checks`,
      explanation: ac.passed >= 6
        ? "Architecture consistency verified."
        : `${ac.total - ac.passed} check(s) failed: ${ac.checks.filter(c => !c.passed).map(c => c.name).join(", ")}.`,
    });

    // C10: Multi-source corroboration
    const multiSource = (p.verificationBreakdown["MULTI_SOURCE"] ?? 0) + (p.verificationBreakdown["VERIFIED"] ?? 0);
    items.push({
      criterion: "Multi-source corroboration present",
      verdict: multiSource >= 3 ? "PASS" : multiSource >= 1 ? "WARNING" : "FAIL",
      value: `${multiSource} verified/multi-source entities`,
      explanation: multiSource >= 3
        ? `${multiSource} entities confirmed across multiple sources.`
        : multiSource >= 1
          ? `Only ${multiSource} multi-source entity(ies) — limited cross-validation.`
          : "No multi-source entities — all knowledge single-sourced.",
    });

    // Overall verdict
    const fails = items.filter(i => i.verdict === "FAIL").length;
    const warnings = items.filter(i => i.verdict === "WARNING").length;
    const overallVerdict: CertificationVerdict = fails > 0 ? "FAIL" : warnings > 0 ? "WARNING" : "PASS";

    // Independence evidence
    const evidence: string[] = [];
    if (p.totalEntities > 0) evidence.push(`${p.totalEntities} canonical entities reconstructed from ${p.providersUsed.length} provider(s)`);
    if (p.adrs.length > 0) evidence.push(`${p.adrs.length} ADR(s) preserved in Official Library (provider-agnostic)`);
    if (p.rfcs.length > 0) evidence.push(`${p.rfcs.length} RFC(s) preserved in Official Library (provider-agnostic)`);
    if (kreReport && kreReport.sourcesScanned > 0) evidence.push(`KRE scanned ${kreReport.sourcesScanned} source(s) and extracted ${kreReport.knowledgeExtracted} knowledge items`);
    if (availSources.some(s => s.id !== "official-library")) evidence.push(`External provider(s) available: ${availSources.filter(s => s.id !== "official-library").map(s => s.name).join(", ")}`);
    else evidence.push("Only Official Library available — external providers (GitHub, Conversations) require credentials/data");

    const canReconstructWithoutBase44 = overallVerdict !== "FAIL" && p.totalEntities >= 5;

    return {
      id: `cert_${Date.now()}`,
      generatedAt: Date.now(),
      projectName: p.name,
      overallVerdict,
      items: Object.freeze(items),
      independenceAnswer: canReconstructWithoutBase44
        ? "YES — MemoryOS can be reconstructed without Base44, using Official Library + GitHub + Conversation providers."
        : fails > 1
          ? "NO — Reconstruction failed critical criteria. More providers or data needed."
          : "PARTIAL — Core knowledge reconstructed, but some sources unavailable.",
      independenceEvidence: Object.freeze(evidence),
      summary: overallVerdict === "PASS"
        ? `${items.filter(i => i.verdict === "PASS").length}/${items.length} criteria passed. Project can be reconstructed independently.`
        : overallVerdict === "WARNING"
          ? `${warnings} warning(s), 0 failures. Reconstruction succeeded with gaps — see WARNING items.`
          : `${fails} critical failure(s). Reconstruction incomplete.`,
    };
  }

  getLastReport(): EF36GReport | null { return this.lastReport; }
  getIdentityEngine() { return this.preEngine.getIdentityEngine(); }
  getFusionEngine() { return this.preEngine.getFusionEngine(); }
}