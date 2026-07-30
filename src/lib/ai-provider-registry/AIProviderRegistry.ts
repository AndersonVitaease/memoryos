/**
 * AIProviderRegistry.ts — registro central de providers de IA.
 *
 * Mesmo padrao do ConnectorRegistry: registra, lista por capacidade,
 * permite ao orquestrador escolher qual provider usar sem conhecer a
 * implementacao especifica de cada um.
 *
 * IMPORTANTE: essa peca ainda NAO esta ligada no pipeline principal de
 * resposta do chat (ETAPA 6 do memoryReasoningPlanner.js continua usando
 * InvokeLLM direto). Isso e proposital — primeiro se prova que o registro
 * funciona isolado, depois (em mudanca separada, testada com calma) o
 * ETAPA 6 passa a usar isso.
 */
import type { AIProvider } from "./AIProviderTypes";
import { base44LLMProvider } from "./Base44LLMProvider";
import { openRouterLLMProvider } from "./OpenRouterLLMProvider";

class AIProviderRegistryClass {
  private _providers: AIProvider[] = [];

  register(provider: AIProvider): void {
    if (this._providers.some((p) => p.id === provider.id)) return;
    this._providers.push(provider);
  }

  listProviders(): AIProvider[] {
    return [...this._providers];
  }

  /** Providers que declaram a capacidade pedida, na ordem de registro (preferencia). */
  findByCapability(capability: string): AIProvider[] {
    return this._providers.filter((p) => p.capabilities.includes(capability));
  }

  /**
   * Escolhe o primeiro provider disponivel para a capacidade — tenta na
   * ordem de preferencia, cai pro proximo se o anterior nao estiver
   * disponivel (ex: secret nao configurada).
   */
  async selectProvider(capability: string): Promise<AIProvider | null> {
    const candidates = this.findByCapability(capability);
    for (const p of candidates) {
      if (await p.isAvailable()) return p;
    }
    return null;
  }
}

export const aiProviderRegistry = new AIProviderRegistryClass();

let _registered = false;
export function ensureAIProvidersRegistered(): void {
  if (_registered) return;
  // Ordem = preferencia. OpenRouter primeiro (acesso a mais modelos +
  // potencial de cache de prompt), Base44 como fallback sempre disponivel.
  aiProviderRegistry.register(openRouterLLMProvider);
  aiProviderRegistry.register(base44LLMProvider);
  _registered = true;
  console.log("[AIProviderRegistry] Providers registrados:", aiProviderRegistry.listProviders().map((p) => p.id));
}
