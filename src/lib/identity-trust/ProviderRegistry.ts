/**
 * ProviderRegistry.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Universal, dynamic registry for OAuth providers.
 * Supports hundreds of providers. No global mutable state — registry is
 * scoped to instance; singleton pattern uses globalThis anchor (HMR-safe).
 *
 * SRP: register, lookup, list, health — nothing else.
 */

import type { OAuthProviderDefinition, ProviderCategory } from './ITPTypes';
import type { IOAuthProvider } from './IOAuthProvider';
import { IdentityEventBus } from './IdentityEventBus';

const REGISTRY_KEY = '__ITP_PROVIDER_REGISTRY__';

function getStore(): Map<string, { definition: OAuthProviderDefinition; provider: IOAuthProvider }> {
  if (!(globalThis as any)[REGISTRY_KEY]) {
    (globalThis as any)[REGISTRY_KEY] = new Map();
  }
  return (globalThis as any)[REGISTRY_KEY];
}

export class ProviderRegistry {
  /**
   * Registers an OAuth provider.
   * Overwrites if same providerId is re-registered (hot-reload support).
   */
  static register(definition: OAuthProviderDefinition, provider: IOAuthProvider): void {
    if (!definition.id || !definition.name) {
      throw new Error('[ProviderRegistry] Provider definition must have id and name.');
    }
    if (definition.id !== provider.providerId) {
      throw new Error(
        `[ProviderRegistry] Definition id "${definition.id}" does not match provider.providerId "${provider.providerId}".`
      );
    }

    const store = getStore();
    const isNew = !store.has(definition.id);
    store.set(definition.id, { definition, provider });

    IdentityEventBus.emit({
      eventType:      'PROVIDER_REGISTERED',
      providerId:     definition.id,
      connectionId:   '',
      organizationId: '',
      actor:          'system',
      payload:        { name: definition.name, version: definition.version, isNew },
      status:         'SUCCESS',
    });
  }

  /** Returns the IOAuthProvider for a given id. Throws if not found. */
  static get(providerId: string): IOAuthProvider {
    const entry = getStore().get(providerId);
    if (!entry) throw new Error(`[ProviderRegistry] Provider not found: "${providerId}"`);
    return entry.provider;
  }

  /** Returns the definition for a given id. Throws if not found. */
  static getDefinition(providerId: string): OAuthProviderDefinition {
    const entry = getStore().get(providerId);
    if (!entry) throw new Error(`[ProviderRegistry] Provider not found: "${providerId}"`);
    return { ...entry.definition };
  }

  /** Returns true if a provider with the given id is registered. */
  static has(providerId: string): boolean {
    return getStore().has(providerId);
  }

  /** Lists all registered provider definitions. */
  static list(): OAuthProviderDefinition[] {
    return Array.from(getStore().values()).map((e) => ({ ...e.definition }));
  }

  /** Lists providers filtered by category. */
  static listByCategory(category: ProviderCategory): OAuthProviderDefinition[] {
    return this.list().filter((d) => d.category === category);
  }

  /** Lists providers that support a given scope. */
  static listByScope(scope: string): OAuthProviderDefinition[] {
    return this.list().filter((d) => d.supportedScopes.includes(scope));
  }

  /** Unregisters a provider (useful in testing or hot-reload). */
  static unregister(providerId: string): boolean {
    return getStore().delete(providerId);
  }

  /** Returns the total number of registered providers. */
  static count(): number {
    return getStore().size;
  }

  /** Runs health checks on all registered providers. */
  static async healthAll(): Promise<Record<string, Awaited<ReturnType<IOAuthProvider['health']>>>> {
    const results: Record<string, Awaited<ReturnType<IOAuthProvider['health']>>> = {};
    await Promise.all(
      Array.from(getStore().entries()).map(async ([id, { provider }]) => {
        try {
          results[id] = await provider.health();
        } catch (e) {
          results[id] = {
            providerId: id,
            status:     'unavailable',
            latencyMs:  -1,
            checkedAt:  new Date().toISOString(),
            details:    { error: String(e) },
          };
        }
      })
    );
    return results;
  }

  static health(): { status: 'ok'; total: number; providers: string[] } {
    return {
      status:    'ok',
      total:     getStore().size,
      providers: Array.from(getStore().keys()),
    };
  }
}