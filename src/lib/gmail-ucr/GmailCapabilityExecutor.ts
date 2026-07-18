/**
 * GmailCapabilityExecutor.ts — Sprint EF-6.6.0
 *
 * Executes Gmail capabilities through the UCR.
 * Mirrors the pattern of GoogleDriveCapabilityExecutor.
 *
 * ARCHITECTURE VALIDATION:
 *   This file calls UCRRuntime.execute() — NEVER fetch() directly.
 *   Proof that UCR is a reusable execution engine, not Drive-specific.
 */

import { UCRRuntime } from "@/lib/ucr/UCRRuntime";
import "@/lib/ucr/adapters/GmailAdapter"; // ensure registered

// ── Result types ──────────────────────────────────────────────────────────────

export interface GmailMessage {
  id:           string;
  threadId:     string;
  labelIds?:    string[];
  snippet?:     string;
  payload?:     unknown;
  sizeEstimate?: number;
  historyId?:   string;
  internalDate?: string;
}

export interface GmailListResult {
  messages:           Array<{ id: string; threadId: string }>;
  nextPageToken?:     string;
  resultSizeEstimate: number;
}

export interface GmailAttachment {
  attachmentId: string;
  size:         number;
  data:         string; // base64url encoded
}

type CapResult = { ok: boolean; data: unknown; error: string | null };

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeGmailCapability(
  capabilityId: string,
  params:        Record<string, unknown>,
  token:         string,
): Promise<CapResult> {

  // Route capability name → UCR operation
  // (capability name in Registry matches UCR operation name in GmailAdapter)
  switch (capabilityId) {

    case "gmail.listMessages": {
      const res = await UCRRuntime.execute("gmail", "gmail.listMessages", params, token);
      return { ok: res.ok, data: res.data as GmailListResult, error: res.ok ? null : res.rawText };
    }

    case "gmail.searchMessages": {
      const res = await UCRRuntime.execute("gmail", "gmail.searchMessages", params, token);
      return { ok: res.ok, data: res.data as GmailListResult, error: res.ok ? null : res.rawText };
    }

    case "gmail.getMessage": {
      const res = await UCRRuntime.execute("gmail", "gmail.getMessage", params, token);
      return { ok: res.ok, data: res.data as GmailMessage, error: res.ok ? null : res.rawText };
    }

    case "gmail.downloadAttachment": {
      const res = await UCRRuntime.execute("gmail", "gmail.downloadAttachment", params, token);
      return { ok: res.ok, data: res.data as GmailAttachment, error: res.ok ? null : res.rawText };
    }

    default:
      return { ok: false, data: null, error: `Unknown Gmail capability: ${capabilityId}` };
  }
}