/** Supervised engineering: OpenHands executes; MemoryOS verifies completion. */
import { base44 } from "@/api/base44Client";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type { AdaptiveProcess, AdaptiveProcessContext, CompletionContract, CompletionRequirement, Reflection, ResearchStep } from "./AdaptiveProcess";

const MAX_ITERATIONS = 2;
const MAX_REQUIREMENTS = 25;

class SupervisedEngineeringProcess implements AdaptiveProcess {
  readonly id = "supervisedEngineering";
  readonly description = "Supervised Engineering — OpenHands execution with completion verification";

  async plan(ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    const repository = typeof ctx.request.params.repository === "string" ? ctx.request.params.repository : "AndersonVitaease/memoryos";
    const mode = ctx.request.params.mode === "write" ? "write" : "read";
    return [
      { id: "openhands-task", call: { connectorId: "openhands", capability: "openhands.runTask", params: { task: ctx.query, repository, mode } }, rationale: "Execute the engineering mission." },
      { id: "verify-status", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.status", arguments: {} } }, rationale: "Verify repository state." },
      { id: "verify-diff", call: { connectorId: "mcp", capability: "mcp.callTool", params: { serverName: "eng-mcp", toolName: "engineering.git.diff", arguments: {} } }, rationale: "Verify actual repository changes." },
    ];
  }

  async invoke(steps: readonly ResearchStep[], ctx: AdaptiveProcessContext): Promise<readonly ExecutionOutcome[]> {
    if (!steps.length) return [];
    const first = await ctx.dispatch(steps[0].call);
    const rest = await Promise.all(steps.slice(1).map((s) => ctx.dispatch(s.call)));
    return [first, ...rest];
  }

  async reflect(steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], ctx: AdaptiveProcessContext): Promise<Reflection> {
    const requirements = await this.deriveRequirements(ctx.query);
    return this.evaluate(requirements, steps, results);
  }

  stop(reflection: Reflection): boolean {
    return reflection.completion?.requiredComplete === true;
  }

  async synthesize(_steps: readonly ResearchStep[], results: readonly ExecutionOutcome[], reflection: Reflection, _ctx: AdaptiveProcessContext): Promise<unknown> {
    const first = results[0];
    const obj = first?.output && typeof first.output === "object" ? first.output as Record<string, unknown> : {};
    return { agent_reply_text: typeof obj.agent_reply_text === "string" ? obj.agent_reply_text : "", completion: reflection.completion ?? null, gaps: reflection.gaps, sufficiency: reflection.sufficiency };
  }

  async run(ctx: AdaptiveProcessContext): Promise<ExecutionOutcome> {
    const requirements = await this.deriveRequirements(ctx.query);
    let task = ctx.query;
    let reflection: Reflection = { byStep: new Map(), gaps: requirements.map((r) => r.description), sufficiency: 0, completion: { requirements, completed: 0, total: requirements.length, requiredComplete: false } };
    let results: readonly ExecutionOutcome[] = [];
    let steps: readonly ResearchStep[] = [];
    let rounds = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      rounds = i + 1;
      const roundCtx: AdaptiveProcessContext = { ...ctx, query: task, request: { ...ctx.request, params: { ...ctx.request.params, task } } };
      steps = await this.plan(roundCtx);
      results = await this.invoke(steps, roundCtx);
      reflection = await this.evaluate(requirements, steps, results);
      if (this.stop(reflection)) break;
      const missing = reflection.completion?.requirements.filter((r) => r.required && r.status !== "completed").map((r) => `- ${r.description}`).join("\n") ?? "";
      if (!missing) break;
      task = `${ctx.query}\n\nComplete only the still-unverified required items and report concrete evidence for each:\n${missing}`;
    }

    const output = { ...(await this.synthesize(steps, results, reflection, ctx) as Record<string, unknown>), rounds };
    const complete = reflection.completion?.requiredComplete === true;
    return Object.freeze({ status: complete ? "success" as const : "failed" as const, connectorId: ctx.request.connectorId, capability: ctx.request.capability, output, message: complete ? null : `Mission incomplete after ${rounds} round(s).`, reversibility: ctx.request.params.mode === "write" ? "reversible" as const : "safe" as const, executionId: ctx.parentExecutionId, durationMs: null });
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
    const firstObj = results[0]?.output && typeof results[0].output === "object" ? results[0].output as Record<string, unknown> : {};
    const agentReply = typeof firstObj.agent_reply_text === "string" ? firstObj.agent_reply_text : "";
    const verification = steps.slice(1).map((s, i) => ({ source: String(s.call.params.toolName ?? s.id), status: results[i + 1]?.status ?? "missing", output: results[i + 1]?.output ?? null }));
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
