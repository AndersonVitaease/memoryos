/**
 * Base44LLMProvider.ts — envolve o InvokeLLM gerenciado do Base44
 * (o caminho ja usado hoje em todo lugar). Serve de provider padrao/
 * fallback — sempre disponivel, sem configuracao extra.
 */
import { base44 } from "@/api/base44Client";
import type { AIProvider, AIProviderInvokeOptions, AIProviderResult } from "./AIProviderTypes";

export class Base44LLMProvider implements AIProvider {
  readonly id = "base44-llm";
  readonly name = "Base44 (gerenciado)";
  readonly capabilities = ["text-generation"] as const;

  async isAvailable(): Promise<boolean> {
    return true; // gerenciado pelo Base44, sempre disponivel
  }

  async invoke(prompt: string, options?: AIProviderInvokeOptions): Promise<AIProviderResult> {
    const t0 = Date.now();
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        ...(options?.model ? { model: options.model } : {}),
        ...(options?.responseJsonSchema ? { response_json_schema: options.responseJsonSchema } : {}),
      });
      return {
        success: true,
        text: typeof result === "string" ? result : JSON.stringify(result),
        model: options?.model ?? "base44-default",
        usage: null,
        durationMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        success: false,
        text: null,
        model: options?.model ?? "base44-default",
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const base44LLMProvider = new Base44LLMProvider();
