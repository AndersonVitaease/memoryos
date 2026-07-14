/**
 * CognitiveAnswerComposer.ts — Phase 5.6.3
 * MemoryOS Core Presentation Layer · 2026-07-13
 *
 * Architecture rules (enforced, not aspirational):
 *   - NEVER calls engines, connectors, or pipelines
 *   - NEVER infers unsupported facts
 *   - NEVER modifies knowledge or state
 *   - Receives structured output and produces human-readable narrative
 *   - Single Responsibility: presentation only
 *
 * Data flow:
 *   LiveCognitivePipeline → CognitiveAnswerComposer → CognitiveAnswer (chat)
 */

import type {
  AnswerTemplate, ComposerInput, ComposedAnswer, EvidenceBlock,
  AnswerSection, ComposerDiagnostic,
} from "./CACTypes";
import { makeCACId } from "./CACTypes";

// ── Template Selector ─────────────────────────────────────────────────────────

const TEMPLATE_MAP: Record<string, AnswerTemplate> = {
  project_status:           "PROJECT_STATUS",
  next_sprint:              "NEXT_SPRINT",
  project_history:          "PROJECT_HISTORY",
  architecture_question:    "ARCHITECTURE",
  connector_diagnostics:    "CONNECTOR_STATUS",
  pipeline_status:          "PIPELINE_STATUS",
  technical_debt:           "TECHNICAL_DEBT",
  current_risks:            "CURRENT_RISKS",
  implementation_status:    "IMPLEMENTATION_PROGRESS",
  knowledge_reconstruction: "GENERAL_SUMMARY",
  repository_analysis:      "IMPLEMENTATION_PROGRESS",
  application_analysis:     "IMPLEMENTATION_PROGRESS",
  general_conversation:     "GENERAL_SUMMARY",
};

function selectTemplate(intent: string): AnswerTemplate {
  return TEMPLATE_MAP[intent] ?? "GENERAL_SUMMARY";
}

// ── Snapshot Accessors (safe, no inference) ───────────────────────────────────

function appState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.applicationState as Record<string, unknown>) ?? {};
}
function repoState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.repositoryState as Record<string, unknown>) ?? {};
}
function goalState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.goalState as Record<string, unknown>) ?? {};
}
function learnState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.learningState as Record<string, unknown>) ?? {};
}
function projState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.projectState as Record<string, unknown>) ?? {};
}
function knowledgeState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.knowledgeState as Record<string, unknown>) ?? {};
}
function identityState(snap: Record<string, unknown>): Record<string, unknown> {
  return (snap.identityState as Record<string, unknown>) ?? {};
}

function connectors(report: Record<string, unknown>): string[] {
  const stages = (report.stages as any[]) ?? [];
  const cis = stages.find((s: any) => s.stageName === "ConnectorInvocationService");
  const result: string[] = [];
  if (cis?.output?.base44Status === "SUCCESS") result.push("Base44");
  if (cis?.output?.githubStatus === "SUCCESS") result.push("GitHub");
  return result;
}

function successStages(report: Record<string, unknown>): string[] {
  return ((report.stages as any[]) ?? [])
    .filter((s: any) => s.status === "SUCCESS")
    .map((s: any) => s.stageName);
}

function pipelineStatus(report: Record<string, unknown>): string {
  return (report.status as string) ?? "UNKNOWN";
}

function recoveryNotes(report: Record<string, unknown>): string[] {
  return ((report.recoveryEvents as any[]) ?? [])
    .map((r: any) => `${r.affectedStage}: ${r.cause} → ${r.strategy}`);
}

// ── Section builders ──────────────────────────────────────────────────────────

function sec(heading: string, body: string, relevant = true): AnswerSection {
  return { heading, body, relevant };
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.map(i => `• ${i}`).join("\n") : "—";
}

// ── Template composers ────────────────────────────────────────────────────────

