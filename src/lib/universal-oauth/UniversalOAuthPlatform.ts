/**
 * UniversalOAuthPlatform.ts — Sprint 6.4.0
 * Top-level singleton facade for the Universal OAuth Platform.
 * All connectors MUST use this platform for OAuth — no individual implementations.
 */

import { OAuthRuntime } from "./OAuthRuntime";

declare const globalThis: any;

const ANCHOR = "__uop_runtime__";

function getOrCreate(): OAuthRuntime {
  if (!globalThis[ANCHOR]) {
    const rt = new OAuthRuntime();
    rt.start();
    globalThis[ANCHOR] = rt;
  }
  return globalThis[ANCHOR];
}

/**
 * Universal OAuth Platform — singleton access point.
 *
 * Usage:
 *   import { UOP } from './UniversalOAuthPlatform';
 *   const session = UOP.sessionManager.create({ ... });
 *   const provider = UOP.registry.getProvider('google');
 */
export const UOP: OAuthRuntime = new Proxy({} as OAuthRuntime, {
  get(_target, prop) {
    const inst = getOrCreate();
    const val = (inst as any)[prop];
    return typeof val === "function" ? val.bind(inst) : val;
  },
});

export { OAuthRuntime };
export type { OAuthRuntimeStatus, OAuthRuntimeState } from "./OAuthRuntime";