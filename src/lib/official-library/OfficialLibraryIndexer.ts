/**
 * OfficialLibraryIndexer.ts — Sprint EF-7.2.0
 *
 * Loads, parses, and indexes all official library documents.
 * Produces a searchable in-memory index of OfficialChunk[].
 * Interface-ready for future embedding generation.
 *
 * Architecture:
 *   Catalog → Parser → Chunker → Index
 *   Index is queried by OfficialLibraryProvider (search).
 */

import type { OfficialChunk, OfficialDocumentMeta, OfficialLibraryStats } from "./OfficialLibraryTypes";
import { MemoryAuthority, MemorySourceType } from "./OfficialLibraryTypes";
import { OfficialLibraryParser } from "./OfficialLibraryParser";
import { OfficialLibraryChunker } from "./OfficialLibraryChunker";
import { OfficialAuthority } from "./OfficialAuthority";

// ── Embedding interface (future) ──────────────────────────────────────────────

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  similarity(a: number[], b: number[]): number;
}

// ── Official Library Catalog ──────────────────────────────────────────────────
// Represents all documents in src/docs/00-official-library/ and src/docs/foundation/
// Loaded as embedded content (no file-system API in browser).

interface CatalogEntry {
  id:    string;
  name:  string;
  path:  string;
  load:  () => Promise<string>;
}

// ── In-memory document catalog ────────────────────────────────────────────────
// Documents are embedded inline as JS strings so the browser can load them.
// The content is loaded lazily on first indexing.

function makeCatalog(): CatalogEntry[] {
  return [
    {
      id: "doc-mv",
      name: "MV-MemoryOS-Vision",
      path: "src/docs/00-official-library/MV-MemoryOS-Vision.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MV-MemoryOS-Vision.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-mv"] ?? ""; }
      },
    },
    {
      id: "doc-mps",
      name: "MPS-MemoryOS-Product-Specification",
      path: "src/docs/00-official-library/MPS-MemoryOS-Product-Specification.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MPS-MemoryOS-Product-Specification.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-mps"] ?? ""; }
      },
    },
    {
      id: "doc-mas",
      name: "MAS-MemoryOS-Architecture-Specification",
      path: "src/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MAS-MemoryOS-Architecture-Specification.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-mas"] ?? ""; }
      },
    },
    {
      id: "doc-mcs",
      name: "MCS-MemoryOS-Core-Specification",
      path: "src/docs/00-official-library/MCS-MemoryOS-Core-Specification.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MCS-MemoryOS-Core-Specification.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-mcs"] ?? ""; }
      },
    },
    {
      id: "doc-constitution",
      name: "MEMORYOS-CONSTITUTION",
      path: "src/docs/00-official-library/MEMORYOS-CONSTITUTION.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MEMORYOS-CONSTITUTION.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-constitution"] ?? ""; }
      },
    },
    {
      id: "doc-arch-freeze",
      name: "ARCHITECTURE-FREEZE-DECLARATION",
      path: "src/docs/00-official-library/ARCHITECTURE-FREEZE-DECLARATION.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/ARCHITECTURE-FREEZE-DECLARATION.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-arch-freeze"] ?? ""; }
      },
    },
    {
      id: "doc-foundation",
      name: "FOUNDATION",
      path: "src/docs/foundation/FOUNDATION.md",
      load: async () => {
        try { const m = await import("@/docs/foundation/FOUNDATION.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-foundation"] ?? ""; }
      },
    },
    {
      id: "doc-mri",
      name: "MRI-MemoryOS-Reference-Implementation",
      path: "src/docs/00-official-library/MRI-MemoryOS-Reference-Implementation.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MRI-MemoryOS-Reference-Implementation.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-mri"] ?? ""; }
      },
    },
    {
      id: "doc-governance",
      name: "ARCHITECTURE-GOVERNANCE",
      path: "src/docs/00-official-library/ARCHITECTURE-GOVERNANCE.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/ARCHITECTURE-GOVERNANCE.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-governance"] ?? ""; }
      },
    },
    {
      id: "doc-mes",
      name: "MES-MemoryOS-Engineering-Specification",
      path: "src/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md",
      load: async () => {
        try { const m = await import("@/docs/00-official-library/MES-MemoryOS-Engineering-Specification.md?raw"); return m.default; }
        catch { return EMBEDDED_FALLBACK["doc-mes"] ?? ""; }
      },
    },
  ];
}

// ── Embedded fallback content ─────────────────────────────────────────────────
// Used when ?raw imports are not available (Vite plugin not configured for md).
// Contains essential knowledge as structured text.