function composeProjectStatus(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap   = input.snapshot;
  const app    = appState(snap);
  const repo   = repoState(snap);
  const goal   = goalState(snap);
  const learn  = learnState(snap);
  const conns  = connectors(input.pipelineReport);
  const pst    = pipelineStatus(input.pipelineReport);
  const rec    = recoveryNotes(input.pipelineReport);

  const sections: AnswerSection[] = [
    sec("Current Phase",
      goal.topRec
        ? String(goal.topRec)
        : `Pipeline at ${pst} — ${successStages(input.pipelineReport).length} stages completed.`
    ),
    sec("Last Completed Sprint",
      learn.lastLesson
        ? String(learn.lastLesson)
        : `Learning score: ${learn.learningScore ?? "N/A"}`
    ),
    sec("Application State",
      `${app.projectCount ?? 0} project(s) · ${app.totalRecords ?? 0} entity records`
        + (app.entityCounts ? "\n" + Object.entries(app.entityCounts as Record<string, number>).map(([k, v]) => `  ${k}: ${v}`).join("\n") : "")
    ),
    sec("Repository State",
      conns.includes("GitHub")
        ? `${repo.repoCount ?? 0} repo(s) · ${repo.branchCount ?? 0} branches · ${repo.commitCount ?? 0} recent commits`
        : "GitHub not configured — repository analysis unavailable.",
      true
    ),
    sec("Runtime Status",
      `Pipeline: ${pst} · Connectors active: ${conns.join(", ") || "none"}`
    ),
    sec("Recommended Next Step",
      String(goal.topRec ?? "Run next pipeline sprint to get updated recommendations."),
      !!goal.topRec
    ),
    rec.length > 0 ? sec("Degradation Notes", formatList(rec)) : sec("Degradation Notes", "", false),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

function composeNextSprint(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap  = input.snapshot;
  const goal  = goalState(snap);
  const learn = learnState(snap);
  const pst   = pipelineStatus(input.pipelineReport);
  const conns = connectors(input.pipelineReport);

  const sections: AnswerSection[] = [
    sec("Recommended Sprint",
      String(goal.topRec ?? "No recommendation available — run pipeline with active connectors.")
    ),
    sec("Active Sub-Goals",
      `${goal.subGoals ?? 0} sub-goal(s) identified by Goal Intelligence Engine`
    ),
    sec("Learning Context",
      `Score: ${learn.learningScore ?? "N/A"} · Lessons: ${learn.lessonCount ?? 0}`
    ),
    sec("Pipeline Basis",
      `${pst} · ${successStages(input.pipelineReport).length} stages executed · Connectors: ${conns.join(", ") || "none"}`
    ),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

function composeProjectHistory(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap  = input.snapshot;
  const proj  = projState(snap);
  const know  = knowledgeState(snap);
  const learn = learnState(snap);

  const sections: AnswerSection[] = [
    sec("Project Overview",
      `Entities: ${proj.totalEntities ?? "N/A"} · Relationships: ${proj.totalRelationships ?? "N/A"} · Coverage: ${proj.coverage ?? "N/A"}`
    ),
    sec("Knowledge Graph",
      `Nodes: ${know.graphNodes ?? "N/A"} · Items extracted: ${know.knowledgeExtracted ?? "N/A"}`
    ),
    sec("Learning History",
      `Score: ${learn.learningScore ?? "N/A"} · Lessons captured: ${learn.lessonCount ?? 0}`
    ),
    sec("Evidence Chain",
      formatList(input.evidence.slice(0, 8))
    ),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

function composeArchitecture(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap  = input.snapshot;
  const proj  = projState(snap);
  const ident = identityState(snap);
  const pst   = pipelineStatus(input.pipelineReport);
  const stgs  = successStages(input.pipelineReport);

  const sections: AnswerSection[] = [
    sec("Pipeline Architecture",
      `Status: ${pst} · ${stgs.length} stage(s) operational\n${formatList(stgs)}`
    ),
    sec("Project Model",
      `Entities: ${proj.totalEntities ?? "N/A"} · Relationships: ${proj.totalRelationships ?? "N/A"} · Confidence: ${proj.confidence ?? "N/A"}`
    ),
    sec("Identity Layer",
      `Canonical identities: ${ident.canonicalEntitiesCreated ?? "N/A"} · Aliases: ${ident.aliasesDetected ?? "N/A"}`
    ),
    sec("Evidence",
      formatList(input.evidence.slice(0, 6))
    ),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

function composeConnectorStatus(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const conns  = connectors(input.pipelineReport);
  const pst    = pipelineStatus(input.pipelineReport);
  const rec    = recoveryNotes(input.pipelineReport);
  const stages = (input.pipelineReport.stages as any[]) ?? [];
  const cis    = stages.find((s: any) => s.stageName === "ConnectorInvocationService");

  const sections: AnswerSection[] = [
    sec("Base44 Connector",
      cis?.output?.base44Status === "SUCCESS"
        ? `✓ OPERATIONAL — ${cis?.output?.base44Records ?? 0} records fetched`
        : "⚠ Not available — application analysis limited"
    ),
    sec("GitHub Connector",
      cis?.output?.githubStatus === "SUCCESS"
        ? `✓ OPERATIONAL — ${cis?.output?.githubRepos ?? 0} repos · ${cis?.output?.githubCommits ?? 0} commits`
        : "⚠ NOT_CONFIGURED — inject GitHub token to enable repository analysis"
    ),
    sec("Pipeline Status",
      `${pst} · ${successStages(input.pipelineReport).length}/${stages.length} stages completed`
    ),
    rec.length > 0
      ? sec("Recovery Events", formatList(rec))
      : sec("Recovery Events", "", false),
  ];

  const degraded = !conns.includes("Base44") || !conns.includes("GitHub");
  let degradeNote = "";
  if (!conns.includes("GitHub") && !conns.includes("Base44")) {
    degradeNote = "Both connectors unavailable — confidence significantly reduced. Results based on pipeline defaults only.";
  } else if (!conns.includes("GitHub")) {
    degradeNote = "Repository analysis is partial — GitHub token not configured. Application data available via Base44.";
  } else if (!conns.includes("Base44")) {
    degradeNote = "Application analysis limited — Base44 connector unavailable.";
  }

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n")
    + (degradeNote ? `\n\n⚠️ ${degradeNote}` : "");

  return { sections, narrative };
}

function composeTechnicalDebt(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap  = input.snapshot;
  const proj  = projState(snap);
  const goal  = goalState(snap);
  const learn = learnState(snap);

  const risks = (proj.risks as string[] | undefined) ?? [];

  const sections: AnswerSection[] = [
    sec("Identified Risks",
      risks.length > 0 ? formatList(risks) : "No risks flagged by current pipeline run."
    ),
    sec("Missing Coverage",
      `Project coverage: ${proj.coverage ?? "N/A"} · Missing items: ${proj.missingKnowledge ?? 0}`
    ),
    sec("Recommendations",
      String(goal.topRec ?? "Run pipeline with full connector access for detailed debt analysis.")
    ),
    sec("Learning Signals",
      `Score: ${learn.learningScore ?? "N/A"} — ${learn.lessonCount ?? 0} lesson(s) recorded`
    ),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

function composeImplementationProgress(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap  = input.snapshot;
  const app   = appState(snap);
  const repo  = repoState(snap);
  const proj  = projState(snap);
  const stgs  = successStages(input.pipelineReport);
  const conns = connectors(input.pipelineReport);

  const sections: AnswerSection[] = [
    sec("Application Progress",
      `${app.projectCount ?? 0} project(s) · ${app.totalRecords ?? 0} entity records across ${Object.keys((app.entityCounts as object) ?? {}).length} types`
    ),
    sec("Repository Progress",
      conns.includes("GitHub")
        ? `${repo.repoCount ?? 0} repo(s) · ${repo.branchCount ?? 0} branches · ${repo.commitCount ?? 0} recent commits`
        : "GitHub not configured — repository metrics unavailable"
    ),
    sec("Knowledge Coverage",
      `Project entities: ${proj.totalEntities ?? "N/A"} · Relationships: ${proj.totalRelationships ?? "N/A"} · Coverage: ${proj.coverage ?? "N/A"}`
    ),
    sec("Pipeline Stages Completed",
      `${stgs.length} stage(s): ${stgs.join(", ")}`
    ),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

function composeGeneralSummary(input: ComposerInput): { sections: AnswerSection[]; narrative: string } {
  const snap  = input.snapshot;
  const app   = appState(snap);
  const goal  = goalState(snap);
  const pst   = pipelineStatus(input.pipelineReport);
  const stgs  = successStages(input.pipelineReport);
  const conns = connectors(input.pipelineReport);

  const sections: AnswerSection[] = [
    sec("Summary",
      `Live Cognitive Pipeline executed: ${stgs.length} stage(s) at ${pst}.`
    ),
    sec("Data",
      `${app.projectCount ?? 0} project(s) · ${app.totalRecords ?? 0} records · Connectors: ${conns.join(", ") || "none"}`
    ),
    sec("Recommendation",
      String(goal.topRec ?? "No specific recommendation — pipeline needs connector data."),
      !!goal.topRec
    ),
  ];

  const narrative = sections
    .filter(s => s.relevant && s.body)
    .map(s => `**${s.heading}**\n${s.body}`)
    .join("\n\n");

  return { sections, narrative };
}

// ── GitHub Live Template ──────────────────────────────────────────────────────

function composeGitHubLive(
  userMessage: string,
  capability: string,
  connectorData: Record<string, unknown>,
  evidence: string[],
): string {
  const d = connectorData as any;

  switch (capability) {
    case "repos.list": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return "No repositories found in your GitHub account.";
      const list = items.map(r =>
        `• **${r.full_name ?? r.name}** — ${r.language ?? "unknown language"}${r.private ? " (private)" : ""} · ⭐ ${r.stargazers_count ?? 0}`
      ).join("\n");
      return `**Your GitHub Repositories** (${d.count ?? items.length})\n\n${list}`;
    }
    case "branches.list": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return "No branches found for this repository.";
      const list = items.map(b =>
        `• **${b.name}**${b.protected ? " 🔒 protected" : ""} · sha: \`${b.sha?.slice(0, 7) ?? "—"}\``
      ).join("\n");
      return `**Branches** (${d.count ?? items.length})\n\n${list}`;
    }
    case "commits.list": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return "No commits found.";
      const list = items.slice(0, 15).map(c =>
        `• \`${c.shortSha ?? c.sha?.slice(0, 7)}\` **${c.message ?? "—"}** — ${c.author ?? "unknown"} · ${c.date ? new Date(c.date).toLocaleDateString() : "—"}`
      ).join("\n");
      return `**Recent Commits** (${d.count ?? items.length})\n\n${list}`;
    }
    case "files.list": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return "No files found in this repository.";
      // Group by top-level directory
      const grouped: Record<string, string[]> = {};
      items.slice(0, 40).forEach((f: any) => {
        const parts = f.path.split("/");
        const top = parts.length > 1 ? parts[0] : "(root)";
        if (!grouped[top]) grouped[top] = [];
        grouped[top].push(f.path);
      });
      const list = Object.entries(grouped).slice(0, 15).map(([dir, files]) =>
        `**${dir}/**: ${files.length} file(s)`
      ).join("\n");
      return `**Repository Files** (${d.totalFiles ?? items.length} total)\n\n${list}${d.truncated ? "\n\n*Results truncated — repository has more files.*" : ""}`;
    }
    case "files.get": {
      if (!d.content) return `File \`${d.path ?? "unknown"}\` found but content could not be decoded.`;
      const preview = (d.content as string).slice(0, 2000);
      return `**File: \`${d.path}\`** (${d.size ?? 0} bytes)\n\n\`\`\`\n${preview}${(d.content as string).length > 2000 ? "\n... (truncated)" : ""}\n\`\`\``;
    }
    case "repos.stats": {
      const top: any[] = d.topContributors ?? [];
      const contribs = top.map(c => `• **${c.login ?? "unknown"}** — ${c.total} commits`).join("\n");
      return `**Repository Stats**\n\nTotal commits: ${d.totalCommits ?? "N/A"} · Contributors: ${d.contributorCount ?? 0}\n\n${contribs || "No contributor data."}`;
    }
    case "repos.languages": {
      const langs: any[] = d.languages ?? [];
      if (langs.length === 0) return "No language data available for this repository.";
      const list = langs.map(l => `• **${l.lang}** — ${l.pct}%`).join("\n");
      return `**Languages** (primary: ${d.primaryLanguage ?? "unknown"})\n\n${list}`;
    }
    case "auth.user": {
      return `**GitHub Account**\n\n• Login: ${d.login}\n• Name: ${d.name ?? "—"}\n• Public repos: ${d.public_repos ?? 0}\n• Followers: ${d.followers ?? 0}`;
    }
    default:
      return `**GitHub — ${capability}**\n\n${JSON.stringify(d, null, 2).slice(0, 500)}`;
  }
}

// ── Evidence Block Builder ────────────────────────────────────────────────────

function buildEvidence(input: ComposerInput, snapshotSections: string[]): EvidenceBlock {
  return {
    sources:          input.evidence.slice(0, 10),
    executionId:      input.executionId,
    confidence:       input.confidence,
    pipelineStatus:   pipelineStatus(input.pipelineReport),
    connectors:       connectors(input.pipelineReport),
    stagesUsed:       successStages(input.pipelineReport),
    snapshotSections,
  };
}

// ── Degradation Detection ─────────────────────────────────────────────────────

function detectDegradation(input: ComposerInput): { degraded: boolean; note: string | null } {
  const conns = connectors(input.pipelineReport);
  const pst   = pipelineStatus(input.pipelineReport);
  const rec   = recoveryNotes(input.pipelineReport);

  if (!conns.includes("Base44") && !conns.includes("GitHub")) {
    return {
      degraded: true,
      note: "Both connectors unavailable — confidence significantly reduced. Results based on pipeline defaults only.",
    };
  }
  if (!conns.includes("GitHub")) {
    return {
      degraded: true,
      note: "Repository analysis is partial — GitHub token not configured. Application data available via Base44.",
    };
  }
  if (!conns.includes("Base44")) {
    return { degraded: true, note: "Application analysis limited — Base44 connector unavailable." };
  }
  if (pst === "DEGRADED" || pst === "PARTIAL") {
    return { degraded: true, note: rec.length > 0 ? rec[0] : `Pipeline status: ${pst}` };
  }
  return { degraded: false, note: null };
}

// ── Evidence Footer ───────────────────────────────────────────────────────────

function evidenceFooter(ev: EvidenceBlock): string {
  const parts: string[] = [];
  if (ev.sources.length > 0) parts.push(`Evidence: ${ev.sources.slice(0, 4).join(" · ")}`);
  if (ev.executionId)        parts.push(`Exec: ${ev.executionId}`);
  parts.push(`Conf: ${Math.round(ev.confidence * 100)}%`);
  if (ev.pipelineStatus)     parts.push(`Pipeline: ${ev.pipelineStatus}`);
  return parts.length > 0 ? `\n\n---\n*${parts.join(" · ")}*` : "";
}

// ── CognitiveAnswerComposer ───────────────────────────────────────────────────

export class CognitiveAnswerComposer {
  private readonly _diagnostics: ComposerDiagnostic[] = [];

  // ── Main compose method ───────────────────────────────────────────────────

  compose(input: ComposerInput): ComposedAnswer {
    const t0       = Date.now();
    const template = selectTemplate(input.intent);
    const snap     = input.snapshot;

    // Pick template-specific sections
    let composed: { sections: AnswerSection[]; narrative: string };
    let snapshotSections: string[] = [];

    switch (template) {
      case "PROJECT_STATUS":
        composed = composeProjectStatus(input);
        snapshotSections = ["applicationState", "repositoryState", "goalState", "learningState"];
        break;
      case "NEXT_SPRINT":
        composed = composeNextSprint(input);
        snapshotSections = ["goalState", "learningState"];
        break;
      case "PROJECT_HISTORY":
        composed = composeProjectHistory(input);
        snapshotSections = ["projectState", "knowledgeState", "learningState"];
        break;
      case "ARCHITECTURE":
        composed = composeArchitecture(input);
        snapshotSections = ["projectState", "identityState"];
        break;
      case "CONNECTOR_STATUS":
      case "PIPELINE_STATUS":
        composed = composeConnectorStatus(input);
        snapshotSections = [];
        break;
      case "TECHNICAL_DEBT":
      case "CURRENT_RISKS":
        composed = composeTechnicalDebt(input);
        snapshotSections = ["projectState", "goalState", "learningState"];
        break;
      case "IMPLEMENTATION_PROGRESS":
        composed = composeImplementationProgress(input);
        snapshotSections = ["applicationState", "repositoryState", "projectState"];
        break;
      default:
        composed = composeGeneralSummary(input);
        snapshotSections = ["applicationState", "goalState"];
    }

    const ev = buildEvidence(input, snapshotSections);
    const { degraded, note: degradationNote } = detectDegradation(input);

    // Full narrative = template body + degradation note + evidence footer
    let fullNarrative = composed.narrative;
    if (degraded && degradationNote) {
      fullNarrative += `\n\n⚠️ ${degradationNote}`;
    }
    fullNarrative += evidenceFooter(ev);

    const answer: ComposedAnswer = {
      id:              makeCACId("cac"),
      template,
      narrative:       fullNarrative,
      sections:        composed.sections,
      evidence:        ev,
      confidence:      input.confidence,
      degraded,
      degradationNote,
      composedAt:      Date.now(),
      compositionMs:   Date.now() - t0,
    };

    const diagnostic: ComposerDiagnostic = {
      id:                   makeCACId("diag"),
      userMessage:          input.userMessage,
      detectedIntent:       input.intent,
      selectedTemplate:     template,
      snapshotSectionsUsed: snapshotSections,
      evidenceCount:        ev.sources.length,
      confidence:           input.confidence,
      compositionMs:        answer.compositionMs,
      answer,
      timestamp:            Date.now(),
    };
    this._diagnostics.push(diagnostic);
    if (this._diagnostics.length > 50) this._diagnostics.splice(0, this._diagnostics.length - 50);

    return answer;
  }

  // ── GitHub Live Connector Compose ─────────────────────────────────────────

  composeFromConnectorResult(
    userMessage:    string,
    capability:     string,
    connectorData:  Record<string, unknown>,
    evidence:       string[],
    executionId:    string | null,
    durationMs:     number,
  ): ComposedAnswer {
    const t0 = Date.now();
    const narrative = composeGitHubLive(userMessage, capability, connectorData, evidence)
      + `\n\n---\n*Source: GitHub Live · Capability: ${capability} · ${evidence.slice(0, 3).join(" · ")} · ${durationMs}ms*`;

    const ev: EvidenceBlock = {
      sources:          evidence,
      executionId,
      confidence:       0.95,
      pipelineStatus:   "CONNECTOR_DIRECT",
      connectors:       ["GitHub"],
      stagesUsed:       [capability],
      snapshotSections: [],
    };

    const answer: ComposedAnswer = {
      id:              makeCACId("cac_gh"),
      template:        "GITHUB_LIVE",
      narrative,
      sections:        [{ heading: capability, body: narrative, relevant: true }],
      evidence:        ev,
      confidence:      0.95,
      degraded:        false,
      degradationNote: null,
      composedAt:      Date.now(),
      compositionMs:   Date.now() - t0,
    };

    const diagnostic: ComposerDiagnostic = {
      id:                   makeCACId("diag_gh"),
      userMessage,
      detectedIntent:       "github_live",
      selectedTemplate:     "GITHUB_LIVE",
      snapshotSectionsUsed: [],
      evidenceCount:        evidence.length,
      confidence:           0.95,
      compositionMs:        answer.compositionMs,
      answer,
      timestamp:            Date.now(),
    };
    this._diagnostics.push(diagnostic);
    if (this._diagnostics.length > 50) this._diagnostics.splice(0, this._diagnostics.length - 50);

    return answer;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  getDiagnostics(): ComposerDiagnostic[] {
    return [...this._diagnostics].reverse();
  }

  getLastDiagnostic(): ComposerDiagnostic | null {
    return this._diagnostics.length > 0
      ? this._diagnostics[this._diagnostics.length - 1]
      : null;
  }

  health(): { status: "OK"; diagnosticsStored: number } {
    return { status: "OK", diagnosticsStored: this._diagnostics.length };
  }
}