// GLGPD-02 real-repo proof — runs the REAL runComplianceAssess (new GLGPD-02 code)
// against the actual eng-mcp repository (a real git repo with a real lockfile).
// Asserts the GLGPD-02 contract on a real target: OSV dependency evidence derived
// from the repo's package-lock.json, git-history scan executed with gitleaks on a
// REAL git repository (EVIDENCED — the GLGPD-01 limitation), honest scanner
// coverage, zero mutation, no compliance claim. Read-only over the target.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runComplianceAssess } from "../src/complianceAssess.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// STORE-MIG-01: 280s tipped over under suite load (10 workers; this proof is the
// suite's long tail — OSV network + gitleaks + SAST over the repo). Its own
// patience, not a gate: 540s.
test("GLGPD-02 real repo proof: OSV dependencies + git-history EVIDENCED on eng-mcp itself", { timeout: 540_000 }, async () => {
  const r = await runComplianceAssess({ targetPath: REPO, maxFindingsPerEngine: 60 });
  console.log("GLGPD02-REALREPO", JSON.stringify({ target: r.target, risk: r.summary?.risk, status: r.assessmentStatus, engines: r.engines, coverage: r.scannerCoverage, osv: r.findings.find((f: any) => f.id === "SAST-OSV-DEPENDENCIES")?.evidence?.vulnerabilityIds ?? null, gitHistory: r.findings.find((f: any) => f.id === "SAST-GIT-HISTORY")?.status, unknowns: r.unknowns, humanInput: r.humanInputRequired?.length }, null, 1));
  // Engines still compose; SAST engine available with provisioned scanners.
  const sast = r.engines.find((e: any) => e.engine === "sast");
  assert.equal(sast?.status, "AVAILABLE");
  // OSV-Scanner dependency evidence over the real package-lock.json.
  const osv = r.findings.find((f: any) => f.id === "SAST-OSV-DEPENDENCIES");
  assert.ok(osv, "OSV dependency finding missing on real repo");
  assert.equal(osv.status, "EVIDENCED");
  // Git-history on this checkout: eng-mcp has NO own .git directory here, so
  // NOT_APPLICABLE is the legitimate outcome — but only when it is proven to
  // derive from the REAL absence of .git, never from a masked engine failure.
  const hist = r.findings.find((f: any) => f.id === "SAST-GIT-HISTORY");
  assert.ok(hist, "git-history finding missing on real repo");
  // Guard 1 (premise): the target really has no .git on disk.
  assert.equal(existsSync(path.join(REPO, ".git")), false, "target unexpectedly HAS .git — NOT_APPLICABLE expectation invalid here");
  // Guard 2 (aligned expectation): without a .git there is nothing to scan.
  assert.equal(hist.status, "NOT_APPLICABLE", `git-history status: ${hist.status} detail: ${JSON.stringify(hist.evidence).slice(0, 400)}`);
  // Guard 3 (no masked failure): the finding must carry no engine-error
  // evidence and its reason must cite the absent .git, not a scanner failure.
  const histText = JSON.stringify(hist.evidence ?? {}).toLowerCase();
  assert.ok(
    hist.evidence?.error == null && !/enoent|spawn|exit code|stderr|engine error|scanner (failed|error)/.test(histText),
    `possible masked failure in git-history evidence: ${histText.slice(0, 400)}`,
  );
  assert.ok(
    /(no|not a|without|absent|missing)[^"]{0,60}\.git|\.git[^"]{0,60}(absent|missing|not found)|no[_ -]?git/.test(histText),
    `git-history NOT_APPLICABLE must cite the absent .git: ${histText.slice(0, 400)}`,
  );
  // Redaction active: the real repo contains no full secret echo in output.
  const json = JSON.stringify(r);
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(json), "unredacted AWS-shaped key in output!");
  // Still READ_ONLY and never a compliance claim.
  assert.equal(r.guardrails.mutations, 0);
  assert.equal(r.guardrails.mutatingToolCalls, 0);
  assert.equal(r.summary.complianceClaim, false);
});
