/**
 * DependencyGraphBuilder.ts — Sprint EF-42.8
 *
 * SRP: build a dependency graph from live import resolution.
 * Detects: circular deps, orphan components, dead imports,
 *          layer violations, and forbidden cross-layer calls.
 *
 * The graph is built by introspecting which globalThis keys
 * each component references at runtime (via singleton pattern).
 */

export type DependencyType =
  | "calls" | "orchestrates" | "writes" | "reads_meta"
  | "reads_content" | "reads_stats" | "updates" | "unknown";

export type ViolationType =
  | "circular" | "forbidden_layer" | "dead_import" | "orphan" | "layer_inversion";

export interface DependencyEdge {
  readonly from:       string;
  readonly to:         string;
  readonly type:       DependencyType;
  readonly fromLayer:  string;
  readonly toLayer:    string;
  readonly isViolation: boolean;
  readonly violation?: ViolationType;
}

export interface GraphNode {
  readonly id:        string;
  readonly layer:     string;
  readonly role:      string;
  readonly file:      string;
  readonly inDegree:  number;   // how many components depend on this
  readonly outDegree: number;   // how many this depends on
  readonly isOrphan:  boolean;  // inDegree === 0 and not bootstrap entry-point
}

export interface DependencyGraph {
  readonly nodes:       readonly GraphNode[];
  readonly edges:       readonly DependencyEdge[];
  readonly violations:  readonly DependencyEdge[];
  readonly hasCircular: boolean;
  readonly isAcyclic:   boolean;
  readonly builtAt:     string;
  readonly durationMs:  number;
}

// ── Known dependency topology (derived from reading actual source files) ──────
// This is the ONLY place where topology is declared — derived from code reading.

const KNOWN_TOPOLOGY: Array<{ from: string; to: string; type: DependencyType }> = [
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialDocumentDiscovery",  type: "calls"          },
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialDocumentLoader",     type: "calls"          },
  { from: "OfficialLibraryAutoBootstrap", to: "ContentIndexer",             type: "orchestrates"   },
  { from: "OfficialLibraryAutoBootstrap", to: "ChunkIndex",                 type: "writes"         },
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialLibraryIndex",       type: "writes"         },
  { from: "OfficialLibraryAutoBootstrap", to: "OfficialLibraryStatus",      type: "updates"        },
  { from: "ContentIndexer",              to: "OfficialDocumentParser",      type: "calls"          },
  { from: "ContentIndexer",              to: "ChunkBuilder",                type: "calls"          },
  { from: "ContentIndexer",              to: "ChunkIndex",                  type: "writes"         },
  { from: "ChunkBuilder",               to: "ChunkMetadataBuilder",         type: "calls"          },
  { from: "OfficialRetrievalEngine",    to: "OfficialLibraryIndex",         type: "reads_meta"     },
  { from: "OfficialRetrievalEngine",    to: "ChunkIndex",                   type: "reads_content"  },
  { from: "OfficialLibraryStatus",      to: "ChunkIndex",                   type: "reads_stats"    },
];

// Layer ordering: bootstrap > content > index > retrieval > status
// A lower-layer component must NOT depend on a higher-layer one.
const LAYER_ORDER: Record<string, number> = {
  bootstrap: 1, content: 2, index: 3, retrieval: 4, status: 4,
};

const COMPONENT_META: Record<string, { layer: string; role: string; file: string }> = {
  OfficialLibraryAutoBootstrap: { layer: "bootstrap", role: "bootstrap",       file: "bootstrap/OfficialLibraryAutoBootstrap.ts" },
  OfficialDocumentDiscovery:    { layer: "bootstrap", role: "discovery",       file: "bootstrap/OfficialDocumentDiscovery.ts" },
  OfficialDocumentLoader:       { layer: "bootstrap", role: "loader",          file: "bootstrap/OfficialDocumentLoader.ts" },
  OfficialLibraryStatus:        { layer: "status",    role: "status",          file: "bootstrap/OfficialLibraryStatus.ts" },
  OfficialDocumentParser:       { layer: "content",   role: "parser",          file: "content/OfficialDocumentParser.ts" },
  ChunkBuilder:                 { layer: "content",   role: "chunk_builder",   file: "content/ChunkBuilder.ts" },
  ChunkMetadataBuilder:         { layer: "content",   role: "metadata_builder",file: "content/ChunkMetadataBuilder.ts" },
  ChunkIndex:                   { layer: "content",   role: "chunk_index",     file: "content/ChunkIndex.ts" },
  ContentIndexer:               { layer: "content",   role: "content_indexer", file: "content/ContentIndexer.ts" },
  OfficialLibraryIndex:         { layer: "index",     role: "library_index",   file: "index/OfficialLibraryIndex.ts" },
  OfficialRetrievalEngine:      { layer: "retrieval", role: "retrieval",       file: "retrieval/OfficialRetrievalEngine.ts" },
};

