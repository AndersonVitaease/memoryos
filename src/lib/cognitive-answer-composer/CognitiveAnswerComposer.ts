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

// ── Knowledge Graph Template (Phase 6.0.3) ───────────────────────────────────

function composeKnowledgeGraph(
  userMessage: string,
  kgResult: {
    queryType: "entity" | "all_entities" | "relationships" | "modules" | "keyword" | "who_uses";
    entities?: Array<{ name: string; type: string; layer: string; filePath: string }>;
    relationships?: Array<{ fromId: string; toId: string; type: string; strength: number }>;
    modules?: Array<{ name: string; entities: string[] }>;
    symbol?: string;
    kgStats: { entityCount: number; relationshipCount: number; moduleCount: number; health: string };
  },
  durationMs: number,
): string {
  const lines: string[] = [];
  const { kgStats } = kgResult;

  switch (kgResult.queryType) {
    case "all_entities": {
      const entities = kgResult.entities ?? [];
      if (entities.length === 0) {
        return `**Knowledge Graph — Entities**\n\nNo entities found. Graph may not be built yet.\n\n*KG Stats: ${kgStats.entityCount} entities · ${kgStats.health}*`;
      }
      const byLayer: Record<string, typeof entities> = {};
      for (const e of entities) {
        if (!byLayer[e.layer]) byLayer[e.layer] = [];
        byLayer[e.layer].push(e);
      }
      lines.push(`**Knowledge Graph — All Entities** (${entities.length} total)`);
      lines.push(`*Graph: ${kgStats.entityCount} entities · ${kgStats.relationshipCount} relationships · ${kgStats.moduleCount} modules · ${kgStats.health}*`);
      lines.push("");
      for (const [layer, ents] of Object.entries(byLayer)) {
        lines.push(`**Layer: ${layer}** (${ents.length})`);
        for (const e of ents.slice(0, 20)) {
          lines.push(`• \`${e.name}\` (${e.type}) — \`${e.filePath}\``);
        }
        if (ents.length > 20) lines.push(`  *...and ${ents.length - 20} more*`);
      }
      break;
    }
    case "relationships": {
      const rels = kgResult.relationships ?? [];
      const entities = kgResult.entities ?? [];
      const byId = new Map(entities.map(e => [e.name, e]));
      lines.push(`**Knowledge Graph — Relationships** (${rels.length} total)`);
      lines.push(`*Source: KnowledgeGraphStore · ${kgStats.entityCount} entities · ${durationMs}ms*`);
      lines.push("");
      if (rels.length === 0) {
        lines.push("No relationships found in the current graph.");
      } else {
        for (const r of rels.slice(0, 30)) {
          lines.push(`• \`${r.fromId}\` —[${r.type}]→ \`${r.toId}\` (strength: ${Math.round(r.strength * 100)}%)`);
        }
        if (rels.length > 30) lines.push(`*...and ${rels.length - 30} more*`);
      }
      break;
    }
    case "modules": {
      const modules = kgResult.modules ?? [];
      lines.push(`**Knowledge Graph — Module Map** (${modules.length} modules)`);
      lines.push(`*Source: KnowledgeGraphStore · cached · ${durationMs}ms*`);
      lines.push("");
      if (modules.length === 0) {
        lines.push("No modules found in the current graph.");
      } else {
        for (const m of modules) {
          lines.push(`**Module: \`${m.name}\`** (${m.entities.length} entities)`);
          for (const e of m.entities.slice(0, 8)) {
            lines.push(`  • \`${e}\``);
          }
          if (m.entities.length > 8) lines.push(`  *...and ${m.entities.length - 8} more*`);
        }
      }
      break;
    }
    case "who_uses":
    case "keyword": {
      const entities = kgResult.entities ?? [];
      const sym = kgResult.symbol ?? "unknown";
      lines.push(`**Knowledge Graph — "${sym}"** (${entities.length} matches)`);
      lines.push(`*Source: KnowledgeGraphStore · ${durationMs}ms*`);
      lines.push("");
      if (entities.length === 0) {
        lines.push(`No entities found matching \`${sym}\` in the knowledge graph.`);
        lines.push(`\nTry: "show all entities", "show all relationships", or "show module graph"`);
      } else {
        for (const e of entities) {
          lines.push(`• \`${e.name}\` (${e.type}) — Layer: \`${e.layer}\` · File: \`${e.filePath}\``);
        }
      }
      break;
    }
    default:
      lines.push(`**Knowledge Graph Query**\n${JSON.stringify(kgResult, null, 2).slice(0, 400)}`);
  }

  lines.push(`\n---\n*Source: KnowledgeGraphStore (cached) · ${kgStats.entityCount} entities · ${kgStats.relationshipCount} rels · ${kgStats.moduleCount} modules · ${durationMs}ms*`);
  return lines.join("\n");
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

    // ── Phase 5.8.0 — Search ───────────────────────────────────────────────
    case "search.file":
    case "search.folder":
    case "search.symbol":
    case "search.class":
    case "search.function":
    case "search.interface":
    case "search.text":
    case "search.import":
    case "search.export":
    case "search.reference": {
      if (d.totalCount === 0) return `No results found for \`${d.query}\` in this repository.`;
      const label = capability.replace("search.", "").replace(/^./, (c: string) => c.toUpperCase());
      const list = (d.items ?? []).slice(0, 10).map((i: any) => {
        const matches = (i.textMatches ?? []).flatMap((m: any) => m.matches ?? []).slice(0, 2).join(", ");
        return `• \`${i.path}\`${matches ? ` — *"${matches}"*` : ""}`;
      }).join("\n");
      return `**${label} Search: \`${d.query}\`** (${d.totalCount} result${d.totalCount !== 1 ? "s" : ""})\n\n${list}`;
    }

    // ── Phase 5.8.0 — Repository Map ──────────────────────────────────────
    case "repository.tree": {
      const dirs: any[] = d.directories ?? [];
      const list = dirs.slice(0, 20).map((dir: any) => `• \`${dir.path}/\` — ${dir.fileCount} file(s)`).join("\n");
      return `**Repository Tree: ${d.owner}/${d.repo}** (${d.totalFiles} files total)\n\n${list}${d.truncated ? "\n\n*Truncated — repository has more files.*" : ""}`;
    }
    case "repository.modules": {
      const mods: any[] = d.modules ?? [];
      const list = mods.slice(0, 20).map((m: any) => `• \`${m.name}\` — ${m.fileCount} file(s)`).join("\n");
      return `**Project Modules** (${mods.length} modules)\n\n${list}`;
    }
    case "repository.dependencies": {
      if (!d.found) return `No \`package.json\` found in this repository.`;
      const deps = (d.dependencies ?? []).slice(0, 20).join(", ");
      const devDeps = (d.devDependencies ?? []).slice(0, 10).join(", ");
      return `**Project Dependencies** (${d.totalDeps} total)\n\n**${d.name}** v${d.version}\n\n**Runtime (${(d.dependencies ?? []).length}):** ${deps || "none"}\n\n**Dev (${(d.devDependencies ?? []).length}):** ${devDeps || "none"}`;
    }
    case "repository.statistics": {
      const langs = (d.languages ?? []).slice(0, 5).map((l: any) => `${l.lang} ${l.pct}%`).join(" · ");
      return `**Repository Statistics: ${d.name}**\n\n• Description: ${d.description ?? "—"}\n• Stars: ${d.stars} · Forks: ${d.forks} · Open Issues: ${d.openIssues}\n• Size: ${d.size_kb} KB · Branch: ${d.defaultBranch}\n• Languages: ${langs || "unknown"}\n• Created: ${d.createdAt?.slice(0, 10)} · Last push: ${d.pushedAt?.slice(0, 10)}`;
    }
    case "repository.entrypoints": {
      const ep: string[] = d.entrypoints ?? [];
      if (ep.length === 0) return "No standard entrypoints detected in this repository.";
      return `**Entry Points** (${ep.length} found)\n\n${ep.map((p: string) => `• \`${p}\``).join("\n")}`;
    }

    // ── Phase 5.8.0 — File Intelligence ───────────────────────────────────
    case "file.summary":
    case "file.explanation":
    case "file.responsibilities":
    case "file.dependencies":
    case "file.exports":
    case "file.imports":
    case "file.relationships": {
      const lines: string[] = [];
      lines.push(`**File: \`${d.path}\`** (${d.lineCount} lines · ${d.size} bytes)`);
      if (d.classes?.length)     lines.push(`\n**Classes:** ${d.classes.join(", ")}`);
      if (d.interfaces?.length)  lines.push(`**Interfaces:** ${d.interfaces.join(", ")}`);
      if (d.functions?.length)   lines.push(`**Functions:** ${d.functions.slice(0, 8).join(", ")}`);
      if (d.types?.length)       lines.push(`**Types:** ${d.types.slice(0, 6).join(", ")}`);
      if (d.imports?.length) {
        lines.push(`\n**Imports (${d.imports.length}):**`);
        d.imports.slice(0, 8).forEach((imp: string) => lines.push(`• \`${imp.slice(0, 80)}\``));
      }
      if (d.exports?.length) {
        lines.push(`\n**Exports (${d.exports.length}):**`);
        d.exports.slice(0, 6).forEach((exp: string) => lines.push(`• \`${exp.slice(0, 80)}\``));
      }
      return lines.join("\n");
    }

    // ── Phase 5.8.0 — Commit Intelligence ─────────────────────────────────
    case "commit.details": {
      const files = (d.changedFiles ?? []).slice(0, 10).map((f: any) =>
        `• \`${f.filename}\` ${f.status} +${f.additions} -${f.deletions}`
      ).join("\n");
      return `**Commit \`${d.shortSha}\`**\n\n${d.message}\n\n**Author:** ${d.author} (@${d.authorLogin ?? "—"}) · **Date:** ${d.date?.slice(0, 10) ?? "—"}\n\n**Changes:** +${d.stats?.additions ?? 0} -${d.stats?.deletions ?? 0} across ${d.totalFiles} file(s)\n\n${files}`;
    }
    case "commit.timeline": {
      const tl: any[] = d.timeline ?? [];
      const list = tl.slice(0, 14).map((t: any) =>
        `• **${t.date}** — ${t.commitCount} commit(s): ${t.messages.slice(0, 2).join("; ")}`
      ).join("\n");
      return `**Commit Timeline** (${d.totalCommits} recent commits)\n\n${list}`;
    }
    case "diff.commit":
    case "commit.diff": {
      const files = (d.files ?? []).slice(0, 10).map((f: any) =>
        `• \`${f.filename}\` ${f.status} +${f.additions} -${f.deletions}`
      ).join("\n");
      return `**Diff: Commit \`${d.sha}\`**\n\n${d.message}\n\n${d.summary}\n\n${files}`;
    }
    case "diff.branch": {
      const files = (d.files ?? []).slice(0, 10).map((f: any) =>
        `• \`${f.filename}\` ${f.status} +${f.additions} -${f.deletions}`
      ).join("\n");
      return `**Branch Diff: \`${d.base}\` vs \`${d.head}\`**\n\n${d.summary}\n\nTotal commits: ${d.totalCommits}\n\n**Changed Files:**\n${files}`;
    }

    // ── Phase 5.8.0 — File History ─────────────────────────────────────────
    case "history.file": {
      const hist: any[] = d.history ?? [];
      const list = hist.slice(0, 12).map((c: any) =>
        `• \`${c.sha}\` **${c.message}** — ${c.author} · ${c.date?.slice(0, 10) ?? "—"}`
      ).join("\n");
      return `**History: \`${d.path}\`** (${d.commitCount} commits)\n\n• First seen: ${d.firstSeen?.slice(0, 10) ?? "unknown"}\n• Last modified: ${d.lastModified?.slice(0, 10) ?? "unknown"}\n\n${list}`;
    }

    // ── Phase 5.8.0 — Pull Requests ────────────────────────────────────────
    case "pullRequests.list": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return `No ${d.state} pull requests found.`;
      const list = items.slice(0, 10).map((p: any) =>
        `• **#${p.number}** ${p.title} — @${p.author} · \`${p.head}\` -> \`${p.base}\`${p.draft ? " (draft)" : ""}`
      ).join("\n");
      return `**Pull Requests** (${d.count} ${d.state})\n\n${list}`;
    }

    // ── Phase 5.8.0 — Issues ───────────────────────────────────────────────
    case "issues.list": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return `No ${d.state} issues found.`;
      const list = items.slice(0, 10).map((i: any) =>
        `• **#${i.number}** ${i.title} — @${i.author}${i.labels?.length ? " [" + i.labels.join(", ") + "]" : ""}`
      ).join("\n");
      return `**Issues** (${d.count} ${d.state})\n\n${list}`;
    }
    case "issue.search": {
      const items: any[] = d.items ?? [];
      if (items.length === 0) return `No issues found for query: "${d.query}".`;
      const list = items.slice(0, 10).map((i: any) =>
        `• **#${i.number}** ${i.title} [${i.state}]`
      ).join("\n");
      return `**Issue Search: "${d.query}"** (${d.totalCount} results)\n\n${list}`;
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

  // ── Knowledge Graph Compose (Phase 6.0.3) ────────────────────────────────

  composeFromKnowledgeGraph(
    userMessage: string,
    kgResult: Parameters<typeof composeKnowledgeGraph>[1],
    durationMs: number,
  ): ComposedAnswer {
    const t0 = Date.now();
    const narrative = composeKnowledgeGraph(userMessage, kgResult, durationMs);
    const ev: EvidenceBlock = {
      sources:          [`KnowledgeGraphStore: ${kgResult.kgStats.entityCount} entities`, `Health: ${kgResult.kgStats.health}`],
      executionId:      null,
      confidence:       0.95,
      pipelineStatus:   "KNOWLEDGE_GRAPH",
      connectors:       ["KnowledgeGraphStore"],
      stagesUsed:       ["KnowledgeGraphStore.read"],
      snapshotSections: [],
    };
    const answer: ComposedAnswer = {
      id:              makeCACId("cac_kg"),
      template:        "KNOWLEDGE_GRAPH",
      narrative,
      sections:        [{ heading: "Knowledge Graph", body: narrative, relevant: true }],
      evidence:        ev,
      confidence:      0.95,
      degraded:        false,
      degradationNote: null,
      composedAt:      Date.now(),
      compositionMs:   Date.now() - t0,
    };
    this._diagnostics.push({
      id: makeCACId("diag_kg"), userMessage, detectedIntent: "knowledge_graph",
      selectedTemplate: "KNOWLEDGE_GRAPH", snapshotSectionsUsed: [],
      evidenceCount: 2, confidence: 0.95, compositionMs: answer.compositionMs,
      answer, timestamp: Date.now(),
    });
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