/**
 * StaticAnalysisEngine.ts — Sprint M1.12
 *
 * SRP: Receber um ExecutionPlan + userMessage e retornar um relatório textual
 *      sem executar nenhum connector, nenhum Runtime, nenhuma chamada de rede.
 *
 * Responsabilidades:
 *   - Construir prompt de análise arquitetural com base no goalType e parameters
 *   - Chamar InvokeLLM para gerar o relatório
 *   - Retornar string com o resultado
 *
 * NÃO faz:
 *   - Executar connectors
 *   - Chamar Runtime ou ExecutionDispatcher
 *   - Chamar UniversalConnectorRouter
 *   - Executar capabilities
 *   - Qualquer chamada HTTP
 */

import type { ExecutionPlan } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import { base44 }             from "@/api/base44Client";

// ── StaticAnalysisEngine ──────────────────────────────────────────────────────

export interface StaticAnalysisResult {
  readonly handled:    true;
  readonly response:   string;
  readonly goalType:   string;
  readonly durationMs: number;
}

export class StaticAnalysisEngine {

  /**
   * Analyzes the intent expressed by the ExecutionPlan using the LLM.
   * No connectors are invoked. No runtime is called. Pure LLM reasoning.
   */
  async analyze(plan: ExecutionPlan, userMessage: string): Promise<StaticAnalysisResult> {
    const t0 = Date.now();

    const prompt = this._buildPrompt(plan, userMessage);

    const llmResponse = await base44.integrations.Core.InvokeLLM({ prompt });

    const response = typeof llmResponse === "string"
      ? llmResponse
      : JSON.stringify(llmResponse);

    return Object.freeze({
      handled:    true,
      response,
      goalType:   plan.goalType,
      durationMs: Date.now() - t0,
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _buildPrompt(plan: ExecutionPlan, userMessage: string): string {
    const stepsDesc = plan.steps.length > 0
      ? plan.steps.map((s) =>
          `  - ${s.connector}.${s.capability}(${JSON.stringify(s.parameters)})`
        ).join("\n")
      : "  (nenhum step — goal resolvido como conversa geral)";

    return `Voce e o MemoryOS, um assistente de memoria inteligente operando em modo de analise estatica.

Neste modo voce NAO executa conectores nem acessa sistemas externos.
Voce apenas analisa a intencao do usuario e responde com base no seu conhecimento interno.

MENSAGEM DO USUARIO:
"${userMessage}"

INTENCAO CLASSIFICADA PELO SISTEMA:
- GoalType: ${plan.goalType}
- Parametros extraidos: ${JSON.stringify(plan.parameters ?? {})}
- Steps que seriam executados (modo live):
${stepsDesc}

INSTRUCAO:
Responda a mensagem do usuario com base exclusivamente no seu conhecimento.
Nao mencione conectores, capabilities, planos de execucao ou detalhes tecnicos internos.
Se a mensagem for sobre codigo, arquitetura ou auditoria de sistemas, realize a analise diretamente.
Seja direto, claro e util.`;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__STATIC_ANALYSIS_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new StaticAnalysisEngine();
}

export const staticAnalysisEngine: StaticAnalysisEngine = (
  globalThis as unknown as Record<string, StaticAnalysisEngine>
)[_KEY];