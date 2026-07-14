/**
 * CognitiveTaskPlanner.ts — EF-59.2 / 59.3 / 59.4 / 59.5 / 59.6 / 59.7
 * Phase 5.9.0 · MemoryOS · 2026-07-14
 *
 * Receives DetectedIntents, builds an ExecutionGraph, and executes tasks
 * with parallel scheduling, capability chaining, and failure recovery.
 */

import type {
  DetectedIntent, ExecutionGraph, TaskNode, TaskResult,
  FusedEvidence, EvidenceItem, PlanExecutionResult,
  RecoveryEvent, PlannerDiagnostic, ConnectorTarget,
} from "./CTPTypes";
import { makeCTPId } from "./CTPTypes";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import { RepositoryResolver } from "../github-deep-analysis/RepositoryResolver";
import { SearchRanker } from "../github-deep-analysis/SearchRanker";
import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

// ── Capability Chain Definitions (EF-59.4) ────────────────────────────────────

/**
 * A chain defines the sequence of capabilities to execute for a given category.
 * Each step may depend on a key extracted from a previous step.
 */
interface CapabilityStep {
  capability: string;
  connector:  ConnectorTarget;
  payloadBuilder: (ctx: ChainContext) => Record<string, unknown>;
  outputKey?: string; // key to extract from result and store in ctx
}

interface ChainContext {
  owner:    string | null;
  repo:     string | null;
  symbol:   string | null;
  file:     string | null;
  sha:      string | null;
  branch:   string | null;
  entities: Record<string, string>;
  results:  Record<string, unknown>; // capabilityKey -> data
}

const CAPABILITY_CHAINS: Record<string, CapabilityStep[]> = {
  implementation_search: [
    {
      capability: "search.symbol",
      connector:  "github",
      payloadBuilder: ctx => ({ query: ctx.symbol ?? ctx.entities.symbol ?? "class", owner: ctx.owner, repo: ctx.repo }),
      outputKey: "search_results",
    },
    {
      capability: "files.get",
      connector:  "github",
      payloadBuilder: ctx => {
        const items = (ctx.results.search_results as any)?.items ?? [];
        const best  = items[0];
        return best ? { owner: ctx.owner, repo: ctx.repo, path: best.path } : {};
      },
      outputKey: "file_content",
    },
  ],
  dependency_analysis: [
    {
      capability: "search.import",
      connector:  "github",
      payloadBuilder: ctx => ({ query: ctx.symbol ?? ctx.entities.symbol ?? "", owner: ctx.owner, repo: ctx.repo }),
      outputKey: "import_results",
    },
    {
      capability: "search.reference",
      connector:  "github",
      payloadBuilder: ctx => ({ query: ctx.symbol ?? ctx.entities.symbol ?? "", owner: ctx.owner, repo: ctx.repo }),
      outputKey: "reference_results",
    },
  ],
  commit_analysis: [
    {
      capability: "commits.list",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, per_page: 15 }),
      outputKey: "commits",
    },
    {
      capability: "commit.timeline",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, per_page: 30 }),
      outputKey: "timeline",
    },
  ],
  file_analysis: [
    {
      capability: "files.get",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, path: ctx.file ?? ctx.entities.file ?? "" }),
      outputKey: "file_content",
    },
    {
      capability: "file.summary",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, path: ctx.file ?? ctx.entities.file ?? "" }),
      outputKey: "file_summary",
    },
  ],
  repository_map: [
    {
      capability: "repository.tree",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo }),
      outputKey: "tree",
    },
    {
      capability: "repository.modules",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo }),
      outputKey: "modules",
    },
  ],
  project_status: [
    {
      capability: "repos.stats",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo }),
      outputKey: "repo_stats",
    },
    {
      capability: "commits.list",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, per_page: 5 }),
      outputKey: "recent_commits",
    },
  ],
  application_analysis: [
    {
      capability: "entities.list",
      connector:  "base44",
      payloadBuilder: () => ({}),
      outputKey: "entities",
    },
  ],
  pull_requests: [
    {
      capability: "pullRequests.list",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, state: "open" }),
      outputKey: "pull_requests",
    },
  ],
  issue_tracking: [
    {
      capability: "issues.list",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo, state: "open" }),
      outputKey: "issues",
    },
  ],
  architecture_question: [
    {
      capability: "repository.modules",
      connector:  "github",
      payloadBuilder: ctx => ({ owner: ctx.owner, repo: ctx.repo }),
      outputKey: "modules",
    },
  ],
};

