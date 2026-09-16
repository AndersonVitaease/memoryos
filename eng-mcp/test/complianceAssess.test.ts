// GLGPD-01 unit tests — run with: node --import tsx --test test/complianceAssess.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { complianceAssessInputSchema, runComplianceAssess, engineSpecs, gdprPython, sastPython, sastBinDir, SAST_BINARIES, redactSecrets, classifyGitHistoryStatus, MUTATING_TOOL_PATTERN, SAST_ELIGIBLE, GDPR_ELIGIBLE, LGPD_ELIGIBLE } from "../src/complianceAssess.ts";

const tmp = mkdtempSync(path.join(tmpdir(), "glgpd01-"));
// engines deliberately unreachable: probes fail -> honest PARTIAL/UNKNOWN (tests 07, 08, 13)
const envOff = { GLGPD_ENGINES_ROOT: path.join(tmp, "no-engines"), ENG_MCP_REPOSITORY_ROOT: tmpdir() };

test("01 fail-closed on relative targetPath", async () => {
  const r = await runComplianceAssess({ targetPath: "relative/path" }, envOff);
  assert.equal(r.error, "TARGET_PATH_INVALID");
  assert.equal(r.mutations, 0);
});
test("01 fail-closed on nonexistent targetPath", async () => {
  const r = await runComplianceAssess({ targetPath: path.join(tmp, "does-not-exist") }, envOff);
  assert.equal(r.error, "TARGET_NOT_FOUND");
});
test("input schema is strict (no unexpected fields)", () => {
  assert.throws(() => complianceAssessInputSchema.parse({ targetPath: "/tmp", extra: 1 }));
});
test("02 LGPD engine participates in composition", () => {
  const specs = engineSpecs({});
  assert.ok(specs.some((s) => s.name === "lgpd"));
  assert.ok(LGPD_ELIGIBLE.test("validar_base_legal") && LGPD_ELIGIBLE.test("checklist_compliance"));
});
test("03 GDPR AST engine participates", () => {
  assert.ok(engineSpecs({}).some((s) => s.name === "gdpr"));
  assert.ok(GDPR_ELIGIBLE.test("analyze_code_ast"));
});
test("04 SAST read-only engine participates", () => {
  assert.ok(engineSpecs({}).some((s) => s.name === "sast"));
  assert.ok(SAST_ELIGIBLE.test("list_scanners") && SAST_ELIGIBLE.test("scan_all") && SAST_ELIGIBLE.test("scan_vulnerabilities"));
});
test("14 GDPR and SAST use separate venvs", () => {
  const gdpr = gdprPython({ GLGPD_ENGINES_ROOT: "/x" }); const sast = sastPython({ GLGPD_ENGINES_ROOT: "/x" });
  assert.notEqual(path.dirname(path.dirname(gdpr)), path.dirname(path.dirname(sast)));
  assert.ok(gdpr.includes("venvs/gdpr") && sast.includes("venvs/sast"));
});
test("07/08/13 engines unavailable -> honest PARTIAL with UNKNOWN, never PASS", async () => {
  const r = await runComplianceAssess({ targetPath: tmpdir() }, envOff);
  assert.equal(r.assessmentStatus, "PARTIAL");
  assert.equal(r.summary.risk, "INCOMPLETE");
  assert.ok(r.findings.some((f: any) => f.id === "LGPD-ENGINE-UNAVAILABLE"));
  assert.ok(r.findings.some((f: any) => f.id === "PRIV-ENGINE-UNAVAILABLE"));
  assert.ok(r.findings.some((f: any) => f.id === "SAST-ENGINE-UNAVAILABLE"));
  assert.ok(r.engines.every((e: any) => e.status === "UNAVAILABLE"));
  assert.ok(r.unknowns.length >= 3);
  assert.ok(r.scannerCoverage.some((c: any) => c.status === "UNAVAILABLE"));
});
test("10 findings always carry evidence and source", async () => {
  const r = await runComplianceAssess({ targetPath: tmpdir() }, envOff);
  for (const f of r.findings) { assert.ok("evidence" in f && "source" in f); assert.ok(FINDING_OK(f.status)); }
  function FINDING_OK(s: string) { return ["EVIDENCED", "PARTIAL", "NOT_EVIDENCED", "NOT_APPLICABLE", "UNKNOWN", "HUMAN_INPUT_REQUIRED"].includes(s); }
});
test("11 scanner coverage is honest (UNAVAILABLE, not PASSED)", async () => {
  const r = await runComplianceAssess({ targetPath: tmpdir() }, envOff);
  for (const c of r.scannerCoverage) assert.ok(["AVAILABLE", "UNAVAILABLE", "NOT_APPLICABLE", "UNKNOWN"].includes(c.status));
});
test("12/15 zero mutations and no mutating SAST tool eligible", async () => {
  const r = await runComplianceAssess({ targetPath: tmpdir() }, envOff);
  assert.equal(r.guardrails.mutations, 0);
  assert.equal(r.guardrails.mutatingToolCalls, 0);
  for (const t of ["autofix_scan", "apply_patch", "fix_vulnerability", "write_report", "delete_finding", "create_issue"])
    assert.ok(!SAST_ELIGIBLE.test(t) || MUTATING_TOOL_PATTERN.test(t), `mutating tool ${t} must be excluded`);
});
test("11b no compliance/certification conclusion in output", async () => {
  const r = await runComplianceAssess({ targetPath: tmpdir() }, envOff);
  const s = JSON.stringify(r).toLowerCase();
  assert.ok(!s.includes("lgpd_compliant") && !s.includes("certified") && !s.includes("100% compliant"));
  assert.equal(r.summary.complianceClaim, false);
  assert.equal(r.noComplianceClaim, true);
  assert.ok(r.disclaimer.toLowerCase().includes("not"));
});
test("PII evidence escalates severity (logic probe)", () => {
  const text = "found pii email in logging statement";
  assert.ok(/pii|personal data|email|cpf|phone/i.test(text));
});
test("cleanup", () => { rmSync(tmp, { recursive: true, force: true }); });

