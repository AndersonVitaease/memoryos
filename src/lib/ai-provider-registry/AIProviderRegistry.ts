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
  // Cache de disponibilidade por provider — evita request de rede a cada mensagem.
  // TTL de 5 minutos; null = ainda não verificado.
  private _availabilityCache = new Map<string, { available: boolean; expiresAt: number }>();
  private readonly _CACHE_TTL_MS = 5 * 60 * 1000;

  register(provider: AIProvider): void {
    if (this._providers.some((p) => p.id === provider.id)) return;
    this._providers.push(provider);
  }

  listProviders(): AIProvider[] {
    return [...this._providers];
  }

  findByCapability(capability: string): AIProvider[] {
    return this._providers.filter((p) => p.capabilities.includes(capability));
  }

  private async _isAvailableCached(provider: AIProvider): Promise<boolean> {
    const cached = this._availabilityCache.get(provider.id);
    if (cached && Date.now() < cached.expiresAt) return cached.available;
    const available = await provider.isAvailable();
    this._availabilityCache.set(provider.id, { available, expiresAt: Date.now() + this._CACHE_TTL_MS });
    return available;
  }

  async selectProvider(capability: string): Promise<AIProvider | null> {
    const candidates = this.findByCapability(capability);
    for (const p of candidates) {
      if (await this._isAvailableCached(p)) return p;
    }
    return null;
  }
}

export const aiProviderRegistry = new AIProviderRegistryClass();

let _registered = false;
export function ensureAIProvidersRegistered(): void {
  if (_registered) return;
  aiProviderRegistry.register(openRouterLLMProvider);
  aiProviderRegistry.register(base44LLMProvider);
  _registered = true;
  console.log("[AIProviderRegistry] Providers registrados:", aiProviderRegistry.listProviders().map((p) => p.id));
  // Pré-aquece o cache de disponibilidade em background — sem await,
  // para que a primeira mensagem do usuário não precise esperar pela verificação.
  aiProviderRegistry.selectProvider("text-generation").catch(() => {});
}