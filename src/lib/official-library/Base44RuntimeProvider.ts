/**
 * Base44RuntimeProvider.ts — Sprint EF-7.2.4
 *
 * IRuntimeProvider stub for the Base44 platform.
 * Priority = 10. Not yet functional — returns empty discovery.
 * Future: wire to Base44DocumentDiscovery once the Base44 file API is ready.
 */

import type { IRuntimeProvider }   from "./IRuntimeProvider";
import type { IDocumentDiscovery }  from "./DocumentDiscovery";
import type { IDocumentLoader }     from "./DocumentLoaderFactory";
import { Base44DocumentDiscovery }  from "./Base44DocumentDiscovery";
import { DocumentLoaderFactory }    from "./DocumentLoaderFactory";

export class Base44RuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "base44-runtime-v1";
  readonly runtimeName = "Base44 Platform (stub)";
  readonly priority    = 10;

  private readonly _discovery = new Base44DocumentDiscovery();

  get isAvailable(): boolean { return false; }

  get reason(): string {
    return "Base44DocumentDiscovery is a stub — Base44 file storage API not yet integrated";
  }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return DocumentLoaderFactory.getActive(); }
}