// ---- GLGPD-02 ---- (fake secret values are assembled at runtime so this file
// never contains a credential-shaped literal)
test("GLGPD-02 A: SAST_BINARIES pins gitleaks + osv-scanner with sha256 and bin dir", () => {
  assert.equal(SAST_BINARIES.length, 2);
  const names = SAST_BINARIES.map((b) => b.name);
  assert.ok(names.includes("gitleaks") && names.includes("osv-scanner"));
  for (const b of SAST_BINARIES) {
    assert.match(b.url, /^https:\/\/github\.com\//);
    assert.match(b.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(sastBinDir({ GLGPD_ENGINES_ROOT: "/x" }), path.join("/x", "bin"));
});
test("GLGPD-02 A: sast engine spec gets PATH with provisioned bin dir first", () => {
  const spec = engineSpecs({ GLGPD_ENGINES_ROOT: "/x" }).find((s) => s.name === "sast");
  assert.ok(spec?.env?.PATH, "sast spec must carry env PATH");
  assert.ok(spec.env.PATH.startsWith(path.join("/x", "bin")));
});
test("GLGPD-02 B: redactSecrets never exposes a full secret value", () => {
  const aws = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
  const sk = ["sk-proj-", "abcdefghijklmnop123456"].join("");
  const ghp = ["ghp_", "a".repeat(36)].join("");
  const pwd = ["hunter2", "hunter2"].join("");
  const out = redactSecrets(["Secret: ", aws, "\n{\"Secret\":\"", sk, "\",\"password\":\"", pwd, "\"}"].join(""));
  assert.ok(!out.includes(aws), "aws key must be redacted");
  assert.ok(!out.includes(sk), "sk key must be redacted");
  assert.ok(!out.includes(pwd), "password must be redacted");
  assert.ok(out.includes("[REDACTED"));
  const obj = redactSecrets({ secret: ghp, keep: "visible" });
  const s = String(obj);
  assert.ok(!s.includes(ghp) && !s.includes("a".repeat(36)), "ghp token must be redacted");
  assert.ok(s.includes("visible"), "non-secret content must survive redaction");
});
test("GLGPD-02 C/E: git repo + failed history scan = UNKNOWN, never NOT_APPLICABLE", () => {
  assert.equal(classifyGitHistoryStatus({ isGitRepo: true, scanOk: false, engineSaysNotRepo: true }), "UNKNOWN");
  assert.equal(classifyGitHistoryStatus({ isGitRepo: true, scanOk: false, engineSaysNotRepo: false }), "UNKNOWN");
  assert.equal(classifyGitHistoryStatus({ isGitRepo: false, scanOk: false, engineSaysNotRepo: true }), "NOT_APPLICABLE");
  assert.equal(classifyGitHistoryStatus({ isGitRepo: false, scanOk: false, engineSaysNotRepo: false }), "UNKNOWN");
  assert.equal(classifyGitHistoryStatus({ isGitRepo: true, scanOk: true, engineSaysNotRepo: false }), "EVIDENCED");
  assert.equal(classifyGitHistoryStatus({ isGitRepo: false, scanOk: true, engineSaysNotRepo: true }), "NOT_APPLICABLE");
});
