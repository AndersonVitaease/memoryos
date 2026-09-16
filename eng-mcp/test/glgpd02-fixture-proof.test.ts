// GLGPD-02 fixture proof — REAL end-to-end evidence (engines + pinned binaries).
// Builds a synthetic GIT repository containing:
//   (1) a fake secret that exists ONLY in git history (removed from the worktree),
//   (2) a fake secret in the working tree (live.py),
//   (3) a deliberately vulnerable dependency (lodash 4.17.15) in package-lock.json.
// Provisions the pinned scanner binaries through the PRODUCTION provisioning path,
// runs the REAL runComplianceAssess and asserts:
//   - gitleaks + osv-scanner actually ran (scanner coverage AVAILABLE)
//   - working-tree secret detected (OBS-SECRETS-SIGNAL)
//   - history-only secret scanned via scan_git_history (EVIDENCED on a git repo)
//   - OSV dependency vulnerability identifiers reported for lodash 4.17.15
//   - NO full fake-secret value anywhere in the output (redaction proof)
//   - zero mutation, no compliance claim. Fixtures live only under tmpdir().
// NOTE: fake secret values are assembled at runtime; this file contains no
// credential-shaped literal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runComplianceAssess, provisionComplianceEngines, sastBinDir, SAST_BINARIES } from "../src/complianceAssess.ts";

const HISTORY_SECRET = ["AKIA", "HIST0RYSECRET123"].join(""); // ONLY in git history
const WORKTREE_SECRET = ["AKIA", "WORKTREESECRET12"].join(""); // present in working tree

function buildFixture(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const sh = (cmd: string) => execSync(cmd, { cwd: dir, stdio: "ignore" });
  sh("git init -q");
  sh("git config user.email glgpd02@fixture.local");
  sh("git config user.name glgpd02");
  writeFileSync(path.join(dir, "creds.txt"), [["aws_secret_access_key", " = ", HISTORY_SECRET].join(""), "\n"].join(""));
  sh("git add -A && git commit -qm history-secret");
  // Remove it from the worktree: the fake secret now exists ONLY in git history.
  writeFileSync(path.join(dir, "creds.txt"), "aws_secret_access_key = REMOVED_FROM_WORKTREE\n");
  // Fake secret present in the working tree inside a source file the observer reads.
  writeFileSync(path.join(dir, "live.py"), [["password", " = \"", WORKTREE_SECRET, "\""].join(""), "\n"].join(""));
  sh("git add -A && git commit -qm working-tree-secret");
  // Deliberately vulnerable dependency (lodash 4.17.15 — multiple OSV entries).
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "glgpd02-fixture", version: "1.0.0", dependencies: { lodash: "4.17.15" } }, null, 2) + "\n");
  writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({
    name: "glgpd02-fixture", version: "1.0.0", lockfileVersion: 3, requires: true,
    packages: {
      "": { name: "glgpd02-fixture", version: "1.0.0", dependencies: { lodash: "4.17.15" } },
      "node_modules/lodash": { version: "4.17.15", resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz", integrity: "sha512-placeholder-not-verified" }
    }
  }, null, 2) + "\n");
  // Safety: the history-only fake secret must NOT exist anywhere in the working tree.
  const tree = execSync(["git grep -l ", HISTORY_SECRET, " || true"].join(""), { cwd: dir }).toString();
  assert.ok(!tree.includes("creds.txt"), "history secret must not exist in the working tree");
}

test("GLGPD-02 provision: pinned gitleaks + osv-scanner binaries present via production provisioning", { timeout: 280_000 }, async () => {
  provisionComplianceEngines();
  const binDir = sastBinDir();
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !SAST_BINARIES.every((b) => existsSync(path.join(binDir, `${b.name}.ok`)))) {
    await new Promise((r) => setTimeout(r, 5_000));
  }
  for (const b of SAST_BINARIES) {
    assert.ok(existsSync(path.join(binDir, b.name)), `binary missing: ${b.name}`);
    assert.ok(existsSync(path.join(binDir, `${b.name}.ok`)), `provision marker missing: ${b.name}.ok`);
  }
});

test("GLGPD-02 fixture proof: worktree+history secrets and vulnerable dependency detected, redacted, honest", { timeout: 280_000 }, async () => {
  const fx = path.join(tmpdir(), "glgpd02-fixture-" + Date.now());
  try {
    buildFixture(fx);
    const r = await runComplianceAssess({ targetPath: fx, maxFindingsPerEngine: 60 });
    const json = JSON.stringify(r);
    console.log("GLGPD02-PROOF", JSON.stringify({ risk: r.summary?.risk, engines: r.engines, coverage: r.scannerCoverage, osvIds: r.findings.find((f: any) => f.id === "SAST-OSV-DEPENDENCIES")?.evidence?.vulnerabilityIds, gitHistory: r.findings.find((f: any) => f.id === "SAST-GIT-HISTORY")?.status, unknowns: r.unknowns }, null, 1));
    // Requirement 5: the FULL fake secret value must NEVER appear anywhere in output.
    assert.ok(!json.includes(HISTORY_SECRET), "history secret leaked into output!");
    assert.ok(!json.includes(WORKTREE_SECRET), "worktree secret leaked into output!");
    assert.ok(json.includes("[REDACTED"), "redaction marker expected in evidence");
    // Requirement 4: fake secret in the working tree detected (filesystem observer).
    const obs = r.findings.find((f: any) => f.id === "OBS-SECRETS-SIGNAL");
    assert.ok(obs && obs.status === "EVIDENCED", "worktree secret signal must be EVIDENCED");
    assert.ok(JSON.stringify(obs.evidence).includes("live.py"), "worktree secret file must be evidenced");
    // Requirement 6: vulnerable dependency detected by OSV.
    const osv = r.findings.find((f: any) => f.id === "SAST-OSV-DEPENDENCIES");
    assert.ok(osv, "OSV dependency finding missing");
    assert.equal(osv.status, "EVIDENCED");
    assert.ok((osv.evidence?.vulnerabilityIds ?? []).length >= 1, "at least one OSV identifier expected (lodash 4.17.15)");
    // Requirements 1/2: the provisioned scanners actually RAN in this assessment.
    const sast = r.engines.find((e: any) => e.engine === "sast");
    assert.equal(sast?.status, "AVAILABLE");
    for (const name of ["gitleaks", "osv-scanner"]) {
      const c = r.scannerCoverage.find((x: any) => x.scanner === name);
      assert.ok(c && c.status === "AVAILABLE", `scanner ${name} coverage: ${JSON.stringify(c)}`);
    }
    // Requirement 3: secret only in git history — history scanned on a git repo.
    const hist = r.findings.find((f: any) => f.id === "SAST-GIT-HISTORY");
    assert.ok(hist, "git-history finding missing");
    assert.equal(hist.status, "EVIDENCED", `git-history status: ${hist.status} detail: ${JSON.stringify(hist.evidence).slice(0, 400)}`);
    // Requirement 8: still READ_ONLY; never a compliance claim.
    assert.equal(r.guardrails.mutations, 0);
    assert.equal(r.guardrails.mutatingToolCalls, 0);
    assert.equal(r.summary.complianceClaim, false);
  } finally {
    rmSync(fx, { recursive: true, force: true });
  }
});