// ── Evidence Fuser (EF-59.8) ──────────────────────────────────────────────────

function fuseEvidence(tasks: TaskNode[]): FusedEvidence {
  const items: EvidenceItem[] = [];
  const sourcesSeen = new Set<string>();
  const conflicts: string[] = [];

  for (const task of tasks) {
    if (!task.result || task.result.status !== "completed") continue;
    for (const ev of task.result.evidence) {
      const key = `${task.connector}:${ev}`;
      if (sourcesSeen.has(key)) {
        conflicts.push(`Duplicate: ${key}`);
        continue;
      }
      sourcesSeen.add(key);
      items.push({
        source:     task.connector,
        capability: task.capability,
        value:      ev,
        confidence: task.result.confidence,
        taskId:     task.taskId,
      });
    }
  }

  const completedTasks = tasks.filter(t => t.result?.status === "completed");
  const overallConfidence = completedTasks.length > 0
    ? completedTasks.reduce((sum, t) => sum + (t.result?.confidence ?? 0), 0) / completedTasks.length
    : 0;

  const sourcesSummary = [...new Set(tasks.filter(t => t.result?.status === "completed").map(t => t.connector))];

  return { items, overallConfidence, sourcesSummary, conflicts };
}

// ── Narrative Builder (EF-59.9) ───────────────────────────────────────────────

function buildNarrative(
  intents: DetectedIntent[],
  tasks: TaskNode[],
  taskData: Record<string, unknown>,
  evidence: FusedEvidence,
): string {
  const sections: string[] = [];

  for (const intent of intents) {
    const intentTasks = tasks.filter(t => t.intentId === intent.intentId && t.result?.status === "completed");
    if (intentTasks.length === 0) continue;

    sections.push(`## ${intent.description}`);

    for (const task of intentTasks) {
      const d = taskData[task.taskId] as any;
      if (!d) continue;

      switch (task.capability) {
        case "search.symbol":
        case "search.class":
        case "search.function":
        case "search.import":
        case "search.reference":
        case "search.text": {
          const items = d.items ?? [];
          if (items.length === 0) { sections.push("No results found."); break; }
          const list = items.slice(0, 8).map((i: any) => `• \`${i.path}\``).join("\n");
          sections.push(`**Search results** (${d.totalCount ?? items.length} total)\n${list}`);
          break;
        }
        case "files.get": {
          if (d.content) {
            const preview = (d.content as string).slice(0, 800);
            sections.push(`**File: \`${d.path}\`**\n\`\`\`\n${preview}${(d.content as string).length > 800 ? "\n..." : ""}\n\`\`\``);
          }
          break;
        }
        case "file.summary": {
          const parts: string[] = [];
          if (d.classes?.length)    parts.push(`Classes: ${d.classes.join(", ")}`);
          if (d.functions?.length)  parts.push(`Functions: ${d.functions.slice(0, 6).join(", ")}`);
          if (d.exports?.length)    parts.push(`Exports: ${d.exports.slice(0, 4).join(", ")}`);
          if (parts.length) sections.push(`**File Summary:** ${parts.join(" · ")}`);
          break;
        }
        case "commits.list": {
          const items = d.items ?? [];
          const list = items.slice(0, 10).map((c: any) =>
            `• \`${c.sha?.slice(0, 7)}\` ${c.message} — ${c.author}`
          ).join("\n");
          sections.push(`**Recent Commits** (${items.length})\n${list}`);
          break;
        }
        case "commit.timeline": {
          const tl = d.timeline ?? [];
          const list = tl.slice(0, 7).map((t: any) =>
            `• **${t.date}** — ${t.commitCount} commit(s): ${t.messages?.slice(0, 1).join("; ")}`
          ).join("\n");
          if (list) sections.push(`**Commit Timeline**\n${list}`);
          break;
        }
        case "repository.tree": {
          const dirs = (d.directories ?? []).slice(0, 10).map((dir: any) => `• \`${dir.path}/\` (${dir.fileCount} files)`).join("\n");
          sections.push(`**Repository Structure** (${d.totalFiles} files)\n${dirs}`);
          break;
        }
        case "repository.modules": {
          const mods = (d.modules ?? []).slice(0, 10).map((m: any) => `• \`${m.name}\``).join("\n");
          sections.push(`**Modules** (${d.modules?.length ?? 0})\n${mods}`);
          break;
        }
        case "repos.stats": {
          sections.push(`**Repository:** ${d.totalCommits ?? "?"} commits · ${d.contributorCount ?? "?"} contributor(s)`);
          break;
        }
        case "pullRequests.list": {
          const items = d.items ?? [];
          const list = items.slice(0, 8).map((p: any) => `• **#${p.number}** ${p.title} (@${p.author})`).join("\n");
          sections.push(`**Pull Requests** (${d.count} open)\n${list || "None."}`);
          break;
        }
        case "issues.list": {
          const items = d.items ?? [];
          const list = items.slice(0, 8).map((i: any) => `• **#${i.number}** ${i.title}`).join("\n");
          sections.push(`**Issues** (${d.count})\n${list || "None."}`);
          break;
        }
        default:
          if (d && typeof d === "object") {
            const keys = Object.keys(d).slice(0, 3).join(", ");
            sections.push(`**${task.capability}**: data fields: ${keys}`);
          }
      }
    }
  }

  const connectors = [...new Set(tasks.filter(t => t.result?.status === "completed").map(t => t.connector))];
  const evFooter = `\n\n---\n*Sources: ${connectors.join(", ")} · ${tasks.filter(t => t.result?.status === "completed").length} tasks executed · Conf: ${Math.round(evidence.overallConfidence * 100)}%*`;

  return sections.join("\n\n") + evFooter;
}