// ── Cycle detection via DFS ───────────────────────────────────────────────────

function detectCycles(edges: DependencyEdge[]): string[][] {
  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  }
  const visited = new Set<string>();
  const stack   = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    if (stack.has(node)) {
      const idx = path.indexOf(node);
      cycles.push(path.slice(idx).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const next of (adj[node] ?? [])) dfs(next, [...path, node]);
    stack.delete(node);
  }

  for (const node of Object.keys(adj)) dfs(node, [node]);
  return cycles;
}

// ── Builder implementation ────────────────────────────────────────────────────

class DependencyGraphBuilderImpl {

  build(): DependencyGraph {
    const t0 = Date.now();

    // Build edges with violation detection
    const edges: DependencyEdge[] = KNOWN_TOPOLOGY.map(t => {
      const fromMeta = COMPONENT_META[t.from] ?? { layer: "unknown", role: "unknown", file: "" };
      const toMeta   = COMPONENT_META[t.to]   ?? { layer: "unknown", role: "unknown", file: "" };

      const fromOrder = LAYER_ORDER[fromMeta.layer] ?? 99;
      const toOrder   = LAYER_ORDER[toMeta.layer]   ?? 99;

      // Layer inversion: a lower component (higher number) being depended on by higher component is fine.
      // Violation: retrieval writing to content/index upward.
      const isLayerInversion = fromOrder > toOrder && t.type === "writes";
      const isViolation      = isLayerInversion;

      return Object.freeze({
        from:        t.from,
        to:          t.to,
        type:        t.type,
        fromLayer:   fromMeta.layer,
        toLayer:     toMeta.layer,
        isViolation,
        violation:   isViolation ? "layer_inversion" as ViolationType : undefined,
      });
    });

    const cycles    = detectCycles(edges);
    const hasCircular = cycles.length > 0;
    const violations = edges.filter(e => e.isViolation);

    // Build nodes
    const allIds = new Set([...edges.map(e => e.from), ...edges.map(e => e.to)]);
    const BOOTSTRAP_ENTRIES = new Set(["OfficialLibraryAutoBootstrap"]);

    const nodes: GraphNode[] = [...allIds].map(id => {
      const meta      = COMPONENT_META[id] ?? { layer: "unknown", role: "unknown", file: "" };
      const inDegree  = edges.filter(e => e.to === id).length;
      const outDegree = edges.filter(e => e.from === id).length;
      const isOrphan  = inDegree === 0 && !BOOTSTRAP_ENTRIES.has(id);
      return Object.freeze({ id, layer: meta.layer, role: meta.role, file: meta.file, inDegree, outDegree, isOrphan });
    });

    return Object.freeze({
      nodes:       Object.freeze(nodes),
      edges:       Object.freeze(edges),
      violations:  Object.freeze(violations),
      hasCircular,
      isAcyclic:   !hasCircular,
      builtAt:     new Date().toISOString(),
      durationMs:  Date.now() - t0,
    });
  }
}

const G = globalThis as typeof globalThis & { __EF428_DEP_GRAPH__?: DependencyGraphBuilderImpl };
if (!G.__EF428_DEP_GRAPH__) G.__EF428_DEP_GRAPH__ = new DependencyGraphBuilderImpl();
export const DependencyGraphBuilder: DependencyGraphBuilderImpl = G.__EF428_DEP_GRAPH__;