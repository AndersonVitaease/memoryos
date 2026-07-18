/**
 * ViteDocumentDiscovery.ts — Sprint EF-7.2.2
 *
 * IDocumentDiscovery implementation for the Vite build environment.
 *
 * ALL import.meta.glob usage is confined to this file.
 * No other file in the Official Library pipeline may use import.meta.glob.
 *
 * OCP: adding a new discovery source = adding a new IDocumentDiscovery impl,
 *      never modifying this file or the catalog.
 */

import type { IDocumentDiscovery, DiscoveredDocument, DiscoveryResult } from "./DocumentDiscovery";
import { MemoryAuthority } from "./OfficialLibraryTypes";

// ── Glob maps declared once at module level (Vite requirement) ────────────────
// Vite's import.meta.glob must have a string literal argument — cannot be dynamic.
// { as: 'raw' } prevents Vite from parsing .md files as JS modules.

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

// ── Path → Authority mapping ──────────────────────────────────────────────────

function authorityFromPath(path: string): MemoryAuthority {
  if (path.includes("/00-official-library/")) return MemoryAuthority.OFFICIAL;
  if (path.includes("/foundation/"))          return MemoryAuthority.VERIFIED;
  return MemoryAuthority.EXTERNAL;
}

// ── Glob entry → DiscoveredDocument ──────────────────────────────────────────

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

// ── Implementation ────────────────────────────────────────────────────────────

export class ViteDocumentDiscovery implements IDocumentDiscovery {
  readonly runtimeId   = "vite-v1";
  readonly runtimeName = "Vite (import.meta.glob)";
  readonly isAvailable = typeof import.meta !== "undefined" && typeof import.meta.glob === "function";

  async discover(): Promise<DiscoveryResult> {
    const t0          = Date.now();
    const diagnostics: string[] = [];
    const documents:   DiscoveredDocument[] = [];

    for (const [glob, label] of [
      [OFFICIAL_GLOB,  "official-library"],
      [FOUNDATION_GLOB,"foundation"],
      [ADR_GLOB,       "adr"],
      [RFC_GLOB,       "rfc"],
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
      durationMs:    Date.now() - t0,
      discoveredAt:  new Date().toISOString(),
      runtimeId:     this.runtimeId,
      diagnostics,
    };
  }

  async list(): Promise<string[]> {
    const result = await this.discover();
    return result.documents.map(d => d.id);
  }

  async exists(idOrPath: string): Promise<boolean> {
    const ids = await this.list();
    return ids.includes(idOrPath) || ids.some(id => id.includes(idOrPath));
  }
}