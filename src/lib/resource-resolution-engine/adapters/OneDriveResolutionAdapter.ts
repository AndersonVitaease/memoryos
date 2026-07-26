import {
  createPreparedSearchAdapter,
  type ResourceCandidateSelector,
  type ResourceResolutionSearchOutcome,
} from "../index";

export function createOneDriveResolutionAdapter<TResult, TFailure = never>(
  searchWithCandidate: (
    candidate: ResourceCandidateSelector,
  ) => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
  fallback: () => Promise<ResourceResolutionSearchOutcome<TResult, TFailure>>,
) {
  return createPreparedSearchAdapter("onedrive", searchWithCandidate, fallback);
}
