/**
 * OAuthConfigurationRegistry.ts — Sprint 6.4.1A
 * Runtime configuration store for OAuth credentials (status tracking only).
 * Values are NEVER stored here — only presence flags.
 */

import { OAuthDiscovery } from "./OAuthDiscoveryEngine";

export interface ProviderConfigEntry {
  provider:          string;
  hasClientId:       boolean;
  hasClientSecret:   boolean;
  configuredAt:      number;
  configuredByUser:  boolean;
}

export class OAuthConfigurationRegistry {
  private _entries: Map<string, ProviderConfigEntry> = new Map();

  /**
   * Register that credentials have been configured for a provider.
   * Does NOT store the actual values.
   */
  markConfigured(provider: string, hasClientId: boolean, hasClientSecret: boolean): void {
    this._entries.set(provider, {
      provider,
      hasClientId,
      hasClientSecret,
      configuredAt:     Date.now(),
      configuredByUser: true,
    });
    OAuthDiscovery.markCredentials(provider, hasClientId, hasClientSecret);
  }

  get(provider: string): ProviderConfigEntry | null {
    return this._entries.get(provider) ?? null;
  }

  all(): ProviderConfigEntry[] {
    return [...this._entries.values()];
  }

  isConfigured(provider: string): boolean {
    const e = this._entries.get(provider);
    return !!e && e.hasClientId && e.hasClientSecret;
  }
}