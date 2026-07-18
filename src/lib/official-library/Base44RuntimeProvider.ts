/**
 * Base44RuntimeProvider.ts — Sprint EF-7.2.6
 * IRuntimeProvider stub for Base44. Priority=10. Environment=Base44.
 * Depends only on ILoaderProvider — DocumentLoaderFactory is unknown here.
 */

import type { IRuntimeProvider }        from "./IRuntimeProvider";
import type { IDocumentDiscovery }       from "./DocumentDiscovery";
import type { IDocumentLoader }          from "./DocumentLoaderFactory";
import type { ILoaderProvider }          from "./ILoaderProvider";
import { Base44DocumentDiscovery }       from "./Base44DocumentDiscovery";
import { LoaderProvider }                from "./LoaderProvider";
import { RuntimeEnvironment }            from "./RuntimeEnvironment";
import type { RuntimeEnvironmentType }   from "./RuntimeEnvironment";

export class Base44RuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "base44-runtime-v1";
  readonly runtimeName = "Base44 Platform (stub)";
  readonly priority    = 10;
  readonly environment: RuntimeEnvironmentType = RuntimeEnvironment.BASE44;

  private readonly _discovery:      IDocumentDiscovery;
  private readonly _loaderProvider: ILoaderProvider;

  constructor(loaderProvider: ILoaderProvider = LoaderProvider) {
    this._discovery      = new Base44DocumentDiscovery();
    this._loaderProvider = loaderProvider;
  }

  get isAvailable(): boolean { return false; }

  get reason(): string {
    return "Base44DocumentDiscovery is a stub — Base44 file storage API not yet integrated";
  }

  supportsEnvironment(): boolean { return false; }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return this._loaderProvider.getLoader(); }
}