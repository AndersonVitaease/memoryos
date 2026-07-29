/**
 * MultiIntentEngine.ts — Motor de Múltiplas Intenções (Parte 2: Orquestrador)
 *
 * Recebe pedaços JÁ CLASSIFICADOS (não sabe nem se importa como foram
 * separados — essa é responsabilidade do Decompositor, Parte 4/5), e
 * dispara a execução de cada um, reaproveitando o que já existe
 * (conectores, capacidades). Junta os resultados numa resposta só.
 */

import type {
  ClassifiedIntent,
  IntentExecutionResult,
  IntentExecutor,
  MultiIntentOutcome,
} from "./IntentTypes";

const MAX_INTENTS_PER_MESSAGE = 6;

export class MultiIntentEngine {
  constructor(private readonly executor: IntentExecutor) {}

  async executeAll(intents: ClassifiedIntent[]): Promise<MultiIntentOutcome> {
    const t0 = Date.now();

    if (intents.length === 0) {
      return { handled: false, totalIntents: 0, results: [], aggregatedResponse: null, durationMs: Date.now() - t0 };
    }

    const capped = intents.slice(0, MAX_INTENTS_PER_MESSAGE);
    if (capped.length < intents.length) {
      console.warn(`[MultiIntentEngine] Mensagem tinha ${intents.length} pedidos — limitado aos primeiros ${MAX_INTENTS_PER_MESSAGE}.`);
    }

    const results = await Promise.all(
      capped.map(async (intent) => {
        const tIntent = Date.now();
        try {
          return await this.executor.execute(intent);
        } catch (err) {
          return {
            intent,
            success: false,
            response: null,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - tIntent,
          } as IntentExecutionResult;
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const aggregatedResponse = successCount > 0 ? this._aggregate(results) : null;

    console.log("[MultiIntentEngine] Resultado:", {
      totalIntents: capped.length,
      successCount,
      durationMs: Date.now() - t0,
    });

    return {
      handled: successCount > 0,
      totalIntents: capped.length,
      results,
      aggregatedResponse,
      durationMs: Date.now() - t0,
    };
  }

  private _aggregate(results: IntentExecutionResult[]): string {
    const sorted = [...results].sort((a, b) => a.intent.order - b.intent.order);
    const successful = sorted.filter((r) => r.success && r.response);

    let lastQuestion: string | null = null;
    const contents = successful
      .map((r) => {
        const { content, question } = this._splitTrailingQuestion(r.response as string);
        if (question) lastQuestion = question;
        return content;
      })
      .filter((c) => c.length > 0);

    let combined = contents.join("\n\n");
    if (lastQuestion) combined += `\n\n${lastQuestion}`;
    return combined;
  }

  private _splitTrailingQuestion(text: string): { content: string; question: string | null } {
    const trimmed = text.trim();
    const paragraphs = trimmed.split(/\n{2,}/);
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.trim().endsWith("?") && last.trim().split(/\s+/).length <= 40) {
      return {
        content: paragraphs.slice(0, -1).join("\n\n").trim(),
        question: last.trim(),
      };
    }
    return { content: trimmed, question: null };
  }
}
