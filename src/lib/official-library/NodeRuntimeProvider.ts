/**
 * NodeRuntimeProvider.ts — Sprint EF-7.2.6
 * IRuntimeProvider for Node.js. Priority=50. Environment=Node.
 * Depends only on ILoaderProvider — DocumentLoaderFactory is unknown here.
 */

import type { IRuntimeProvider }        from "./IRuntimeProvider";
import type { IDocumentDiscovery }       from "./DocumentDiscovery";
import type { IDocumentLoader }          from "./DocumentLoaderFactory";
import type { ILoaderProvider }          from "./ILoaderProvider";
import { NodeDocumentDiscovery }         from "./NodeDocumentDiscovery";
import { LoaderProvider }                from "./LoaderProvider";
import { RuntimeEnvironment }            from "./RuntimeEnvironment";
import type { RuntimeEnvironmentType }   from "./RuntimeEnvironment";

export class NodeRuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "node-runtime-v1";
  readonly runtimeName = "Node.js (fs.readdir)";
  readonly priority    = 50;
  readonly environment: RuntimeEnvironmentType = RuntimeEnvironment.NODE;

  private readonly _discovery:      IDocumentDiscovery;
  private readonly _loaderProvider: ILoaderProvider;

  constructor(loaderProvider: ILoaderProvider = LoaderProvider) {
    this._discovery      = new NodeDocumentDiscovery();
    this._loaderProvider = loaderProvider;
  }

  get isAvailable(): boolean { return this._discovery.isAvailable; }

  get reason(): string {
    return this.isAvailable
      ? "Node.js process.versions.node is present"
      : "Not in a Node.js environment (no process.versions.node)";
  }

  supportsEnvironment(): boolean { return this.isAvailable; }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return this._loaderProvider.getLoader(); }
}