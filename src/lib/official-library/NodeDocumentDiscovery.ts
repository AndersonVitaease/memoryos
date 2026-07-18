/**
 * NodeDocumentDiscovery.ts — Sprint EF-7.2.3
 *
 * IDocumentDiscovery implementation for the Node.js runtime.
 *
 * EF-7.2.3 changes:
 * - priority = 50
 * - baseDirs is configurable at construction time (no hardcoded project root)
 * - Defaults are relative to process.cwd() — works regardless of project structure
 * - Each dir entry carries its authority
 */

import type { IDocumentDiscovery, DiscoveredDocument, DiscoveryResult } from "./DocumentDiscovery";
import { MemoryAuthority } from "./OfficialLibraryTypes";

export interface NodeDiscoveryDir {
  readonly dir:       string;
  readonly authority: MemoryAuthority;
}

const DEFAULT_DIRS: NodeDiscoveryDir[] = [
  { dir: "src/docs/00-official-library", authority: MemoryAuthority.OFFICIAL },
  { dir: "src/docs/foundation",           authority: MemoryAuthority.VERIFIED },
  { dir: "src/docs/foundation/adr",       authority: MemoryAuthority.VERIFIED },
  { dir: "src/docs/foundation/rfc",       authority: MemoryAuthority.VERIFIED },
];

export class NodeDocumentDiscovery implements IDocumentDiscovery {
  readonly runtimeId   = "node-v1";
  readonly runtimeName = "Node.js (fs.readdir)";
  readonly priority    = 50;

  private readonly _dirs: NodeDiscoveryDir[];

  constructor(dirs: NodeDiscoveryDir[] = DEFAULT_DIRS) {
    this._dirs = dirs;
  }

  get isAvailable(): boolean {
    return typeof process !== "undefined"
      && typeof process.versions?.node === "string";
  }

  async discover(): Promise<DiscoveryResult> {
    const t0          = Date.now();
    const diagnostics: string[] = [];
    const documents:   DiscoveredDocument[] = [];

    if (!this.isAvailable) {
      diagnostics.push("NodeDocumentDiscovery: not in a Node.js environment");
      return { documents, durationMs: Date.now() - t0, discoveredAt: new Date().toISOString(), runtimeId: this.runtimeId, diagnostics };
    }

    try {
      const { readdir, readFile } = await import("fs/promises" as any);
      const { join, resolve }     = await import("path" as any);
      const cwd = process.cwd();

      for (const { dir, authority } of this._dirs) {
        const absDir = resolve(cwd, dir);
        try {
          const files: string[] = await readdir(absDir);
          for (const file of files.filter((f: string) => f.endsWith(".md"))) {
            const fullPath = join(absDir, file);
            const relPath  = join(dir, file);
            const name     = file.replace(/\.md$/i, "");
            const id       = `doc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
            documents.push({
              id,
              name,
              path:      relPath,
              authority,
              load:      () => readFile(fullPath, "utf-8"),
            });
          }
        } catch {
          diagnostics.push(`NodeDocumentDiscovery: could not read "${dir}" (resolved: ${absDir})`);
        }
      }
    } catch (e) {
      diagnostics.push(`NodeDocumentDiscovery: fs module unavailable — ${(e as Error).message}`);
    }

    if (documents.length === 0) {
      diagnostics.push("NodeDocumentDiscovery: no documents found");
    }

    return {
      documents,
      durationMs:   Date.now() - t0,
      discoveredAt: new Date().toISOString(),
      runtimeId:    this.runtimeId,
      diagnostics,
    };
  }

  async list(): Promise<string[]> {
    const result = await this.discover();
    return result.documents.map(d => d.id);
  }

  async exists(idOrPath: string): Promise<boolean> {
    const ids = await this.list();
    return ids.includes(idOrPath);
  }
}