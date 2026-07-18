/**
 * NodeRuntimeProvider.ts — Sprint EF-7.2.4
 *
 * IRuntimeProvider for the Node.js environment.
 * Wires together NodeDocumentDiscovery + DefaultDocumentLoader.
 * Priority = 50.
 */

import type { IRuntimeProvider }   from "./IRuntimeProvider";
import type { IDocumentDiscovery }  from "./DocumentDiscovery";
import type { IDocumentLoader }     from "./DocumentLoaderFactory";
import { NodeDocumentDiscovery }    from "./NodeDocumentDiscovery";
import { DocumentLoaderFactory }    from "./DocumentLoaderFactory";

export class NodeRuntimeProvider implements IRuntimeProvider {
  readonly runtimeId   = "node-runtime-v1";
  readonly runtimeName = "Node.js (fs.readdir)";
  readonly priority    = 50;

  private readonly _discovery = new NodeDocumentDiscovery();

  get isAvailable(): boolean {
    return this._discovery.isAvailable;
  }

  get reason(): string {
    return this.isAvailable
      ? "Node.js process.versions.node is present"
      : "Not in a Node.js environment (no process.versions.node)";
  }

  discovery(): IDocumentDiscovery { return this._discovery; }
  loader():    IDocumentLoader    { return DocumentLoaderFactory.getActive(); }
}