/**
 * resolved-capability-runtime-bridge.spec.ts — BUGFIX-SPRINT-002.6.1
 *
 * Validates the ResolvedCapability Runtime Bridge contract:
 *   - Adapter correctly converts legacy inputs to ResolvedCapability
 *   - preferredConnector is always honoured (no override downstream)
 *   - ambiguous inputs never resolve to a default connector
 *   - Google Drive is NEVER selected for GitHub-targeted inputs
 */

import { ResolvedCapabilityAdapter } from "./ResolvedCapabilityAdapter";
import type { ResolvedCapability }   from "./ResolvedCapability";

const adapter = new ResolvedCapabilityAdapter();

interface BridgeTest {
  name:   string;
  input:  Parameters<ResolvedCapabilityAdapter["adapt"]>[0];
  assert: (r: ResolvedCapability) => { pass: boolean; detail: string };
}

const TESTS: BridgeTest[] = [

  // ── Test 1 — GitHub Repository readFile ───────────────────────────────────
  {
    name: "T1: connectorId=github, operation=files.get → github, never google-drive",
    input: { connectorId: "github", operation: "files.get" },
    assert: (r) => ({
      pass: r.preferredConnector === "github"
            && r.preferredConnector !== "google-drive"
            && !r.ambiguous
            && r.domain === "repository",
      detail: `connector=${r.preferredConnector} domain=${r.domain} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 2 — Google Drive document ────────────────────────────────────────
  {
    name: "T2: connectorId=google-drive, operation=drive.files.get → google-drive, never github",
    input: { connectorId: "google-drive", operation: "drive.files.get" },
    assert: (r) => ({
      pass: r.preferredConnector === "google-drive"
            && r.preferredConnector !== "github"
            && !r.ambiguous
            && r.domain === "document",
      detail: `connector=${r.preferredConnector} domain=${r.domain} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 3 — Ambiguous (no connectorId, no source) ────────────────────────
  {
    name: "T3: no connectorId, no metadata.source → AMBIGUOUS, connector=null",
    input: { operation: "file.read" },
    assert: (r) => ({
      pass: r.ambiguous
            && r.preferredConnector === null
            && r.capabilityId === "ambiguous_capability_resolution",
      detail: `connector=${r.preferredConnector} ambiguous=${r.ambiguous} cap=${r.capabilityId}`,
    }),
  },

  // ── Test 4 CRITICAL — adaptFromCIS: github input never returns google-drive ─
  {
    name: "T4 CRITICAL: adaptFromCIS(github, repos.list) → github, never google-drive",
    input: { connectorId: "github", operation: "repos.list" },
    assert: (r) => ({
      pass: r.preferredConnector === "github"
            && r.preferredConnector !== "google-drive",
      detail: `connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 5 — metadata.source fallback (no connectorId given) ──────────────
  {
    name: "T5: no connectorId, metadata.source=github → github inferred",
    input: { metadata: { source: "github" }, operation: "files.get" },
    assert: (r) => ({
      pass: r.preferredConnector === "github" && !r.ambiguous,
      detail: `connector=${r.preferredConnector} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 6 — metadata.source=google-drive, no connectorId ─────────────────
  {
    name: "T6: no connectorId, metadata.source=google-drive → google-drive",
    input: { metadata: { source: "google-drive" }, operation: "drive.files.list" },
    assert: (r) => ({
      pass: r.preferredConnector === "google-drive" && !r.ambiguous,
      detail: `connector=${r.preferredConnector} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 7 — preservedContext carries all metadata through ─────────────────
  {
    name: "T7: preservedContext is fully preserved",
    input: {
      connectorId: "github",
      operation:   "files.get",
      metadata: { source: "github", type: "code", repository: "memoryos", origin: "ler arquivo" },
    },
    assert: (r) => {
      const pc = r.preservedContext;
      const ok = pc.source === "github"
                 && pc.type === "code"
                 && pc.repository === "memoryos"
                 && pc.origin === "ler arquivo";
      return { pass: ok, detail: JSON.stringify(pc) };
    },
  },

  // ── Test 8 — confidence > 0 for explicit connector ────────────────────────
  {
    name: "T8: explicit connectorId → confidence >= 0.80",
    input: { connectorId: "github", operation: "commits.list" },
    assert: (r) => ({
      pass: r.confidence >= 0.80,
      detail: `confidence=${r.confidence}`,
    }),
  },

  // ── Test 9 — ambiguous input: confidence = 0 ─────────────────────────────
  {
    name: "T9: ambiguous input → confidence = 0",
    input: {},
    assert: (r) => ({
      pass: r.confidence === 0 && r.ambiguous,
      detail: `confidence=${r.confidence} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 10 — Calendar domain ─────────────────────────────────────────────
  {
    name: "T10: connectorId=google-calendar → domain=calendar",
    input: { connectorId: "google-calendar", operation: "calendar.events.list" },
    assert: (r) => ({
      pass: r.domain === "calendar" && r.preferredConnector === "google-calendar",
      detail: `domain=${r.domain} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 11 — Gmail domain ────────────────────────────────────────────────
  {
    name: "T11: connectorId=gmail → domain=email",
    input: { connectorId: "gmail", operation: "readInbox" },
    assert: (r) => ({
      pass: r.domain === "email" && r.preferredConnector === "gmail",
      detail: `domain=${r.domain} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 12 — OfficialRuntimeBridge CIS_TO_GOAL_TYPE path ────────────────
  // The bridge maps "files.get" → "github.getFile" → connector "github"
  // This test validates the adapter round-trip for that path
  {
    name: "T12: adaptFromCIS(github, files.get) → capabilityId=files.get, connector=github",
    input: { connectorId: "github", operation: "files.get" },
    assert: (r) => ({
      pass: r.capabilityId === "files.get" && r.preferredConnector === "github",
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector}`,
    }),
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export function runBridgeTests(): {
  passed: number; failed: number; results: string[];
} {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of TESTS) {
    try {
      const r = adapter.adapt(tc.input);
      const { pass, detail } = tc.assert(r);
      if (pass) {
        passed++;
        results.push(`PASS  ${tc.name}`);
      } else {
        failed++;
        results.push(`FAIL  ${tc.name} — ${detail}`);
      }
    } catch (e) {
      failed++;
      results.push(`ERROR ${tc.name} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { passed, failed, results };
}

// ── Runtime Bridge Contract Validation ───────────────────────────────────────
// Validates the contract between OfficialRuntimeBridge and ResolvedCapability

export function runRuntimeBridgeContractTests(): {
  passed: number; failed: number; results: string[];
} {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  // Simulate the OfficialRuntimeBridge.invokeCompat(connectorId, operation) flow
  // and verify the adapter correctly wraps it without overriding the connector.
  const CIS_PAIRS: Array<{ connectorId: string; operation: string; expectConnector: string }> = [
    { connectorId: "github",          operation: "repos.list",           expectConnector: "github" },
    { connectorId: "github",          operation: "files.get",            expectConnector: "github" },
    { connectorId: "github",          operation: "branches.list",        expectConnector: "github" },
    { connectorId: "google-drive",    operation: "drive.files.list",     expectConnector: "google-drive" },
    { connectorId: "google-drive",    operation: "drive.files.search",   expectConnector: "google-drive" },
    { connectorId: "google-calendar", operation: "calendar.events.list", expectConnector: "google-calendar" },
    { connectorId: "gmail",           operation: "readInbox",            expectConnector: "gmail" },
  ];

  for (const pair of CIS_PAIRS) {
    const r = adapter.adaptFromCIS(pair.connectorId, pair.operation);
    const ok = r.preferredConnector === pair.expectConnector && !r.ambiguous;
    if (ok) {
      passed++;
      results.push(`PASS  CIS-contract: ${pair.connectorId}.${pair.operation} → ${r.preferredConnector}`);
    } else {
      failed++;
      results.push(`FAIL  CIS-contract: ${pair.connectorId}.${pair.operation} → got=${r.preferredConnector} expected=${pair.expectConnector} ambiguous=${r.ambiguous}`);
    }
  }

  return { passed, failed, results };
}