// ── CognitiveTaskPlanner ──────────────────────────────────────────────────────

export class CognitiveTaskPlanner {
  private readonly _cis      = new ConnectorInvocationService();
  private readonly _resolver = new RepositoryResolver();
  private readonly _ranker   = new SearchRanker();
  private readonly _diagnostics: PlannerDiagnostic[] = [];
  private _repoCache: { owner: string; repo: string; fetchedAt: number } | null = null;

  // ── EF-60.1.5: Query Knowledge Graph before GitHub ────────────────────────

  queryKnowledgeGraph(symbol: string): { found: boolean; answer: string; source: string } {
    if (!KnowledgeGraphStore.isReady()) {
      return { found: false, answer: "", source: "not_ready" };
    }
    const direct  = KnowledgeGraphStore.query(symbol);
    const keyword = KnowledgeGraphStore.queryByKeyword(symbol);

    if (direct.found && direct.entity) {
      const e = direct.entity;
      const answer = [
        `**${e.name}** (${e.type}) — Layer: \`${e.layer}\``,
        `File: \`${e.filePath}\``,
        e.responsibilities.length > 0 ? `Responsibilities: ${e.responsibilities.join("; ")}` : "",
        direct.dependencies.length > 0 ? `Depends on: ${direct.dependencies.slice(0, 5).map(d => d.name).join(", ")}` : "",
        direct.dependents.length > 0  ? `Used by: ${direct.dependents.slice(0, 5).map(d => d.name).join(", ")}` : "",
      ].filter(Boolean).join("\n");
      return { found: true, answer, source: "knowledge_graph" };
    }

    if (keyword.length > 0) {
      const names = keyword.slice(0, 5).map(e => `\`${e.name}\` (${e.layer})`).join(", ");
      return {
        found: true,
        answer: `Found ${keyword.length} entities matching "${symbol}": ${names}`,
        source: "knowledge_graph",
      };
    }

    return { found: false, answer: "", source: "knowledge_graph_miss" };
  }

  // ── Build Execution Graph (EF-59.3) ──────────────────────────────────────

