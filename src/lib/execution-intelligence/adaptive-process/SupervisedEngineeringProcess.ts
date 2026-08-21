/**
 * SupervisedEngineeringProcess.ts — Adaptive Mission Decomposition V1
 *
 * READ MODE (V1): Evidence-based engineering investigation loop.
 *   MISSION → DISCOVERY (code.search) → EVIDENCE → REFLECT
 *   (observations + hypothesis + gaps + nextActions) → TARGETED NEXT WAVE
 *   → MORE EVIDENCE → ... → CONCLUSION (CONFIRMED / INFERRED / UNRESOLVED)
 *
 * Each wave is justified by the results of the previous wave. The LLM
 * interprets evidence, formulates hypotheses, identifies gaps, and proposes
 * targeted next actions — never reads files indiscriminately.
 *
 * Constraints (read mode):
 *   - Max 8 new file.read per adaptive wave (cognitive expansion limit,
 *     NOT concurrency — ResourcePolicyResolver controls physical concurrency).
 *   - Independent actions run in the same wave (dependsOn=[]) → parallel.
 *   - code.references only with a valid symbol from evidence.
 *   - git.* only when the mission requires change/repository context.
 *   - No writes. No direct connector calls. ExecutionOrchestrator executes waves.
 *
 * WRITE MODE: OpenHands executes; MemoryOS verifies completion.
 * (Currently not activated — run() returns failed for write mode.)
 */
import { base44 } from "@/api/base44Client";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type { AdaptiveProcess, AdaptiveProcessContext, AdaptiveRunState, CompletionContract, CompletionRequirement, Reflection, ResearchStep } from "./AdaptiveProcess";
import { DynamicWaveRunner } from "./DynamicWaveRunner";

const MAX_ITERATIONS = 3;
const MAX_READS_PER_WAVE = 8;
const MAX_DISCOVERY_QUERIES = 4;
const SUFFICIENCY_THRESHOLD = 0.75;
const MAX_REQUIREMENTS = 25;

// ── Evidence-based reflection extensions (read mode) ────────────────────────

interface EngineeringObservation {
  readonly step: string;
  readonly finding: string;
}

interface EngineeringNextAction {
  readonly type: "file.read" | "code.references" | "code.search" | "git.log" | "git.diff" | "git.status" | "repo.structure";
  readonly params: Record<string, unknown>;
  readonly rationale: string;
}

interface EngineeringReflection extends Reflection {
  readonly observations: readonly EngineeringObservation[];
  readonly nextActions: readonly EngineeringNextAction[];
  readonly hypothesis?: string;
}

// ── Process ──────────────────────────────────────────────────────────────────

class SupervisedEngineeringProcess implements AdaptiveProcess {
  readonly id = "supervisedEngineering";
  readonly description = "Supervised Engineering — evidence-based read-only investigation (V1) + OpenHands write verification";

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAN — first wave (discovery)
  // ═══════════════════════════════════════════════════════════════════════════

