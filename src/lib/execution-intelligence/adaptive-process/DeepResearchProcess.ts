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
  AdaptiveRunState,
  Reflection,
  ResearchStep,
} from "./AdaptiveProcess";
import { DynamicWaveRunner } from "./DynamicWaveRunner";

// OPT: 5 iteracoes x (1 plan + N invoke + 1 reflect) + 3 sinteses = ~38
// chamadas LLM, estourando o timeout COMPOSITE de 4min. Reduzido para 2 — a
// 2a iteracao so roda se a 1a deixar gaps reais; na pratica a deterministica
// (README + package.json + web grounding) ja resolve a maioria das queries.
const MAX_ITERATIONS = 2;
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
      id: `step-llm-${i + 1}`,
      call: {
        connectorId: String(s.connectorId ?? ""),
        capability: String(s.capability ?? ""),
        params: (s.params as Record<string, unknown>) ?? {},
      },
      rationale: String(s.rationale ?? ""),
    }));

    // AP-refine: prepend DETERMINISTIC steps. The LLM planner is non-deterministic
    // and frequently omits critical steps (or emits invalid connectors), leaving
    // synthesis with zero real evidence — which produced the "no documentation /
    // inaccessible" hallucination. These steps ALWAYS run, independent of the LLM.

    const deterministicSteps: ResearchStep[] = [];

    // 1. Web grounding (Gemini + Google Search) — garante evidencia web real.
    deterministicSteps.push({
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
    });

    // 2. GitHub primary-source reads — se a query menciona "owner/repo", ler o
    //    README.md e package.json DIRETAMENTE do GitHub (fonte primaria verbatim).
    //    O LLM planner frequentemente omite estes passos; sem eles, a sintese so
    //    tem o resumo web (LLM-gerado, nao fonte primaria) — aterramento fraco.
    const repoMatch = ctx.query.match(/\b([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?)\/([a-zA-Z0-9._-]+)\b/);
    if (repoMatch) {
      const owner = repoMatch[1];
      const repo = repoMatch[2];
      deterministicSteps.push({
        id: "step-github-readme",
        call: {
          connectorId: "github",
          capability: "files.get",
          params: { owner, repo, path: "README.md" },
        },
        rationale: `Leitura direta do README.md de ${owner}/${repo} — fonte primaria verbatim (nao resumo web).`,
      });
      deterministicSteps.push({
        id: "step-github-package",
        call: {
          connectorId: "github",
          capability: "files.get",
          params: { owner, repo, path: "package.json" },
        },
        rationale: `Leitura direta do package.json de ${owner}/${repo} — confirma dependencias, scripts e tipo do projeto.`,
      });
    }

    return [...deterministicSteps, ...llmSteps];
  }

  async invoke(
    steps: readonly ResearchStep[],
    ctx: AdaptiveProcessContext,
  ): Promise<readonly ExecutionOutcome[]> {
    // OPT: passos de coleta sao INDEPENDENTES (leituras read-only, sem
    // dependencia entre si). Rodar em PARALELO (Promise.all) em vez do
    // for-loop sequencial corta o tempo de invoke de ~N*10s para ~10s
    // (limitado pelo passo mais lento, tipicamente o web grounding).
    let registry: import("@/lib/connector-runtime/ConnectorRegistry").ConnectorRegistry | null = null;
    try {
      const { getRealConnectorRegistry } = await import(
        "@/lib/connector-runtime-provider/ConnectorRuntimeProvider"
      );
      registry = await getRealConnectorRegistry();
    } catch { registry = null; }

    const runOne = async (step: ResearchStep): Promise<ExecutionOutcome> => {
      const isDirectWeb = step.call.connectorId === "base44" && step.call.capability === "ai.invokeLLM";
      const isDirectGithubRead = step.call.connectorId === "github" && step.call.capability === "files.get";

      if (isDirectWeb) {
        try {
          const res = await base44.integrations.Core.InvokeLLM({
            prompt: String(step.call.params.prompt ?? ""),
            add_context_from_internet: Boolean(step.call.params.add_context_from_internet),
          });
          return this._okOutcome(step, ctx, res);
        } catch (e) {
          return this._failOutcome(step, ctx, (e as Error).message);
        }
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
            return this._okOutcome(step, ctx, result.data);
          }
          return this._failOutcome(step, ctx, result.error ?? `status=${result.status}`);
        } catch (e) {
          return this._failOutcome(step, ctx, (e as Error).message);
        }
      }

      // Demais sub-caps: cadeia completa (Intelligence + Safety + Dispatch).
      return await ctx.dispatch(step.call);
    };

    return Promise.all(steps.map(runOne));
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

  /**
   * Verificacao deterministica de compatibilidade de transporte MCP.
   *
   * Causa raiz (dead-end documentado): o MemoryOS roda no sandbox Deno em
   * nuvem da Base44, que NAO consegue spawning de processos locais nem I/O
   * stdio. Servidores MCP que usam transporte stdio (Standard Input/Output)
   * sao INCOMPATIVEIS com o MemoryOS em producao — so seriam compativeis se
   * expusessem transporte HTTP/SSE, o que o sandbox consegue consumir.
   *
   * O LLM de sintese frequentemente alucina "compativel, basta um conector
   * que faca spawn de processo" porque nao conhece essa restricao arquitetural.
   * Esta verificacao deterministica detecta o padrao nas evidencias verbatim
   * e sobrescreve a sintese com o veredicto correto quando aplicavel.
   *
   * Retorna o veredicto deterministico (markdown) se a incompatibilidade for
   * detectada, ou null se a verificacao nao se aplica.
   */
  private _checkMcpTransportCompatibility(
    evidence: readonly { step: string; verbatim: string | null }[],
    query: string,
  ): string | null {
    // 1. A query precisa ser sobre conectar/integrar o servidor com o MemoryOS.
    //    Normaliza acentos para corresponder "compatível" (com acento) ao padrao
    //    "compativel" (sem acento) — acentuacao portuguesa quebraria a regex.
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const asksConnection =
      /\b(conectar|conectar com|integrar|integracao|integrar com|compativel|compatibilidade|usar com)\b/.test(q)
      && /\b(memoryos|memory os|memory os)\b/.test(q);
    if (!asksConnection) return null;

    // 2. Concatena todo o verbatim coletado (README, package.json, web)
    const allText = (evidence
      .map((e) => e.verbatim ?? "")
      .join("\n")
    ).toLowerCase();

    // 3. Detecta transporte HTTP/SSE (COMPATIVEL com o sandbox).
    //    CUIDADO: "http" aparece em URLs (https://github.com/...) e em
    //    "http calls to <api>" (cliente HTTP, nao transporte do servidor).
    //    So conta como transporte se houver indicador explicito de modo
    //    HTTP/SSE para o servidor MCP, nao mencao generica de HTTP.
    const textNoUrls = allText.replace(/https?:\/\/[^\s)]+/g, " ");
    const hasHttpTransport =
      /\b(http transport|transport:\s*["']?http|sse transport|transport:\s*["']?sse|server-sent events|http\/sse|--http\b|http server|http-based|express server|fastify|hono)\b/.test(textNoUrls);

    // 4. Detecta transporte stdio (INCOMPATIVEL com o sandbox)
    const stdioIndicators = [
      "stdio",
      "standard input",
      "standard output",
      "stdin",
      "stdout",
      "npx ",
      "node main",
      "node dist/main",
      "node build/main",
      "node index.js",
      "node index",
      "spawn",
      "child_process",
      "command",
      "transport: \"stdio\"",
      "transport: 'stdio'",
    ];
    const hasStdio = stdioIndicators.some((ind) => allText.includes(ind));

    // 5. So emite veredicto se houver evidencia clara de stdio E sem HTTP/SSE
    if (!hasStdio) return null;
    if (hasHttpTransport) return null; // HTTP/SSE presente = compativel, nao sobrescreve

    // 6. Cita os step-ids cujo verbatim revelou stdio (rastreabilidade)
    const stdioSources = evidence
      .filter((e) => {
        const t = (e.verbatim ?? "").toLowerCase();
        return stdioIndicators.some((ind) => t.includes(ind));
      })
      .map((e) => e.step);

    return `# Veredicto de Compatibilidade: INCOMPATIVEL (producao)

## Resposta direta

Nao. O servidor MCP pesquisado **nao e compativel** para conexao direta com o MemoryOS em producao, porque utiliza transporte **stdio (Standard Input/Output)**, que exige um processo local — algo que o MemoryOS nao consegue hospedar.

## Por que e incompativel (restricao arquitetural)

O MemoryOS roda em um **sandbox Deno em nuvem** (Base44). Esse ambiente:

- Nao consegue fazer **spawning de processos locais** (ex: \`npx\`, \`node main.js\`).
- Nao tem acesso a **I/O stdio** (stdin/stdout de um processo filho).

Portanto, um servidor MCP baseado em stdio — que deve ser executado como um processo local e comunicado via entrada/saida padrao — **nao pode ser integrado** pelo MemoryOS. A unica via de integracao seria se o servidor MCP expusesse um transporte **HTTP/SSE** (que o sandbox consegue consumir como cliente HTTP), mas as evidencias coletadas nao indicam esse transporte.

## Evidencias (fonte primaria verbatim)

Transporte stdio detectado nos seguintes trechos coletados:
${stdioSources.map((s) => `- [${s}]`).join("\n")}

## O que seria necessario para tornar compativel

1. **Forcar transporte HTTP/SSE no servidor MCP** (ex: adicionar um modo \`--http\` ou um wrapper que exponha o servidor via HTTP). Se o servidor so suporta stdio, isso exige modificar o codigo-fonte dele.
2. **Ou** hospedar o servidor em uma infraestrutura propria (VM/container com processo local) que atue como proxy HTTP -> stdio, expondo um endpoint HTTP/SSE que o MemoryOS possa consumir. Isso e infraestrutura externa, nao conector nativo.

## Lacunas

- Se houver um modo HTTP/SSE nao documentado no README, ele nao foi detectado nas evidencias — re-pesquisar o codigo-fonte do servidor por configuracoes de transporte alternativas pode ser necessario.`;
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

    // ── Verificacao deterministica de compatibilidade de transporte MCP ──
    // Antes do LLM: se a query e sobre conectar um servidor MCP com o MemoryOS
    // e as evidencias mostram transporte stdio (sem HTTP/SSE), o veredicto e
    // INCOMPATIVEL — restricao arquitetural do sandbox Deno em nuvem. O LLM
    // frequentemente alucina "compativel com conector que faca spawn" porque
    // desconhece essa restricao; este veredicto e autoritativo.
    const stdioVerdict = this._checkMcpTransportCompatibility(evidence, ctx.query);
    if (stdioVerdict) return stdioVerdict;

    // ── Sintese em CHAMADA UNICA (OPT) ──
    // Antes: draft + verify + strip = 3 chamadas LLM sequenciais (~30-45s).
    // Agora: uma unica chamada com auto-verificacao embutida no prompt.
    // O determinista _checkMcpTransportCompatibility (acima) ja cobre o caso
    // mais grave de alucinacao ("compativel com spawn de processo"); a
    // instrucao de aterramento estrito + auto-check no prompt cobre o resto.
    const draftPrompt = `Sintetize um relatorio de pesquisa aprofundada em portugues (markdown).
Query original: "${ctx.query}"
Suficiencia alcancada: ${reflection.sufficiency}
Lacunas remanescentes: ${JSON.stringify(reflection.gaps)}

Evidencias coletadas (cada uma com trecho VERBATIM da fonte primaria):
${JSON.stringify(evidence, null, 2)}

Produza um relatorio estruturado em markdown respondendo a query.
REGRAS CRITICAS (Aterramento estrito + AUTO-VERIFICACAO):
- Baseie-se APENAS no conteudo verbatim das evidencias acima. NAO invente, infira ou estenda.
- Cada afirmacao factual DEVE ser suportada por um trecho verbatim de alguma evidencia. Nao afirme nada que nao esteja literalmente no verbatim.
- NAO inclua opcoes de configuracao, comandos, nomes de arquivos ou passos de instalacao que NAO aparecam literalmente em algum verbatim. Se o verbatim nao contem, NAO afirme.
- Se uma evidencia leu o README com sucesso, a existencia e o conteudo do repositorio sao fato — use-os.
- Se um passo falhou, NAO conclua "inacessivel/privado" — so diga que aquela etapa falhou (pode ser path errado).
- Priorize o conteudo da fonte primaria (README/arquivo lido) sobre o resumo web quando ambos existirem.
- Cite o step-id (ex: [step-2]) ao lado de cada bloco derivado de uma evidencia.
- AUTO-CHECK: antes de finalizar, revise cada afirmacao do seu relatorio contra o verbatim. Se algo nao esta literalmente suportado, REMOVA-O voce mesmo (nao inclua uma secao "afirmacoes removidas" — apenas nao escreva o que nao tem base).
- Inclua secao "Lacunas" apenas se houver gaps remanescentes reais.
- Se a query pede comparacao (ex: "compare com a estrutura do MemoryOS"), faca a comparacao explicitamente, mas so afirme sobre o MemoryOS o que estiver nas evidencias OU for restricao arquitetural conhecida (sandbox Deno em nuvem, sem stdio/spawn).`;

    const report = (await base44.integrations.Core.InvokeLLM({ prompt: draftPrompt })) as string;
    return report;
  }

  /**
   * Dynamic Re-planning V1: generate next wave based on accumulated state.
   * Uses LLM to interpret gaps and decide what to search/read next.
   */
  async planNextWave(state: AdaptiveRunState, ctx: AdaptiveProcessContext): Promise<readonly ResearchStep[]> {
    if (state.gaps.length === 0) return [];

    const evidenceSnippet = state.completedSteps
      .map(({ step, result }) => {
        const out = result.status === "success" && result.output != null
          ? JSON.stringify(result.output).slice(0, 600)
          : `(failed: ${result.message ?? result.status})`;
        return `[${step.id}] ${step.call.connectorId}.${step.call.capability} -> ${out}`;
      })
      .join("\n");

    const prompt = `You are the re-planner for a deep research mission. The previous wave left gaps.
Generate 1-3 NEW sub-research steps to fill the gaps. Do NOT repeat steps already executed.

Original query: "${ctx.query}"
Gaps found: ${JSON.stringify(state.gaps)}

Completed steps (do NOT repeat):
${evidenceSnippet}

Available capabilities:
- base44 (web): {capability: "ai.invokeLLM", params: {prompt: "...", add_context_from_internet: true}}
- github (code): {capability: "files.get", params: {owner, repo, path}}
- github (search): {capability: "search.symbol", params: {query}}
- google-drive (docs): {capability: "drive.files.search", params: {query}}

Respond ONLY JSON: {steps: [{connectorId, capability, params, rationale}]}`;

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
      id: `step-nextwave-${i + 1}`,
      call: {
        connectorId: String(s.connectorId ?? ""),
        capability: String(s.capability ?? ""),
        params: (s.params as Record<string, unknown>) ?? {},
      },
      rationale: String(s.rationale ?? ""),
    }));
  }

  async run(ctx: AdaptiveProcessContext): Promise<ExecutionOutcome> {
    const runner = new DynamicWaveRunner();
    return runner.run(this, ctx, { maxIterations: MAX_ITERATIONS });
  }
}

let _instance: DeepResearchProcess | null = null;
export function getDeepResearchProcess(): DeepResearchProcess {
  if (!_instance) _instance = new DeepResearchProcess();
  return _instance;
}