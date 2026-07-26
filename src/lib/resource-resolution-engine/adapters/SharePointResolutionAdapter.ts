import {
  createPreparedSearchAdapter,
  type ResourceCandidateSelector,
  type ResourceResolutionSearchOutcome,
} from "../index";

export function createSharePointResolutionAdapter<TResult, TFailure = never>(
  searchWithCandidate: (
    candidate: ResourceCandidateSelector,
  ) => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
  fallback: () => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
) {
  return createPreparedSearchAdapter("sharepoint", searchWithCandidate, fallback);
}
