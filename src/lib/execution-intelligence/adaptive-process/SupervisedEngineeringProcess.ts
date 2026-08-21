/** Supervised engineering: OpenHands executes; MemoryOS verifies completion. */
import { base44 } from "@/api/base44Client";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type { AdaptiveProcess, AdaptiveProcessContext, AdaptiveRunState, CompletionContract, CompletionRequirement, Reflection, ResearchStep } from "./AdaptiveProcess";
import { DynamicWaveRunner } from "./DynamicWaveRunner";

const MAX_ITERATIONS = 2;
const MAX_REQUIREMENTS = 25;

class SupervisedEngineeringProcess implements AdaptiveProcess {
  readonly id = "supervisedEngineering";
  readonly description = "Supervised Engineering — OpenHands execution with completion verification";

  async plan(ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    const mode = ctx.request.params.mode === "write" ? "write" : "read";

    // ── Read mode: discovery wave only (NO OpenHands) ────────────────────
    // Dynamic Re-planning V1: wave 1 is just discovery (search). Subsequent
    // waves (file.read) are born from real search output via planNextWave().
    if (mode !== "write") {
      const searchTerm = this._extractSearchTerm(ctx.query);
      return [
        {
          id: "discovery-search",
          call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.code.search", arguments: { query: searchTerm, mode: "filename" } } },
          rationale: `Search for "${searchTerm}" to locate relevant files.`,
        },
      ];
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

  /**
   * Dynamic Re-planning V1: generate next wave from real search output.
   * Looks at completed code.search results, extracts file paths, and
   * generates engineering.file.read steps for each found file.
   * These steps did NOT exist in the initial plan — they are born from
   * the actual execution output of the previous wave.
   */
  async planNextWave(state: AdaptiveRunState, _ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    const steps: ResearchStep[] = [];

    for (const { step, result } of state.completedSteps) {
      if (result.status !== "success" || result.output == null) continue;

      const toolName = step.call.params?.toolName;
      if (toolName !== "engineering.code.search") continue;

      const paths = this._extractPathsFromOutput(result.output);
      for (const path of paths.slice(0, 10)) {
        steps.push({
          id: `read-${steps.length + 1}`,
          call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.file.read", arguments: { path } } },
          rationale: `Read ${path} found in search results.`,
        });
      }
    }

    return steps;
  }

  async invoke(steps: readonly ResearchStep[], ctx: AdaptiveProcessContext): Promise<readonly ExecutionOutcome[]> {
    if (!steps.length) return [];
    const openHandsIndex = steps.findIndex((s) => s.id === "openhands-task");
    if (openHandsIndex < 0) return Promise.all(steps.map((s) => ctx.dispatch(s.call)));
    const before = await Promise.all(steps.slice(0, openHandsIndex).map((s) => ctx.dispatch(s.call)));
    const openHands = await ctx.dispatch(steps[openHandsIndex].call);
    const after = await Promise.all(steps.slice(openHandsIndex + 1).map((s) => ctx.dispatch(s.call)));
    return [...before, openHands, ...after];
  }

  async reflect(steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], ctx: AdaptiveProcessContext): Promise<Reflection> {
    const byStep = new Map<string, ExecutionOutcome>();
    steps.forEach((s, i) => byStep.set(s.id, results[i]));

    // ── Read mode: deterministic reflection (no LLM) ─────────────────────
    if (ctx.request.params.mode !== "write") {
      const hasSearch = steps.some((s) => s.call.params?.toolName === "engineering.code.search");
      const hasReads = steps.some((s) => s.call.params?.toolName === "engineering.file.read");
      const successfulReads = steps.filter((s, i) =>
        s.call.params?.toolName === "engineering.file.read" && results[i]?.status === "success",
      ).length;

      if (hasSearch && !hasReads) {
        return { byStep, gaps: ["Read files found in search results"], sufficiency: 0.3 };
      }
      if (successfulReads > 0) {
        return { byStep, gaps: [], sufficiency: 0.9 };
      }
      return { byStep, gaps: [], sufficiency: 0.5 };
    }

    // ── Write mode: existing LLM-based reflection ────────────────────────
    const requirements = await this.deriveRequirements(ctx.query);
    return this.evaluate(requirements, steps, results);
  }

  stop(reflection: Reflection): boolean {
    return reflection.completion?.requiredComplete === true;
  }

  async synthesize(steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], reflection: Reflection, ctx: AdaptiveProcessContext): Promise<unknown> {
    // ── Read mode: summarize evidence from file reads ───────────────────
    if (ctx.request.params.mode !== "write") {
      const evidence = steps.map((s, i) => {
        const r = results[i];
        const text = r.status === "success" && r.output != null
          ? (typeof r.output === "string" ? r.output : JSON.stringify(r.output)).slice(0, 2000)
          : null;
        return { step: s.id, tool: s.call.params?.toolName ?? s.id, params: s.call.params, status: r.status, content: text };
      });
      return { evidence, gaps: reflection.gaps, sufficiency: reflection.sufficiency };
    }

    // ── Write mode: existing synthesis ───────────────────────────────────
    const openHandsIndex = steps.findIndex((s) => s.id === "openhands-task");
    const openHands = openHandsIndex >= 0 ? results[openHandsIndex] : undefined;
    const obj = openHands?.output && typeof openHands.output === "object" ? openHands.output as Record<string, unknown> : {};
    return { agent_reply_text: typeof obj.agent_reply_text === "string" ? obj.agent_reply_text : "", completion: reflection.completion ?? null, gaps: reflection.gaps, sufficiency: reflection.sufficiency };
  }

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
    // ── Read mode: Dynamic Re-planning via DynamicWaveRunner ─────────────
    // Waves are executed by ExecutionOrchestrator (resource-aware concurrency
    // preserved). Wave 2+ steps are born from real search output — they did
    // NOT exist in the initial plan. No OpenHands required for read-only.
    const runner = new DynamicWaveRunner();
    return runner.run(this, ctx, { maxIterations: MAX_ITERATIONS });
  }

  /**
   * Extracts a search term from the mission query for the discovery wave.
   * Tries file path first, then capitalized identifiers (class/module names).
   * No LLM — pure regex.
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
   * Extracts file paths from a code.search output. Handles multiple output
   * formats (MCP response with text, direct matches array, raw JSON string).
   * No LLM — deterministic parsing.
   */
  private _extractPathsFromOutput(output: unknown): string[] {
    let text = "";
    if (typeof output === "string") {
      text = output;
    } else if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      if (Array.isArray(obj.matches)) {
        return obj.matches.filter((m) => typeof m === "string") as string[];
      }
      if (Array.isArray(obj.result)) {
        const first = obj.result[0];
        if (first && typeof first === "object") {
          text = String((first as Record<string, unknown>).text ?? "");
        }
      }
      if (!text) {
        try { text = JSON.stringify(obj); } catch { return []; }
      }
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.matches)) {
        return parsed.matches.filter((m: unknown) => typeof m === "string") as string[];
      }
    } catch { /* not JSON */ }

    const RE = /(?:[A-Za-z0-9_@.\-]+\/)*[A-Za-z0-9_@\-]+\.(?:ts|tsx|js|jsx|json|jsonc|md|py|toml|yml|yaml|sh|css|html|txt|env|lock)(?![A-Za-z0-9])/g;
    const matches = text.match(RE);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * Deterministic file path extraction from the mission query.
   * Matches: package.json, src/lib/foo.ts, base44/config.jsonc, README.md
   * Does NOT match: MemoryOS, arquitetura, v1.0 (extension must start with a letter).
   * No LLM call — pure regex.
   */
  private extractFilePath(query: string): string | null {
    const FILE_PATH_RE = /\b(?:[\w@.-]+\/)*[\w@-]+\.[a-zA-Z][a-zA-Z0-9]{0,7}\b/;
    const match = query.match(FILE_PATH_RE);
    return match ? match[0] : null;
  }

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