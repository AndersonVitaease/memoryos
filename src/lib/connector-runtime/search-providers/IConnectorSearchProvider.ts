import type { ResourceCandidateSelector } from "@/lib/resource-resolution-engine";

export interface ConnectorSearchResult<TResult> {
  readonly success: boolean;
  readonly reason: string;
  readonly value: TResult | null;
  readonly error: string | null;
}

export interface IConnectorSearchProvider<TResult> {
  readonly providerId: string;
  readonly connectorId: string;
  searchCandidate(
    candidate: ResourceCandidateSelector,
    options?: { readonly maxResults?: number },
  ): Promise<ConnectorSearchResult<TResult>>;
}
