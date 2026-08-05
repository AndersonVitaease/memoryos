/**
 * DeepResearchProcess.ts — AP-02 (RFC-010 / ADR-017)
 *
 * Primeira instancia concreta de AdaptiveProcess.
 *
 * Loop: plan -> invoke -> reflect -> (gap? re-plan) -> stop? -> synthesize.
 * Sub-capabilities sao invocadas via ctx.dispatch (runtime.processCapability
 * com parentExecutionId — AP-04). Reentrada pela cadeia completa: cada sub-cap
 * passa por Intelligence + Safety + Dispatch (bypass impossivel, ADR-015).
 *
 * Nenhum caller importa este modulo ainda (AP-02 = scaffold puro).
 * AP-03 conecta o AdaptiveProcessConnector; AP-04 wired o dispatch real;
 * AP-05 expoe sinais no GoalRegistry ("pesquise a fundo", etc.).
 *
 * Prompts de LLM (plan/reflect/synthesize) usam base44.integrations.Core.InvokeLLM
 * (caminho vivo do SDK). Detalhe do prompt e honesto e minimal — nao over-engineering.
 */

import { base44 } from "@/api/base44Client";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type {
  AdaptiveProcess,
  AdaptiveProcessContext,
  Reflection,
  ResearchStep,
} from "./AdaptiveProcess";

const MAX_ITERATIONS = 5;
const SUFFICIENCY_THRESHOLD = 0.75;

class DeepResearchProcess implements AdaptiveProcess {
  readonly id = "deepResearch";
  readonly description = "Deep Research — pesquisa aprofundada com loop reflexivo";

  async plan(ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    const prompt = `Voce e o planejador de uma pesquisa aprofundada. Dada a query do usuario,
identifique 1-5 sub-pesquisas necessarias para respondê-la com suficiencia.
Responda APENAS um JSON array de objetos {connectorId, capability, params, rationale}.

Capabilities disponiveis para busca:
- serperSearch (web): {query} — busca web generica
- github.searchCode (code): {query} — busca de codigo em repos
- github.getFile (code): {owner, repo, path} — le arquivo de repo
- google-drive.searchFiles (docs): {query} — busca documentos do Drive do usuario

Query do usuario: "${ctx.query}"

Responda JSON array, sem texto adicional.`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                connectorId: { type: "string" },
                capability: { type: "string" },
                params: { type: "object" },
                rationale: { type: "string" },
              },
              required: ["connectorId", "capability", "params", "rationale"],
            },
          },
        },
        required: ["steps"],
      },
    });

    const data = (res as { steps?: Array<Record<string, unknown>> }).steps ?? [];
    return data.map((s, i) => ({
      id: `step-${i + 1}`,
      call: {
        connectorId: String(s.connectorId ?? ""),
        capability: String(s.capability ?? ""),
        params: (s.params as Record<string, unknown>) ?? {},
      },
      rationale: String(s.rationale ?? ""),
    }));
  }

  async invoke(
    steps: readonly ResearchStep[],
    ctx: AdaptiveProcessContext,
  ): Promise<readonly ExecutionOutcome[]> {
    const outcomes: ExecutionOutcome[] = [];
    for (const step of steps) {
      const outcome = await ctx.dispatch(step.call);
      outcomes.push(outcome);
    }
    return outcomes;
  }

  async reflect(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    ctx: AdaptiveProcessContext,
  ): Promise<Reflection> {
    const byStep = new Map<string, ExecutionOutcome>();
    steps.forEach((s, i) => byStep.set(s.id, results[i]));

    const successes = results.filter((r) => r.status === "success").length;
    const coverage = steps.length > 0 ? successes / steps.length : 0;

    const prompt = `Avalie a suficiencia de uma pesquisa aprofundada.
Query original: "${ctx.query}"
Passos planejados: ${steps.length}
Passos com sucesso: ${successes}

Responda APENAS JSON: {sufficiency: number 0..1, gaps: [string, ...]}
- sufficiency: 1.0 se a query esta totalmente respondida com os resultados; <0.75 se faltam pecas importantes.
- gaps: lista curta do que ainda falta pesquisar (vazia se suficiente).`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          sufficiency: { type: "number" },
          gaps: { type: "array", items: { type: "string" } },
        },
        required: ["sufficiency", "gaps"],
      },
    });

    const data = res as { sufficiency?: number; gaps?: string[] };
    return {
      byStep,
      gaps: data.gaps ?? [],
      sufficiency: typeof data.sufficiency === "number" ? data.sufficiency : coverage,
    };
  }

  stop(reflection: Reflection): boolean {
    return reflection.sufficiency >= SUFFICIENCY_THRESHOLD || reflection.gaps.length === 0;
  }

  async synthesize(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    reflection: Reflection,
    ctx: AdaptiveProcessContext,
  ): Promise<unknown> {
    const evidence = steps.map((s, i) => ({
      step: s.id,
      rationale: s.rationale,
      status: results[i].status,
      output: results[i].output,
    }));

    const prompt = `Sintetize um relatorio de pesquisa aprofundada.
Query original: "${ctx.query}"
Suficiencia alcancada: ${reflection.sufficiency}
Lacunas remanescentes: ${JSON.stringify(reflection.gaps)}

Evidencias coletadas (JSON):
${JSON.stringify(evidence, null, 2)}

Produza um relatorio estruturado em markdown, citando os passos (step-id) ao usar cada evidencia.
Inclua secao "Lacunas" se houver gaps remanescentes.`;

    const res = await base44.integrations.Core.InvokeLLM({ prompt });
    return res as string;
  }

  async run(ctx: AdaptiveProcessContext): Promise<ExecutionOutcome> {
    const allResults: ExecutionOutcome[] = [];
    const allSteps: ResearchStep[] = [];
    let reflection: Reflection = { byStep: new Map(), gaps: [], sufficiency: 0 };

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const steps = await this.plan(ctx);
      if (steps.length === 0) break;

      const results = await this.invoke(steps, ctx);
      allSteps.push(...steps);
      allResults.push(...results);

      reflection = await this.reflect(steps, results, ctx);
      if (this.stop(reflection)) break;
    }

    const report = await this.synthesize(allSteps, allResults, reflection, ctx);

    return Object.freeze({
      status: "success" as const,
      connectorId: ctx.request.connectorId,
      capability: ctx.request.capability,
      output: report,
      message: null,
      reversibility: "safe" as const,
      executionId: ctx.parentExecutionId,
      durationMs: null,
    });
  }
}

let _instance: DeepResearchProcess | null = null;
export function getDeepResearchProcess(): DeepResearchProcess {
  if (!_instance) _instance = new DeepResearchProcess();
  return _instance;
}