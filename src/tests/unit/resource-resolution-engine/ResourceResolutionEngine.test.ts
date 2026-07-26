import { beforeEach, describe, expect, it } from "vitest";
import {
  createDropboxResolutionAdapter,
  createGitHubResolutionAdapter,
  createGmailResolutionAdapter,
  createOneDriveResolutionAdapter,
  createSharePointResolutionAdapter,
  resourceResolutionAuditStore,
  resourceResolutionEngine,
  type ResourceCandidateSelector,
} from "@/lib/resource-resolution-engine";

describe("ResourceResolutionEngine (Sprint 7)", () => {
  beforeEach(() => {
    resourceResolutionAuditStore.clear();
  });

  it("executes cascade order and stops after first success", async () => {
    const calls: string[] = [];

    const candidates: ResourceCandidateSelector[] = [
      { id: "c1", value: "first", strategy: "literal", priority: 1, confidence: 1 },
      { id: "c2", value: "second", strategy: "descriptor_removed", priority: 2, confidence: 0.9 },
      { id: "c3", value: "third", strategy: "filename_only", priority: 3, confidence: 0.8 },
    ];

    const result = await resourceResolutionEngine.resolve<{ fileId: string }>({
      connector: "google-drive",
      featureEnabled: true,
      candidateSelectors: candidates,
      searchCallback: async (candidate) => {
        calls.push(candidate.value);
        if (candidate.value === "second") {
          return { success: true, reason: "resolved", value: { fileId: "f-2" }, failure: null };
        }
        return { success: false, reason: "not_found", value: null, failure: null };
      },
      fallbackCallback: async () => ({ success: false, reason: "unused", value: null, failure: null }),
    });

    expect(result.success).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.winnerCandidate?.id).toBe("c2");
    expect(calls).toEqual(["first", "second"]);
  });

  it("uses fallback when feature flag is disabled", async () => {
    const result = await resourceResolutionEngine.resolve<{ fileId: string }>({
      connector: "google-drive",
      featureEnabled: false,
      candidateSelectors: [],
      searchCallback: async () => ({ success: false, reason: "unused", value: null, failure: null }),
      fallbackCallback: async () => ({ success: true, reason: "legacy_resolved", value: { fileId: "legacy-1" }, failure: null }),
    });

    expect(result.success).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.result?.fileId).toBe("legacy-1");
  });

  it("aggregates global metrics with connector breakdown", async () => {
    await resourceResolutionEngine.resolve<{ fileId: string }>({
      connector: "google-drive",
      featureEnabled: true,
      candidateSelectors: [{ id: "c1", value: "ok", strategy: "literal", priority: 1, confidence: 1 }],
      searchCallback: async () => ({ success: true, reason: "resolved", value: { fileId: "f-1" }, failure: null }),
      fallbackCallback: async () => ({ success: false, reason: "unused", value: null, failure: null }),
    });

    await resourceResolutionEngine.resolve<{ fileId: string }>({
      connector: "gmail",
      featureEnabled: false,
      candidateSelectors: [],
      searchCallback: async () => ({ success: false, reason: "unused", value: null, failure: null }),
      fallbackCallback: async () => ({ success: true, reason: "legacy_resolved", value: { fileId: "f-2" }, failure: null }),
    });

    const metrics = resourceResolutionAuditStore.getMetrics();
    expect(metrics.totalResolutions).toBe(2);
    expect(metrics.successRate).toBe(1);
    expect(metrics.fallbackRate).toBe(0.5);
    expect(metrics.connectorBreakdown["google-drive"]?.total).toBe(1);
    expect(metrics.connectorBreakdown.gmail?.total).toBe(1);
    expect(metrics.winnerStrategy.literal).toBe(1);
  });

  it("provides prepared adapters for future connectors without connector-specific logic", async () => {
    const search = async (_candidate: ResourceCandidateSelector) => ({
      success: false,
      reason: "not_implemented",
      value: null,
      failure: null,
    });

    const fallback = async () => ({
      success: false,
      reason: "not_implemented",
      value: null,
      failure: null,
    });

    const gmail = createGmailResolutionAdapter(search, fallback);
    const github = createGitHubResolutionAdapter(search, fallback);
    const onedrive = createOneDriveResolutionAdapter(search, fallback);
    const dropbox = createDropboxResolutionAdapter(search, fallback);
    const sharepoint = createSharePointResolutionAdapter(search, fallback);

    expect(gmail.connector).toBe("gmail");
    expect(github.connector).toBe("github");
    expect(onedrive.connector).toBe("onedrive");
    expect(dropbox.connector).toBe("dropbox");
    expect(sharepoint.connector).toBe("sharepoint");
  });
});
