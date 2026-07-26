export const MULTI_CANDIDATE_RESOLUTION_FEATURE_FLAG = "ENABLE_MULTI_CANDIDATE_RESOLUTION" as const;

export function isMultiCandidateResolutionEnabled(): boolean {
  const globalValue = (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_RESOLUTION__;
  if (typeof globalValue === "boolean") {
    return globalValue;
  }

  const envValue = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_MULTI_CANDIDATE_RESOLUTION;
  return envValue === "true";
}
