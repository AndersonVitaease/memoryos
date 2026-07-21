/**
 * OfficialDocumentMetadata.ts — Sprint EF-41
 *
 * Rich metadata contract for every document in the Official Library Index.
 * Extends the existing OfficialDocumentMeta (OfficialLibraryTypes.ts) with
 * indexing-specific fields: checksum, keywords, category, relationships.
 *
 * This type is owned exclusively by the Index Engine.
 * The Planner, PromptBuilder, UCME and Runtime do NOT depend on it.
 */

// ── Document categories ───────────────────────────────────────────────────────

export type OfficialDocumentCategory =
  | "architecture"      // MAS, MCS, MRS, MDS, ADR
  | "specification"     // MES, MIP, MIEM, MCF, MCIS, MGIS, MDIS, MGFS, MIES
  | "governance"        // MPEGS, MQCCS, MADS, MERS, MREM
  | "operations"        // MEOM, MDOK, MIP, OPERATIONAL-RUNBOOK
  | "vision"            // MV, MPS
  | "engineering"       // MEB, ENGINEERING-BASELINE, ENGINEERING-FIRST
  | "reference"         // MRI, API-REFERENCE, MPAR
  | "developer"         // MDH, MDPS
  | "changelog"         // FREEZE-CHANGELOG, VERSIONING-POLICY, RELEASE
  | "decision"          // ADR-* files
  | "rfc"               // RFC-* files
  | "connector"         // MCF, CONNECTOR-*, connector guides
  | "testing"           // TESTING-STANDARD, CONNECTOR-CERTIFICATION-STANDARD
  | "unknown";

// ── Document status ───────────────────────────────────────────────────────────

export type OfficialDocumentStatus =
  | "active"       // Current canonical version
  | "draft"        // Work in progress — not yet official
  | "deprecated"   // Superseded — kept for historical reference
  | "archived"     // No longer relevant — excluded from retrieval
  | "unknown";

// ── Document type ─────────────────────────────────────────────────────────────

export type OfficialDocumentType =
  | "specification"
  | "architecture-decision-record"
  | "rfc"
  | "guide"
  | "runbook"
  | "changelog"
  | "vision"
  | "standard"
  | "reference"
  | "unknown";

// ── Relationship between documents ───────────────────────────────────────────

export interface DocumentRelationship {
  readonly targetId:       string;
  readonly targetName:     string;
  readonly relationshipType:
    | "supersedes"      // this document replaces targetId
    | "superseded-by"   // this document is replaced by targetId
    | "extends"         // this document extends targetId
    | "implements"      // this document implements targetId
    | "references"      // this document references targetId
    | "governed-by"     // this document is governed by targetId
    | "governs";        // this document governs targetId
  readonly strength: number; // 0–1 (1 = tightly coupled)
}

// ── Core metadata contract ────────────────────────────────────────────────────

export interface OfficialDocumentMetadata {
  // ── Identity ────────────────────────────────────────────────────────────────
  readonly id:          string;   // Unique stable ID (e.g. "MAS-v1.0")
  readonly title:       string;   // Human-readable title
  readonly type:        OfficialDocumentType;
  readonly category:    OfficialDocumentCategory;

  // ── Versioning ──────────────────────────────────────────────────────────────
  readonly version:     string;   // Semver or named version ("v1.0", "1.6")
  readonly author:      string;   // "MemoryOS Engineering" or specific team
  readonly createdAt:   string;   // ISO-8601
  readonly updatedAt:   string;   // ISO-8601 — last modification detected

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  readonly status:      OfficialDocumentStatus;

  // ── Discovery ───────────────────────────────────────────────────────────────
  readonly path:        string;   // File path relative to project root
  readonly rawId:       string;   // Original ID from OfficialDocumentMeta

  // ── Classification ──────────────────────────────────────────────────────────
  readonly tags:        readonly string[];
  readonly keywords:    readonly string[];
  readonly dependencies: readonly string[];        // doc IDs this doc depends on
  readonly relatedDocuments: readonly DocumentRelationship[];

  // ── Integrity ───────────────────────────────────────────────────────────────
  readonly checksum:    string;   // SHA-256 of title+version+path+tags
  readonly chunkCount:  number;
  readonly tokenEstimate: number;
}

// ── Factory helpers ───────────────────────────────────────────────────────────

/**
 * Compute a deterministic checksum for a document.
 * Does NOT use crypto — uses a fast polynomial hash suitable for
 * change-detection in a browser/Deno environment.
 */
export function computeChecksum(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Derive category from document path + title heuristics.
 */
export function deriveCategory(path: string, title: string): OfficialDocumentCategory {
  const p = path.toLowerCase();
  const t = title.toLowerCase();

  if (p.includes("/adr/") || t.startsWith("adr-"))               return "decision";
  if (p.includes("/rfc/") || t.startsWith("rfc-"))               return "rfc";
  if (t.includes("vision") || t.startsWith("mv-"))               return "vision";
  if (t.includes("product") || t.startsWith("mps-"))             return "vision";
  if (t.includes("architecture") && !t.includes("governance"))   return "architecture";
  if (t.includes("engineering specification") || t.startsWith("mes-")) return "specification";
  if (t.includes("governance") || t.startsWith("mpegs") || t.startsWith("mads") || t.startsWith("mqccs")) return "governance";
  if (t.includes("operations manual") || t.startsWith("meom"))   return "operations";
  if (t.includes("onboarding") || t.startsWith("mdok"))          return "operations";
  if (t.includes("runbook"))                                      return "operations";
  if (t.includes("developer handbook") || t.startsWith("mdh"))   return "developer";
  if (t.includes("connector"))                                    return "connector";
  if (t.includes("testing") || t.includes("standard"))           return "testing";
  if (t.includes("changelog") || t.includes("versioning") || t.includes("release")) return "changelog";
  if (t.includes("reference implementation") || t.startsWith("mri")) return "reference";
  if (t.startsWith("mds") || t.includes("developer"))            return "developer";
  return "unknown";
}

/**
 * Derive document type from title / filename heuristics.
 */
export function deriveDocumentType(path: string, title: string): OfficialDocumentType {
  const p = path.toLowerCase();
  const t = title.toLowerCase();

  if (p.includes("/adr/") || t.startsWith("adr-"))    return "architecture-decision-record";
  if (p.includes("/rfc/") || t.startsWith("rfc-"))    return "rfc";
  if (t.includes("runbook"))                           return "runbook";
  if (t.includes("changelog") || t.includes("versioning")) return "changelog";
  if (t.includes("vision") || t.startsWith("mv-"))    return "vision";
  if (t.includes("guide") || t.includes("handbook"))  return "guide";
  if (t.includes("standard"))                         return "standard";
  if (t.includes("reference") && !t.includes("implementation")) return "reference";
  if (t.includes("specification") || t.includes("spec")) return "specification";
  return "specification"; // default for MemoryOS official docs
}

/**
 * Extract keywords from title and tags.
 */
export function extractKeywords(title: string, tags: readonly string[]): string[] {
  const stopWords = new Set([
    "the", "a", "an", "of", "for", "and", "or", "in", "to", "by",
    "memoryos", "memory", "os", "official", "specification",
  ]);

  const fromTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  const fromTags = tags.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(t => t.length > 2);

  return [...new Set([...fromTitle, ...fromTags])];
}