/**
 * GoogleDriveReferenceResolver.ts — Sprint C-02.2
 * Adapter: resolve referencias humanas em fileIds do Google Drive.
 *
 * SRP: transformar uma referencia de texto em um fileId.
 * Nao executa connectors. Nao abre arquivos. Nao interpreta intencao.
 *
 * Prioridade deterministica (sem randomness):
 *   1. Nome exatamente igual          → confidence = 1.00
 *   2. Nome inicia com a referencia   → confidence = 0.85
 *   3. Nome contém a referencia       → confidence = 0.65
 *   4. Arquivo mais recente           → confidence = 0.30
 *
 * Entrada: lista de arquivos pre-carregada via ResolverContext.preloaded
 * (o caller e responsavel por buscar os dados; este resolver e puramente determinístico).
 */

import type { ReferenceResolver, ResolverContext } from "../ReferenceResolver";
import type { Reference }                          from "../Reference";
import type { ResolutionResult, ResolutionCandidate } from "../ResolutionResult";
import { resolvedResult, failedResult }            from "../ResolutionResult";

interface DriveFile {
  id:           string;
  name:         string;
  modifiedTime?: string;
  mimeType?:    string;
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreFile(name: string, query: string): number {
  const n = name.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (n === q)               return 1.00;
  if (n.startsWith(q))       return 0.85;
  if (n.includes(q))         return 0.65;
  return 0;
}

// ── GoogleDriveReferenceResolver ──────────────────────────────────────────────

export class GoogleDriveReferenceResolver implements ReferenceResolver {
  readonly connectorId = "google-drive";

  async resolve(
    reference: Reference,
    context?: ResolverContext,
  ): Promise<ResolutionResult> {
    const q = reference.text.trim();
    if (!q) {
      return failedResult("google-drive", reference.text, "Reference text is empty");
    }

    // Preloaded file list injected by the caller (from Drive connector output)
    const files = this._extractFiles(context?.preloaded);
    if (files.length === 0) {
      return failedResult("google-drive", reference.text, "No files available for resolution — preload Drive files first");
    }

    const maxCandidates = context?.maxCandidates ?? 10;
    const candidates: ResolutionCandidate[] = [];
    let fallback: DriveFile | null = null;
    let latestModified = "";

    for (const file of files) {
      if (!file.id || !file.name) continue;

      const score = scoreFile(file.name, q);
      if (score > 0) {
        candidates.push(Object.freeze({
          resourceId:  file.id,
          displayName: file.name,
          confidence:  score,
        }));
      }

      // Track most recently modified file as low-confidence fallback
      const mt = file.modifiedTime ?? "";
      if (mt > latestModified) {
        latestModified = mt;
        fallback = file;
      }
    }

    // Add fallback with lowest confidence when no match found
    if (candidates.length === 0 && fallback) {
      candidates.push(Object.freeze({
        resourceId:  fallback.id,
        displayName: fallback.name,
        confidence:  0.30,
      }));
    }

    // Trim to maxCandidates after sort (sort happens in resolvedResult)
    const trimmed = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxCandidates);

    return resolvedResult("google-drive", reference.text, trimmed);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _extractFiles(preloaded: unknown): DriveFile[] {
    if (!preloaded) return [];
    // Accept: { files: DriveFile[] } or DriveFile[] directly
    if (Array.isArray(preloaded)) return preloaded as DriveFile[];
    const p = preloaded as Record<string, unknown>;
    if (Array.isArray(p.files)) return p.files as DriveFile[];
    return [];
  }
}