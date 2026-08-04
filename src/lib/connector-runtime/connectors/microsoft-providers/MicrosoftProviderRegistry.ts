/**
 * MicrosoftProviderRegistry.ts — Registro central de provedores de acesso ao
 * Microsoft Graph (ADR-014 / RFC-007).
 *
 * SRP: registrar provedores e resolver qual provedor executa uma operation
 * para uma conta (workspaceId) dada.
 *
 * Open/Closed: novo provedor = registrar aqui. O shell (MicrosoftGraphConnector)
 * nunca muda — apenas chama resolveProvider().
 *
 * Padrao: singleton HMR-safe via globalThis (mesmo padrao do
 * WhatsAppProviderRegistry, KnowledgeRegistry, CognitiveEventBus).
 *
 * Lineup (estado apos Fases 1-3):
 *   - official-graph  (OfficialGraphProvider) — ativo, cobre as 32 operations
 *   - mcp-microsoft   (McpMicrosoftProvider)  — stub, operations=[]
 *   - rest-sdk        (RestSdkProvider)        — stub, operations=[]
 *   - base44-outlook (Base44OutlookProvider) — Fase 4, cobre 8 ops core via App-User Connector
 *
 * Politica de resolucao (resolveProvider):
 *   1. Preferido declarado para a operation (se cobre e esta disponivel).
 *   2. Primeiro provedor disponivel que cobre a operation (selecao multi-provider).
 *   3. Fallback: primeiro provedor que cobre a operation (mesmo indisponivel) —
 *      preserva paridade com o shell antigo: o provedor emite seu proprio erro
 *      de "nao conectado" em vez de o router devolver "Unknown operation".
 *   4. null se nenhum provedor cobre a operation → shell emite "Unknown operation".
 */
import type {
  MicrosoftProvider,
  MicrosoftAccountInfo,
} from "./MicrosoftProviderTypes";
import { OfficialGraphProvider, listOfficialAccounts } from "./OfficialGraphProvider";
import { McpMicrosoftProvider } from "./McpMicrosoftProvider";
import { RestSdkProvider } from "./RestSdkProvider";
import { Base44OutlookProvider } from "./Base44OutlookProvider";

class MicrosoftProviderRegistryClass {
  private readonly _providers = new Map<string, MicrosoftProvider>();
  private readonly _preferred = new Map<string, string>();

  constructor() {
    // Ordem de registro = ordem de precedencia no passo 2.
    // OfficialGraph primeiro para que, quando base44-outlook for adicionado,
    // ele seja fallback (a menos que setPreferred o inverta).
    this.register(OfficialGraphProvider);
    this.register(McpMicrosoftProvider);
    this.register(RestSdkProvider);
    // Fase 4: Base44Outlook apos os stubs — OfficialGraph segue como default
    // (passo 2). Base44Outlook vira fallback das 8 ops core quando o app user
    // conecta via App-User Connector mas nao tem OAuth proprio conectado.
    this.register(Base44OutlookProvider);
  }

  register(provider: MicrosoftProvider): void {
    this._providers.set(provider.id, provider);
  }

  /**
   * Resolve o provedor para (operation, workspaceId).
   * Ver political de resolucao no header do arquivo.
   */
  async resolveProvider(
    operation: string,
    workspaceId: string,
  ): Promise<MicrosoftProvider | null> {
    // 1. Preferido declarado (se cobre e esta disponivel).
    const prefId = this._preferred.get(operation);
    if (prefId) {
      const p = this._providers.get(prefId);
      if (p && p.operations.includes(operation) && await p.isAvailable(workspaceId)) {
        return p;
      }
    }

    // 2. Primeiro provedor disponivel que cobre a operation.
    for (const p of this._providers.values()) {
      if (!p.operations.includes(operation)) continue;
      if (await p.isAvailable(workspaceId)) return p;
    }

    // 3. Fallback: primeiro provedor que cobre a operation (mesmo indisponivel).
    //    Preserva paridade — o provedor emite "nao conectado" em vez de
    //    o router devolver "Unknown operation".
    for (const p of this._providers.values()) {
      if (p.operations.includes(operation)) return p;
    }

    // 4. Nenhum provedor cobre a operation.
    return null;
  }

  /** Define qual provedor e preferido para uma operation (override manual). */
  setPreferred(operation: string, providerId: string): boolean {
    if (!this._providers.has(providerId)) return false;
    this._preferred.set(operation, providerId);
    return true;
  }

  /** Lista provedores registrados (para UI/diagnostics). */
  list(): readonly {
    id: string;
    displayName: string;
    isOfficial: boolean;
    operationsCount: number;
  }[] {
    return [...this._providers.values()].map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isOfficial: p.isOfficial,
      operationsCount: p.operations.length,
    }));
  }

  /**
   * Lista contas conhecidas (para UI de switcher multi-conta).
   * Hoje so o OfficialGraph declara contas (via MicrosoftAuthSession).
   * Stub pronto para a UI da Fase 2/4; sem consumidor ativo hoje.
   */
  async listAccounts(): Promise<MicrosoftAccountInfo[]> {
    return listOfficialAccounts();
  }
}

// ── Singleton HMR-safe (mesmo padrao do WhatsAppProviderRegistry) ────────────

const _KEY = "__MICROSOFT_PROVIDER_REGISTRY__";
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g[_KEY]) {
  _g[_KEY] = new MicrosoftProviderRegistryClass();
}

export const microsoftProviderRegistry: MicrosoftProviderRegistryClass = _g[
  _KEY
] as MicrosoftProviderRegistryClass;