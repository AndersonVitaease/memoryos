import { filterDownloadCandidates, rankCandidates } from "./DriveDownloadPolicies";
import { isTooGenericDriveSearchQuery, resolveDriveSearchQuery } from "./DriveSearchQueryPolicy";
import type { RankCandidate } from "./DriveDownloadPolicies";

export interface CandidateSelectorInput {
  readonly id: string;
  readonly value: string;
  readonly strategy: string;
  readonly priority: number;
  readonly confidence: number;
}

export interface CandidateExecutionAttempt {
  readonly candidateId: string;
  readonly value: string;
  readonly strategy: string;
  readonly priority: number;
  readonly success: boolean;
  readonly reason: string;
  readonly durationMs: number;
}

export interface CandidateResolutionOutcome {
  readonly success: boolean;
  readonly fileId: string | null;
  readonly ranked: readonly RankCandidate[];
  readonly winnerCandidateId: string | null;
  readonly attempts: readonly CandidateExecutionAttempt[];
}

export async function resolveByCandidateCascade(
  candidates: readonly CandidateSelectorInput[],
  searchByName: (query: string) => Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }>>,
): Promise<CandidateResolutionOutcome> {
  const attempts: CandidateExecutionAttempt[] = [];

  for (const candidate of candidates) {
    const t0 = Date.now();
    const query = resolveDriveSearchQuery(candidate.value);

    if (!query) {
      attempts.push(Object.freeze({
        candidateId: candidate.id,
        value: candidate.value,
        strategy: candidate.strategy,
        priority: candidate.priority,
        success: false,
        reason: "empty_query_after_normalization",
        durationMs: Date.now() - t0,
      }));
      continue;
    }

    if (isTooGenericDriveSearchQuery(query)) {
      attempts.push(Object.freeze({
        candidateId: candidate.id,
        value: candidate.value,
        strategy: candidate.strategy,
        priority: candidate.priority,
        success: false,
        reason: "query_too_generic",
        durationMs: Date.now() - t0,
      }));
      continue;
    }

    try {
      const searchResults = await searchByName(query);
      if (searchResults.length === 0) {
        attempts.push(Object.freeze({
          candidateId: candidate.id,
          value: candidate.value,
          strategy: candidate.strategy,
          priority: candidate.priority,
          success: false,
          reason: "not_found",
          durationMs: Date.now() - t0,
        }));
        continue;
      }

      const filtered = filterDownloadCandidates(searchResults);
      const ranked = rankCandidates(filtered, query);

      if (ranked.length === 0) {
        attempts.push(Object.freeze({
          candidateId: candidate.id,
          value: candidate.value,
          strategy: candidate.strategy,
          priority: candidate.priority,
          success: false,
          reason: "no_downloadable_results",
          durationMs: Date.now() - t0,
        }));
        continue;
      }

      attempts.push(Object.freeze({
        candidateId: candidate.id,
        value: candidate.value,
        strategy: candidate.strategy,
        priority: candidate.priority,
        success: true,
        reason: "resolved",
        durationMs: Date.now() - t0,
      }));

      return Object.freeze({
        success: true,
        fileId: ranked[0].id,
        ranked,
        winnerCandidateId: candidate.id,
        attempts: Object.freeze(attempts),
      });
    } catch (e) {
      attempts.push(Object.freeze({
        candidateId: candidate.id,
        value: candidate.value,
        strategy: candidate.strategy,
        priority: candidate.priority,
        success: false,
        reason: `search_error:${(e as Error).message ?? String(e)}`,
        durationMs: Date.now() - t0,
      }));
    }
  }

  return Object.freeze({
    success: false,
    fileId: null,
    ranked: Object.freeze([]),
    winnerCandidateId: null,
    attempts: Object.freeze(attempts),
  });
}