  async plan(ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    const mode = ctx.request.params.mode === "write" ? "write" : "read";

    // ── Read mode: LLM-generated discovery search queries ────────────────
    // The first wave seeks INITIAL EVIDENCE via code.search. The LLM
    // extracts relevant technical search terms from the mission question.
    // No files are read blindly — discovery must come first.
    if (mode !== "write") {
      const queries = await this._generateDiscoveryQueries(ctx.query);
      return queries.map((q, i) => ({
        id: `discovery-search-${i + 1}`,
        call: {
          connectorId: "mcp",
          capability: "mcp.callTool",
          params: {
            serverName: "eng-mcp",
            toolName: "engineering.code.search",
            arguments: { query: q.query, mode: q.mode },
          },
        },
        rationale: `Discovery search for "${q.query}" (${q.mode})`,
      }));
    }

    // ── Write mode: existing plan (OpenHands + verification) ────────────
    const repository = typeof ctx.request.params.repository === "string" ? ctx.request.params.repository : "AndersonVitaease/memoryos";
    const appConversationId = typeof ctx.request.params.app_conversation_id === "string" ? ctx.request.params.app_conversation_id : "";
    const openHandsParams: Record<string, unknown> = { task: ctx.query, repository, mode };
    if (appConversationId) openHandsParams.app_conversation_id = appConversationId;
    const steps: ResearchStep[] = [
      { id: "baseline-status", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.status", arguments: {} } }, rationale: "Capture repository state before OpenHands." },
      { id: "baseline-log", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.log", arguments: { limit: 1 } } }, rationale: "Capture HEAD before OpenHands so unexpected commits are detectable." },
      { id: "openhands-task", call: { connectorId: "openhands", capability: "openhands.runTask", params: openHandsParams }, rationale: appConversationId ? "Continue the engineering mission in the same OpenHands conversation/workspace." : "Execute the engineering mission." },
      { id: "verify-status", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.status", arguments: {} } }, rationale: "Verify repository state after execution." },
      { id: "verify-diff", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.diff", arguments: {} } }, rationale: "Verify actual repository changes." },
      { id: "verify-log", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.log", arguments: { limit: 1 } } }, rationale: "Compare HEAD after execution with the baseline." },
    ];
    const filePath = this.extractFilePath(ctx.query);
    if (filePath) steps.push({ id: "verify-file-read", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.file.read", arguments: { path: filePath } } }, rationale: "Verify the target file content independently through ENG-MCP." });
    const q = ctx.query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/\b(typecheck|type check|typescript|checagem de tipos|verificar tipos)\b/.test(q)) steps.push({ id: "verify-typecheck", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.typecheck.run", arguments: {} } }, rationale: "Verify TypeScript typecheck with ENG-MCP." });
    if (/\b(lint|eslint|linter)\b/.test(q)) steps.push({ id: "verify-lint", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.lint.run", arguments: {} } }, rationale: "Verify lint with ENG-MCP." });
    if (/\b(test|tests|teste|testes)\b/.test(q)) steps.push({ id: "verify-tests", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.test.run", arguments: { mode: /\bintegration\b/.test(q) ? "integration" : "suite" } } }, rationale: "Verify requested tests with ENG-MCP." });
    return steps;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAN NEXT WAVE — convert nextActions to ExecutionSteps
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dynamic Re-planning V1: converts the NEXT ACTIONS produced by reflect()
   * into concrete ExecutionSteps. Each action whose required params are
   * available from evidence becomes a step. Independent actions share the
   * same wave (dependsOn=[]) so the ExecutionOrchestrator parallelizes them.
   *
   * Max 8 file.read per wave (cognitive expansion limit — NOT concurrency).
   */
  async planNextWave(state: AdaptiveRunState, ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    // Write mode never reaches DynamicWaveRunner (run returns early).
    // No next-wave planning for write mode.
    if (ctx.request.params.mode === "write") return [];

    const reflection = state.reflection as EngineeringReflection;
    const actions = reflection.nextActions ?? [];

    // ── Query dedup per run (transient, derived from completedSteps) ──
    // Collects every (query, mode) pair already executed across prior waves so
    // the LLM's reformulated code.search nextActions do not silently repeat a
    // query that already returned nothing. No new entity, no global history.
    const executedQueryKeys = new Set<string>();
    for (const entry of state.completedSteps) {
      const args = entry.step.call.params?.arguments as Record<string, unknown> | undefined;
      if (entry.step.call.params?.toolName === "engineering.code.search" && args) {
        const q = String(args.query ?? "").trim().toLowerCase();
        const m = String(args.mode ?? "literal").trim().toLowerCase();
        if (q) executedQueryKeys.add(`${q}|${m}`);
      }
    }

    const steps: ResearchStep[] = [];
    let fileReadCount = 0;

    for (const action of actions) {
      if (action.type === "file.read" && fileReadCount >= MAX_READS_PER_WAVE) break;
      // Dedup code.search: skip reformulated queries that repeat a prior query.
      if (action.type === "code.search") {
        const q = String(action.params?.query ?? "").trim().toLowerCase();
        const m = String(action.params?.mode ?? "literal").trim().toLowerCase();
        if (q && executedQueryKeys.has(`${q}|${m}`)) continue;
      }
      const step = this._actionToStep(action, steps.length + 1);
      if (!step) continue;
      if (action.type === "file.read") fileReadCount++;
      steps.push(step);
    }

    return steps;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVOKE — dispatch (write mode only; read mode uses DynamicWaveRunner)
  // ═══════════════════════════════════════════════════════════════════════════

  async invoke(steps: readonly ResearchStep[], ctx: AdaptiveProcessContext): Promise<readonly ExecutionOutcome[]> {
    if (!steps.length) return [];
    const openHandsIndex = steps.findIndex((s) => s.id === "openhands-task");
    if (openHandsIndex < 0) return Promise.all(steps.map((s) => ctx.dispatch(s.call)));
    const before = await Promise.all(steps.slice(0, openHandsIndex).map((s) => ctx.dispatch(s.call)));
    const openHands = await ctx.dispatch(steps[openHandsIndex].call);
    const after = await Promise.all(steps.slice(openHandsIndex + 1).map((s) => ctx.dispatch(s.call)));
    return [...before, openHands, ...after];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REFLECT — evidence analysis
  // ═══════════════════════════════════════════════════════════════════════════

  async reflect(steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], ctx: AdaptiveProcessContext): Promise<Reflection> {
    const byStep = new Map<string, ExecutionOutcome>();
    steps.forEach((s, i) => byStep.set(s.id, results[i]));

    // ── Read mode: LLM-based evidence reflection ────────────────────────
    // Produces OBSERVATIONS, HYPOTHESIS, GAPS, NEXT ACTIONS, SUFFICIENCY
    // from the actual outputs of the current wave.
    if (ctx.request.params.mode !== "write") {
      return this._reflectReadMode(steps, results, ctx, byStep);
    }

    // ── Write mode: existing LLM-based evaluate ─────────────────────────
    const requirements = await this.deriveRequirements(ctx.query);
    return this.evaluate(requirements, steps, results);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STOP
  // ═══════════════════════════════════════════════════════════════════════════

  stop(reflection: Reflection): boolean {
    // Write mode: completion contract
    if (reflection.completion) return reflection.completion.requiredComplete === true;
    // Read mode: sufficiency threshold OR no gaps remaining
    return reflection.sufficiency >= SUFFICIENCY_THRESHOLD || reflection.gaps.length === 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNTHESIZE
  // ═══════════════════════════════════════════════════════════════════════════

  async synthesize(steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], reflection: Reflection, ctx: AdaptiveProcessContext): Promise<unknown> {
    // ── Read mode: CONFIRMED / INFERRED / UNRESOLVED ────────────────────
    if (ctx.request.params.mode !== "write") {
      return this._synthesizeReadMode(steps, results, reflection, ctx);
    }

    // ── Write mode: existing synthesis ───────────────────────────────────
    const openHandsIndex = steps.findIndex((s) => s.id === "openhands-task");
    const openHands = openHandsIndex >= 0 ? results[openHandsIndex] : undefined;
    const obj = openHands?.output && typeof openHands.output === "object" ? openHands.output as Record<string, unknown> : {};
    return { agent_reply_text: typeof obj.agent_reply_text === "string" ? obj.agent_reply_text : "", completion: reflection.completion ?? null, gaps: reflection.gaps, sufficiency: reflection.sufficiency };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUN
  // ═══════════════════════════════════════════════════════════════════════════

  async run(ctx: AdaptiveProcessContext): Promise<ExecutionOutcome> {
    if (ctx.request.params.mode === "write") {
      return Object.freeze({
        status: "failed" as const,
        connectorId: ctx.request.connectorId,
        capability: ctx.request.capability,
        output: { completion: null, gaps: ["Supervised write mode requires a shared/continuable OpenHands workspace before activation."] },
        message: "SupervisedEngineering write mode is not activated: OpenHands Cloud and ENG-MCP currently observe different working trees, so independent verification of file changes is not yet reliable.",
        reversibility: "reversible" as const,
        executionId: ctx.parentExecutionId,
        durationMs: null,
      });
    }
    // ── Read mode: evidence-based adaptive loop via DynamicWaveRunner ───
    // Waves are executed by ExecutionOrchestrator (resource-aware concurrency
    // preserved). Wave 2+ steps are born from real evidence — they did NOT
    // exist in the initial plan. No OpenHands required for read-only.
    const runner = new DynamicWaveRunner();
    return runner.run(this, ctx, { maxIterations: MAX_ITERATIONS });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Read mode helpers (Adaptive Mission Decomposition V1)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generates 1-3 discovery search queries from the mission question.
   * The LLM extracts relevant technical terms (identifiers, class names,
   * error names) and decides whether to search by code content or filename.
   * Falls back to deterministic term extraction if the LLM returns nothing.
   */
  private async _generateDiscoveryQueries(mission: string): Promise<readonly { query: string; mode: string }[]> {
    const prompt = `You are the discovery planner for a code investigation in a TypeScript/React repository.
Mission: "${mission}"

Generate up to ${MAX_DISCOVERY_QUERIES} search queries to find relevant code. You MUST produce TWO distinct categories:

A) LITERAL CONCEPT QUERIES
- Terms EXACTLY present in the mission text (phrases the user wrote).
- mode "literal" (search file contents for that exact text).

B) CODE IDENTIFIER CANDIDATES
- Translations of the mission concept into PROBABLE code identifiers / strings.
- Example: concept "FAST PATH / ADAPTIVE PATH" could yield identifiers like "executionPath", "fast", "adaptive", "path selection".
- Prefer camelCase / snake_case forms common in TypeScript code.
- mode "literal" (search file contents for the identifier as a string).

Respond ONLY JSON:
{"queries": [{"query": "search term", "mode": "literal|filename", "category": "literal_concept|identifier_candidate"}]}

Rules:
- Maximum ${MAX_DISCOVERY_QUERIES} queries total.
- Include at least one literal_concept query AND at least one identifier_candidate query when possible.
- Queries MUST be distinct from each other. Do NOT emit near-duplicate variations of the same term.
- Prefer a few high-quality queries over many similar ones.
- mode "literal": search file contents for a literal text/identifier (DEFAULT).
- mode "filename": ONLY when the mission explicitly references a file name or module name.
- Do NOT search for common words (the, how, why, where, investigate, discover, system, decide, between).
- Extract the most relevant TECHNICAL terms from the mission, not generic verbs.
- Do NOT hardcode identifiers you happen to know from a specific codebase; derive candidates generically from the mission concept.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            maxItems: MAX_DISCOVERY_QUERIES,
            items: {
              type: "object",
              properties: {
                query: { type: "string" },
                mode: { type: "string", enum: ["literal", "filename"] },
                category: { type: "string", enum: ["literal_concept", "identifier_candidate"] },
              },
              required: ["query", "mode"],
            },
          },
        },
        required: ["queries"],
      },
    });

    const queries = (res as { queries?: Array<Record<string, unknown>> }).queries ?? [];
    const mapped = queries
      .map((q) => ({
        query: String(q.query ?? "").trim(),
        mode: q.mode === "filename" ? "filename" : "literal",
      }))
      .filter((q) => q.query.length > 0);

    if (mapped.length === 0) {
      const term = this._extractSearchTerm(mission);
      return [{ query: term, mode: "literal" }];
    }
    return mapped;
  }

  /**
   * LLM-based evidence reflection for read mode. Analyzes the actual outputs
   * of the current wave and produces:
   *   - OBSERVATIONS: factual findings directly from evidence
   *   - HYPOTHESIS: current best understanding
   *   - GAPS: specific unknowns blocking the answer
   *   - NEXT ACTIONS: targeted capabilities to fill gaps (with concrete params)
   *   - SUFFICIENCY: 0..1 semantic completeness score
   */
  private async _reflectReadMode(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    ctx: AdaptiveProcessContext,
    byStep: Map<string, ExecutionOutcome>,
  ): Promise<EngineeringReflection> {
    const evidence = steps.map((s, i) => {
      const r = results[i];
      const out = r.status === "success" && r.output != null
        ? JSON.stringify(r.output).slice(0, 2000)
        : `(failed: ${r.message ?? r.status})`;
      return `[${s.id}] tool=${s.call.params?.toolName} status=${r.status}\n  params: ${JSON.stringify(s.call.params).slice(0, 300)}\n  output: ${out}`;
    }).join("\n\n");

    const prompt = `You are the reflector of an engineering investigation in a TypeScript/React repository.
Mission: "${ctx.query}"

Evidence from the current wave:
${evidence}

TOOL CAPABILITIES (factual, apply when interpreting evidence):
- engineering.code.search: searches RECURSIVELY across the entire repository root (including /src, /lib, /base44, all subdirectories). It does NOT require listing subdirectories first. If it returns zero/poor results, the QUERY was likely inadequate — NOT a visibility/access problem.
- engineering.repo.structure: lists the repository tree. It is NOT a prerequisite for code.search. Use it only for structural understanding or as a fallback after multiple failed searches.
- engineering.file.read: reads a single file. REQUIRES a concrete path previously found in evidence (e.g., from a code.search result).

Analyze the evidence and respond ONLY JSON:
{
  "observations": [{"step": "step-id from above", "finding": "factual finding directly from this step output"}],
  "hypothesis": "current best understanding of how the mission can be answered (or empty string if unknown)",
  "gaps": ["specific unknown that blocks answering the mission", ...],
  "nextActions": [
    {
      "type": "file.read|code.references|code.search|git.log|git.diff|git.status|repo.structure",
      "params": {"path": "..."} or {"symbol": "..."} or {"query": "...", "mode": "literal|filename"} or {},
      "rationale": "why this action helps fill a gap"
    }
  ],
  "sufficiency": 0.0
}

MANDATORY CONVERSION RULE — GAP WITH CONCRETE UNREAD PATH → file.read:
- If a gap refers to a concrete file path or concrete source file that appeared in the evidence/search results AND that file has NOT yet been read in this run, you MUST emit a file.read nextAction for that exact full path.
- Returning empty nextActions while unresolved gaps refer to concrete unread files is FORBIDDEN.
- "Concrete full path" means a path like "src/lib/execution-intelligence/adaptive-process/DynamicWaveRunner.ts" that was literally returned by a code.search result in the evidence. A bare filename like "DynamicWaveRunner.ts" WITHOUT a full path in evidence is NOT sufficient to emit file.read.
- PATH INVENTION IS FORBIDDEN: never fabricate a path that does not appear verbatim in the evidence. If a gap mentions a filename/symbol but the full path is not yet known, emit a code.search nextAction (mode "filename" or "literal") to LOCATE the full path first — do NOT guess the path.
- MULTIPLE GAPS WITH DIFFERENT CONCRETE PATHS: emit multiple file.read nextActions (one per concrete unread path). All such file.read actions enter the SAME next wave (they are independent). Up to 8 file.read per wave.
- PRIORITY: when a concrete unread path exists, file.read has ABSOLUTE priority. Do NOT substitute it with repo.structure, generic search, or a repeated code.search that already ran. Do NOT re-run a code.search whose query already executed just to avoid emitting file.read.

Rules:
- observations: ONLY facts directly present in the evidence output. Do NOT infer. Example of VALID observation: "Search for 'executionPath' returned ConversationPlanningEngine.ts." Example of INVALID observation: "The runtime must decide this somewhere."
- gaps: specific unanswered questions. VALID gap: "Where 'executionPath' is assigned is still unknown." INVALID gap (FORBIDDEN): "Cannot access /src", "Source files are missing", "Lack of visibility into subdirectories". code.search is recursive — do NOT claim lack of directory access.
- ZERO / LOW SEARCH RESULTS: if a code.search returned zero or very few matches, do NOT conclude the repository is inaccessible or source files are missing. Conclude instead that the QUERY was inadequate and produce code.search nextActions with REFORMULATED queries (different terms, identifiers, or broader/narrower variants). Do NOT repeat the exact same query already executed.
- SEARCH RETURNED PATHS: if code.search returned file paths, PRIORITIZE file.read of the most relevant paths as nextActions (up to 8). Do NOT call repo.structure when useful paths are already available.
- nextActions constraints:
  - file.read: params MUST include "path" with a concrete FULL path found verbatim in the evidence (from a search result). Never invent or guess a path.
  - code.references: params MUST include "symbol" with a concrete identifier found in the evidence.
  - code.search: params MUST include "query" and "mode" (literal or filename). The query MUST be DIFFERENT from any query already executed in this run (reformulate, do not repeat).
  - git.* / repo.structure: only when the mission asks about changes/repository state, OR as a contextual fallback after at least two rounds of failed searches that produced no paths at all.
  - Max 8 nextActions total.
  - Do NOT include actions whose required params are NOT available from evidence.
- EMPTY NEXTACTIONS: allowed ONLY when sufficiency >= 0.75, OR gaps is empty, OR no actionable capability can advance the mission. Empty nextActions while resolvable gaps reference concrete unread files is FORBIDDEN.
- sufficiency: 1.0 if the mission is fully answerable from current evidence alone; 0.0 if nothing relevant found; 0.75+ if mostly answerable with minor gaps.
- If sufficiency >= 0.75, nextActions should be empty or minimal (we have enough).`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          observations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "string" },
                finding: { type: "string" },
              },
              required: ["step", "finding"],
            },
          },
          hypothesis: { type: "string" },
          gaps: { type: "array", items: { type: "string" } },
          nextActions: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["file.read", "code.references", "code.search", "git.log", "git.diff", "git.status", "repo.structure"] },
                params: { type: "object" },
                rationale: { type: "string" },
              },
              required: ["type", "params", "rationale"],
            },
          },
          sufficiency: { type: "number" },
        },
        required: ["observations", "gaps", "nextActions", "sufficiency"],
      },
    });

    const data = res as {
      observations?: Array<Record<string, unknown>>;
      hypothesis?: string;
      gaps?: string[];
      nextActions?: Array<Record<string, unknown>>;
      sufficiency?: number;
    };

    return {
      byStep,
      observations: (data.observations ?? []).map((o) => ({
        step: String(o.step ?? ""),
        finding: String(o.finding ?? ""),
      })),
      hypothesis: typeof data.hypothesis === "string" ? data.hypothesis : undefined,
      gaps: data.gaps ?? [],
      nextActions: (data.nextActions ?? []).map((a) => ({
        type: a.type as EngineeringNextAction["type"],
        params: (a.params as Record<string, unknown>) ?? {},
        rationale: String(a.rationale ?? ""),
      })),
      sufficiency: typeof data.sufficiency === "number" ? data.sufficiency : 0,
    };
  }

  /**
   * Converts a NEXT ACTION (from reflect) into a concrete ResearchStep.
   * Returns null if the action's required params are missing — the action
   * is silently dropped (the LLM was told not to propose actions without
   * evidence-backed params, but we validate defensively).
   *
   * All steps have dependsOn=[] (independent) — the ExecutionOrchestrator
   * parallelizes them via ResourcePolicyResolver.
   */
  private _actionToStep(action: EngineeringNextAction, index: number): ResearchStep | null {
    const p = action.params;
    const make = (toolName: string, args: Record<string, unknown>): ResearchStep => ({
      id: `wave-next-${String(index).padStart(2, "0")}`,
      call: {
        connectorId: "mcp",
        capability: "mcp.callTool",
        params: { serverName: "eng-mcp", toolName, arguments: args },
      },
      rationale: action.rationale,
    });

    switch (action.type) {
      case "file.read": {
        const path = typeof p.path === "string" ? p.path.trim() : "";
        if (!path) return null;
        return make("engineering.file.read", { path });
      }
      case "code.references": {
        const symbol = typeof p.symbol === "string" ? p.symbol.trim() : "";
        if (!symbol) return null;
        return make("engineering.code.references", { symbol });
      }
      case "code.search": {
        const query = typeof p.query === "string" ? p.query.trim() : "";
        if (!query) return null;
        const mode = p.mode === "filename" ? "filename" : "literal";
        return make("engineering.code.search", { query, mode });
      }
      case "git.log": {
        const limit = typeof p.limit === "number" ? p.limit : 10;
        return make("engineering.git.log", { limit });
      }
      case "git.diff": {
        return make("engineering.git.diff", {});
      }
      case "git.status": {
        return make("engineering.git.status", {});
      }
      case "repo.structure": {
        return make("engineering.repo.structure", {});
      }
      default:
        return null;
    }
  }

  /**
   * Synthesizes the final investigation report (read mode).
   * Distinguishes CONFIRMED (direct evidence), INFERRED (derived), and
   * UNRESOLVED (gaps). Never invents facts absent from the evidence.
   */
  private async _synthesizeReadMode(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    reflection: Reflection,
    ctx: AdaptiveProcessContext,
  ): Promise<unknown> {
    const evidence = steps.map((s, i) => {
      const r = results[i];
      const text = r.status === "success" && r.output != null
        ? (typeof r.output === "string" ? r.output : JSON.stringify(r.output)).slice(0, 4000)
        : null;
      return {
        step: s.id,
        tool: s.call.params?.toolName ?? s.id,
        params: s.call.params,
        status: r.status,
        content: text,
        error: r.status !== "success" ? (r.message ?? r.status) : null,
      };
    });

    const engReflection = reflection as EngineeringReflection;

    const prompt = `Synthesize an engineering investigation report in markdown.
Mission: "${ctx.query}"
Sufficiency reached: ${reflection.sufficiency}
Hypothesis: ${engReflection.hypothesis ?? "(none)"}
Gaps remaining: ${JSON.stringify(reflection.gaps)}
Observations: ${JSON.stringify(engReflection.observations ?? [])}

Evidence (verbatim, truncated):
${JSON.stringify(evidence, null, 2)}

Produce a markdown report with EXACTLY these sections:
## CONFIRMED
Facts directly supported by verbatim evidence. Each fact MUST cite the [step-id] it came from. Do NOT include anything not literally in the evidence.
## INFERRED
Conclusions derived by combining multiple pieces of evidence. Cite the [step-id]s used for each inference. Clearly mark these as derived, not direct.
## UNRESOLVED
What could not be determined from the evidence collected. Reference the gaps.
## Summary
A brief (3-5 sentence) answer to the mission question, noting confidence level.

Rules:
- CONFIRMED: base ONLY on verbatim content from the evidence. Cite step-id.
- Do NOT invent facts, file names, or code that does not appear in the evidence.
- If a file was read successfully, its content is fact.
- If a search returned results, the file paths found are fact.
- INFERRED items must be clearly derived from CONFIRMED evidence.`;

    const report = (await base44.integrations.Core.InvokeLLM({ prompt })) as string;
    return report;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Shared helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extracts a search term from the mission query for the discovery wave.
   * Tries file path first, then capitalized identifiers (class/module names).
   * No LLM — pure regex. Used as fallback when _generateDiscoveryQueries
   * returns nothing.
   */
  private _extractSearchTerm(query: string): string {
    const filePath = this.extractFilePath(query);
    if (filePath) return filePath;

    const classMatches = query.match(/\b([A-Z][a-zA-Z0-9]+)\b/g);
    if (classMatches && classMatches.length > 0) {
      const term = classMatches.sort((a, b) => b.length - a.length)[0];
      return term + ".ts";
    }

    return query.split(/\s+/).slice(0, 5).join(" ");
  }

  /**
   * Deterministic file path extraction from the mission query.
   * Matches: package.json, src/lib/foo.ts, base44/config.jsonc, README.md
   * Does NOT match: MemoryOS, arquitetura, v1.0 (extension must start with a letter).
   * No LLM call — pure regex. Used by write mode plan().
   */
  private extractFilePath(query: string): string | null {
    const FILE_PATH_RE = /\b(?:[\w@.-]+\/)*[\w@-]+\.[a-zA-Z][a-zA-Z0-9]{0,7}\b/;
    const match = query.match(FILE_PATH_RE);
    return match ? match[0] : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — Write mode helpers (unchanged)
  // ═══════════════════════════════════════════════════════════════════════════

  private async deriveRequirements(task: string): Promise<readonly CompletionRequirement[]> {
    const res = await base44.integrations.Core.InvokeLLM({ prompt: `Convert the mission into atomic verifiable completion requirements. Preserve every explicit request and constraint. Do not invent new requirements. Maximum ${MAX_REQUIREMENTS}. Mission:\n${task}`, response_json_schema: { type: "object", properties: { requirements: { type: "array", maxItems: MAX_REQUIREMENTS, items: { type: "object", properties: { id: { type: "string" }, description: { type: "string" }, required: { type: "boolean" } }, required: ["id", "description", "required"] } } }, required: ["requirements"] } });
    const rows = (res as { requirements?: Array<Record<string, unknown>> }).requirements ?? [];
    const out = rows.slice(0, MAX_REQUIREMENTS).map((r, i) => ({ id: String(r.id ?? `req-${i + 1}`), description: String(r.description ?? "").trim(), required: r.required !== false, status: "pending" as const, evidence: [] as readonly string[] })).filter((r) => r.description);
    return out.length ? out : [{ id: "req-1", description: task.trim(), required: true, status: "pending", evidence: [] }];
  }

  private async evaluate(requirements: readonly CompletionRequirement[], steps: readonly ResearchStep[], results: readonly ExecutionOutcome[]): Promise<Reflection> {
    const byStep = new Map<string, ExecutionOutcome>();
    steps.forEach((s, i) => byStep.set(s.id, results[i]));
    const openHandsIndex = steps.findIndex((s) => s.id === "openhands-task");
    const openHands = openHandsIndex >= 0 ? results[openHandsIndex] : undefined;
    const firstObj = openHands?.output && typeof openHands.output === "object" ? openHands.output as Record<string, unknown> : {};
    const agentReply = typeof firstObj.agent_reply_text === "string" ? firstObj.agent_reply_text : "";
    const verification = steps.map((s, i) => ({ id: s.id, source: String(s.call.params.toolName ?? s.id), status: results[i]?.status ?? "missing", output: results[i]?.output ?? null })).filter((e) => e.id !== "openhands-task");
    const res = await base44.integrations.Core.InvokeLLM({ prompt: `Evaluate every requirement. ENG-MCP evidence overrides agent narrative. If a technical claim needs verification and evidence is insufficient, mark unverified. Never invent evidence.\nRequirements:${JSON.stringify(requirements)}\nAgent:${agentReply.slice(0, 12000)}\nVerification:${JSON.stringify(verification).slice(0, 18000)}`, response_json_schema: { type: "object", properties: { requirements: { type: "array", items: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["completed", "failed", "unverified", "pending"] }, evidence: { type: "array", items: { type: "string" } } }, required: ["id", "status", "evidence"] } } }, required: ["requirements"] } });
    const judged = new Map<string, { status: "completed" | "failed" | "unverified" | "pending"; evidence: readonly string[] }>();
    for (const row of (res as { requirements?: Array<Record<string, unknown>> }).requirements ?? []) {
      const id = String(row.id ?? ""); const raw = String(row.status ?? "unverified");
      const status = (["completed", "failed", "unverified", "pending"].includes(raw) ? raw : "unverified") as "completed" | "failed" | "unverified" | "pending";
      if (id) judged.set(id, { status, evidence: Array.isArray(row.evidence) ? row.evidence.map(String).slice(0, 8) : [] });
    }
    const evaluated = requirements.map((r) => ({ ...r, status: judged.get(r.id)?.status ?? "unverified" as const, evidence: judged.get(r.id)?.evidence ?? [] }));
    const completed = evaluated.filter((r) => r.status === "completed").length;
    const total = evaluated.length;
    const completion: CompletionContract = { requirements: evaluated, completed, total, requiredComplete: evaluated.filter((r) => r.required).every((r) => r.status === "completed") };
    return { byStep, gaps: evaluated.filter((r) => r.required && r.status !== "completed").map((r) => r.description), sufficiency: total ? completed / total : 1, completion };
  }
}

let instance: SupervisedEngineeringProcess | null = null;
export function getSupervisedEngineeringProcess(): SupervisedEngineeringProcess {
  if (!instance) instance = new SupervisedEngineeringProcess();
  return instance;
}