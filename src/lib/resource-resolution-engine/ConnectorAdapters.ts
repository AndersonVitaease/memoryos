import type {
  ResourceCandidateSelector,
  ResourceResolutionSearchOutcome,
} from "./ResourceResolutionTypes";

export type StandardConnectorId =
  | "google-drive"
  | "gmail"
  | "github"
  | "onedrive"
  | "dropbox"
  | "sharepoint";

export interface ResourceConnectorAdapter<TResult, TFailure = never> {
  readonly connector: StandardConnectorId;
  searchWithCandidate(
    candidate: ResourceCandidateSelector,
  ): Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>;
  fallback(): Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>;
}

export function createPreparedSearchAdapter<TResult, TFailure = never>(
  connector: Exclude<StandardConnectorId, "google-drive">,
  searchWithCandidate: (
    candidate: ResourceCandidateSelector,
  ) => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
  fallback: () => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
): ResourceConnectorAdapter<TResult, TFailure> {
  return Object.freeze({
    connector,
    searchWithCandidate,
    fallback,
  });
}

export function createNotImplementedFallback<TFailure>(message: string, failure: TFailure) {
  return async () => Object.freeze({
    success: false,
    reason: message,
    value: null,
    failure,
  });
}