  buildGraph(intents: DetectedIntent[], userMessage: string): ExecutionGraph {
    const tasks: TaskNode[] = [];

    for (const intent of intents) {
      const chain = CAPABILITY_CHAINS[intent.category];
      if (!chain) continue;

      for (let i = 0; i < chain.length; i++) {
        const step = chain[i];
        const prevTaskInChain = tasks.filter(t => t.intentId === intent.intentId);
        const dependsOn = i > 0 && prevTaskInChain.length > 0
          ? [prevTaskInChain[prevTaskInChain.length - 1].taskId]
          : [];

        // Add cross-intent dependencies
        for (const depIntentId of intent.dependencies) {
          const depTasks = tasks.filter(t => t.intentId === depIntentId);
          if (depTasks.length > 0) {
            const lastDep = depTasks[depTasks.length - 1].taskId;
            if (!dependsOn.includes(lastDep)) dependsOn.push(lastDep);
          }
        }

        tasks.push({
          taskId:      makeCTPId("task"),
          intentId:    intent.intentId,
          name:        `${intent.category}:${step.capability}`,
          description: `${intent.description} — ${step.capability}`,
          connector:   step.connector,
          capability:  step.capability,
          payload:     {}, // filled at execution time
          status:      "pending",
          dependsOn,
          canParallel: dependsOn.length === 0,
          priority:    intent.priority,
          result:      null,
          startedAt:   null,
          completedAt: null,
          durationMs:  null,
        });
      }
    }

    // Critical path: tasks with longest dependency chains
    const criticalPath = computeCriticalPath(tasks);

    // Parallel groups: tasks with no inter-group dependencies
    const parallelGroups = computeParallelGroups(tasks);

    const estimatedMs = tasks.length * 800;

    return {
      graphId:       makeCTPId("graph"),
      userMessage,
      intents,
      tasks,
      criticalPath,
      parallelGroups,
      estimatedMs,
      createdAt:     Date.now(),
    };
  }

  // ── Execute Graph (EF-59.7 + EF-59.10) ───────────────────────────────────

