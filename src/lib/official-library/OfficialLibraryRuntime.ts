/**
 * OfficialLibraryRuntime.ts — Sprint EF-7.2.3
 *
 * Single entry point for runtime registration.
 * The ONLY file that imports concrete IDocumentDiscovery implementations.
 *
 * EF-7.2.3 changes:
 * - Registration uses priority-based auto-selection (no manual if/else)
 * - Idempotent: safe to import multiple times
 *
 * To add a new runtime (e.g. GitHubDocumentDiscovery):
 *   1. Create the class implementing IDocumentDiscovery with a suitable priority
 *   2. Import it here and call register()
 *   Nothing else changes.
 */

import { DocumentDiscoveryRegistry } from "./DocumentDiscoveryRegistry";
import { ViteDocumentDiscovery }     from "./ViteDocumentDiscovery";
import { NodeDocumentDiscovery }     from "./NodeDocumentDiscovery";
import { Base44DocumentDiscovery }   from "./Base44DocumentDiscovery";

let _initialized = false;

export function initOfficialLibraryRuntime(): void {
  if (_initialized) return;
  _initialized = true;

  // Register all implementations — getActive() selects highest-priority available one
  DocumentDiscoveryRegistry.register(new ViteDocumentDiscovery());   // priority 100
  DocumentDiscoveryRegistry.register(new NodeDocumentDiscovery());   // priority 50
  DocumentDiscoveryRegistry.register(new Base44DocumentDiscovery()); // priority 10

  // No manual setActive() — priority-based auto-selection handles it
}

// Auto-initialize on import
initOfficialLibraryRuntime();