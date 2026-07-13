/**
 * SDKValidator.ts — MemoryOS Connector SDK v1.0
 * Beta-03 · 2026-07-13
 *
 * Validates any connector (or generated artifact) against PCS v1.0 rules.
 * Provider-agnostic — inspects structure and interface compliance only.
 */

import type { SDKValidationReport, SDKValidationCheck } from "./SDKTypes";
import type { ConnectorManifest } from "./SDKTypes";
import { ProductionComplianceValidator } from "../production-connector-standard/ProductionComplianceValidator";

type Verdict = "PASS" | "FAIL" | "WARN";
function check(name: string, verdict: Verdict, detail: string, required: boolean): SDKValidationCheck {
  return { name, verdict, detail, required };
}

export class SDKValidator {

  async validateConnector(connector: any): Promise<SDKValidationReport> {
    const t0 = Date.now();
    const checks: SDKValidationCheck[] = [];
    const id = connector?.id ?? "unknown";

    // ── IConnector surface ────────────────────────────────────────────────

    checks.push(check("metadata() present",    typeof connector?.metadata    === "function" ? "PASS" : "FAIL", "IConnector.metadata()", true));
    checks.push(check("initialize() present",  typeof connector?.initialize  === "function" ? "PASS" : "FAIL", "IConnector.initialize()", true));
    checks.push(check("shutdown() present",    typeof connector?.shutdown    === "function" ? "PASS" : "FAIL", "IConnector.shutdown()", true));
    checks.push(check("health() present",      typeof connector?.health      === "function" ? "PASS" : "FAIL", "IConnector.health()", true));
    checks.push(check("execute() present",     typeof connector?.execute     === "function" ? "PASS" : "FAIL", "IConnector.execute()", true));
    checks.push(check("validate() present",    typeof connector?.validate    === "function" ? "PASS" : "FAIL", "IConnector.validate()", true));
    checks.push(check("validateAsync() present", typeof connector?.validateAsync === "function" ? "PASS" : "FAIL", "IConnector.validateAsync()", true));

    // ── IProductionConnector surface ──────────────────────────────────────

    const ipMethods = ["connect","disconnect","isAuthenticated","refreshAuthentication","permissions","authenticationDiagnostics",
      "fullHealth","availability","latency","metrics","resetMetrics","logExecution","executionHistory",
      "diagnostics","supportedCapabilities","authorization","validateProduction","certificationStatus"];

    for (const m of ipMethods) {
      checks.push(check(`IProductionConnector.${m}()`, typeof connector?.[m] === "function" ? "PASS" : "FAIL", m, true));
    }

    // ── Identity fields ───────────────────────────────────────────────────

    checks.push(check("connector.id present",      typeof connector?.id      === "string" && connector.id.length > 0      ? "PASS" : "FAIL", `id="${connector?.id}"`, true));
    checks.push(check("connector.name present",    typeof connector?.name    === "string" && connector.name.length > 0    ? "PASS" : "FAIL", `name="${connector?.name}"`, true));
    checks.push(check("connector.version present", typeof connector?.version === "string" && connector.version.length > 0 ? "PASS" : "FAIL", `version="${connector?.version}"`, true));

    // ── Capabilities declared ─────────────────────────────────────────────

    let capsOk = false;
    try {
      const caps = connector.supportedCapabilities();
      capsOk = Array.isArray(caps) && caps.length > 0 && caps.every((c: any) => c.id && c.type);
      checks.push(check("supportedCapabilities() valid", capsOk ? "PASS" : "FAIL", `${caps?.length ?? 0} capabilities with id+type`, true));
    } catch (e) { checks.push(check("supportedCapabilities() valid", "FAIL", String(e), true)); }

    // ── internalMetrics shape ─────────────────────────────────────────────

    const m = connector?.internalMetrics;
    const metricsOk = m && typeof m.totalRequests === "number" && typeof m.avgLatencyMs === "number";
    checks.push(check("internalMetrics shape valid", metricsOk ? "PASS" : "FAIL", metricsOk ? "totalRequests, avgLatencyMs present" : "missing metric fields", true));

    // ── PCS compliance ────────────────────────────────────────────────────

    try {
      const v = new ProductionComplianceValidator();
      const cv = await v.validate(connector);
      const scoreVerdict: Verdict = cv.score >= 0.7 ? "PASS" : cv.score >= 0.5 ? "WARN" : "FAIL";
      checks.push(check("PCS compliance score >= 0.50", cv.score >= 0.5 ? "PASS" : "FAIL", `Score: ${(cv.score * 100).toFixed(0)}% overall=${cv.overall}`, true));
      checks.push(check("PCS compliance score >= 0.70", cv.score >= 0.7 ? "PASS" : "WARN", `Score: ${(cv.score * 100).toFixed(0)}%`, false));
    } catch (e) { checks.push(check("PCS compliance score", "FAIL", String(e), true)); }

    const passed = checks.filter(c => c.verdict === "PASS").length;
    const failed = checks.filter(c => c.verdict === "FAIL").length;
    const score  = checks.length > 0 ? parseFloat((passed / checks.length).toFixed(3)) : 0;
    const overall: Verdict = failed === 0 ? "PASS" : score >= 0.7 ? "WARN" : "FAIL";

    return {
      connectorId: id,
      validatedAt: Date.now(),
      checks, passed, failed, score, overall,
      summary: `${id} — ${passed}/${checks.length} checks · score=${(score * 100).toFixed(0)}% · ${overall} · ${Date.now() - t0}ms`,
    };
  }

