// DEPLOY-OPTIONAL-CRED-01: contract tests for runPipeline's OPTIONAL credential
// *_FILE env threading. A LoadCredential listed in the unit can disappear (source
// file removed -> /run/credentials/<unit>/<id> absent after a restart); the runner
// used to spread GIT_CREDENTIALS_FILE (and siblings) unconditionally whenever
// CREDENTIALS_DIRECTORY was set, making deployAction bind-mount a nonexistent
// source path — docker refuses the container with "mkdir ...: read-only file
// system" and EVERY deploy fails until the credential is restored (observed live
// 2026-10-05: deploy of b14d106a failed, rollback to 357ad749). The contract: a
// credential that exists on disk is threaded into the child environment; one that
// does not exist is omitted entirely (no env, no mount) — the same stat-before-
// spread pattern the github-app block has always used.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runPipeline } from "../scripts/eng-mcp-release-runner.mjs";

type ThreadedEnv = { GIT_CREDENTIALS_FILE: string | null; E2B_API_KEY_FILE: string | null; GITHUB_TOKEN_FILE: string | null };

async function withCredentialsDirectory(dir: string, callback: () => Promise<void>): Promise<void> {
  const previous = process.env.CREDENTIALS_DIRECTORY;
  process.env.CREDENTIALS_DIRECTORY = dir;
  try { await callback(); } finally {
    if (previous === undefined) delete process.env.CREDENTIALS_DIRECTORY; else process.env.CREDENTIALS_DIRECTORY = previous;
  }
}

test("runPipeline threads credential *_FILE env only for credential files that exist on disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-optional-cred-"));
  try {
    const stub = path.join(dir, "env-dump.mjs");
    await writeFile(stub, `console.log(JSON.stringify({\n  GIT_CREDENTIALS_FILE: process.env.GIT_CREDENTIALS_FILE ?? null,\n  E2B_API_KEY_FILE: process.env.E2B_API_KEY_FILE ?? null,\n  GITHUB_TOKEN_FILE: process.env.GITHUB_TOKEN_FILE ?? null\n}));\n`);
    // Present: git-credentials and github-pat exist; absent: e2b-api-key does not.
    await writeFile(path.join(dir, "git-credentials"), "stub\n");
    await writeFile(path.join(dir, "github-pat"), "stub\n");

    await withCredentialsDirectory(dir, async () => {
      const result = await runPipeline({ operation: "status" }, { pipeline: stub });
      assert.equal(result.success, true);
      const dump = JSON.parse(result.stdout.trim()) as ThreadedEnv;
      assert.equal(dump.GIT_CREDENTIALS_FILE, path.join(dir, "git-credentials"), "existing credential is threaded (mount proceeds)");
      assert.equal(dump.GITHUB_TOKEN_FILE, path.join(dir, "github-pat"), "existing credential is threaded (mount proceeds)");
      assert.equal(dump.E2B_API_KEY_FILE, null, "absent credential is omitted entirely — no env, no docker mount");
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("runPipeline omits every optional credential env when CREDENTIALS_DIRECTORY points at an empty directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-mcp-optional-cred-empty-"));
  try {
    const stub = path.join(dir, "env-dump.mjs");
    await writeFile(stub, `console.log(JSON.stringify({\n  GIT_CREDENTIALS_FILE: process.env.GIT_CREDENTIALS_FILE ?? null,\n  E2B_API_KEY_FILE: process.env.E2B_API_KEY_FILE ?? null\n}));\n`);
    await withCredentialsDirectory(dir, async () => {
      const result = await runPipeline({ operation: "status" }, { pipeline: stub });
      assert.equal(result.success, true);
      const dump = JSON.parse(result.stdout.trim()) as ThreadedEnv;
      assert.equal(dump.GIT_CREDENTIALS_FILE, null);
      assert.equal(dump.E2B_API_KEY_FILE, null);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
