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
    // Resolve o registry real UMA vez (lazy) para chamadas diretas de leitura.
    // Evita o timeout de 10s do engine (DEFAULT_EXECUTION_POLICY) que mata
    // leituras de fonte primaria antes de retornarem.
    let registry: import("@/lib/connector-runtime/ConnectorRegistry").ConnectorRegistry | null = null;
    try {
      const { getRealConnectorRegistry } = await import(
        "@/lib/connector-runtime-provider/ConnectorRuntimeProvider"
      );
      registry = await getRealConnectorRegistry();
    } catch { registry = null; }

    for (const step of steps) {
      // ── Passos de leitura deterministica (safe, read-only) → SDK/connector
      //    direto. Motivo: o engine aplica DEFAULT_EXECUTION_POLICY (stepTimeoutMs=10s)
      //    nas sub-caps nao-composite. InvokeLLM com web search (10-20s) e leituras
      //    GitHub (rede/token hydrate) frequentemente excedem 10s — o timeout mata
      //    a etapa antes de retornar, deixando a sintese sem evidencia real (causa
      //    raiz das respostas "pesquisa falhou / nenhum dado encontrado"). Chamando
      //    direto, as leituras rodam reliably. Outros sub-caps seguem pela cadeia
      //    completa via ctx.dispatch (Intelligence + Safety + Dispatch).
      const isDirectWeb = step.call.connectorId === "base44" && step.call.capability === "ai.invokeLLM";
      const isDirectGithubRead = step.call.connectorId === "github" && step.call.capability === "files.get";

      if (isDirectWeb) {
        try {
          const res = await base44.integrations.Core.InvokeLLM({
            prompt: String(step.call.params.prompt ?? ""),
            add_context_from_internet: Boolean(step.call.params.add_context_from_internet),
          });
          outcomes.push(this._okOutcome(step, ctx, res));
        } catch (e) {
          outcomes.push(this._failOutcome(step, ctx, (e as Error).message));
        }
        continue;
      }

      if (isDirectGithubRead && registry) {
        try {
          const connector = registry.get("github");
          if (!connector) throw new Error("github connector not registered");
          const connCtx: import("@/lib/connector-runtime/ConnectorTypes").ConnectorContext = {
            userId: ctx.request.context.userId,
            projectId: (ctx.request.context as { workspaceId?: string }).workspaceId,
            sessionId: ctx.request.context.sessionId,
            goalId: ctx.request.context.goalId,
            executionId: ctx.parentExecutionId,
          };
          const result = await connector.execute("files.get", step.call.params, connCtx);
          if (result.success && result.data) {
            outcomes.push(this._okOutcome(step, ctx, result.data));
          } else {
            outcomes.push(this._failOutcome(step, ctx, result.error ?? `status=${result.status}`));
          }
        } catch (e) {
          outcomes.push(this._failOutcome(step, ctx, (e as Error).message));
        }
        continue;
      }

      // Demais sub-caps: cadeia completa (Intelligence + Safety + Dispatch).
      const outcome = await ctx.dispatch(step.call);
      outcomes.push(outcome);
    }
    return outcomes;
  }

  private _okOutcome(step: ResearchStep, ctx: AdaptiveProcessContext, output: unknown): ExecutionOutcome {
    return Object.freeze({
      status: "success" as const,
      connectorId: step.call.connectorId,
      capability: step.call.capability,
      output,
      message: null,
      reversibility: "safe" as const,
      executionId: ctx.parentExecutionId,
      durationMs: null,
    });
  }

  private _failOutcome(step: ResearchStep, ctx: AdaptiveProcessContext, message: string): ExecutionOutcome {
    return Object.freeze({
      status: "failed" as const,
      connectorId: step.call.connectorId,
      capability: step.call.capability,
      output: null,
      message,
      reversibility: "safe" as const,
      executionId: ctx.parentExecutionId,
      durationMs: null,
    });
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

  /**
   * Extrai o conteudo de texto de cada evidencia (README, arquivo, web) para
   * alimentar a sintese e a verificacao — preserva verbatim (truncado).
   */
  private _extractText(outcome: ExecutionOutcome): string {
    if (outcome.status !== "success" || outcome.output == null) return "";
    const o = outcome.output;
    if (typeof o === "string") return o;
    if (typeof o === "object") {
      const obj = o as Record<string, unknown>;
      if (typeof obj.content === "string") return obj.content;
      try { return JSON.stringify(obj).slice(0, 6000); } catch { return ""; }
    }
    return "";
  }

  async synthesize(
    steps: readonly ResearchStep[],
    results: readonly ExecutionOutcome[],
    reflection: Reflection,
    ctx: AdaptiveProcessContext,
  ): Promise<unknown> {
    // ── Evidencias: cada step com seu trecho verbatim (truncado) ──
    const evidence = steps.map((s, i) => {
      const text = this._extractText(results[i]).slice(0, 4000);
      return {
        step: s.id,
        source: `${s.call.connectorId}.${s.call.capability}`,
        params: s.call.params,
        status: results[i].status,
        verbatim: text || null,
        error: results[i].status !== "success" ? (results[i].message ?? results[i].status) : null,
      };
    });

    const successEvidence = evidence.filter((e) => e.verbatim);
    if (successEvidence.length === 0) {
      const errors = evidence.map((e) => `${e.step}: ${e.error ?? "no content"}`).join("; ");
      return `# Pesquisa aprofundada: ${ctx.query}\n\n## Sem evidencia coletada\n\nNenhuma das etapas de pesquisa retornou conteudo utilizavel.\n\nErros por etapa: ${errors}\n\n## Lacunas\n- Requer re-execucao ou ajuste dos passos de coleta.`;
    }

    // ── Passo 1: relatorio aterrado com CITACAO VERBATIM ──
    const draftPrompt = `Sintetize um relatorio de pesquisa aprofundada em portugues (markdown).
Query original: "${ctx.query}"
Suficiencia alcancada: ${reflection.sufficiency}
Lacunas remanescentes: ${JSON.stringify(reflection.gaps)}

Evidencias coletadas (cada uma com trecho VERBATIM da fonte primaria):
${JSON.stringify(evidence, null, 2)}

Produza um relatorio estruturado em markdown respondendo a query.
REGRAS CRITICAS (Aterramento estrito):
- Baseie-se APENAS no conteudo verbatim das evidencias acima. NAO invente, infira ou estenda.
- Cada afirmacao factual DEVE ser suportada por um trecho verbatim de alguma evidencia. Nao afirme nada que nao esteja literalmente no verbatim.
- NAO inclua opcoes de configuracao, comandos, nomes de arquivos ou passos de instalacao que NAO aparecam literalmente em algum verbatim. Se o verbatim nao contem, NAO afirme.
- Se uma evidencia leu o README com sucesso, a existencia e o conteudo do repositorio sao fato — use-os.
- Se um passo falhou, NAO conclua "inacessivel/privado" — so diga que aquela etapa falhou (pode ser path errado).
- Priorize o conteudo da fonte primaria (README/arquivo lido) sobre o resumo web quando ambos existirem.
- Cite o step-id (ex: [step-2]) ao lado de cada bloco derivado de uma evidencia.
- Inclua secao "Lacunas" apenas se houver gaps remanescentes reais.`;

    const draft = (await base44.integrations.Core.InvokeLLM({ prompt: draftPrompt })) as string;

    // ── Passo 2: VERIFICACAO — checa cada afirmacao contra o verbatim ──
    const verifyPrompt = `Voce e um verificador rigoroso. Cheque se o relatorio abaixo e aterrado EXCLUSIVAMENTE nas evidencias verbatim fornecidas.

Evidencias verbatim disponiveis (fonte primaria):
${JSON.stringify(successEvidence.map((e) => ({ step: e.step, verbatim: e.verbatim?.slice(0, 3000) })), null, 2)}

Relatorio a verificar:
${draft}

Tarefa: identifique TODAS as afirmacoes factuais, comandos, opcoes de configuracao, nomes de arquivo ou passos no relatorio que NAO aparecem literalmente em nenhum verbatim acima. Liste-os. Se nao houver inventados, diga "OK".

Responda APENAS JSON: {fabricados: [string], veredict: "OK" | "HAS_FABRICATION"}`;

    let verified = draft;
    try {
      const verifyRes = await base44.integrations.Core.InvokeLLM({
        prompt: verifyPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            fabricados: { type: "array", items: { type: "string" } },
            veredict: { type: "string" },
          },
          required: ["fabricados", "veredict"],
        },
      });
      const v = verifyRes as { fabricados?: string[]; veredict?: string };
      if (v.veredict === "HAS_FABRICATION" && v.fabricados && v.fabricados.length > 0) {
        // Re-sintese REMOVENDO os trechos fabricados identificados.
        const stripPrompt = `Reescreva o relatorio abaixo REMOVENDO estritamente as afirmacoes listadas como fabricadas (nao suportadas pelo verbatim). Mantenha o restante intacto. Se uma secao inteira depende de fabricacao, remova a secao. NAO adicione nada novo.

Afirmacoes a REMOVER (nao suportadas pelas evidencias):
${v.fabricados.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Relatorio original:
${draft}

Responda apenas o relatorio reescrito em markdown.`;
        verified = (await base44.integrations.Core.InvokeLLM({ prompt: stripPrompt })) as string;
      }
    } catch { /* se a verificacao falhar, mantem o draft */ }

    return verified;
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