/**
 * OfficialLibraryRuntime.ts — Sprint EF-7.2.4
 *
 * Single entry point for provider registration.
 * ONLY responsibility: register concrete IRuntimeProvider implementations.
 *
 * EF-7.2.4 changes:
 * - Registers IRuntimeProvider instances into RuntimeRegistry
 * - Also registers legacy IDocumentDiscovery into DocumentDiscoveryRegistry
 *   for backward compatibility with Suites 20–28
 * - Zero selection logic here — RuntimeRegistry.getActive() handles it
 *
 * To add a new runtime (GitHub, Drive, S3…):
 *   1. Create class implementing IRuntimeProvider
 *   2. register(new MyRuntimeProvider()) here
 *   Nothing else changes.
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

  const vite   = new ViteRuntimeProvider();
  const node   = new NodeRuntimeProvider();
  const base44 = new Base44RuntimeProvider();

  // Register into RuntimeRegistry (EF-7.2.4 — primary)
  RuntimeRegistry.register(vite);
  RuntimeRegistry.register(node);
  RuntimeRegistry.register(base44);

  // Register legacy discovery impls for backward compat (Suites 20–28)
  DocumentDiscoveryRegistry.register(vite.discovery());
  DocumentDiscoveryRegistry.register(node.discovery());
  DocumentDiscoveryRegistry.register(base44.discovery());
}

// Auto-initialize on import
initOfficialLibraryRuntime();