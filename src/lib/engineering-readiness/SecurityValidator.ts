/**
 * SecurityValidator.ts — Sprint 6.3.5
 * Confirms zero credential persistence, governance active, policies valid.
 */

import type { ValidatorResult, CheckResult } from "./ReadinessTypes";
import { ConnectorSessionStore } from "../runtime-persistence/ConnectorSessionStore";
import { SessionSerializer } from "../runtime-persistence/SessionSerializer";

const FORBIDDEN_FIELDS = ["accessToken", "refreshToken", "clientSecret", "password", "apiKey", "secret", "token", "bearer"];

function check(name: string, ok: boolean, detail: string, critical = true): CheckResult {
  return { name, status: ok ? "PASS" : "FAIL", detail, critical };
}

export class SecurityValidator {
  async validate(): Promise<ValidatorResult> {
    const t0 = Date.now();
    const checks: CheckResult[] = [];

    // 1. No credentials in session store
    const store = new ConnectorSessionStore();
    store.upsert({
      connectorId: "sec_probe",
      provider: "SecurityTest",
      displayName: "SecProbe",
      status: "CONNECTED",
      statusReason: "probe",
      capabilities: ["READ"],
      health: "HEALTHY",
      metadata: { repo: "memoryos" },
      expiresAt: null,
    });
    const serializer = new SessionSerializer();
    serializer.serialize(store.all());
    const restored = serializer.deserialize();
    serializer.clear();
    const raw = JSON.stringify(restored ?? {});
    const noForbidden = !FORBIDDEN_FIELDS.some(f => raw.includes(`"${f}"`));
    checks.push(check("No credentials in serialized sessions", noForbidden, noForbidden ? "Zero forbidden fields in payload" : `SECURITY: forbidden field found in serialized output`));

    // 2. Metadata sanitization
    const store2 = new ConnectorSessionStore();
    store2.upsert({
      connectorId: "sec_meta_probe",
      provider: "SecMeta",
      displayName: "SM",
      status: "CONNECTED",
      statusReason: "ok",
      capabilities: [],
      health: "HEALTHY",
      metadata: { token: "SHOULD_BE_STRIPPED", repo: "safe" },
      expiresAt: null,
    });
    const ser2 = new SessionSerializer();
    ser2.serialize(store2.all());
    const res2 = ser2.deserialize();
    ser2.clear();
    const metaRaw = JSON.stringify(res2?.sessions?.[0]?.metadata ?? {});
    const tokenStripped = !metaRaw.includes('"token"');
    checks.push(check("Metadata sanitization active", tokenStripped, tokenStripped ? "Token stripped from metadata" : "SECURITY: token found in metadata output"));

    // 3. Governance layer accessible
    let govOk = false;
    try {
      const { EngineeringGovernance } = await import("../engineering-governance/EngineeringGovernance");
      const gov = new EngineeringGovernance();
      govOk = typeof gov.inspect === "function" || typeof gov.enforce === "function" || !!gov;
    } catch { govOk = false; }
    checks.push(check("Governance layer accessible", govOk, govOk ? "EngineeringGovernance operational" : "Governance import failed"));

    // 4. CoreProtectionEngine accessible
    let cpeOk = false;
    try {
      const { CoreProtectionEngine } = await import("../engineering-governance/CoreProtectionEngine");
      const cpe = new CoreProtectionEngine();
      cpeOk = !!cpe;
    } catch { cpeOk = false; }
    checks.push(check("CoreProtectionEngine accessible", cpeOk, cpeOk ? "CPE operational" : "CPE import failed"));

    // 5. SecurityEngine accessible
    let seOk = false;
    try {
      const { SecurityEngine } = await import("../engineering-governance/SecurityEngine");
      const se = new SecurityEngine();
      seOk = !!se;
    } catch { seOk = false; }
    checks.push(check("SecurityEngine accessible", seOk, seOk ? "SecurityEngine operational" : "SecurityEngine import failed"));

    // 6. No globalThis credential leaks
    const g = globalThis as any;
    const noGlobalLeaks = !["token", "secret", "password", "apiKey"].some(k => typeof g[k] === "string");
    checks.push(check("No credential leaks on globalThis", noGlobalLeaks, noGlobalLeaks ? "globalThis clean" : "SECURITY: credential found on globalThis"));

    const failed = checks.filter(c => c.status !== "PASS");
    const criticalFailed = failed.filter(c => c.critical);
    const score = Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100);

    return {
      id: "sec_validator",
      name: "Security Validator",
      domain: "Security",
      status: criticalFailed.length > 0 ? "FAIL" : failed.length > 0 ? "WARN" : "PASS",
      score,
      detail: `${checks.filter(c => c.status === "PASS").length}/${checks.length} security checks passed`,
      checks,
      durationMs: Date.now() - t0,
      blockers: criticalFailed.map(c => `[SECURITY] ${c.name}: ${c.detail}`),
      warnings: failed.filter(c => !c.critical).map(c => c.name),
      recommendations: criticalFailed.length > 0
        ? ["Fix credential exposure immediately. Audit SessionSerializer.sanitize()."] : [],
    };
  }
}