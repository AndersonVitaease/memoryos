export const CANONICAL_RESOURCE_REQUEST_FEATURE_FLAG = "ENABLE_CANONICAL_RESOURCE_REQUEST" as const;
export const CANONICAL_RESOURCE_READ_FEATURE_FLAG = "ENABLE_CANONICAL_RESOURCE_READ" as const;
export const MULTI_CANDIDATE_GENERATION_FEATURE_FLAG = "ENABLE_MULTI_CANDIDATE_GENERATION" as const;

export function isCanonicalResourceRequestEnabled(): boolean {
  const globalValue = (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_REQUEST__;
  if (typeof globalValue === "boolean") {
    return globalValue;
  }

  const envValue = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_CANONICAL_RESOURCE_REQUEST;
  return envValue === "true";
}

export function isCanonicalResourceReadEnabled(): boolean {
  const globalValue = (globalThis as unknown as Record<string, unknown>).__ENABLE_CANONICAL_RESOURCE_READ__;
  if (typeof globalValue === "boolean") {
    return globalValue;
  }

  const envValue = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_CANONICAL_RESOURCE_READ;
  return envValue === "true";
}

export function isMultiCandidateGenerationEnabled(): boolean {
  const globalValue = (globalThis as unknown as Record<string, unknown>).__ENABLE_MULTI_CANDIDATE_GENERATION__;
  if (typeof globalValue === "boolean") {
    return globalValue;
  }

  const envValue = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ENABLE_MULTI_CANDIDATE_GENERATION;
  return envValue === "true";
}
