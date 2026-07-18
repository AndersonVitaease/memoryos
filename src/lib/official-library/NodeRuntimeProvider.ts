/**
 * NodeRuntimeProvider.ts — Sprint EF-7.2.5
 * IRuntimeProvider for Node.js. Priority=50. Environment=Node.
 */

import type { IRuntimeProvider }        from "./IRuntimeProvider";
import type { IDocumentDiscovery }       from "./DocumentDiscovery";
import type { IDocumentLoader }          from "./DocumentLoaderFactory";
import { NodeDocumentDiscovery }         from "./NodeDocumentDiscovery";
import { DocumentLoaderFactory }         from "./DocumentLoaderFactory";
import { RuntimeEnvironment }            from "./RuntimeEnvironment";
import type { RuntimeEnvironmentType }   from "./RuntimeEnvironment";

export class NodeRuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "node-runtime-v1";
  readonly runtimeName = "Node.js (fs.readdir)";
  readonly priority    = 50;
  readonly environment: RuntimeEnvironmentType = RuntimeEnvironment.NODE;

  private readonly _discovery = new NodeDocumentDiscovery();

  get isAvailable(): boolean { return this._discovery.isAvailable; }

  get reason(): string {
    return this.isAvailable
      ? "Node.js process.versions.node is present"
      : "Not in a Node.js environment (no process.versions.node)";
  }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return DocumentLoaderFactory.getActive(); }
}