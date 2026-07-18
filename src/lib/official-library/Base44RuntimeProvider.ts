/**
 * Base44RuntimeProvider.ts — Sprint EF-7.2.5
 * IRuntimeProvider stub for Base44. Priority=10. Environment=Base44.
 */

import type { IRuntimeProvider }        from "./IRuntimeProvider";
import type { IDocumentDiscovery }       from "./DocumentDiscovery";
import type { IDocumentLoader }          from "./DocumentLoaderFactory";
import { Base44DocumentDiscovery }       from "./Base44DocumentDiscovery";
import { DocumentLoaderFactory }         from "./DocumentLoaderFactory";
import { RuntimeEnvironment }            from "./RuntimeEnvironment";
import type { RuntimeEnvironmentType }   from "./RuntimeEnvironment";

export class Base44RuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "base44-runtime-v1";
  readonly runtimeName = "Base44 Platform (stub)";
  readonly priority    = 10;
  readonly environment: RuntimeEnvironmentType = RuntimeEnvironment.BASE44;

  private readonly _discovery = new Base44DocumentDiscovery();

  get isAvailable(): boolean { return false; }

  get reason(): string {
    return "Base44DocumentDiscovery is a stub — Base44 file storage API not yet integrated";
  }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return DocumentLoaderFactory.getActive(); }
}