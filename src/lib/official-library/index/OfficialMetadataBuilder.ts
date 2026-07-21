/**
 * OfficialMetadataBuilder.ts — Sprint EF-41A (Refinement 3)
 *
 * Single responsibility: build OfficialDocumentMetadata from raw, validated inputs.
 *
 * Split from OfficialDocumentScanner which previously performed both:
 *   - scanning / validation (Scanner's job)
 *   - metadata construction (Builder's job)
 *
 * Responsibilities:
 *   - Derive category (via CategoryStrategy)
 *   - Derive document type (via DocumentTypeStrategy)
 *   - Compute FNV-1a checksum
 *   - Extract keywords from title + tags
 *   - Extract relationships (supersedes / supersededBy)
 *   - Extract tag-encoded dependencies
 *   - Assemble final, frozen OfficialDocumentMetadata
 *
 * What this does NOT do:
 *   - Validate document structure (Scanner's job)
 *   - Load or parse raw content (Bootstrap's job)
 *   - Index or store (Indexer's job)
 *
 * SRP: build metadata — one reason to change.
 */

import type { OfficialDocumentMetadata, DocumentRelationship } from "./OfficialDocumentMetadata";
import { computeChecksum, extractKeywords }                    from "./OfficialDocumentMetadata";
import { CategoryStrategy, DocumentTypeStrategy }             from "./ClassificationStrategies";
import type { RawDocumentInput, RawChunkInput }               from "./OfficialLibraryAdapter";

// ── Builder input ─────────────────────────────────────────────────────────────

export interface MetadataBuildInput {
  readonly doc:      RawDocumentInput;
  readonly chunks:   readonly RawChunkInput[];    // chunks belonging to this doc only
  readonly allDocs:  readonly RawDocumentInput[]; // full set, for relationship resolution
}

// ── Builder ───────────────────────────────────────────────────────────────────

class OfficialMetadataBuilderImpl {

  build(input: MetadataBuildInput): OfficialDocumentMetadata {
    const { doc, chunks, allDocs } = input;

    const chunkCount    = chunks.length;
    const tokenEstimate = chunks.reduce((s, c) => s + Math.ceil(c.content.length / 4), 0);
    const tags          = [...doc.tags];
    const keywords      = extractKeywords(doc.name, tags);
    const dependencies  = this._extractDependencies(tags);
    const relationships = this._extractRelationships(doc, allDocs);

    const checksumInput = `${doc.id}|${doc.name}|${doc.version}|${doc.path}|${[...tags].sort().join(",")}`;
    const checksum      = computeChecksum(checksumInput);

    const category = CategoryStrategy.derive(doc.path, doc.name);
    const type     = DocumentTypeStrategy.derive(doc.path, doc.name);

    const now = new Date().toISOString();

    return Object.freeze({
      id:               doc.id,
      title:            doc.name,
      type,
      category,
      version:          doc.version || "unknown",
      author:           "MemoryOS Engineering",
      createdAt:        doc.createdAt || now,
      updatedAt:        doc.updatedAt || now,
      status:           doc.deprecated ? "deprecated" : "active",
      path:             doc.path,
      rawId:            doc.id,
      tags:             Object.freeze(tags),
      keywords:         Object.freeze(keywords),
      dependencies:     Object.freeze(dependencies),
      relatedDocuments: Object.freeze(relationships),
      checksum,
      chunkCount,
      tokenEstimate,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _extractDependencies(tags: string[]): string[] {
    const deps: string[] = [];
    for (const tag of tags) {
      const match = tag.match(/^(?:depends|implements|extends):(.+)$/i);
      if (match) deps.push(match[1].trim());
    }
    return deps;
  }

  private _extractRelationships(
    doc: RawDocumentInput,
    allDocs: readonly RawDocumentInput[],
  ): DocumentRelationship[] {
    const relationships: DocumentRelationship[] = [];

    if (doc.supersedes) {
      const target = allDocs.find(d => d.id === doc.supersedes);
      relationships.push({
        targetId:         doc.supersedes,
        targetName:       target?.name ?? doc.supersedes,
        relationshipType: "supersedes",
        strength:         1.0,
      });
    }

    if (doc.supersededBy) {
      const target = allDocs.find(d => d.id === doc.supersededBy);
      relationships.push({
        targetId:         doc.supersededBy,
        targetName:       target?.name ?? doc.supersededBy,
        relationshipType: "superseded-by",
        strength:         1.0,
      });
    }

    return relationships;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_META_BUILDER__?: OfficialMetadataBuilderImpl };
if (!G.__OL_META_BUILDER__) G.__OL_META_BUILDER__ = new OfficialMetadataBuilderImpl();
export const OfficialMetadataBuilder: OfficialMetadataBuilderImpl = G.__OL_META_BUILDER__;