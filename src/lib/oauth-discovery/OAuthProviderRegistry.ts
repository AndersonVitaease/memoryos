/**
 * OAuthProviderRegistry.ts — Sprint 6.4.1A
 * Extended provider registry that enriches UOP provider data with discovery metadata.
 */

import { UOP } from "../universal-oauth/UniversalOAuthPlatform";
import { OAuthDiscovery } from "./OAuthDiscoveryEngine";

export class OAuthProviderRegistry {
  /**
   * Get full enriched provider info including discovery data.
   */
  getEnriched(provider: string) {
    const uopConfig  = UOP.registry.getProvider(provider as any);
    const discovered = OAuthDiscovery.getProviderConfig(provider);
    return { uopConfig, discovered };
  }

  listAll() {
    return UOP.registry.listProviders().map(p => {
      const discovered = OAuthDiscovery.history.latest()?.providers.find(d => d.provider === p.name) ?? null;
      return { ...p, discovered };
    });
  }

  count(): number { return UOP.registry.providerCount(); }
}