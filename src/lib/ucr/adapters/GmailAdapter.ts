/**
 * GmailAdapter.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.6.0 — Architecture Validation
 *
 * Gmail implemented as a second ConnectorAdapter.
 * Proves architecture reusability:
 *   - Zero changes to: Runtime, UCRPipeline, UTL, HttpTransport, Registries, Factory
 *   - New code: this file only (+ GmailCapabilityExecutor)
 *
 * Pattern identical to GoogleDriveAdapter:
 *   buildRequest()    — describes what to do (endpoint + params)
 *   parseResponse()   — shapes the response
 *   No fetch(), no headers, no HTTP knowledge.
 *   Credential passed as UCRRequest.credential → HttpTransport injects Bearer header.
 *
 * Capabilities:
 *   gmail.listMessages
 *   gmail.getMessage
 *   gmail.searchMessages
 *   gmail.downloadAttachment
 */

import type { ConnectorAdapter, UCRRequest, UCRResponse } from "../UCRTypes";
import { UCRRuntime } from "../UCRRuntime";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const OPS = {
  LIST:               "gmail.listMessages",
  GET:                "gmail.getMessage",
  SEARCH:             "gmail.searchMessages",
  DOWNLOAD_ATTACHMENT:"gmail.downloadAttachment",
} as const;

export const GmailAdapter: ConnectorAdapter = {
  id:   "gmail",
  name: "Gmail",
  capabilities: [
    OPS.LIST,
    OPS.GET,
    OPS.SEARCH,
    OPS.DOWNLOAD_ATTACHMENT,
  ],

  buildRequest(operation: string, params: Record<string, unknown>, token: string): UCRRequest {
    // No headers constructed here — credential flows to HttpTransport.
    switch (operation) {

      case OPS.LIST: {
        const sp = new URLSearchParams({
          maxResults: String((params.maxResults as number) ?? 20),
          ...(params.pageToken ? { pageToken: params.pageToken as string } : {}),
          ...(params.labelIds  ? { labelIds:  params.labelIds as string }  : {}),
        });
        return { operation, url: `${BASE}/messages?${sp}`, credential: token };
      }

      case OPS.SEARCH: {
        const sp = new URLSearchParams({
          q:          (params.q as string) ?? "",
          maxResults: String((params.maxResults as number) ?? 20),
          ...(params.pageToken ? { pageToken: params.pageToken as string } : {}),
        });
        return { operation, url: `${BASE}/messages?${sp}`, credential: token };
      }

      case OPS.GET: {
        const messageId = encodeURIComponent(params.messageId as string);
        const format    = (params.format as string) ?? "full";
        const sp = new URLSearchParams({ format });
        return { operation, url: `${BASE}/messages/${messageId}?${sp}`, credential: token };
      }

      case OPS.DOWNLOAD_ATTACHMENT: {
        const messageId    = encodeURIComponent(params.messageId as string);
        const attachmentId = encodeURIComponent(params.attachmentId as string);
        return { operation, url: `${BASE}/messages/${messageId}/attachments/${attachmentId}`, credential: token };
      }

      default:
        throw new Error(`GmailAdapter: unknown operation "${operation}"`);
    }
  },

  parseResponse<T>(_operation: string, response: UCRResponse): T {
    return (response.data ?? response.rawText) as T;
  },
};

// ── Self-register (Plugin Model — identical pattern to GoogleDriveAdapter) ─────
UCRRuntime.register(GmailAdapter);

// ── Convenience facade ────────────────────────────────────────────────────────

export async function executeGmailOperation<T = unknown>(
  operation: string,
  params: Record<string, unknown>,
  token: string,
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  const res = await UCRRuntime.execute<T>("gmail", operation, params, token);
  return { ok: res.ok, data: res.data, error: res.ok ? null : res.rawText };
}