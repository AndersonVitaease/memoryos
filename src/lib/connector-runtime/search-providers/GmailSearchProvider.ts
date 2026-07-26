import type { ResourceCandidateSelector } from "@/lib/resource-resolution-engine";
import type { ConnectorSearchResult, IConnectorSearchProvider } from "./IConnectorSearchProvider";

export interface GmailMessageSummary {
  readonly id: string;
  readonly threadId: string;
  readonly subject?: string;
  readonly from?: string;
  readonly to?: string;
  readonly snippet?: string;
  readonly internalDate?: string;
  readonly labelIds?: readonly string[];
}

export interface GmailSearchData {
  readonly messages: readonly GmailMessageSummary[];
  readonly query?: string;
  readonly resultSizeEstimate: number;
}

export class GmailSearchProvider implements IConnectorSearchProvider<GmailSearchData> {
  readonly providerId = "gmail-search-provider";
  readonly connectorId = "gmail";

  async searchCandidate(
    candidate: ResourceCandidateSelector,
    options: { readonly maxResults?: number } = {},
  ): Promise<ConnectorSearchResult<GmailSearchData>> {
    const query = candidate.value?.trim() ?? "";
    if (!query) {
      return Object.freeze({
        success: false,
        reason: "empty_query",
        value: null,
        error: null,
      });
    }

    return this.searchRaw(query, options);
  }

  async searchRaw(
    query: string,
    options: { readonly maxResults?: number } = {},
  ): Promise<ConnectorSearchResult<GmailSearchData>> {
    const { searchMessages } = await import("@/lib/gmail/GmailConnector");
    const maxResults = options.maxResults ?? 20;

    const response = await searchMessages(query, maxResults) as {
      ok: boolean;
      data: GmailSearchData | null;
      error: string | null;
    };

    if (!response.ok) {
      return Object.freeze({
        success: false,
        reason: "provider_error",
        value: null,
        error: response.error,
      });
    }

    const data = response.data ?? { messages: [], query, resultSizeEstimate: 0 };
    const hasResults = Array.isArray(data.messages) && data.messages.length > 0;

    return Object.freeze({
      success: hasResults,
      reason: hasResults ? "resolved" : "not_found",
      value: Object.freeze(data),
      error: null,
    });
  }
}
