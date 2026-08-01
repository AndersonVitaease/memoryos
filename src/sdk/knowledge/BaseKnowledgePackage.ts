/**
 * BaseKnowledgePackage.ts — Knowledge Package SDK
 * Abstract base class for all MemoryOS Knowledge Packages.
 * Provides standard query, validation, and health reporting.
 * Subclasses implement only domain-specific content loading.
 *
 * P3 · Version: 1.0.0
 */

import type {
  IKnowledgePackage,
  KnowledgePackageManifest,
  KnowledgePackageContent,
  KnowledgeNode,
} from "./IKnowledgePackage";

export abstract class BaseKnowledgePackage implements IKnowledgePackage {
  readonly manifest: KnowledgePackageManifest;
  readonly id: string;
  readonly domain: string;

  constructor(manifest: KnowledgePackageManifest) {
    this.manifest = manifest;
    this.id = manifest.packageId;
    this.domain = manifest.domain;
  }

  // ── Abstract — subclasses implement ──────────────────────────────────────

  /** Returns the complete structured content for this package. */
  abstract content(): KnowledgePackageContent;

  // ── IKnowledgePackage interface ───────────────────────────────────────────

  query(keyword: string): readonly KnowledgeNode[] {
    const kw = keyword.toLowerCase();
    return this.content().nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(kw) ||
        n.content.toLowerCase().includes(kw) ||
        n.tags.some((t) => t.toLowerCase().includes(kw))
    ).sort((a, b) => b.confidence - a.confidence);
  }

  isValid(): boolean {
    if (!this.manifest.validUntil) return true;
    return new Date(this.manifest.validUntil).getTime() > Date.now();
  }

  health(): { status: "valid" | "expired" | "partial"; details: string } {
    if (!this.isValid()) {
      return {
        status: "expired",
        details: `${this.manifest.name} v${this.manifest.version} — expired at ${this.manifest.validUntil}`,
      };
    }
    const { nodes, edges } = this.content();
    const status = nodes.length > 0 ? "valid" : "partial";
    return {
      status,
      details: `${this.manifest.name} v${this.manifest.version} — nodes=${nodes.length} edges=${edges.length} valid=true`,
    };
  }
}