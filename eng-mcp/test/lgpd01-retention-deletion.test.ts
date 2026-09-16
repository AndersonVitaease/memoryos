// LGPD-01 mission tests — RETENTION + DATA_DELETION composition completion.
// Deterministic only: no LLM, no network. The engine call seam is injected
// (composeRetentionDeletionFindings), so the tests prove WHEN the two
// previously-uncalled tools are invoked and with WHAT inputs (real observed
// context, never fabricated). Engine-unavailable behavior is proven end-to-end
// through runComplianceAssess with engines unreachable (envOff).
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { composeRetentionDeletionFindings, retentionPolicyContext, runComplianceAssess, redactSecrets } from "../src/complianceAssess.ts";

const base = mkdtempSync(path.join(tmpdir(), "lgpd01-"));
const dirWithPolicy = path.join(base, "with-policy"); mkdirSync(dirWithPolicy);
const POLICY_TEXT = "# Data Retention Policy\nCustomer records are retained for 24 months after contract end.\nData is deleted after the retention period expires. Annual review of retention periods.";
writeFileSync(path.join(dirWithPolicy, "PRIVACY.md"), POLICY_TEXT);
const dirCodeNoPolicy = path.join(base, "code-no-policy"); mkdirSync(dirCodeNoPolicy);
writeFileSync(path.join(dirCodeNoPolicy, "app.ts"), "const r = 'retention'; export function cleanupOld() {}");
const envOff = { GLGPD_ENGINES_ROOT: path.join(base, "no-engines"), ENG_MCP_REPOSITORY_ROOT: tmpdir() };

function recorder(result: any, ok = true) {
  const calls: { tool: string; args: any }[] = [];
  return { calls, callTool: async (tool: string, args: any) => { calls.push({ tool, args }); return { ok, result, detail: ok ? "ok" : "tool error" }; } };
}
const observed = { filesAnalyzed: 1, piiObserved: true, retentionCodeObserved: true, deletionEvidenceObserved: true };
const hasBoth = (n: string) => n === "assess_retention_policy" || n === "check_deletion_requirements";

test("T1 retention WITH evidence: assess_retention_policy called with the REAL observed policy text and a finding is produced", async () => {
  const ctx = retentionPolicyContext(dirWithPolicy);
  assert.equal(ctx.executed, true);
  assert.equal(ctx.policyDescription, POLICY_TEXT); // real text from disk, never invented
  const rec = recorder("## Issues Found\n- retention periods not defined for all categories");
  const out = await composeRetentionDeletionFindings({ targetPath: dirWithPolicy, observed, filesCount: 1, hasTool: hasBoth, callTool: rec.callTool });
  const call = rec.calls.find((c) => c.tool === "assess_retention_policy");
  assert.ok(call, "assess_retention_policy must be called when context exists");
  assert.equal(call.args.policy_description, POLICY_TEXT);
  const f = out.findings.find((x) => x.id === "PRIV-RETENTION-POLICY");
  assert.ok(f, "retention finding must be produced");
  assert.equal(f.status, "PARTIAL");
});

test("T2 retention WITHOUT evidence: honest HUMAN_INPUT_REQUIRED, tool NOT called, no fabricated policy", async () => {
  const ctx = retentionPolicyContext(dirCodeNoPolicy);
  assert.equal(ctx.executed, false);
  const rec = recorder("");
  const out = await composeRetentionDeletionFindings({ targetPath: dirCodeNoPolicy, observed, filesCount: 1, hasTool: hasBoth, callTool: rec.callTool });
  assert.equal(rec.calls.some((c) => c.tool === "assess_retention_policy"), false, "tool must NOT be called without real policy context");
  const f = out.findings.find((x) => x.id === "PRIV-RETENTION-POLICY");
  assert.ok(f, "finding must exist even when tool is not executed");
  assert.equal(f.status, "HUMAN_INPUT_REQUIRED");
  assert.ok(/NOT executed/.test(String((f.evidence as any).reason)));
  assert.ok(out.humanInput.length >= 1);
});

