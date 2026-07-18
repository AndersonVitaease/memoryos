/**
 * ViteRuntimeProvider.ts — Sprint EF-7.2.6
 * IRuntimeProvider for Vite/Browser. Priority=100. Environment=Browser.
 * Depends only on ILoaderProvider — DocumentLoaderFactory is unknown here.
 */

import type { IRuntimeProvider }        from "./IRuntimeProvider";
import type { IDocumentDiscovery }       from "./DocumentDiscovery";
import type { IDocumentLoader }          from "./DocumentLoaderFactory";
import type { ILoaderProvider }          from "./ILoaderProvider";
import { ViteDocumentDiscovery }         from "./ViteDocumentDiscovery";
import { LoaderProvider }                from "./LoaderProvider";
import { RuntimeEnvironment }            from "./RuntimeEnvironment";
import type { RuntimeEnvironmentType }   from "./RuntimeEnvironment";

export class ViteRuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "vite-runtime-v1";
  readonly runtimeName = "Vite (Browser Build)";
  readonly priority    = 100;
  readonly environment: RuntimeEnvironmentType = RuntimeEnvironment.BROWSER;

  private readonly _discovery:     IDocumentDiscovery;
  private readonly _loaderProvider: ILoaderProvider;

  constructor(loaderProvider: ILoaderProvider = LoaderProvider) {
    this._discovery     = new ViteDocumentDiscovery();
    this._loaderProvider = loaderProvider;
  }

  get isAvailable(): boolean { return this._discovery.isAvailable; }

  get reason(): string {
    return this.isAvailable
      ? "Vite import.meta.glob is available — browser/build environment"
      : "Vite import.meta.glob is not available in this environment";
  }

  supportsEnvironment(): boolean { return this.isAvailable; }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return this._loaderProvider.getLoader(); }
}