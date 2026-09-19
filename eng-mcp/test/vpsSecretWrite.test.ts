// Unit tests for engineering.vps.secret.write (VPS-SECRET-WRITE-01).
// All filesystem operations run inside a per-test tmpdir with allowlists
// injected through deps — the real defaults (/data/credentials/*) are never
// touched here except by the dedicated default-allowlist refusal test, which
// only exercises the pre-write refusal path.
import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { existsSync, lstatSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runVpsSecretWrite, type VpsSecretWriteDeps } from "../src/vpsSecretWrite.ts";

const sha16 = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 16);

interface Fixture {
  root: string;
  deps: VpsSecretWriteDeps;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "vps-secret-write-"));
  await mkdir(path.join(root, "credentials"), { recursive: true });
  await mkdir(path.join(root, "staging"), { recursive: true });
  return {
    root,
    deps: {
      targetPrefixes: [`${root}/credentials/`],
      targetFiles: [`${root}/tokens.json`],
      stagingPrefix: `${root}/staging/.staging-secret-`
    }
  };
}

async function stageValue(root: string, name: string, value: string, mode = 0o600): Promise<string> {
  const stagingPath = path.join(root, "staging", `.staging-secret-${name}`);
  await writeFile(stagingPath, value);
  await chmod(stagingPath, mode);
  return stagingPath;
}