const EMBEDDED_FALLBACK: Record<string, string> = {
  "doc-mv": `# MV — MemoryOS Vision v1.0

## Mission
MemoryOS is a permanent, intelligent memory layer for humans.
It preserves long-term user knowledge, allowing users to converse naturally with their history.

## Core Principles
- Memory is the foundation of intelligence
- Knowledge should be permanent and accessible
- The user should never have to manage files, chats, or manual summaries
- All knowledge sources are equal: voice, text, documents, emails, code

## Architecture Vision
Single unified memory engine (UCME) that aggregates all memory providers.
Memory Reasoning Engine (MRE) for intelligent knowledge extraction.
Official Library as the highest-authority knowledge source.

## Key Components
- UnifiedCognitiveMemoryEngine (UCME)
- MemoryReasoningEngine (MRE)
- Official Library Provider
- Conversation Memory Provider
- Knowledge Graph Provider
- Google Workspace Providers`,

  "doc-mas": `# MAS — MemoryOS Architecture Specification v3.0

## Chapter 1: Architecture Principles

### Section 1.1: Single Responsibility
Every component has exactly one reason to change.
UCME is the sole memory access point.
MRE is the sole reasoning engine.
Official Library is the sole authority source.

### Section 1.2: Open/Closed Principle
Components are open for extension (new providers, new rules).
Components are closed for modification.

### Section 1.3: Dependency Inversion
High-level modules (Planner) depend on abstractions (UCME interface).
Never on concrete implementations (ConversationMemoryProvider).

## Chapter 2: UCME Architecture

### Section 2.1: Provider Model
MemoryProvider interface defines the contract.
Providers self-register via MemoryProviderRegistry.
UnifiedMemoryEngine queries all registered providers.

### Section 2.2: Fusion
MemoryFusionEngine merges, deduplicates, and ranks evidence.
Ranking: Authority > Confidence > Relevance > Recency.

## Chapter 3: MRE Architecture

### Section 3.1: Pipeline
MemoryEvidence[] → SimilarityEngine → RuleRegistry → ConflictResolver → ReasoningResult

### Section 3.2: Rules
Rules are registered externally via ReasoningRuleRegistry.
The engine never knows individual rules.

## Chapter 4: Official Library

### Section 4.1: Authority Hierarchy
OFFICIAL > VERIFIED > LEARNED > USER > EXTERNAL
Official Library evidence always has highest authority.

### Section 4.2: Guard
No LLM, connector, or external source may override Official Library knowledge.
Conflicts are logged, official knowledge preserved.`,

  "doc-mps": `# MPS — MemoryOS Product Specification v2.0

## Product Goals
- Natural conversation with your entire history
- Zero manual memory management
- Automatic knowledge extraction and indexing
- Multi-source memory fusion

## Core Features
- Conversation Memory: preserves all chat history
- Document Memory: indexes all uploaded documents
- Email Memory: reads and indexes Gmail
- Drive Memory: searches Google Drive
- Official Library Memory: authoritative architecture knowledge

## User Experience
The user simply asks. MemoryOS finds the answer.
No need to specify where to look — UCME handles routing.`,

  "doc-constitution": `# MemoryOS Constitution v1.0

## Article 1: Memory Sovereignty
The user owns all their memory. No data is shared without consent.

## Article 2: Architecture Integrity
The Official Library is the supreme architectural authority.
No implementation may contradict the Official Library.

## Article 3: Evidence-Based Reasoning
No response may be generated without verifiable evidence.
All conclusions must cite their sources.

## Article 4: Provider Independence
All memory providers are equal at the interface level.
Authority ranking is applied only during fusion.

## Article 5: Non-Regression
No sprint may break existing APIs or functionality.
Zero regression is a hard requirement.`,

  "doc-foundation": `# Foundation v1.0

## Engineering Principles
SOLID principles apply to all components.
Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion.

## Quality Standards
100% TypeScript for all new code.
Zero any types in public APIs.
All public APIs must be stable and documented.

## Testing Requirements
Every new module must have a test suite.
Zero regression on every sprint.`,

  "doc-mri": `# MRI — MemoryOS Reference Implementation v1.0

## Reference Components
- WorkingMemoryEngine: active session memory
- UnifiedMemoryEngine: multi-provider memory access
- MemoryReasoningEngine: evidence-based reasoning
- OfficialLibraryProvider: authoritative knowledge

## Integration Points
Planner → UCME → Providers → MRE → ReasoningResult → Response`,

  "doc-governance": `# Architecture Governance v1.0

## Governance Rules
1. No component may directly import another component at the same layer.
2. All cross-layer communication goes through defined interfaces.
3. Official Library changes require engineering review.
4. Architecture decisions are documented as ADRs.

## Change Process
1. Propose change as ADR
2. Engineering review
3. Impact analysis
4. Implementation
5. Test verification
6. Documentation update`,

  "doc-mcs": `# MCS — MemoryOS Core Specification v1.0

## Core Systems
- Memory Pipeline: ingestion, indexing, retrieval
- Reasoning Pipeline: evidence analysis, conflict resolution, knowledge synthesis
- Execution Pipeline: goal detection, capability routing, connector execution

## Data Flow
User Input → Intent → Goal → Capabilities → Connectors → Memory → Response`,

  "doc-mes": `# MES — MemoryOS Engineering Specification v1.0

## Engineering Standards
- All modules use TypeScript strict mode
- No circular dependencies
- HMR-safe singletons via globalThis
- Immutable data structures (Object.freeze)
- Pure functions for all stateless logic

## Module Structure
Each module: Types → Interfaces → Implementation → Tests → Registration`,

  "doc-arch-freeze": `# Architecture Freeze Declaration v1.0

## Frozen APIs
- MemoryProvider interface (UCMETypes.ts)
- MemoryEvidence shape (UCMETypes.ts)
- ReasoningResult shape (MRETypes.ts)
- MemoryProviderRegistry interface
- UnifiedMemoryEngine public API

## Freeze Rules
Frozen APIs may only be extended (new optional fields).
Breaking changes require a new major version and migration path.`,
};

