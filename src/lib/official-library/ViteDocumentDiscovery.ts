/**
 * ViteDocumentDiscovery.ts — Sprint EF-7.2.3
 *
 * IDocumentDiscovery implementation for the Vite build environment.
 * ALL import.meta.glob usage is confined to this file.
 *
 * EF-7.2.3: added priority = 100 (highest — Vite/browser is the primary runtime).
 */

import type { IDocumentDiscovery, DiscoveredDocument, DiscoveryResult } from "./DocumentDiscovery";
import { MemoryAuthority } from "./OfficialLibraryTypes";

// Glob maps declared at module level (Vite requirement — string literal args).
// { as: 'raw' } prevents Vite from parsing .md as JS.

const OFFICIAL_GLOB = import.meta.glob(
  "/src/docs/00-official-library/*.md",
  { eager: false, as: "raw" }
) as Record<string, () => Promise<string>>;

const FOUNDATION_GLOB = import.meta.glob(
  "/src/docs/foundation/*.md",
  { eager: false, as: "raw" }
) as Record<string, () => Promise<string>>;

const ADR_GLOB = import.meta.glob(
  "/src/docs/foundation/adr/*.md",
  { eager: false, as: "raw" }
) as Record<string, () => Promise<string>>;

const RFC_GLOB = import.meta.glob(
  "/src/docs/foundation/rfc/*.md",
  { eager: false, as: "raw" }
) as Record<string, () => Promise<string>>;

function authorityFromPath(path: string): MemoryAuthority {
  if (path.includes("/00-official-library/")) return MemoryAuthority.OFFICIAL;
  if (path.includes("/foundation/"))          return MemoryAuthority.VERIFIED;
  return MemoryAuthority.EXTERNAL;
}

function toDiscovered(path: string, importer: () => Promise<string>): DiscoveredDocument {
  const fileName = path.split("/").pop() ?? path;
  const name     = fileName.replace(/\.md$/i, "");
  const id       = `doc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return {
    id,
    name,
    path:      path.replace(/^\//, ""),
    authority: authorityFromPath(path),
    load:      async () => {
      const content = await importer();
      return typeof content === "string" ? content : (content as any).default ?? "";
    },
  };
}

export class ViteDocumentDiscovery implements IDocumentDiscovery {
  readonly runtimeId   = "vite-v1";
  readonly runtimeName = "Vite (import.meta.glob)";
  readonly priority    = 100;

  get isAvailable(): boolean {
    return typeof import.meta !== "undefined" && typeof import.meta.glob === "function";
  }

  async discover(): Promise<DiscoveryResult> {
    const t0          = Date.now();
    const diagnostics: string[] = [];
    const documents:   DiscoveredDocument[] = [];

    for (const [glob, label] of [
      [OFFICIAL_GLOB,   "official-library"],
      [FOUNDATION_GLOB, "foundation"],
      [ADR_GLOB,        "adr"],
      [RFC_GLOB,        "rfc"],
    ] as [Record<string, () => Promise<string>>, string][]) {
      const entries = Object.entries(glob);
      if (entries.length === 0) {
        diagnostics.push(`${label}: no documents found`);
        continue;
      }
      for (const [path, importer] of entries) {
        documents.push(toDiscovered(path, importer));
      }
    }

    if (documents.length === 0) {
      diagnostics.push("ViteDocumentDiscovery: no .md documents discovered via glob");
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
    return Object.keys({ ...OFFICIAL_GLOB, ...FOUNDATION_GLOB, ...ADR_GLOB, ...RFC_GLOB })
      .map(path => {
        const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
        return `doc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      });
  }

  async exists(idOrPath: string): Promise<boolean> {
    const ids = await this.list();
    return ids.includes(idOrPath) || ids.some(id => id.includes(idOrPath));
  }
}