/**
 * ConnectorManifestBuilder.ts — MemoryOS Connector SDK v1.0
 * Beta-03 · 2026-07-13
 *
 * Builds a validated, immutable ConnectorManifest from a ConnectorConfig.
 * Provider-agnostic — generates structure only, no business logic.
 */

import type { ConnectorConfig, ConnectorManifest, CapabilityDeclaration } from "./SDKTypes";

export class ConnectorManifestBuilder {

  build(config: ConnectorConfig): ConnectorManifest {
    this._validateConfig(config);

    const ops = config.capabilities.map(c => c.id);

    const manifest: ConnectorManifest = {
      specVersion: "1.0",
      id:                    config.id,
      name:                  config.name,
      provider:              config.provider,
      version:               config.version ?? "1.0.0",
      description:           config.description ?? `${config.name} — MemoryOS Production Connector`,
      author:                config.author ?? "MemoryOS",
      authType:              config.authType,
      requiredPermissions:   config.requiredPermissions ?? [],
      capabilities:          config.capabilities,
      supportedOperations:   ops,
      hasKnowledgeProvider:  config.hasKnowledgeProvider ?? false,
      knowledgeProviderType: config.knowledgeProviderType,
      productionLevel:       "experimental",
      dependencies:          [],
      compatibility: {
        minRuntimeVersion: "1.0.0",
        pcsVersion:        "1.0",
      },
      createdAt: Date.now(),
      tags: config.tags ?? [],
    };

    return Object.freeze(manifest);
  }

  /** Validate that the manifest follows PCS rules before using it. */
  validateManifest(manifest: ConnectorManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!manifest.id || !/^[a-z0-9_-]+$/.test(manifest.id))
      errors.push("manifest.id must be kebab-case alphanumeric");
    if (!manifest.name || manifest.name.trim().length === 0)
      errors.push("manifest.name is required");
    if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version))
      errors.push("manifest.version must be semver (e.g. 1.0.0)");
    if (!manifest.authType)
      errors.push("manifest.authType is required");
    if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0)
      errors.push("manifest.capabilities must contain at least one capability");
    if (manifest.hasKnowledgeProvider && !manifest.knowledgeProviderType)
      errors.push("manifest.knowledgeProviderType required when hasKnowledgeProvider=true");

    // Every capability must have required fields
    for (const cap of manifest.capabilities) {
      if (!cap.id || !cap.type)
        errors.push(`Capability missing id or type: ${JSON.stringify(cap)}`);
    }
    return { valid: errors.length === 0, errors };
  }

  private _validateConfig(config: ConnectorConfig): void {
    if (!config.id) throw new Error("ConnectorConfig.id is required");
    if (!config.name) throw new Error("ConnectorConfig.name is required");
    if (!config.provider) throw new Error("ConnectorConfig.provider is required");
    if (!config.authType) throw new Error("ConnectorConfig.authType is required");
    if (!Array.isArray(config.capabilities) || config.capabilities.length === 0)
      throw new Error("ConnectorConfig.capabilities must contain at least one entry");
  }
}