// ── Indexer Implementation ────────────────────────────────────────────────────

class OfficialLibraryIndexerImpl {
  private _chunks:    OfficialChunk[]           = [];
  private _metas:     Map<string, OfficialDocumentMeta> = new Map();
  private _indexed:   boolean                   = false;
  private _indexedAt: string | null             = null;
  private _catalog:   CatalogEntry[]            = [];

  async initialize(): Promise<void> {
    if (this._indexed) return;
    this._catalog = makeCatalog();
    await this._buildIndex();
    this._indexed  = true;
    this._indexedAt = new Date().toISOString();
  }

  private async _buildIndex(): Promise<void> {
    const catalog = this._catalog;
    const results = await Promise.allSettled(
      catalog.map(entry => this._loadEntry(entry))
    );

    const allChunks: OfficialChunk[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        allChunks.push(...r.value.chunks);
        this._metas.set(r.value.meta.documentId, r.value.meta);
      }
    }
    this._chunks = allChunks;
  }

  private async _loadEntry(entry: CatalogEntry): Promise<{ chunks: OfficialChunk[]; meta: OfficialDocumentMeta }> {
    let raw: string;
    try {
      raw = await entry.load();
    } catch {
      raw = EMBEDDED_FALLBACK[entry.id] ?? `# ${entry.name}\n\nContent not available.`;
    }

    if (!raw || raw.trim().length < 10) {
      raw = EMBEDDED_FALLBACK[entry.id] ?? `# ${entry.name}\n\nContent not available.`;
    }

    const parsed = OfficialLibraryParser.parse(raw, entry.path, entry.name);
    const chunks = OfficialLibraryChunker.chunk(parsed);

    const meta: OfficialDocumentMeta = {
      documentId:   parsed.documentId,
      documentName: parsed.documentName,
      version:      parsed.version,
      createdAt:    parsed.detectedAt,
      updatedAt:    parsed.detectedAt,
      deprecated:   false,
      supersedes:   null,
      supersededBy: null,
      authority:    parsed.authority,
      tags:         parsed.tags,
      path:         parsed.path,
    };

    return { chunks, meta };
  }

  get isIndexed(): boolean   { return this._indexed; }
  get indexedAt(): string | null { return this._indexedAt; }
  get chunkCount(): number   { return this._chunks.length; }
  get documentCount(): number { return this._metas.size; }

  getChunks(): OfficialChunk[] { return [...this._chunks]; }

  getMeta(documentId: string): OfficialDocumentMeta | null {
    return this._metas.get(documentId) ?? null;
  }

  getAllMeta(): OfficialDocumentMeta[] {
    return [...this._metas.values()];
  }

  /** Keyword search over chunks. Returns ranked results. */
  search(queryText: string, maxResults = 10): OfficialChunk[] {
    if (!this._indexed || this._chunks.length === 0) return [];
    const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const scored = this._chunks.map(chunk => {
      const haystack = `${chunk.title} ${chunk.summary} ${chunk.content}`.toLowerCase();
      const hits     = words.filter(w => haystack.includes(w)).length;
      const score    = hits / words.length;
      return { chunk, score };
    });

    return scored
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ chunk }) => chunk);
  }

  /** Force reindex a specific document. */
  async reindex(documentId: string): Promise<boolean> {
    const entry = this._catalog.find(e => e.id === documentId);
    if (!entry) return false;
    try {
      const { chunks, meta } = await this._loadEntry(entry);
      this._chunks = this._chunks.filter(c => c.documentId !== documentId);
      this._chunks.push(...chunks);
      this._metas.set(documentId, meta);
      this._indexedAt = new Date().toISOString();
      return true;
    } catch {
      return false;
    }
  }

  stats(): OfficialLibraryStats {
    const authorities: Record<string, number> = {};
    for (const meta of this._metas.values()) {
      authorities[meta.authority] = (authorities[meta.authority] ?? 0) + 1;
    }
    const versions = [...new Set(this._chunks.map(c => c.version))].sort();
    return {
      documentCount: this._metas.size,
      chunkCount:    this._chunks.length,
      totalTokens:   this._chunks.reduce((s, c) => s + Math.ceil(c.content.length / 4), 0),
      lastIndexedAt: this._indexedAt,
      versions,
      authorities,
    };
  }

  /** Reset for testing. */
  _reset(): void {
    this._chunks    = [];
    this._metas     = new Map();
    this._indexed   = false;
    this._indexedAt = null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_INDEXER__?: OfficialLibraryIndexerImpl };
if (!G.__OL_INDEXER__) G.__OL_INDEXER__ = new OfficialLibraryIndexerImpl();
export const OfficialLibraryIndexer: OfficialLibraryIndexerImpl = G.__OL_INDEXER__;