  async execute(
    graph: ExecutionGraph,
    projectId: string | null = null,
  ): Promise<PlanExecutionResult> {
    const t0 = Date.now();
    const planId = makeCTPId("plan");
    const recoveryEvents: RecoveryEvent[] = [];
    const taskData: Record<string, unknown> = {};

    // EF-60.1.5: Check Knowledge Graph first for architecture/implementation queries
    const kgDependentIntents = ["implementation_search", "dependency_analysis", "architecture_question", "repository_map"];
    for (const intent of graph.intents) {
      if (!kgDependentIntents.includes(intent.category)) continue;
      const symbol = intent.extractedEntities?.symbol ?? intent.extractedEntities?.class ?? "";
      if (!symbol) continue;
      const kgResult = this.queryKnowledgeGraph(symbol);
      if (kgResult.found) {
        // Short-circuit: answer from KG, mark all tasks for this intent as completed via graph
        for (const task of graph.tasks.filter(t => t.intentId === intent.intentId)) {
          task.status = "completed";
          task.result = {
            taskId:     task.taskId,
            status:     "completed",
            data:       { answer: kgResult.answer, source: "knowledge_graph" },
            evidence:   [`KnowledgeGraph: ${symbol}`, `Layer: knowledge_graph`, `Conf: 90%`],
            confidence: 0.9,
            error:      null,
          };
        }
      }
    }

    // Resolve repository context
    const ctx = await this._buildContext(graph.intents, projectId);

    // Process tasks in topological order with parallel execution
    const completed = new Set<string>();
    const failed    = new Set<string>();
    let remaining   = [...graph.tasks];

    while (remaining.length > 0) {
      // Find tasks that are ready (all deps satisfied)
      const ready = remaining.filter(t =>
        t.dependsOn.every(dep => completed.has(dep) || failed.has(dep))
      );
      if (ready.length === 0) break; // deadlock guard

      // Update chain contexts with results so far
      for (const task of ready) {
        const chain = CAPABILITY_CHAINS[task.intentId.split("-")[0]] ?? [];
        const chainStep = Object.values(CAPABILITY_CHAINS)
          .flatMap(c => c)
          .find(s => s.capability === task.capability);
        if (chainStep) {
          task.payload = chainStep.payloadBuilder({ ...ctx, results: taskData as Record<string, unknown> });
        }
      }

      // Execute all ready tasks in parallel (EF-59.7)
      const results = await Promise.allSettled(
        ready.map(task => this._executeTask(task, ctx, taskData))
      );

      for (let i = 0; i < ready.length; i++) {
        const task   = ready[i];
        const result = results[i];

        if (result.status === "fulfilled") {
          const tr = result.value;
          task.result      = tr;
          task.status      = tr.status === "completed" ? "completed" : "failed";
          task.completedAt = Date.now();
          task.durationMs  = task.startedAt ? Date.now() - task.startedAt : 0;

          if (tr.status === "completed") {
            completed.add(task.taskId);
            if (tr.data) taskData[task.taskId] = tr.data;
            // Also store in ctx.results by capability for chaining
            (ctx.results as any)[`${task.capability}`] = tr.data;
          } else {
            failed.add(task.taskId);
            recoveryEvents.push({
              taskId:      task.taskId,
              failureType: tr.error ?? "unknown",
              strategy:    "skip_and_continue",
              outcome:     "Skipped task, continuing execution",
              timestamp:   Date.now(),
            });
          }
        } else {
          task.status = "failed";
          failed.add(task.taskId);
          recoveryEvents.push({
            taskId:      task.taskId,
            failureType: String(result.reason),
            strategy:    "exception_recovery",
            outcome:     "Task threw exception, skipped",
            timestamp:   Date.now(),
          });
        }
      }

      remaining = remaining.filter(t => !completed.has(t.taskId) && !failed.has(t.taskId));
    }

    const completedTasks = graph.tasks.filter(t => t.status === "completed");
    const failedTasks    = graph.tasks.filter(t => t.status === "failed");
    const skippedTasks   = graph.tasks.filter(t => t.status === "pending");

    const fusedEvidence  = fuseEvidence(graph.tasks);
    const narrative      = buildNarrative(graph.intents, graph.tasks, taskData, fusedEvidence);

    const overallStatus = failedTasks.length === 0 ? "SUCCESS"
      : completedTasks.length > 0 ? "PARTIAL"
      : "FAILED";

    const result: PlanExecutionResult = {
      planId,
      graph,
      completedTasks,
      failedTasks,
      skippedTasks,
      fusedEvidence,
      overallStatus,
      confidence:     fusedEvidence.overallConfidence,
      durationMs:     Date.now() - t0,
      recoveryEvents,
      narrative,
      taskData,
    };

    const diagnostic: PlannerDiagnostic = {
      planId,
      userMessage: graph.userMessage,
      graph,
      result,
      timestamp: Date.now(),
    };
    this._diagnostics.push(diagnostic);
    if (this._diagnostics.length > 50) this._diagnostics.splice(0, this._diagnostics.length - 50);

    return result;
  }

  // ── Execute Individual Task ───────────────────────────────────────────────

  private async _executeTask(
    task: TaskNode,
    ctx: ChainContext,
    taskData: Record<string, unknown>,
  ): Promise<TaskResult> {
    task.startedAt = Date.now();
    task.status    = "running";

    // Rebuild payload with updated context
    const chainStep = Object.values(CAPABILITY_CHAINS)
      .flatMap(c => c)
      .find(s => s.capability === task.capability);

    const payload = chainStep
      ? chainStep.payloadBuilder({ ...ctx, results: taskData })
      : task.payload;

    // Skip empty payload (e.g. file path not resolved)
    if (payload.path === "" || payload.query === "") {
      return {
        taskId:     task.taskId,
        status:     "failed",
        data:       null,
        evidence:   [],
        confidence: 0,
        error:      "Payload incomplete — required field missing",
      };
    }

    const inv = await this._cis.invoke(
      task.connector === "github" ? "github" : "base44",
      task.capability,
      payload,
      { originComponent: "CognitiveTaskPlanner", reason: task.description, goalId: task.intentId },
    );

    if (inv.record.status === "SUCCESS" && inv.result?.data) {
      let data = inv.result.data as any;

      // Apply search ranking for search capabilities
      if (task.capability.startsWith("search.") && data.items) {
        data = { ...data, items: this._ranker.rank(data.items, ctx.symbol ?? "") };
      }

      const evidence = [
        `${task.connector}:${task.capability}`,
        `ExecId: ${inv.record.id?.slice(-8)}`,
        `${inv.record.durationMs}ms`,
      ];

      return {
        taskId:     task.taskId,
        status:     "completed",
        data,
        evidence,
        confidence: 0.9,
        error:      null,
      };
    }

    return {
      taskId:     task.taskId,
      status:     "failed",
      data:       null,
      evidence:   [],
      confidence: 0,
      error:      inv.record.error ?? inv.record.status,
    };
  }