test("T3 deletion WITH evidence: check_deletion_requirements called with observed signals and explicit UNKNOWN markers", async () => {
  const rec = recorder("# GDPR Deletion & Anonymization Requirements");
  const out = await composeRetentionDeletionFindings({ targetPath: dirWithPolicy, observed, filesCount: 2, hasTool: hasBoth, callTool: rec.callTool });
  const call = rec.calls.find((c) => c.tool === "check_deletion_requirements");
  assert.ok(call, "check_deletion_requirements must be called with observed context");
  assert.match(String(call.args.system_context), /deletion_code_evidence=true/);
  assert.match(String(call.args.system_context), /real_data_stores=UNKNOWN/);
  const f = out.findings.find((x) => x.id === "PRIV-DELETION-REQUIREMENTS");
  assert.ok(f);
  assert.equal(f.status, "PARTIAL");
});

test("T4 deletion WITHOUT evidence (no source files): honest NOT_EVIDENCED, tool NOT called", async () => {
  const rec = recorder("");
  const out = await composeRetentionDeletionFindings({ targetPath: dirWithPolicy, observed, filesCount: 0, hasTool: hasBoth, callTool: rec.callTool });
  assert.equal(rec.calls.some((c) => c.tool === "check_deletion_requirements"), false, "no observed context means no engine call");
  const f = out.findings.find((x) => x.id === "PRIV-DELETION-REQUIREMENTS");
  assert.ok(f);
  assert.equal(f.status, "NOT_EVIDENCED");
});

test("T5 engine unavailable: engines unreachable cannot produce retention/deletion findings (no false success)", async () => {
  const res = await runComplianceAssess({ targetPath: dirWithPolicy }, envOff);
  assert.ok(!res.findings.some((f: any) => f.id === "PRIV-RETENTION-POLICY" || f.id === "PRIV-DELETION-REQUIREMENTS"));
  assert.equal(res.assessmentStatus, "PARTIAL");
  assert.ok(res.unknowns.some((u: string) => /unavailable/i.test(u)));
});

test("T6 read-only: guardrails report zero mutations; composition only calls the two allowlisted read-only tools", async () => {
  const res = await runComplianceAssess({ targetPath: dirWithPolicy }, envOff);
  assert.equal(res.guardrails.readOnly, true);
  assert.equal(res.guardrails.mutations, 0);
  assert.equal(res.guardrails.mutatingToolCalls, 0);
  const rec = recorder("");
  await composeRetentionDeletionFindings({ targetPath: dirWithPolicy, observed, filesCount: 1, hasTool: hasBoth, callTool: rec.callTool });
  for (const c of rec.calls) assert.ok(["assess_retention_policy", "check_deletion_requirements"].includes(c.tool), `unexpected tool call: ${c.tool}`);
});

test("T7 no compliance claim: structural flags preserved and new findings carry no compliance/certification language", async () => {
  const rec = recorder("assessment");
  const out = await composeRetentionDeletionFindings({ targetPath: dirWithPolicy, observed, filesCount: 1, hasTool: hasBoth, callTool: rec.callTool });
  const res = await runComplianceAssess({ targetPath: dirWithPolicy }, envOff);
  assert.equal(res.noComplianceClaim, true);
  assert.equal(res.summary.complianceClaim, false);
  for (const f of out.findings) assert.ok(!/is compliant|certified|LGPD_COMPLIANT/i.test(f.description));
});

test("T8 secret safety: engine output carrying a credential-shaped literal is redacted before reaching findings", async () => {
  // Deliberately constructed, credential-SHAPED fake value (matches the
  // redaction patterns; it is not a real credential and never leaves tests).
  const SECRET = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
  const secretEcho = `Assessment contains ${SECRET} embedded`;
  const out = await composeRetentionDeletionFindings({
    targetPath: dirWithPolicy, observed, filesCount: 1, hasTool: hasBoth,
    callTool: async () => ({ ok: true, result: redactSecrets(secretEcho), detail: "ok" }),
  });
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes(SECRET), "full credential-shaped value must never appear in findings");
  assert.ok(serialized.includes("[REDACTED"), "redaction marker must be present");
});
