/**
 * ViteRuntimeProvider.ts — Sprint EF-7.2.4
 *
 * IRuntimeProvider for the Vite/Browser environment.
 * Wires together ViteDocumentDiscovery + DefaultDocumentLoader.
 * Priority = 100.
 */

import type { IRuntimeProvider }  from "./IRuntimeProvider";
import type { IDocumentDiscovery } from "./DocumentDiscovery";
import type { IDocumentLoader }    from "./DocumentLoaderFactory";
import { ViteDocumentDiscovery }   from "./ViteDocumentDiscovery";
import { DocumentLoaderFactory }   from "./DocumentLoaderFactory";

export class ViteRuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "vite-runtime-v1";
  readonly runtimeName = "Vite (Browser Build)";
  readonly priority    = 100;

  private readonly _discovery = new ViteDocumentDiscovery();

  get isAvailable(): boolean {
    return this._discovery.isAvailable;
  }

  get reason(): string {
    return this.isAvailable
      ? "Vite import.meta.glob is available — browser/build environment"
      : "Vite import.meta.glob is not available in this environment";
  }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return DocumentLoaderFactory.getActive(); }
}