  validateManifest(manifest: ConnectorManifest): SDKValidationReport {
    const checks: SDKValidationCheck[] = [];
    const id = manifest?.id ?? "unknown";

    checks.push(check("specVersion='1.0'",          manifest?.specVersion === "1.0"                                       ? "PASS" : "FAIL", `specVersion="${manifest?.specVersion}"`, true));
    checks.push(check("id kebab-case",               manifest?.id && /^[a-z0-9_-]+$/.test(manifest.id)                   ? "PASS" : "FAIL", `id="${manifest?.id}"`, true));
    checks.push(check("name non-empty",              manifest?.name?.trim().length > 0                                    ? "PASS" : "FAIL", `name="${manifest?.name}"`, true));
    checks.push(check("version semver",              manifest?.version && /^\d+\.\d+\.\d+/.test(manifest.version)         ? "PASS" : "FAIL", `version="${manifest?.version}"`, true));
    checks.push(check("authType defined",            !!manifest?.authType                                                  ? "PASS" : "FAIL", `authType="${manifest?.authType}"`, true));
    checks.push(check("capabilities non-empty",      Array.isArray(manifest?.capabilities) && manifest.capabilities.length > 0 ? "PASS" : "FAIL", `${manifest?.capabilities?.length ?? 0} capabilities`, true));
    checks.push(check("supportedOperations non-empty", Array.isArray(manifest?.supportedOperations) && manifest.supportedOperations.length > 0 ? "PASS" : "FAIL", `${manifest?.supportedOperations?.length ?? 0} operations`, true));
    checks.push(check("compatibility.pcsVersion='1.0'", manifest?.compatibility?.pcsVersion === "1.0"                    ? "PASS" : "FAIL", `pcsVersion="${manifest?.compatibility?.pcsVersion}"`, true));
    checks.push(check("KP type when hasKP=true",     !manifest?.hasKnowledgeProvider || !!manifest.knowledgeProviderType  ? "PASS" : "FAIL", "knowledgeProviderType required when hasKnowledgeProvider=true", false));

    const passed = checks.filter(c => c.verdict === "PASS").length;
    const failed = checks.filter(c => c.verdict === "FAIL").length;
    const score  = checks.length > 0 ? parseFloat((passed / checks.length).toFixed(3)) : 0;
    const overall: Verdict = failed === 0 ? "PASS" : score >= 0.7 ? "WARN" : "FAIL";

    return {
      connectorId: id, validatedAt: Date.now(),
      checks, passed, failed, score, overall,
      summary: `Manifest[${id}] — ${passed}/${checks.length} · ${overall}`,
    };
  }
}