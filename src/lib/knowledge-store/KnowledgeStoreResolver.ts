// KnowledgeStoreResolver.ts — Sprint EF-38.1
// Resolves which engine id to use based on environment config.
// Never instantiates implementations directly.

import type { EngineId, EngineEnvironment } from "./KnowledgeStoreRegistry";
import { KnowledgeStoreRegistry } from "./KnowledgeStoreRegistry";

export interface ResolverConfig {
  environment: EngineEnvironment;
  override?:   EngineId;  // explicit override takes priority
}

export interface ResolveResult {
  readonly ok:          boolean;
  readonly engineId:    EngineId | null;
  readonly environment: EngineEnvironment;
  readonly reason:      string;
  readonly fallback:    boolean;
}

// Default engine per environment — deterministic
const ENV_DEFAULTS: Record<EngineEnvironment, EngineId> = {
  development: "memory",
  testing:     "memory",
  production:  "postgres",
  enterprise:  "distributed",
};

export const KnowledgeStoreResolver = {
  resolve(config: ResolverConfig): ResolveResult {
    const env = config.environment;

    // Explicit override
    if (config.override) {
      const meta = KnowledgeStoreRegistry.get(config.override);
      if (!meta) {
        return Object.freeze({ ok: false, engineId: null, environment: env, reason: `Unknown engine: ${config.override}`, fallback: false });
      }
      return Object.freeze({ ok: true, engineId: config.override, environment: env, reason: `Override: ${config.override}`, fallback: false });
    }

    // Default for environment
    const defaultId = ENV_DEFAULTS[env];
    if (!defaultId) {
      return Object.freeze({ ok: false, engineId: null, environment: env, reason: `No default engine for environment: ${env}`, fallback: false });
    }

    return Object.freeze({ ok: true, engineId: defaultId, environment: env, reason: `Default for ${env}`, fallback: false });
  },

  getDefaultForEnvironment(env: EngineEnvironment): EngineId {
    return ENV_DEFAULTS[env];
  },

  listEnvironments(): EngineEnvironment[] {
    return Object.keys(ENV_DEFAULTS) as EngineEnvironment[];
  },
};