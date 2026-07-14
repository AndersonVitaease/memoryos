/**
 * OAuthEnvironmentInspector.ts — Sprint 6.4.1A
 * Inspects the current runtime environment for OAuth readiness.
 * Reports credential presence/absence WITHOUT exposing values.
 */

import type { DiscoverySecretStatus } from "./OAuthDiscoveryTypes";

export interface EnvironmentInspection {
  baseUrl:            string;
  isSecure:           boolean;
  isLocalhost:        boolean;
  isProduction:       boolean;
  supportsSessionStorage: boolean;
  supportsLocalStorage:   boolean;
  pkceSupported:      boolean;
  webCryptoAvailable: boolean;
  // Per-provider credential status (never values)
  providerCredentials: Record<string, {
    clientId:     DiscoverySecretStatus;
    clientSecret: DiscoverySecretStatus;
  }>;
  runtimeWarnings:    string[];
}

// In-browser env: secrets configured by the user at runtime via settings UI
// Status is tracked here without ever reading the actual value after it's set
const _credentialStore: Map<string, { clientId: boolean; clientSecret: boolean }> = new Map();

export function markCredentialConfigured(provider: string, type: "clientId" | "clientSecret"): void {
  const existing = _credentialStore.get(provider) ?? { clientId: false, clientSecret: false };
  _credentialStore.set(provider, { ...existing, [type]: true });
}

export function markCredentialMissing(provider: string, type: "clientId" | "clientSecret"): void {
  const existing = _credentialStore.get(provider) ?? { clientId: false, clientSecret: false };
  _credentialStore.set(provider, { ...existing, [type]: false });
}

export class OAuthEnvironmentInspector {
  inspect(): EnvironmentInspection {
    const baseUrl     = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "unknown";
    const isSecure    = baseUrl.startsWith("https://") || baseUrl.includes("localhost");
    const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    const isProduction = !isLocalhost && baseUrl.startsWith("https://");

    const supportsSessionStorage = typeof sessionStorage !== "undefined";
    const supportsLocalStorage   = typeof localStorage !== "undefined";
    const webCryptoAvailable     = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
    const pkceSupported          = webCryptoAvailable;

    const runtimeWarnings: string[] = [];
    if (!isSecure)               runtimeWarnings.push("OAuth requires HTTPS in production");
    if (!webCryptoAvailable)     runtimeWarnings.push("WebCrypto not available — PKCE may be limited");
    if (!supportsSessionStorage) runtimeWarnings.push("sessionStorage not available — PKCE state cannot be stored");

    // Build credential status map for all known providers
    const providerCredentials: EnvironmentInspection["providerCredentials"] = {};
    const ALL_PROVIDERS = ["google","microsoft","slack","notion","dropbox","hubspot","meta","github"];
    for (const p of ALL_PROVIDERS) {
      const creds = _credentialStore.get(p);
      providerCredentials[p] = {
        clientId:     creds?.clientId     ? "CONFIGURED" : "MISSING",
        clientSecret: creds?.clientSecret ? "CONFIGURED" : "MISSING",
      };
    }

    return {
      baseUrl, isSecure, isLocalhost, isProduction,
      supportsSessionStorage, supportsLocalStorage,
      pkceSupported, webCryptoAvailable,
      providerCredentials, runtimeWarnings,
    };
  }

  getCredentialStatus(provider: string): { clientId: DiscoverySecretStatus; clientSecret: DiscoverySecretStatus } {
    const creds = _credentialStore.get(provider);
    return {
      clientId:     creds?.clientId     ? "CONFIGURED" : "MISSING",
      clientSecret: creds?.clientSecret ? "CONFIGURED" : "MISSING",
    };
  }

  setCredentialPresence(provider: string, clientIdPresent: boolean, clientSecretPresent: boolean): void {
    _credentialStore.set(provider, { clientId: clientIdPresent, clientSecret: clientSecretPresent });
  }
}