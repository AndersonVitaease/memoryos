/**
 * pcsTests.ts — Beta-01.1 Production Connector Standard Validation Suite
 * 2026-07-13
 */

import { GitHubConnector } from "@/lib/connector-runtime/connectors/GitHubConnector";
import { ProductionComplianceValidator } from "./ProductionComplianceValidator";
import { PCSGenerator } from "./PCSGenerator";
import { CERTIFICATION_LABELS } from "./PCSTypes";
import type { CertificationLevel } from "./PCSTypes";

export interface PCSTestResult {
  id: string;
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "SKIP";
  durationMs: number;
  detail: string;
}

export interface PCSValidationReport {
  id: string;
  generatedAt: number;
  durationMs: number;
  results: PCSTestResult[];
  passed: number;
  failed: number;
  total: number;
  overallStatus: "PASS" | "FAIL";
  githubCertificationLevel: string;
  githubComplianceScore: number;
  summary: string;
}

let _seq = 0;
function makeId() { return `pcs_${Date.now()}_${(++_seq).toString(36)}`; }

async function run(
  id: string, name: string, category: string,
  fn: () => Promise<{ status: "PASS" | "FAIL" | "SKIP"; detail: string }>,
): Promise<PCSTestResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { id, name, category, status: r.status, durationMs: Date.now() - t0, detail: r.detail };
  } catch (err) {
    return { id, name, category, status: "FAIL", durationMs: Date.now() - t0, detail: `Exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const LEVEL_ORDER: Record<string, number> = { LEVEL_0: 0, LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3, LEVEL_4: 4 };

export async function runPCSTests(): Promise<PCSValidationReport> {
  const t0 = Date.now();
  const results: PCSTestResult[] = [];
  const validator = new ProductionComplianceValidator();
  const generator = new PCSGenerator();
  const github = new GitHubConnector();
  const ctx = { executionId: `pcs_test_${Date.now()}`, userId: "pcs", policyContext: {} };
  await github.initialize(ctx as any);

  // ── Part 1 — Standard ─────────────────────────────────────────────────────

  results.push(await run("PCS-01", "ProductionComplianceValidator instantiation", "Standard", async () => {
    return typeof validator.validate === "function" && typeof validator.certificationLevel === "function"
      ? { status: "PASS", detail: "validate() and certificationLevel() present" }
      : { status: "FAIL", detail: "ProductionComplianceValidator missing methods" };
  }));

  results.push(await run("PCS-02", "PCSGenerator instantiation", "Standard", async () => {
    return typeof generator.generate === "function"
      ? { status: "PASS", detail: "generate() present" }
      : { status: "FAIL", detail: "PCSGenerator missing generate()" };
  }));

  // ── Part 2 — Capability classification ────────────────────────────────────

  results.push(await run("PCS-03", "GitHub capabilities classified correctly", "Capabilities", async () => {
    const spec = await generator.generate(github);
    const hasList = spec.capabilities.some(c => c.type === "LIST");
    const hasRead = spec.capabilities.some(c => c.type === "READ");
    return hasList && hasRead
      ? { status: "PASS", detail: `${spec.capabilities.length} capabilities classified — LIST:${spec.capabilities.filter(c => c.type === "LIST").length} READ:${spec.capabilities.filter(c => c.type === "READ").length}` }
      : { status: "FAIL", detail: "Expected LIST and READ capability types" };
  }));

  results.push(await run("PCS-04", "All capabilities have required fields", "Capabilities", async () => {
    const spec = await generator.generate(github);
    const invalid = spec.capabilities.filter(c => !c.id || !c.type || typeof c.readOnly !== "boolean");
    return invalid.length === 0
      ? { status: "PASS", detail: `All ${spec.capabilities.length} capabilities have id, type, readOnly` }
      : { status: "FAIL", detail: `${invalid.length} capabilities missing fields: ${invalid.map(c => c.id).join(", ")}` };
  }));

  // ── Part 3 — Certification levels ─────────────────────────────────────────

  results.push(await run("PCS-05", "CERTIFICATION_LABELS covers all 5 levels", "Certification", async () => {
    const levels: CertificationLevel[] = ["LEVEL_0", "LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"];
    const missing = levels.filter(l => !CERTIFICATION_LABELS[l]);
    return missing.length === 0
      ? { status: "PASS", detail: "LEVEL_0 through LEVEL_4 all labeled" }
      : { status: "FAIL", detail: `Missing labels for: ${missing.join(", ")}` };
  }));

  results.push(await run("PCS-06", "GitHub reaches LEVEL_3 or higher", "Certification", async () => {
    const v = await validator.validate(github);
    const level = validator.certificationLevel(v);
    return LEVEL_ORDER[level] >= 3
      ? { status: "PASS", detail: `GitHub certified at ${level} (${CERTIFICATION_LABELS[level]})` }
      : { status: "FAIL", detail: `GitHub only at ${level} — expected LEVEL_3+` };
  }));

  // ── Part 4 — ProductionComplianceValidator ────────────────────────────────

  results.push(await run("PCS-07", "validate() returns ConnectorValidation with all fields", "Compliance", async () => {
    const v = await validator.validate(github);
    const hasAll = Array.isArray(v.checks) && v.checks.length > 0 && typeof v.score === "number" && typeof v.overall === "string" && Array.isArray(v.failures) && Array.isArray(v.warnings);
    return hasAll
      ? { status: "PASS", detail: `${v.checks.length} checks · score=${(v.score * 100).toFixed(0)}% · overall=${v.overall}` }
      : { status: "FAIL", detail: "ConnectorValidation missing required fields" };
  }));

  results.push(await run("PCS-08", "GitHub compliance score >= 0.70", "Compliance", async () => {
    const v = await validator.validate(github);
    return v.score >= 0.70
      ? { status: "PASS", detail: `Score: ${(v.score * 100).toFixed(0)}%` }
      : { status: "FAIL", detail: `Score only ${(v.score * 100).toFixed(0)}% — expected >= 70%` };
  }));

  results.push(await run("PCS-09", "All required compliance checks pass", "Compliance", async () => {
    const v = await validator.validate(github);
    const requiredFails = v.checks.filter(c => c.required && c.verdict === "FAIL");
    return requiredFails.length === 0
      ? { status: "PASS", detail: "All required checks pass" }
      : { status: "FAIL", detail: `Required check failures: ${requiredFails.map(c => c.name).join(", ")}` };
  }));

  // ── Part 5 — PCS generation ───────────────────────────────────────────────

  results.push(await run("PCS-10", "PCS generates successfully for GitHub", "PCS Generation", async () => {
    const spec = await generator.generate(github);
    return spec && spec.connectorId === "github" && spec.specVersion === "1.0"
      ? { status: "PASS", detail: `PCS v${spec.specVersion} for ${spec.connectorName} v${spec.connectorVersion}` }
      : { status: "FAIL", detail: "PCS generation failed or missing fields" };
  }));

  results.push(await run("PCS-11", "PCS is immutable (frozen)", "PCS Generation", async () => {
    const spec = await generator.generate(github);
    let threw = false;
    try { (spec as any).connectorId = "tampered"; } catch { threw = true; }
    return threw || spec.connectorId !== "tampered"
      ? { status: "PASS", detail: "PCS is immutable — Object.freeze() applied" }
      : { status: "FAIL", detail: "PCS is mutable — Object.freeze() missing" };
  }));

  results.push(await run("PCS-12", "PCS includes all identity fields", "PCS Generation", async () => {
    const spec = await generator.generate(github);
    const ok = spec.connectorId && spec.connectorName && spec.connectorVersion && spec.specVersion;
    return ok
      ? { status: "PASS", detail: `${spec.connectorName} v${spec.connectorVersion} by ${spec.author}` }
      : { status: "FAIL", detail: "PCS missing identity fields" };
  }));

  results.push(await run("PCS-13", "PCS diagnostics summary non-empty", "PCS Generation", async () => {
    const spec = await generator.generate(github);
    return spec.diagnostics.summary.length > 0
      ? { status: "PASS", detail: spec.diagnostics.summary }
      : { status: "FAIL", detail: "Diagnostics summary is empty" };
  }));

  // ── Part 6 — Runtime compatibility ───────────────────────────────────────

  results.push(await run("PCS-14", "GitHub metadata().capabilities present", "Runtime Compatibility", async () => {
    const caps = github.metadata().capabilities;
    return Array.isArray(caps) && caps.length > 0
      ? { status: "PASS", detail: `${caps.length} capabilities in metadata()` }
      : { status: "FAIL", detail: "metadata().capabilities missing or empty" };
  }));

  results.push(await run("PCS-15", "validateAsync() executes without throwing", "Runtime Compatibility", async () => {
    const v = await github.validateAsync();
    return Array.isArray(v.checks)
      ? { status: "PASS", detail: `${v.checks.length} checks — ${v.summary}` }
      : { status: "FAIL", detail: "validateAsync() returned invalid shape" };
  }));

  results.push(await run("PCS-16", "health() returns required fields", "Runtime Compatibility", async () => {
    const h = await github.health() as any;
    const ok = h.status && h.connectorId && h.checkedAt && typeof h.details === "string";
    return ok
      ? { status: "PASS", detail: `health=${h.status} connectorId=${h.connectorId}` }
      : { status: "FAIL", detail: "health() missing required fields" };
  }));

  // ── Part 7 — Reference Connector ─────────────────────────────────────────

  results.push(await run("PCS-17", "GitHub isReferenceConnector when LEVEL_4", "Reference Connector", async () => {
    const spec = await generator.generate(github);
    const level = spec.certificationLevel;
    if (LEVEL_ORDER[level] >= 4) {
      return spec.isReferenceConnector
        ? { status: "PASS", detail: `GitHub is Reference Connector at ${level}` }
        : { status: "FAIL", detail: `GitHub at ${level} but isReferenceConnector=false` };
    }
    return { status: "SKIP", detail: `GitHub at ${level} — not yet LEVEL_4 (passes standard)` };
  }));

  // ── Part 8 — Architecture rules ───────────────────────────────────────────

  results.push(await run("PCS-18", "PCSGenerator is provider-agnostic (works with mock connector)", "Architecture Rules", async () => {
    const mockConnector = {
      id: "mock_connector",
      metadata: () => ({ id: "mock_connector", name: "Mock", version: "1.0.0", capabilities: ["connectivity.ping", "auth.validate"], description: "test", author: "test" }),
      validate: () => true,
      validateAsync: async () => ({ valid: false, checks: [{ name: "Token configured", passed: false, detail: "No token" }], summary: "No token" }),
      health: async () => ({ status: "not_configured", connectorId: "mock_connector", checkedAt: Date.now(), details: "No token", checks: [] }),
      internalMetrics: { totalRequests: 0, totalExecutions: 0, avgLatencyMs: 0, p95LatencyMs: 0, uptimeDurationMs: 100, operationCallCount: {} },
    };
    const spec = await generator.generate(mockConnector as any);
    return spec.connectorId === "mock_connector"
      ? { status: "PASS", detail: `PCSGenerator works with any connector — generated spec for "${spec.connectorId}"` }
      : { status: "FAIL", detail: "PCSGenerator appears provider-coupled" };
  }));

  const passed  = results.filter(r => r.status === "PASS").length;
  const failed  = results.filter(r => r.status === "FAIL").length;
  const total   = results.length;

  const githubSpec = await generator.generate(github);

  return {
    id: makeId(),
    generatedAt: Date.now(),
    durationMs: Date.now() - t0,
    results,
    passed, failed, total,
    overallStatus: failed === 0 ? "PASS" : "FAIL",
    githubCertificationLevel: `${githubSpec.certificationLevel} — ${CERTIFICATION_LABELS[githubSpec.certificationLevel]}`,
    githubComplianceScore: githubSpec.complianceScore,
    summary: failed === 0
      ? `PCS v1.0 validated — ${passed}/${total} pass · GitHub: ${githubSpec.certificationLevel} · Score: ${(githubSpec.complianceScore * 100).toFixed(0)}%`
      : `PCS v1.0 — ${failed} failure(s) · ${passed}/${total} pass`,
  };
}