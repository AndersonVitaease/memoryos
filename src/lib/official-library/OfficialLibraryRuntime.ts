/**
 * OfficialLibraryRuntime.ts — Sprint P-01.11B
 *
 * Auto-registration: each provider self-registers on module import.
 * Bootstrap never knows about concrete providers.
 *
 * Pattern: import this file → providers auto-register → Bootstrap uses IRuntimeStore.
 * To add a new provider: implement IRuntimeProvider + add one import line here.
 * Nothing else changes anywhere.
 *
 * SRP: orchestrates auto-registration only.
 * DIP: Bootstrap depends on IRuntimeStore/IRuntimeResolver, not this file.
 */

import { RuntimeRegistry }          from "./RuntimeRegistry";
import { DocumentDiscoveryRegistry } from "./DocumentDiscoveryRegistry";
import { ViteRuntimeProvider }       from "./ViteRuntimeProvider";
import { NodeRuntimeProvider }       from "./NodeRuntimeProvider";
import { Base44RuntimeProvider }     from "./Base44RuntimeProvider";

let _initialized = false;

export function initOfficialLibraryRuntime(): void {
  if (_initialized) return;
  _initialized = true;

  // ── Auto-registration: providers register themselves on bootstrap ──────────
  // Each provider is responsible only for implementing IRuntimeProvider.
  // Bootstrap never imports or names concrete providers.
  [
    new ViteRuntimeProvider(),
    new NodeRuntimeProvider(),
    new Base44RuntimeProvider(),
  ].forEach(provider => {
    RuntimeRegistry.register(provider);
    // Register legacy discovery for backward compat (Suites 20–28)
    DocumentDiscoveryRegistry.register(provider.discovery());
  });
}

// Auto-initialize on import — side-effect is intentional and idempotent
initOfficialLibraryRuntime();