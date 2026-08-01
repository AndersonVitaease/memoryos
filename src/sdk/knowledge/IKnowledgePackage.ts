/**
 * IKnowledgePackage.ts — Knowledge Package SDK
 * Official interface every MemoryOS Knowledge Package MUST implement.
 * MDPS-compliant — Knowledge Packages provide structured domain facts.
 */

export interface OfficialSource {
  readonly name: string;
  readonly url?: string;
  readonly date: string;
  readonly type: "law" | "regulation" | "jurisprudence" | "standard" | "other";
}

export interface KnowledgePackageManifest {
  readonly packageId: string;       // e.g. "com.memoryos.brazilian-labor-law"
  readonly name: string;
  readonly domain: string;
  readonly version: string;         // semver
  readonly author: string;
  readonly license: string;
  readonly sources: readonly OfficialSource[];
  readonly language: string;
  readonly validUntil?: string;     // ISO 8601 — null = no expiry
  readonly dependencies: readonly string[];
}

export interface KnowledgeNode {
  readonly id: string;
  readonly type: "fact" | "concept" | "rule" | "term";
  readonly label: string;
  readonly content: string;
  readonly confidence: number;
  readonly sourceIds: readonly string[];
  readonly tags: readonly string[];
}

export interface KnowledgeEdge {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly relation: "related_to" | "depends_on" | "contradicts" | "extends" | "replaces";
  readonly weight: number;
}

export interface KnowledgePackageContent {
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
}

export interface IKnowledgePackage {
  readonly manifest: KnowledgePackageManifest;
  readonly id: string;
  readonly domain: string;

  /** Returns the full structured content of this package. */
  content(): KnowledgePackageContent;

  /** Query nodes by keyword — returns matching nodes ordered by confidence. */
  query(keyword: string): readonly KnowledgeNode[];

  /** Returns true if package content is still valid (not expired). */
  isValid(): boolean;

  /** Returns current package health. */
  health(): { status: "valid" | "expired" | "partial"; details: string };
}