  // ── Build Chain Context from Intents ─────────────────────────────────────

  private async _buildContext(
    intents: DetectedIntent[],
    projectId: string | null,
  ): Promise<ChainContext> {
    // Merge entities from all intents
    const entities = intents.reduce((acc, i) => ({ ...acc, ...i.extractedEntities }), {} as Record<string, string>);
    let owner: string | null = null;
    let repo:  string | null = null;

    const needsGitHub = intents.some(i => i.requiredConnectors.includes("github"));
    if (needsGitHub) {
      // Use repo cache if fresh
      if (this._repoCache && Date.now() - this._repoCache.fetchedAt < 5 * 60 * 1000) {
        owner = this._repoCache.owner;
        repo  = this._repoCache.repo;
      } else {
        const reposInv = await this._cis.invoke("github", "repos.list", { per_page: 10 },
          { originComponent: "CognitiveTaskPlanner", reason: "Repository context resolution" });
        if (reposInv.record.status === "SUCCESS") {
          const items = (reposInv.result?.data as any)?.items ?? [];
          if (items.length > 0) {
            // Build a fake message from entity names for resolution
            const hint = Object.values(entities).join(" ");
            const resolved = this._resolver.resolve(items, hint || "main project", projectId);
            if (resolved) {
              owner = resolved.owner;
              repo  = resolved.repo;
              this._repoCache = { owner, repo, fetchedAt: Date.now() };
            }
          }
        }
      }
    }

    return {
      owner,
      repo,
      symbol: entities.symbol ?? null,
      file:   entities.file   ?? null,
      sha:    entities.sha    ?? null,
      branch: entities.branch ?? null,
      entities,
      results: {},
    };
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  getDiagnostics(): PlannerDiagnostic[] {
    return [...this._diagnostics].reverse();
  }

  getLastDiagnostic(): PlannerDiagnostic | null {
    return this._diagnostics.length > 0
      ? this._diagnostics[this._diagnostics.length - 1]
      : null;
  }
}

// ── Graph Utilities ───────────────────────────────────────────────────────────

function computeCriticalPath(tasks: TaskNode[]): string[] {
  // Longest dependency chain by task count
  const taskMap = new Map(tasks.map(t => [t.taskId, t]));

  function depth(taskId: string): number {
    const t = taskMap.get(taskId);
    if (!t || t.dependsOn.length === 0) return 1;
    return 1 + Math.max(...t.dependsOn.map(depth));
  }

  return tasks
    .sort((a, b) => depth(b.taskId) - depth(a.taskId))
    .slice(0, Math.min(tasks.length, 5))
    .map(t => t.taskId);
}

function computeParallelGroups(tasks: TaskNode[]): string[][] {
  const groups: string[][] = [];
  const assigned = new Set<string>();

  for (const task of tasks) {
    if (assigned.has(task.taskId)) continue;
    if (task.dependsOn.length === 0) {
      // Find all parallel peers (same no-deps level)
      const group = tasks.filter(t =>
        !assigned.has(t.taskId) &&
        t.dependsOn.length === 0
      ).map(t => t.taskId);
      groups.push(group);
      group.forEach(id => assigned.add(id));
    }
  }

  // Remaining tasks form sequential groups
  const remaining = tasks.filter(t => !assigned.has(t.taskId)).map(t => t.taskId);
  if (remaining.length > 0) groups.push(remaining);

  return groups;
}