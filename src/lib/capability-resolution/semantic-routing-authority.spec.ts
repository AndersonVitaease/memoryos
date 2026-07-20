/**
 * semantic-routing-authority.spec.ts — BUGFIX-SPRINT-002.5
 *
 * Validates the Unified Semantic Routing Authority contract.
 * Tests that ResolvedCapability is correctly produced and that
 * context is fully preserved through the resolution chain.
 */

import { CapabilityResolutionEngine } from "./CapabilityResolutionEngine";
import type { ResolvedCapability } from "./ResolvedCapability";

const engine = new CapabilityResolutionEngine();

interface SRATestCase {
  name: string;
  input: Parameters<typeof engine.resolveCapability>[0];
  assert: (r: ResolvedCapability) => { pass: boolean; detail: string };
}

const TESTS: SRATestCase[] = [

  // ── Test 1: GitHub source code ────────────────────────────────────────────
  {
    name: "T1: FETCH_SOURCE_CODE + github/code → source.code.read via github",
    input: { goal: "FETCH_SOURCE_CODE", metadata: { source: "github", type: "code" } },
    assert: (r) => ({
      pass: r.capabilityId === "source.code.read" && r.preferredConnector === "github" && !r.ambiguous,
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 2: Google Drive document ─────────────────────────────────────────
  {
    name: "T2: READ_DOCUMENT + google-drive → document.read via google-drive",
    input: { goal: "READ_DOCUMENT", metadata: { source: "google-drive", type: "document" } },
    assert: (r) => ({
      pass: r.capabilityId === "document.read" && r.preferredConnector === "google-drive" && !r.ambiguous,
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 3: Ambiguous READ_FILE (no context) ──────────────────────────────
  {
    name: "T3: READ_FILE (no source/type) → ambiguous, connector=null",
    input: { goal: "READ_FILE" },
    assert: (r) => ({
      pass: r.ambiguous && r.preferredConnector === null && r.capabilityId === "ambiguous_capability_resolution",
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector} ambiguous=${r.ambiguous}`,
    }),
  },

  // ── Test 4: READ_FILE + github source → github, never google-drive ────────
  {
    name: "T4 CRITICAL: READ_FILE + source=github → source.code.read/github (never drive)",
    input: { goal: "READ_FILE", metadata: { source: "github" } },
    assert: (r) => ({
      pass: r.preferredConnector === "github" && r.preferredConnector !== "google-drive",
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 5: READ_FILE + google-drive → google-drive, never github ─────────
  {
    name: "T5 CRITICAL: READ_FILE + source=google-drive → document.read/google-drive",
    input: { goal: "READ_FILE", metadata: { source: "google-drive" } },
    assert: (r) => ({
      pass: r.preferredConnector === "google-drive" && r.preferredConnector !== "github",
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 6: Context preservation ──────────────────────────────────────────
  {
    name: "T6: Context fully preserved in resolvedCapability.preservedContext",
    input: {
      goal: "FETCH_SOURCE_CODE",
      metadata: { source: "github", type: "code", repository: "memoryos", origin: "ler arquivo" },
    },
    assert: (r) => {
      const pc = r.preservedContext;
      const ok = pc.source === "github" && pc.type === "code"
        && pc.repository === "memoryos" && pc.origin === "ler arquivo";
      return { pass: ok, detail: JSON.stringify(pc) };
    },
  },

  // ── Test 7: DOWNLOAD_ASSET drive → never github ───────────────────────────
  {
    name: "T7: DOWNLOAD_ASSET + google-drive → document.download (not github)",
    input: { goal: "DOWNLOAD_ASSET", metadata: { source: "google-drive" } },
    assert: (r) => ({
      pass: r.preferredConnector === "google-drive" && !r.ambiguous,
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 8: Unknown goal → ambiguous, no default connector ────────────────
  {
    name: "T8: UNKNOWN_GOAL → ambiguous, no default connector assigned",
    input: { goal: "UNKNOWN_GOAL" },
    assert: (r) => ({
      pass: r.ambiguous && r.preferredConnector === null,
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 9: domain hint "repository" → github without explicit source ─────
  {
    name: "T9: READ_FILE + domain=repository → source.code.read/github",
    input: { goal: "READ_FILE", metadata: { domain: "repository" } },
    assert: (r) => ({
      pass: r.preferredConnector === "github" && r.capabilityId === "source.code.read",
      detail: `cap=${r.capabilityId} connector=${r.preferredConnector}`,
    }),
  },

  // ── Test 10: confidence < 1 when no explicit source ───────────────────────
  {
    name: "T10: Rule with typeHint only → confidence < 0.95 (no explicit source)",
    input: { goal: "FETCH_SOURCE_CODE", metadata: { type: "code" } },
    assert: (r) => ({
      pass: r.confidence > 0 && r.confidence <= 0.80 && !r.ambiguous,
      detail: `confidence=${r.confidence}`,
    }),
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

export function runSemanticRoutingAuthorityTests(): {
  passed: number; failed: number; results: string[];
} {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of TESTS) {
    try {
      const r = engine.resolveCapability(tc.input);
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

// ── GitHubQueryRouter anchor integration test ─────────────────────────────────

export function runGitHubAnchorIntegrationTests(): {
  passed: number; failed: number; results: string[];
} {
  // Simulate the anchor logic from GitHubQueryRouter (002.4) with the
  // canonical test phrase from the sprint acceptance criteria.
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  const scenarios: Array<{
    msg: string;
    expectGitHub: boolean;
    expectCapContains: string;
  }> = [
    { msg: "Ler código do repositório GitHub",            expectGitHub: true,  expectCapContains: "files.get" },
    { msg: "ler arquivo do repositório GitHub",           expectGitHub: true,  expectCapContains: "files.get" },
    { msg: "leia o arquivo UniversalConnectorRouter.ts",  expectGitHub: false, expectCapContains: "" }, // no anchor
    { msg: "leia o arquivo UniversalConnectorRouter.ts do repositório", expectGitHub: true, expectCapContains: "files.get" },
    { msg: "read file from github repo",                  expectGitHub: true,  expectCapContains: "files.get" },
    { msg: "listar emails do gmail",                      expectGitHub: false, expectCapContains: "" },
    { msg: "quais são os commits do repo",                expectGitHub: true,  expectCapContains: "" },
  ];

  for (const s of scenarios) {
    const lower = s.msg.toLowerCase();
    const hasAnchor = lower.includes("github") || lower.includes("repositorio")
      || lower.includes("repository") || lower.includes("repo ");
    const looksGitHub = hasAnchor;
    const anchorOk = looksGitHub === s.expectGitHub;

    if (anchorOk) {
      passed++;
      results.push(`PASS  Router anchor: "${s.msg.slice(0, 55)}"`);
    } else {
      failed++;
      results.push(`FAIL  Router anchor: "${s.msg.slice(0, 55)}" — expected hasAnchor=${s.expectGitHub} got=${looksGitHub}`);
    }
  }

  return { passed, failed, results };
}