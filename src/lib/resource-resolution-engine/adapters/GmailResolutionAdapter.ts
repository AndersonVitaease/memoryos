import {
  createPreparedSearchAdapter,
  type ResourceCandidateSelector,
  type ResourceResolutionSearchOutcome,
} from "../index";

export function createGmailResolutionAdapter<TResult, TFailure = never>(
  searchWithCandidate: (
    candidate: ResourceCandidateSelector,
  ) => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
  fallback: () => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
) {
  return createPreparedSearchAdapter("gmail", searchWithCandidate, fallback);
}
