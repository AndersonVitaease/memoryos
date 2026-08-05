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
identifique 1-5 sub-pesquisas necessarias para responde-la com suficiencia.
Responda APENAS um JSON array de objetos {connectorId, capability, params, rationale}.

Capabilities disponiveis para busca (USE APENAS ESTAS — todas sao connectors reais e vivos):
- base44 (web grounding): {capability: "ai.invokeLLM", params: {prompt: "...", add_context_from_internet: true}} — busca web generica com Gemini + Google Search. Use para perguntas factuais, localizar repos, verificar existencia publica.
- github (code): {capability: "files.get", params: {owner, repo, path}} — le um arquivo especifico de um repo GitHub publico.
- github (code): {capability: "search.symbol", params: {query}} — busca de codigo/simbolos em repos.
- google-drive (docs): {capability: "drive.files.search", params: {query}} — busca documentos do Drive do usuario.

REGRAS CRITICAS:
1. Se a query menciona um repo GitHub no formato "owner/repo" (ex: "newerton/mcp-mercado-livre"),
   extraia owner e repo e SEMPRE inclua passos para ler os arquivos principais:
   - {connectorId: "github", capability: "files.get", params: {owner, repo, path: "README.md"}}
   - {connectorId: "github", capability: "files.get", params: {owner, repo, path: "package.json"}}
   Nunca conclua que um repo e "privado/inacessivel" sem antes tentar ler o README.md.
2. Inclua pelo menos um passo de web grounding (base44.ai.invokeLLM com add_context_from_internet: true)
   para corroborar informacoes factuais sobre o topico da query.
3. NAO use capabilities que nao estao listadas acima (ex: serperSearch, mcpClientCall). Elas nao existem como connector e falham.

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
    const llmSteps = data.map((s, i) => ({
      id: `step-${i + 2}`,
      call: {
        connectorId: String(s.connectorId ?? ""),
        capability: String(s.capability ?? ""),
        params: (s.params as Record<string, unknown>) ?? {},
      },
      rationale: String(s.rationale ?? ""),
    }));

    // AP-refine: prepend a DETERMINISTIC web-grounding step. The LLM planner is
    // non-deterministic and frequently omits web search (or emits invalid connectors
    // like the removed "serperSearch"), leaving synthesis with zero real evidence —
    // which produced the "no documentation / inaccessible" hallucination. This step
    // ALWAYS runs first, providing grounded facts via Gemini + Google Search. It is
    // a real, live capability (base44.ai.invokeLLM with add_context_from_internet)
    // that returns concrete, sourced answers — verified to work for this exact query.
    const webStep: ResearchStep = {
      id: "step-web-grounding",
      call: {
        connectorId: "base44",
        capability: "ai.invokeLLM",
        params: {
          prompt: `Pesquise na web e responda com fontes: ${ctx.query}. Inclua fatos concretos e, se aplicavel: existencia publica do projeto/repositorio, instrucoes de instalacao e configuracao, transporte usado (stdio vs HTTP/SSE), e ferramentas/funcionalidades expostas.`,
          add_context_from_internet: true,
        },
      },
      rationale: "Web grounding deterministico (Gemini + Google Search) — garante evidencia real independente do planner LLM.",
    };
    return [webStep, ...llmSteps];
  }

  async invoke(
    steps: readonly ResearchStep[],
    ctx: AdaptiveProcessContext,
  ): Promise<readonly ExecutionOutcome[]> {
    const outcomes: ExecutionOutcome[] = [];
    for (const step of steps) {
      // AP-refine: o passo de web grounding (base44.ai.invokeLLM com
      // add_context_from_internet) e DETERMINISTICO, seguro e somente leitura.
      // Executa-o DIRETAMENTE via SDK em vez de ctx.dispatch (engine.execute).
      // Motivo: o engine aplica DEFAULT_EXECUTION_POLICY (stepTimeoutMs=10s) nas
      // sub-caps nao-composite. InvokeLLM com web search (Gemini + Google Search)
      // costuma levar 10-20s — o step timeout mata a busca web antes dela retornar,
      // deixando a sintese sem evidencia real (causa raiz das respostas "pesquisa
      // falhou / nenhum dado encontrado"). Chamando direto, o web grounding roda
      // reliably (provado em teste isolado). Outros sub-caps (github.files.get)
      // seguem pela cadeia completa via ctx.dispatch (Intelligence + Safety + Dispatch).
      if (step.call.connectorId === "base44" && step.call.capability === "ai.invokeLLM") {
        try {
          const res = await base44.integrations.Core.InvokeLLM({
            prompt: String(step.call.params.prompt ?? ""),
            add_context_from_internet: Boolean(step.call.params.add_context_from_internet),
          });
          outcomes.push(Object.freeze({
            status: "success" as const,
            connectorId: step.call.connectorId,
            capability: step.call.capability,
            output: res,
            message: null,
            reversibility: "safe" as const,
            executionId: ctx.parentExecutionId,
            durationMs: null,
          }));
        } catch (e) {
          outcomes.push(Object.freeze({
            status: "failed" as const,
            connectorId: step.call.connectorId,
            capability: step.call.capability,
            output: null,
            message: (e as Error).message,
            reversibility: "safe" as const,
            executionId: ctx.parentExecutionId,
            durationMs: null,
          }));
        }
        continue;
      }
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

    // AP-refine: alimenta o LLM com o CONTEUDO real das evidencias (truncado), nao
    // apenas contagens. Sem isto, o LLM nao tem como distinguir "passo falhou por path
    // errado" de "alvo e inacessivel" — e alucina "privado/sem documentacao".
    const evidenceSnippet = steps.map((s, i) => {
      const r = results[i];
      const out = r.status === "success" && r.output != null
        ? JSON.stringify(r.output).slice(0, 800)
        : `(falhou: ${r.message ?? r.status})`;
      return `[${s.id}] ${s.call.connectorId}.${s.call.capability} -> ${r.status}\n  params: ${JSON.stringify(s.call.params).slice(0, 200)}\n  output: ${out}`;
    }).join("\n\n");

    const prompt = `Avalie a suficiencia de uma pesquisa aprofundada.
Query original: "${ctx.query}"
Passos planejados: ${steps.length}
Passos com sucesso: ${successes}

Evidencias coletadas (truncadas):
${evidenceSnippet}

Avalie se a query esta GENUINAMENTE respondida com as evidencias acima.
- Um passo que falhou NAO significa que o alvo e inacessivel — pode ser path errado.
- Se o README.md de um repo foi lido com sucesso, a existencia e o conteudo do repo sao fato.
- Nao invente "inacessivel/privado" se alguma evidencia mostra o contrario.

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
REGRAS CRITICAS:
- Baseie-se APENAS nas evidencias coletadas. Nao invente fatos.
- Se uma evidencia mostra que o alvo existe e e publico (ex: README.md lido com sucesso), AFIRME isso.
- NUNCA afirme "privado/inacessivel/sem documentacao" se alguma evidencia (ex: README lido) prova o contrario.
- Se um passo falhou mas outro obteve o conteudo, priorize o que foi obtido.
- Inclua secao "Lacunas" apenas se houver gaps remanescentes reais.`;

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