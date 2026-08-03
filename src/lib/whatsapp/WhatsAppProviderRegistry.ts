/**
 * WhatsAppProviderRegistry.ts — Registro central de provedores WhatsApp
 *
 * SRP: registrar e selecionar o provedor ativo.
 *
 * Open/Closed: novo provedor = registrar aqui. A Capability Layer
 * (WhatsAppConnector) nunca muda — apenas chama getActive().
 *
 * Padrao: singleton HMR-safe via globalThis (mesmo padrao do
 * KnowledgeRegistry, CognitiveEventBus, GoalCapabilityRegistry).
 *
 * Default: "meta-cloud" (API oficial da Meta). Para trocar (ex: para
 * Evolution API em desenvolvimento), chame setActive("evolution-api").
 */

import type { WhatsAppProvider } from "./WhatsAppProviderTypes";
import { MetaCloudProvider } from "./providers/MetaCloudProvider";
import { EvolutionAPIProvider } from "./providers/EvolutionAPIProvider";
import { BaileysProvider } from "./providers/BaileysProvider";

class WhatsAppProviderRegistryClass {
  private readonly _providers = new Map<string, WhatsAppProvider>();
  private _activeId: string = "meta-cloud";

  constructor() {
    // Registra todos os provedores conhecidos no load do modulo.
    // Meta Cloud e o default ativo; Evolution e Baileys ficam registrados
    // mas marcam isAvailable()=false ate serem implementados.
    this.register(new MetaCloudProvider());
    this.register(new EvolutionAPIProvider());
    this.register(new BaileysProvider());
  }

  register(provider: WhatsAppProvider): void {
    this._providers.set(provider.id, provider);
  }

  getActive(): WhatsAppProvider | null {
    return this._providers.get(this._activeId) ?? null;
  }

  setActive(id: string): boolean {
    if (!this._providers.has(id)) return false;
    this._activeId = id;
    return true;
  }

  getActiveId(): string {
    return this._activeId;
  }

  list(): readonly { id: string; displayName: string; isOfficial: boolean; available: boolean }[] {
    return [...this._providers.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isOfficial: p.isOfficial,
      available: p.isAvailable(),
    }));
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__WHATSAPP_PROVIDER_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new WhatsAppProviderRegistryClass();
}

export const whatsappProviderRegistry: WhatsAppProviderRegistryClass = (
  globalThis as unknown as Record<string, WhatsAppProviderRegistryClass>
)[_KEY];