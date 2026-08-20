/**
 * OpenRouterLLMProvider.ts — envolve a function de backend openrouterChat
 * ja existente. Da acesso a Gemini/GPT/Claude/etc via uma API so, e (em
 * modelos que suportam) cache de prompt nativo — o que o InvokeLLM do
 * Base44 nao expoe.
 */
import { base44 } from "@/api/base44Client";
import type { AIProvider, AIProviderInvokeOptions, AIProviderResult } from "./AIProviderTypes";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export class OpenRouterLLMProvider implements AIProvider {
  readonly id = "openrouter-llm";
  readonly name = "OpenRouter";
  readonly capabilities = ["text-generation"] as const;

  async isAvailable(): Promise<boolean> {
    // A function ja checa a secret no backend; aqui so confirmamos que
    // a chamada nao falha por falta de configuracao (checagem leve).
    try {
      const res = await base44.functions.invoke("openrouterListModels", {});
      const d = (res as any)?.data ?? res;
      return !d?.error;
    } catch {
      return false;
    }
  }

  async invoke(prompt: string, options?: AIProviderInvokeOptions): Promise<AIProviderResult> {
    const t0 = Date.now();
    try {
      // Se systemPrompt for passado, enviamos como mensagem system separada
      // (permite prompt caching no OpenRouter para modelos que suportam)
      const messages = options?.systemPrompt
        ? [{ role: "system", content: options.systemPrompt }, { role: "user", content: prompt }]
        : [{ role: "user", content: prompt }];
      const res = await base44.functions.invoke("openrouterChat", {
        model: options?.model ?? DEFAULT_MODEL,
        messages,
        maxTokens: options?.maxTokens ?? 1024,
      });
      const d = (res as any)?.data ?? res;
      if (d?.error) {
        return { success: false, text: null, model: options?.model ?? DEFAULT_MODEL, durationMs: Date.now() - t0, error: d.error };
      }
      return {
        success: true,
        text: d.reply ?? null,
        model: d.model ?? options?.model ?? DEFAULT_MODEL,
        usage: d.usage ? {
          promptTokens: d.usage.prompt_tokens,
          completionTokens: d.usage.completion_tokens,
          totalTokens: d.usage.total_tokens,
          cachedTokens: d.usage.cached_tokens ?? d.usage.prompt_tokens_details?.cached_tokens,
          cacheWriteTokens: d.usage.cache_write_tokens ?? d.usage.prompt_tokens_details?.cache_write_tokens,
          cost: d.usage.cost ?? d.usage.total_cost,
        } : null,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        success: false,
        text: null,
        model: options?.model ?? DEFAULT_MODEL,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const openRouterLLMProvider = new OpenRouterLLMProvider();