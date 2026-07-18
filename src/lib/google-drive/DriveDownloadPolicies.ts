/**
 * DriveDownloadPolicies.ts — Sprint EF-6.3.2
 *
 * Configurable policies for ranking and export.
 * Replaces all magic numbers.
 *
 * ALTERAÇÃO 5: RankingPolicy
 * ALTERAÇÃO 6: ExportPolicy
 */

import { DRIVE_MIME } from "./GoogleDriveTypes";

// ── RankingPolicy ─────────────────────────────────────────────────────────────

export interface RankingPolicy {
  /** Min score difference between top-1 and top-2 to auto-select */
  readonly ambiguityThreshold: number;
  /** Weight for exact name match */
  readonly exactMatchWeight: number;
  /** Weight for name contains query */
  readonly containsWeight: number;
  /** Weight for word overlap fraction */
  readonly wordSimilarityWeight: number;
  /** Weight for matching file extension */
  readonly extensionWeight: number;
  /** Max recency bonus (decreases by 1 per month of age) */
  readonly recencyWeight: number;
}

export const DEFAULT_RANKING_POLICY: Readonly<RankingPolicy> = Object.freeze({
  ambiguityThreshold:  30,
  exactMatchWeight:    100,
  containsWeight:      60,
  wordSimilarityWeight: 40,
  extensionWeight:     20,
  recencyWeight:       10,
});

// ── ExportConfig (per MIME) ───────────────────────────────────────────────────

export interface ExportConfig {
  readonly exportMime: string;
  readonly strategy:   "export" | "media";
}

// ── ExportPolicy ──────────────────────────────────────────────────────────────

export interface ExportPolicy {
  readonly mimeMap: Readonly<Record<string, ExportConfig>>;
  /** MIME returned when outputFormat is not recognized */
  readonly fallbackExportMime: string;
}

export const DEFAULT_EXPORT_POLICY: Readonly<ExportPolicy> = Object.freeze({
  mimeMap: Object.freeze({
    [DRIVE_MIME.DOCUMENT]:     { exportMime: "text/plain",      strategy: "export" },
    [DRIVE_MIME.SPREADSHEET]:  { exportMime: "text/csv",        strategy: "export" },
    [DRIVE_MIME.PRESENTATION]: { exportMime: "text/plain",      strategy: "export" },
    [DRIVE_MIME.DRAWING]:      { exportMime: "image/svg+xml",   strategy: "export" },
    [DRIVE_MIME.FORM]:         { exportMime: "application/zip", strategy: "export" },
  } as Record<string, ExportConfig>),
  fallbackExportMime: "text/plain",
});

// ── OUTPUT_FORMAT map (user-specified outputFormat → MIME) ────────────────────

export const OUTPUT_FORMAT_MIME: Readonly<Record<string, string>> = Object.freeze({
  pdf:      "application/pdf",
  docx:     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx:     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx:     "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt:      "text/plain",
  text:     "text/plain",
  markdown: "text/markdown",
  md:       "text/markdown",
  csv:      "text/csv",
  html:     "text/html",
  json:     "application/json",
});

// ── resolveExportConfig ───────────────────────────────────────────────────────
// ALTERAÇÃO 6: respects goal.parameters.outputFormat when provided.

export function resolveExportConfig(
  mimeType: string,
  outputFormat?: string | null,
  policy: ExportPolicy = DEFAULT_EXPORT_POLICY,
): ExportConfig {
  // If user explicitly requested a format, honor it (export strategy always)
  if (outputFormat) {
    const requestedMime = OUTPUT_FORMAT_MIME[outputFormat.toLowerCase().trim()];
    if (requestedMime) {
      return { exportMime: requestedMime, strategy: "export" };
    }
  }

  // Look up by source MIME type
  return policy.mimeMap[mimeType] ?? { exportMime: mimeType, strategy: "media" };
}

// ── rankCandidates ────────────────────────────────────────────────────────────
// ALTERAÇÃO 5: uses RankingPolicy weights instead of magic numbers.

export interface RankCandidate {
  id:           string;
  name:         string;
  mimeType:     string;
  modifiedTime: string | null;
  score:        number;
}

export function rankCandidates(
  files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }>,
  query: string,
  policy: RankingPolicy = DEFAULT_RANKING_POLICY,
): RankCandidate[] {
  if (files.length === 0) return [];

  const qLower = query.toLowerCase().trim();
  const qExt   = qLower.match(/\.([a-z0-9]{1,6})$/i)?.[1]?.toLowerCase() ?? null;

  return files
    .map(f => {
      let score = 0;
      const nameLower = f.name.toLowerCase();

      if (nameLower === qLower) {
        score += policy.exactMatchWeight;
      } else if (nameLower.includes(qLower)) {
        score += policy.containsWeight;
      } else {
        const words   = qLower.split(/\s+/).filter(w => w.length > 2);
        const matched = words.filter(w => nameLower.includes(w));
        if (words.length > 0) score += (matched.length / words.length) * policy.wordSimilarityWeight;
      }

      if (qExt && nameLower.endsWith(`.${qExt}`)) score += policy.extensionWeight;

      if (f.modifiedTime) {
        const ageDays = (Date.now() - new Date(f.modifiedTime).getTime()) / 86400000;
        score += Math.max(0, policy.recencyWeight - Math.floor(ageDays / 30));
      }

      return { ...f, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function isGoogleWorkspaceMime(mimeType: string): boolean {
  return mimeType.startsWith("application/vnd.google-apps.");
}