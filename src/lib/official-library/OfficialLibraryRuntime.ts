/**
 * OfficialLibraryRuntime.ts — Sprint EF-7.2.2
 *
 * Single entry point for runtime registration.
 * Registers all available IDocumentDiscovery implementations and selects
 * the best one for the current environment.
 *
 * This is the ONLY file that imports concrete implementations.
 * All other Official Library files depend only on interfaces.
 *
 * To add a new runtime: import it here and call register().
 * Nothing else changes.
 */

import { DocumentDiscoveryRegistry }  from "./DocumentDiscoveryRegistry";
import { ViteDocumentDiscovery }       from "./ViteDocumentDiscovery";
import { NodeDocumentDiscovery }       from "./NodeDocumentDiscovery";
import { Base44DocumentDiscovery }     from "./Base44DocumentDiscovery";

let _initialized = false;

export function initOfficialLibraryRuntime(): void {
  if (_initialized) return;
  _initialized = true;

  // Register all implementations — order defines fallback priority
  const vite   = new ViteDocumentDiscovery();
  const node   = new NodeDocumentDiscovery();
  const base44 = new Base44DocumentDiscovery();

  DocumentDiscoveryRegistry.register(vite);
  DocumentDiscoveryRegistry.register(node);
  DocumentDiscoveryRegistry.register(base44);

  // Auto-select: prefer Vite (browser/build), fallback to Node, then Base44
  if (vite.isAvailable) {
    DocumentDiscoveryRegistry.setActive(vite);
  } else if (node.isAvailable) {
    DocumentDiscoveryRegistry.setActive(node);
  } else {
    DocumentDiscoveryRegistry.setActive(base44);
  }
}

// Auto-initialize when this module is imported
initOfficialLibraryRuntime();