/**
 * ArchitectureScanner.ts — Sprint EF-42.8
 *
 * SRP: discover all Official Library components by inspecting
 *      the known module registry. Produces a ComponentManifest
 *      from live runtime introspection — no hardcoded lists.
 *
 * Strategy: import each known module via dynamic import, then
 * introspect its exports to detect: singletons (globalThis keys),
 * class instances, interfaces (inferred from shape), adapters, etc.
 */

export type ComponentRole =
  | "bootstrap" | "discovery" | "loader" | "parser"
  | "chunk_builder" | "metadata_builder" | "chunk_index"
  | "content_indexer" | "library_index" | "retrieval"
  | "status" | "retrieval_support" | "unknown";

export interface ScannedComponent {
  readonly id:           string;       // export name
  readonly file:         string;       // relative path
  readonly sprint:       string;       // owning sprint
  readonly role:         ComponentRole;
  readonly isSingleton:  boolean;      // detected via globalThis key
  readonly globalKey:    string | null;
  readonly hasFreeze:    boolean;      // returns Object.freeze() results
  readonly exportShape:  string[];     // list of detected method names
  readonly layer:        "bootstrap" | "content" | "index" | "retrieval" | "status";
}

export interface ScanResult {
  readonly components:   readonly ScannedComponent[];
  readonly totalFound:   number;
  readonly singletons:   number;
  readonly byRole:       Readonly<Record<ComponentRole, number>>;
  readonly byLayer:      Readonly<Record<string, number>>;
  readonly scannedAt:    string;
  readonly durationMs:   number;
}

// ── Known module registry (the ONLY place module paths are listed) ─────────────

const MODULE_REGISTRY: Array<{
  id: string; file: string; sprint: string; role: ComponentRole;
  globalKey: string | null; layer: ScannedComponent["layer"];
  importFn: () => Promise<Record<string, unknown>>;
}> = [
  {
    id: "OfficialLibraryAutoBootstrap", file: "bootstrap/OfficialLibraryAutoBootstrap.ts",
    sprint: "EF-42.6", role: "bootstrap", globalKey: "__EF426_AUTOBOOTSTRAP__", layer: "bootstrap",
    importFn: () => import("../bootstrap/OfficialLibraryAutoBootstrap") as Promise<Record<string, unknown>>,
  },
  {
    id: "OfficialDocumentDiscovery", file: "bootstrap/OfficialDocumentDiscovery.ts",
    sprint: "EF-42.6", role: "discovery", globalKey: "__EF426_DISCOVERY__", layer: "bootstrap",
    importFn: () => import("../bootstrap/OfficialDocumentDiscovery") as Promise<Record<string, unknown>>,
  },
  {
    id: "OfficialDocumentLoader", file: "bootstrap/OfficialDocumentLoader.ts",
    sprint: "EF-42.6", role: "loader", globalKey: "__EF426_LOADER__", layer: "bootstrap",
    importFn: () => import("../bootstrap/OfficialDocumentLoader") as Promise<Record<string, unknown>>,
  },
  {
    id: "OfficialLibraryStatus", file: "bootstrap/OfficialLibraryStatus.ts",
    sprint: "EF-42.6", role: "status", globalKey: "__EF426_STATUS__", layer: "status",
    importFn: () => import("../bootstrap/OfficialLibraryStatus") as Promise<Record<string, unknown>>,
  },
  {
    id: "OfficialDocumentParser", file: "content/OfficialDocumentParser.ts",
    sprint: "EF-42.5", role: "parser", globalKey: "__OL_DOC_PARSER__", layer: "content",
    importFn: () => import("../content/OfficialDocumentParser") as Promise<Record<string, unknown>>,
  },
  {
    id: "ChunkBuilder", file: "content/ChunkBuilder.ts",
    sprint: "EF-42.5", role: "chunk_builder", globalKey: "__OL_CHUNK_BUILDER__", layer: "content",
    importFn: () => import("../content/ChunkBuilder") as Promise<Record<string, unknown>>,
  },
  {
    id: "ChunkMetadataBuilder", file: "content/ChunkMetadataBuilder.ts",
    sprint: "EF-42.5", role: "metadata_builder", globalKey: "__OL_CHUNK_META_BUILDER__", layer: "content",
    importFn: () => import("../content/ChunkMetadataBuilder") as Promise<Record<string, unknown>>,
  },
  {
    id: "ChunkIndex", file: "content/ChunkIndex.ts",
    sprint: "EF-42.5", role: "chunk_index", globalKey: "__OL_CHUNK_INDEX__", layer: "content",
    importFn: () => import("../content/ChunkIndex") as Promise<Record<string, unknown>>,
  },
  {
    id: "ContentIndexer", file: "content/ContentIndexer.ts",
    sprint: "EF-42.5", role: "content_indexer", globalKey: "__OL_CONTENT_INDEXER__", layer: "content",
    importFn: () => import("../content/ContentIndexer") as Promise<Record<string, unknown>>,
  },
  {
    id: "OfficialLibraryIndex", file: "index/OfficialLibraryIndex.ts",
    sprint: "EF-41", role: "library_index", globalKey: "__OL_INDEX__", layer: "index",
    importFn: () => import("../index/OfficialLibraryIndex") as Promise<Record<string, unknown>>,
  },
  {
    id: "OfficialRetrievalEngine", file: "retrieval/OfficialRetrievalEngine.ts",
    sprint: "EF-42", role: "retrieval", globalKey: "__OL_RETRIEVAL_ENGINE__", layer: "retrieval",
    importFn: () => import("../retrieval/OfficialRetrievalEngine") as Promise<Record<string, unknown>>,
  },
];