test("staging source happy path writes atomically, forces 0600 and adopts the directory owner", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "release-bearer");
    await writeFile(target, "old-value");
    await chmod(target, 0o644); // pre-existing wide perms must be corrected
    const stagingPath = await stageValue(root, "t1", "rotated-value-42");
    const dirStat = statSync(path.join(root, "credentials"));

    const result = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);

    assert.equal(result.status, "WRITE");
    assert.equal(result.mutationPerformed, true);
    assert.equal(result.changed, true);
    assert.equal(result.newSha16, sha16("rotated-value-42"));
    assert.equal(result.oldSha16, sha16("old-value"));
    assert.equal(result.target.perms, "600");
    assert.equal(result.target.owner, `${dirStat.uid}:${dirStat.gid}`);
    assert.equal(await readFile(target, "utf8"), "rotated-value-42");
    assert.equal((lstatSync(target).mode & 0o777), 0o600);
    // no temp residue
    assert.equal(existsSync(path.join(root, "credentials", `.tmp-secret-`)), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("byte-identical rewrite is a NO_OP with zero mutation (mtime preserved)", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "release-bearer");
    const stagingPath = await stageValue(root, "t2", "same-value");
    const first = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.equal(first.status, "WRITE");

    const before = statSync(target).mtimeMs;
    const second = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);

    assert.equal(second.status, "NO_OP");
    assert.equal(second.mutationPerformed, false);
    assert.equal(second.changed, false);
    assert.equal(second.oldSha16, second.newSha16);
    assert.equal(statSync(target).mtimeMs, before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("symlinks are refused: leaf target and mid-chain component, with zero mutation", async () => {
  const { root, deps } = await makeFixture();
  try {
    // leaf symlink: points at a real file that must stay untouched
    const realFile = path.join(root, "credentials", "real.txt");
    await writeFile(realFile, "real");
    const leafLink = path.join(root, "credentials", "leaf-link");
    await symlink(realFile, leafLink);
    const stagingPath = await stageValue(root, "t3", "evil");
    const leaf = await runVpsSecretWrite({
      path: leafLink, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.equal(leaf.status, "BLOCKED");
    assert.equal(leaf.mutationPerformed, false);
    assert.ok(leaf.findings.some((f) => f.code === "SECRET_TARGET_SYMLINK_REFUSED"));
    assert.equal(await readFile(realFile, "utf8"), "real");

    // mid-chain symlink: credentials/link-dir -> real-dir
    const realDir = path.join(root, "credentials", "real-dir");
    await mkdir(realDir);
    const linkDir = path.join(root, "credentials", "link-dir");
    await symlink(realDir, linkDir);
    const component = await runVpsSecretWrite({
      path: path.join(linkDir, "file"), source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.equal(component.status, "BLOCKED");
    assert.equal(component.mutationPerformed, false);
    assert.ok(component.findings.some((f) => f.code === "SECRET_TARGET_SYMLINK_REFUSED"));
    assert.equal(existsSync(path.join(realDir, "file")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("path traversal resolves before the allowlist and is refused with zero mutation", async () => {
  const { root, deps } = await makeFixture();
  try {
    const stagingPath = await stageValue(root, "t4", "sneaky");
    const result = await runVpsSecretWrite({
      path: `${root}/credentials/../../outside`, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
    assert.ok(result.findings.some((f) => f.code === "SECRET_TARGET_NOT_ALLOWED"));
    assert.equal(existsSync(path.join(root, "outside")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("empty staging file aborts with SECRET_VALUE_EMPTY and leaves the target untouched", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "release-bearer");
    await writeFile(target, "current");
    const stagingPath = await stageValue(root, "t5", "");
    const result = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
    assert.ok(result.findings.some((f) => f.code === "SECRET_VALUE_EMPTY"));
    assert.equal(await readFile(target, "utf8"), "current");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("staging source hardening: wide perms, symlink and missing file are refused", async () => {
  const { root, deps } = await makeFixture();
  try {
    const wide = await stageValue(root, "t6a", "value", 0o644);
    const wideResult = await runVpsSecretWrite({
      path: path.join(root, "credentials", "x"), source: { kind: "staging", path: wide }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.ok(wideResult.findings.some((f) => f.code === "SECRET_SOURCE_PERMS_REFUSED"));
    assert.equal(wideResult.mutationPerformed, false);

    const real = await stageValue(root, "t6b", "value");
    const link = path.join(root, "staging", ".staging-secret-t6c");
    await symlink(real, link);
    const linkResult = await runVpsSecretWrite({
      path: path.join(root, "credentials", "x"), source: { kind: "staging", path: link }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.ok(linkResult.findings.some((f) => f.code === "SECRET_SOURCE_SYMLINK_REFUSED"));

    const missingResult = await runVpsSecretWrite({
      path: path.join(root, "credentials", "x"), source: { kind: "staging", path: path.join(root, "staging", ".staging-secret-t6-missing") }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.ok(missingResult.findings.some((f) => f.code === "SECRET_SOURCE_NOT_FOUND"));
    assert.equal(existsSync(path.join(root, "credentials", "x")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("PLAN mode never mutates and reports wouldChange correctly", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "release-bearer");
    const stagingPath = await stageValue(root, "t7", "planned-value");
    const plan = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true
    }, deps);
    assert.equal(plan.status, "PLAN");
    assert.equal(plan.mutationPerformed, false);
    assert.equal(plan.plan.possible, true);
    assert.equal(existsSync(target), false);

    await writeFile(target, "planned-value");
    const noChange = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true
    }, deps);
    assert.equal(noChange.status, "PLAN");
    assert.equal(noChange.wouldChange, false);

    await writeFile(target, "different");
    const change = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true
    }, deps);
    assert.equal(change.wouldChange, true);
    assert.equal(await readFile(target, "utf8"), "different");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("execute without approval.approved stays read-only (PLAN)", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "release-bearer");
    const stagingPath = await stageValue(root, "t8", "value");
    const result = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true
    }, deps);
    assert.equal(result.status, "PLAN");
    assert.equal(result.mutationPerformed, false);
    assert.equal(existsSync(target), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("env source: happy path writes and unset/empty env is refused", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "from-env");
    const ok = await runVpsSecretWrite({
      path: target, source: { kind: "env", name: "VPS_SECRET_WRITE_TEST_VAR" }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, { ...deps, env: { VPS_SECRET_WRITE_TEST_VAR: "env-value-9" } });
    assert.equal(ok.status, "WRITE");
    assert.equal(ok.newSha16, sha16("env-value-9"));
    assert.equal(await readFile(target, "utf8"), "env-value-9");

    const empty = await runVpsSecretWrite({
      path: path.join(root, "credentials", "never"), source: { kind: "env", name: "VPS_SECRET_WRITE_TEST_ABSENT" }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, { ...deps, env: {} });
    assert.ok(empty.findings.some((f) => f.code === "SECRET_VALUE_EMPTY"));
    assert.equal(existsSync(path.join(root, "credentials", "never")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("default allowlist refuses arbitrary paths before any filesystem mutation", async () => {
  const stagingDir = await mkdtemp(path.join(tmpdir(), "vps-secret-stage-"));
  try {
    const stagingPath = path.join(stagingDir, "s");
    await writeFile(stagingPath, "value");
    await chmod(stagingPath, 0o600);
    const result = await runVpsSecretWrite({
      path: "/etc/passwd", source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.mutationPerformed, false);
    assert.ok(result.findings.some((f) => f.code === "SECRET_TARGET_NOT_ALLOWED"));
  } finally { await rm(stagingDir, { recursive: true, force: true }); }
});

test("creating a new credential file is allowed inside the allowlist and yields 0600", async () => {
  const { root, deps } = await makeFixture();
  try {
    const target = path.join(root, "credentials", "new-bearer");
    const stagingPath = await stageValue(root, "t10", "fresh");
    const result = await runVpsSecretWrite({
      path: target, source: { kind: "staging", path: stagingPath }, acknowledgeWrite: true, execute: true, approval: { approved: true }
    }, deps);
    assert.equal(result.status, "WRITE");
    assert.equal(result.target.exists, true);
    assert.equal(result.target.perms, "600");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing acknowledgeWrite is rejected by the schema", async () => {
  const { root, deps } = await makeFixture();
  try {
    await assert.rejects(runVpsSecretWrite({
      path: path.join(root, "credentials", "x"), source: { kind: "staging", path: path.join(root, "staging", "s") }, execute: true, approval: { approved: true }
    }, deps));
  } finally { await rm(root, { recursive: true, force: true }); }
});
