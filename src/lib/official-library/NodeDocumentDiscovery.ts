/**
 * NodeDocumentDiscovery.ts — Sprint EF-7.2.2
 *
 * IDocumentDiscovery implementation for the Node.js runtime.
 *
 * Allows the Official Library to run in Node (CLI tools, tests, SSR, scripts)
 * without any Vite dependency.
 *
 * Implementation uses dynamic imports + optional `fs` access.
 * Gracefully degrades when `fs` is unavailable (e.g., in a browser context
 * where this class should not be instantiated).
 */

import type { IDocumentDiscovery, DiscoveredDocument, DiscoveryResult } from "./DocumentDiscovery";
import { MemoryAuthority } from "./OfficialLibraryTypes";

export class NodeDocumentDiscovery implements IDocumentDiscovery {
  readonly runtimeId   = "node-v1";
  readonly runtimeName = "Node.js (fs.readdir)";

  get isAvailable(): boolean {
    // Only available in a Node-like environment
    return typeof process !== "undefined"
      && typeof process.versions?.node === "string";
  }

  async discover(): Promise<DiscoveryResult> {
    const t0         = Date.now();
    const diagnostics: string[] = [];
    const documents:   DiscoveredDocument[] = [];

    if (!this.isAvailable) {
      diagnostics.push("NodeDocumentDiscovery: not in a Node.js environment");
      return { documents, durationMs: Date.now() - t0, discoveredAt: new Date().toISOString(), runtimeId: this.runtimeId, diagnostics };
    }

    try {
      // Dynamic import to avoid breaking browser/Vite bundling
      const { readdir, readFile } = await import("fs/promises" as any);
      const { join } = await import("path" as any);

      const BASES = [
        { dir: "src/docs/00-official-library", authority: MemoryAuthority.OFFICIAL },
        { dir: "src/docs/foundation",           authority: MemoryAuthority.VERIFIED },
        { dir: "src/docs/foundation/adr",       authority: MemoryAuthority.VERIFIED },
        { dir: "src/docs/foundation/rfc",       authority: MemoryAuthority.VERIFIED },
      ];

      for (const { dir, authority } of BASES) {
        try {
          const files: string[] = await readdir(dir);
          for (const file of files.filter((f: string) => f.endsWith(".md"))) {
            const fullPath = join(dir, file);
            const name     = file.replace(/\.md$/i, "");
            const id       = `doc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
            documents.push({
              id,
              name,
              path:      fullPath,
              authority,
              load:      async () => readFile(fullPath, "utf-8"),
            });
          }
        } catch {
          diagnostics.push(`NodeDocumentDiscovery: could not read directory "${dir}"`);
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