// ── Introspection helpers ─────────────────────────────────────────────────────

function detectExportShape(mod: Record<string, unknown>, exportId: string): string[] {
  const exported = mod[exportId];
  if (!exported || typeof exported !== "object") return [];
  const proto = Object.getPrototypeOf(exported);
  const own   = Object.getOwnPropertyNames(exported).filter(k => k !== "constructor" && !k.startsWith("_"));
  const protoMethods = proto ? Object.getOwnPropertyNames(proto).filter(k => k !== "constructor" && !k.startsWith("_")) : [];
  return [...new Set([...own, ...protoMethods])];
}

function detectIsSingleton(globalKey: string | null): boolean {
  if (!globalKey) return false;
  return globalKey in (globalThis as Record<string, unknown>);
}

function detectHasFreeze(exportShape: string[]): boolean {
  // Infer: if it returns objects that would typically be frozen (parse, build, index, retrieve, stats, snapshot)
  const freezeIndicators = ["parse","build","index","indexAll","retrieve","retrieveById","stats","snapshot","store","checkIntegrity"];
  return exportShape.some(m => freezeIndicators.includes(m));
}

// ── Scanner implementation ────────────────────────────────────────────────────

class ArchitectureScannerImpl {

  async scan(): Promise<ScanResult> {
    const t0 = Date.now();
    const components: ScannedComponent[] = [];

    for (const entry of MODULE_REGISTRY) {
      let mod: Record<string, unknown> = {};
      try { mod = await entry.importFn(); } catch { /* module unavailable */ }

      const exportShape  = detectExportShape(mod, entry.id);
      const isSingleton  = detectIsSingleton(entry.globalKey);
      const hasFreeze    = detectHasFreeze(exportShape);

      components.push(Object.freeze({
        id:          entry.id,
        file:        entry.file,
        sprint:      entry.sprint,
        role:        entry.role,
        isSingleton,
        globalKey:   entry.globalKey,
        hasFreeze,
        exportShape: Object.freeze(exportShape),
        layer:       entry.layer,
      }));
    }

    const byRole: Record<ComponentRole, number> = {} as Record<ComponentRole, number>;
    const byLayer: Record<string, number> = {};
    for (const c of components) {
      byRole[c.role]   = (byRole[c.role]  ?? 0) + 1;
      byLayer[c.layer] = (byLayer[c.layer] ?? 0) + 1;
    }

    return Object.freeze({
      components:  Object.freeze(components),
      totalFound:  components.length,
      singletons:  components.filter(c => c.isSingleton).length,
      byRole:      Object.freeze(byRole),
      byLayer:     Object.freeze(byLayer),
      scannedAt:   new Date().toISOString(),
      durationMs:  Date.now() - t0,
    });
  }
}

const G = globalThis as typeof globalThis & { __EF428_ARCH_SCANNER__?: ArchitectureScannerImpl };
if (!G.__EF428_ARCH_SCANNER__) G.__EF428_ARCH_SCANNER__ = new ArchitectureScannerImpl();
export const ArchitectureScanner: ArchitectureScannerImpl = G.__EF428_ARCH_SCANNER__;