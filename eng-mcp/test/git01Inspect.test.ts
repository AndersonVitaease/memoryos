// GIT-01-W1 — testes das super tools READ-ONLY engineering.git.inspect_commit e
// engineering.git.inspect_changes sobre fixtures Git reais em tmpdir (sem mocks),
// prova de aceitação via batchOrchestrate e o benchmark do commit 2740766f contra
// o repositório autorizado. Nenhuma operação mutante é alcançável.
// Nota: o marcador de chave usado no T9 é montado em runtime por fragmentos para
// não disparar o gate de conteúdo sensível do próprio arquivo de teste, mas o
// conteúdo gravado no fixture temp dispara o gate real em gitRead (prova do T9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RepositoryAdapter } from "../src/repository.ts";
import { EngineeringError, RepositoryPolicy } from "../src/policy.ts";

const git = (cwd: string, args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" });
const codeOf = (error: unknown): string => (error instanceof EngineeringError ? error.code : (error as { code?: string })?.code ?? "");
const cleanDir = (dir: string): Promise<void> => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });

// Marcadores montados em runtime (nunca contíguos neste arquivo).
const DASH5 = "-".repeat(5);
const KEY_MARK = `${DASH5}BEGIN ${"RSA "}${"PRIVATE "}${"KEY"}${DASH5}`;
const KEY_MARK_END = `${DASH5}END ${"RSA "}${"PRIVATE "}${"KEY"}${DASH5}`;

type CommitMeta = { hash: string; shortHash: string; authorName: string; date: string; subject: string; parents: string[]; merge: boolean };
type CommitFile = { path: string; status: string; oldPath?: string; additions?: number; deletions?: number; binary?: boolean };
type InspectCommitResult = {
  ref: string; commit: string; mode: "meta" | "stat" | "patch" | "file"; path?: string;
  meta?: CommitMeta; files?: CommitFile[]; stat?: { filesChanged: number; insertions: number; deletions: number; binaryFiles: number };
  content?: string; patch?: string; patchBytes?: number; maxPatchBytes?: number; truncated?: boolean;
};
type InspectChangesResult = {
  worktree: { toplevel: string; gitCommonDir: string; linkedWorktree: boolean };
  branch: string | null; detached: boolean; head: string; base: string; baseCommit: string; dirty: boolean;
  staged: string[]; unstaged: string[]; untracked: string[]; conflicted: string[]; changedFiles: string[];
  stat: { filesChanged: number; insertions: number; deletions: number; binaryFiles: number; untrackedFiles: number };
  patch?: string; patchBytes?: number; maxPatchBytes?: number; truncated?: boolean;
};
type BatchResult = { success: boolean; results: Array<{ tool: string; index: number; success: boolean; result?: unknown; error?: string }> };

async function adapterFor(root: string): Promise<RepositoryAdapter> {
  return new RepositoryAdapter(await RepositoryPolicy.create(root));
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "git01-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "git01@example.test"]);
  git(root, ["config", "user.name", "Git01 Fixture"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  return root;
}

async function commitAll(root: string, files: Array<{ file: string; content: string | Buffer }>, message: string): Promise<string> {
  for (const entry of files) {
    const absolute = path.join(root, entry.file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, entry.content);
    git(root, ["add", "--", entry.file]);
  }
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

const commitFile = (root: string, file: string, content: string | Buffer, message: string): Promise<string> =>
  commitAll(root, [{ file, content }], message);

type FixtureA = { root: string; adapter: RepositoryAdapter; initial: string; second: string; sensitive: string; renamed: string; binary: string };

async function makeFixtureA(): Promise<FixtureA> {
  const root = await makeRepo();
  const adapter = await adapterFor(root);
  const initial = await commitAll(root, [{ file: "src/app.ts", content: "export const app = 1;\n" }], "git01 initial");
  const second = await commitAll(root, [
    { file: "src/app.ts", content: "export const app = 2;\n// tweak\n" },
    { file: "src/lib/util.ts", content: "export const util = () => 3;\n" },
    { file: "docs/readme.md", content: "# docs\n" }
  ], "git01 second");
  const sensitive = await commitAll(root, [{ file: "docs/leak.md", content: `${KEY_MARK}\nAAAA\n${KEY_MARK_END}\n` }], "git01 sensitive");
  git(root, ["mv", "docs/readme.md", "docs/guide.md"]);
  git(root, ["commit", "-m", "git01 rename docs"]);
  const renamed = git(root, ["rev-parse", "HEAD"]).trim();
  const binary = await commitAll(root, [{ file: "assets/blob.bin", content: Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x00]) }], "git01 binary");
  return { root, adapter, initial, second, sensitive, renamed, binary };
}

async function withFixtureA(run: (fixture: FixtureA) => Promise<void>): Promise<void> {
  const fixture = await makeFixtureA();
  try { await run(fixture); } finally { await cleanDir(fixture.root); }
}

async function makeCommittedRepo(): Promise<{ root: string; adapter: RepositoryAdapter; branch: string }> {
  const root = await makeRepo();
  await commitFile(root, "src/main.ts", "const a = 1;\nconst b = 2;\n", "git01 base");
  const adapter = await adapterFor(root);
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  return { root, adapter, branch };
}

test("T1 inspect_commit: ref valida resolve (hash completo e curto)", async () => {
  await withFixtureA(async ({ adapter, second }) => {
    const full = (await adapter.gitInspectCommit({ ref: second, mode: "meta" })) as unknown as InspectCommitResult;
    assert.equal(full.commit, second);
    const short = (await adapter.gitInspectCommit({ ref: second.slice(0, 10), mode: "meta" })) as unknown as InspectCommitResult;
    assert.equal(short.commit, second);
  });
});

test("T2 inspect_commit: refs invalidas/ausentes falham fechado", async () => {
  await withFixtureA(async ({ adapter }) => {
    await assert.rejects(() => adapter.gitInspectCommit({ ref: "does-not-exist", mode: "meta" }), (error: unknown) => codeOf(error) === "REF_NOT_AVAILABLE");
    await assert.rejects(() => adapter.gitInspectCommit({ ref: "--upload-pack=evil", mode: "meta" }), (error: unknown) => codeOf(error) === "REF_INVALID");
    await assert.rejects(() => adapter.gitInspectCommit({ ref: "HEAD~1", mode: "meta" }), (error: unknown) => codeOf(error) === "REF_INVALID");
  });
});

test("T3 inspect_commit mode=meta: metadados + pais, sem files/patch", async () => {
  await withFixtureA(async ({ adapter, second, initial }) => {
    const result = (await adapter.gitInspectCommit({ ref: second, mode: "meta" })) as unknown as InspectCommitResult;
    assert.equal(result.meta?.subject, "git01 second");
    assert.equal(result.meta?.merge, false);
    assert.equal(result.meta?.parents.length, 1);
    assert.equal(result.meta?.parents[0], initial);
    assert.ok(result.meta?.hash);
    assert.ok(result.meta?.date);
    assert.ok(result.meta?.authorName);
    assert.equal("files" in result, false);
    assert.equal("patch" in result, false);
  });
});

test("T4 inspect_commit mode=stat: arquivos + stat agregado, sem patch", async () => {
  await withFixtureA(async ({ adapter, second }) => {
    const result = (await adapter.gitInspectCommit({ ref: second, mode: "stat" })) as unknown as InspectCommitResult;
    assert.deepEqual(result.files?.map((file) => file.path).sort(), ["docs/readme.md", "src/app.ts", "src/lib/util.ts"]);
    const app = result.files?.find((file) => file.path === "src/app.ts");
    assert.equal(app?.status, "M");
    assert.equal(app?.additions, 2);
    assert.equal(app?.deletions, 1);
    assert.equal(result.files?.find((file) => file.path === "src/lib/util.ts")?.status, "A");
    assert.deepEqual(result.stat, { filesChanged: 3, insertions: 4, deletions: 1, binaryFiles: 0 });
    assert.equal("patch" in result, false);
  });
});

test("T5 inspect_commit mode=patch: diff presente, subject suprimido, rename e binario", async () => {
  await withFixtureA(async ({ adapter, second, renamed, binary }) => {
    const result = (await adapter.gitInspectCommit({ ref: second, mode: "patch" })) as unknown as InspectCommitResult;
    assert.ok(result.patch?.includes("diff --git"));
    assert.equal(result.patch?.includes("git01 second"), false);
    assert.equal(result.maxPatchBytes, 32768);
    assert.equal(result.patchBytes, Buffer.byteLength(result.patch ?? "", "utf8"));
    assert.equal(result.truncated, false);
    const renamePatch = (await adapter.gitInspectCommit({ ref: renamed, mode: "patch" })) as unknown as InspectCommitResult;
    assert.ok(renamePatch.patch?.includes("rename from"));
    const binaryPatch = (await adapter.gitInspectCommit({ ref: binary, mode: "patch" })) as unknown as InspectCommitResult;
    assert.ok(binaryPatch.patch?.includes("Binary files"));
    assert.equal(binaryPatch.stat?.binaryFiles, 1);
  });
});

test("T6 inspect_commit mode=file: conteudo historico do path + PATH_REQUIRED sem path", async () => {
  await withFixtureA(async ({ adapter, initial }) => {
    const result = (await adapter.gitInspectCommit({ ref: initial, mode: "file", path: "src/app.ts" })) as unknown as InspectCommitResult;
    assert.equal(result.content, "export const app = 1;\n");
    assert.equal(result.truncated, false);
    await assert.rejects(() => adapter.gitInspectCommit({ ref: initial, mode: "file" }), (error: unknown) => codeOf(error) === "PATH_REQUIRED");
  });
});

test("T7 inspect_commit: path filter deterministico (com e sem barra final)", async () => {
  await withFixtureA(async ({ adapter, second }) => {
    const filtered = (await adapter.gitInspectCommit({ ref: second, mode: "stat", path: "docs" })) as unknown as InspectCommitResult;
    assert.deepEqual(filtered.files?.map((file) => file.path), ["docs/readme.md"]);
    assert.equal(filtered.stat?.filesChanged, 1);
    const slash = (await adapter.gitInspectCommit({ ref: second, mode: "stat", path: "docs/" })) as unknown as InspectCommitResult;
    assert.deepEqual(slash.files?.map((file) => file.path), ["docs/readme.md"]);
  });
});

test("T8 inspect_commit: patch limitado por maxPatchBytes com truncated honesto", async () => {
  await withFixtureA(async ({ adapter, second }) => {
    const result = (await adapter.gitInspectCommit({ ref: second, mode: "patch", maxPatchBytes: 256 })) as unknown as InspectCommitResult;
    assert.equal(result.truncated, true);
    assert.ok((result.patchBytes ?? 0) <= 256);
    assert.ok((result.patch ?? "").length > 0);
  });
});

test("T9 inspect_commit: conteudo sensivel no historico falha fechado (gate)", async () => {
  await withFixtureA(async ({ adapter, sensitive }) => {
    await assert.rejects(() => adapter.gitInspectCommit({ ref: sensitive, mode: "patch" }), (error: unknown) => codeOf(error) === "SENSITIVE_CONTENT_BLOCKED");
    await assert.rejects(() => adapter.gitInspectCommit({ ref: sensitive, mode: "file", path: "docs/leak.md" }), (error: unknown) => codeOf(error) === "SENSITIVE_CONTENT_BLOCKED");
    const stat = (await adapter.gitInspectCommit({ ref: sensitive, mode: "stat" })) as unknown as InspectCommitResult;
    assert.deepEqual(stat.files?.map((file) => file.path), ["docs/leak.md"]);
  });
});

test("T10 inspect_commit: injecao via ref/path e negada", async () => {
  await withFixtureA(async ({ adapter, second }) => {
    await assert.rejects(() => adapter.gitInspectCommit({ ref: "HEAD;rm -rf /", mode: "meta" }), (error: unknown) => ["REF_INVALID", "REF_NOT_AVAILABLE"].includes(codeOf(error)));
    for (const badPath of ["-oKey=value", "..", "a/../b", ".git/config", "src/*.ts", "/etc/passwd", "C:/temp/x", "docs\\leak.md", ":3:src/app.ts", ""]) {
      await assert.rejects(() => adapter.gitInspectCommit({ ref: second, mode: "stat", path: badPath }), (error: unknown) => ["PATH_INVALID", "PATH_DENIED"].includes(codeOf(error)));
    }
  });
});

test("T11 inspect_commit: nenhuma mutacao no repositorio", async () => {
  await withFixtureA(async ({ root, adapter, second, initial }) => {
    const before = git(root, ["status", "--porcelain"]) + git(root, ["rev-parse", "HEAD"]) + git(root, ["stash", "list"]);
    await adapter.gitInspectCommit({ ref: second, mode: "patch" });
    await adapter.gitInspectCommit({ ref: initial, mode: "file", path: "src/app.ts" });
    await adapter.gitInspectCommit({ ref: second, mode: "stat" });
    const after = git(root, ["status", "--porcelain"]) + git(root, ["rev-parse", "HEAD"]) + git(root, ["stash", "list"]);
    assert.equal(after, before);
  });
});

test("T12 inspect_changes: worktree limpo", async () => {
  const { root, adapter, branch } = await makeCommittedRepo();
  try {
    const result = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.equal(result.dirty, false);
    assert.deepEqual(result.staged, []);
    assert.deepEqual(result.unstaged, []);
    assert.deepEqual(result.untracked, []);
    assert.deepEqual(result.conflicted, []);
    assert.deepEqual(result.changedFiles, []);
    assert.equal(result.stat.filesChanged, 0);
    assert.equal(result.stat.untrackedFiles, 0);
    assert.equal(result.branch, branch);
    assert.equal(result.detached, false);
    assert.equal(result.worktree.linkedWorktree, false);
    assert.equal("patch" in result, false);
  } finally { await cleanDir(root); }
});

test("T13 inspect_changes: mudancas staged", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    await writeFile(path.join(root, "src/main.ts"), "const a = 10;\nconst b = 2;\n");
    await writeFile(path.join(root, "src/extra.ts"), "export const extra = 1;\n");
    git(root, ["add", "--", "src/main.ts", "src/extra.ts"]);
    const result = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.deepEqual(result.staged, ["src/extra.ts", "src/main.ts"]);
    assert.deepEqual(result.unstaged, []);
    assert.equal(result.dirty, true);
  } finally { await cleanDir(root); }
});

test("T14 inspect_changes: mudancas unstaged", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    await writeFile(path.join(root, "src/main.ts"), "const a = 42;\nconst b = 2;\n");
    const result = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.deepEqual(result.unstaged, ["src/main.ts"]);
    assert.deepEqual(result.staged, []);
  } finally { await cleanDir(root); }
});

test("T15 inspect_changes: arquivos untracked (contados no stat)", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    await writeFile(path.join(root, "notes.txt"), "note\n");
    await writeFile(path.join(root, "src/nested.txt"), "nested\n");
    const result = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.deepEqual(result.untracked, ["notes.txt", "src/nested.txt"]);
    assert.equal(result.stat.untrackedFiles, 2);
    assert.equal(result.dirty, true);
  } finally { await cleanDir(root); }
});

test("T16 inspect_changes: estado de conflito de merge", async () => {
  const { root, adapter, branch } = await makeCommittedRepo();
  try {
    git(root, ["checkout", "-b", "feature"]);
    await writeFile(path.join(root, "src/main.ts"), "const a = 1;\nconst b = feature;\n");
    git(root, ["commit", "-am", "git01 feature"]);
    git(root, ["checkout", branch]);
    await writeFile(path.join(root, "src/main.ts"), "const a = 1;\nconst b = main;\n");
    git(root, ["commit", "-am", "git01 main"]);
    const merge = spawnSync("git", ["merge", "--no-edit", "feature"], { cwd: root, encoding: "utf8" });
    assert.notEqual(merge.status, 0); // conflito esperado
    const result = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.deepEqual(result.conflicted, ["src/main.ts"]);
    assert.equal(result.dirty, true);
  } finally { await cleanDir(root); }
});

test("T17/T18 inspect_changes: changedFiles uniao + stat numstat correto", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    await commitFile(root, "src/second.ts", "const c = 3;\n", "git01 second file");
    await writeFile(path.join(root, "src/main.ts"), "const a = 10;\nconst b = 22;\n"); // unstaged +2/-2
    await writeFile(path.join(root, "src/second.ts"), "const c = 30;\nconst d = 4;\n"); // unstaged +2/-1
    await writeFile(path.join(root, "src/staged.ts"), "export const staged = true;\n"); // staged novo +1/-0
    git(root, ["add", "--", "src/staged.ts"]);
    await writeFile(path.join(root, "notes.txt"), "note\n"); // untracked
    const result = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.deepEqual(result.changedFiles, ["notes.txt", "src/main.ts", "src/second.ts", "src/staged.ts"]);
    assert.deepEqual(result.staged, ["src/staged.ts"]);
    assert.deepEqual(result.unstaged.sort(), ["src/main.ts", "src/second.ts"]);
    assert.equal(result.stat.filesChanged, 3);
    assert.equal(result.stat.insertions, 5);
    assert.equal(result.stat.deletions, 3);
    assert.equal(result.stat.untrackedFiles, 1);
  } finally { await cleanDir(root); }
});

test("T19 inspect_changes: includePatch ausente/false nao retorna patch", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    await writeFile(path.join(root, "src/main.ts"), "const a = 9;\nconst b = 2;\n");
    const omitted = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.equal("patch" in omitted, false);
    const explicit = (await adapter.gitInspectChanges({ includePatch: false })) as unknown as InspectChangesResult;
    assert.equal("patch" in explicit, false);
  } finally { await cleanDir(root); }
});

test("T20 inspect_changes: includePatch=true retorna patch limitado e truncado honesto", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    const lines = Array.from({ length: 40 }, (_, index) => `const line${index} = ${index};`).join("\n") + "\n";
    await writeFile(path.join(root, "src/main.ts"), lines);
    const result = (await adapter.gitInspectChanges({ includePatch: true, maxPatchBytes: 256 })) as unknown as InspectChangesResult;
    assert.equal(typeof result.patch, "string");
    assert.ok((result.patchBytes ?? 0) <= 256);
    assert.equal(result.truncated, true);
  } finally { await cleanDir(root); }
});

test("T21 inspect_changes: linked worktree (.git FILE) e suportado", async () => {
  const { root, adapter } = await makeCommittedRepo();
  const sibling = `${root}-wt`;
  try {
    git(root, ["worktree", "add", "-b", "git01-wt", sibling]);
    const worktreeAdapter = await adapterFor(sibling);
    const result = (await worktreeAdapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.equal(result.worktree.linkedWorktree, true);
    assert.equal(result.branch, "git01-wt");
    assert.equal(result.dirty, false);
    const fromMain = (await adapter.gitInspectChanges({})) as unknown as InspectChangesResult;
    assert.equal(fromMain.worktree.linkedWorktree, false);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", sibling], { cwd: root });
    spawnSync("git", ["worktree", "prune"], { cwd: root });
    await cleanDir(sibling);
    await cleanDir(root);
  }
});

test("T22 inspect_changes: nenhuma mutacao no worktree", async () => {
  const { root, adapter } = await makeCommittedRepo();
  try {
    await writeFile(path.join(root, "src/main.ts"), "const a = 7;\nconst b = 2;\n");
    const before = git(root, ["status", "--porcelain"]) + git(root, ["rev-parse", "HEAD"]) + git(root, ["stash", "list"]);
    await adapter.gitInspectChanges({});
    await adapter.gitInspectChanges({ includePatch: true, maxPatchBytes: 1024 });
    await adapter.gitInspectChanges({ base: "HEAD" });
    const after = git(root, ["status", "--porcelain"]) + git(root, ["rev-parse", "HEAD"]) + git(root, ["stash", "list"]);
    assert.equal(after, before);
  } finally { await cleanDir(root); }
});

test("T23-T25 batchOrchestrate aceita as duas super tools e paraleliza sem mutacao", async () => {
  await withFixtureA(async ({ root, adapter, second, initial }) => {
    const before = git(root, ["status", "--porcelain"]) + git(root, ["rev-parse", "HEAD"]);
    const batch = (await adapter.batchOrchestrate("git01-batch", [
      { tool: "engineering.git.inspect_commit", arguments: { ref: second, mode: "meta" } },
      { tool: "engineering.git.inspect_changes", arguments: {} }
    ])) as unknown as BatchResult;
    assert.equal(batch.success, true);
    assert.equal(batch.results.length, 2);
    assert.equal(batch.results[0]?.success, true);
    assert.equal(batch.results[1]?.success, true);
    const parallel = (await adapter.batchOrchestrate("git01-batch-parallel", [
      { tool: "engineering.git.inspect_commit", arguments: { ref: initial, mode: "stat" } },
      { tool: "engineering.git.inspect_commit", arguments: { ref: second, mode: "stat" } },
      { tool: "engineering.git.inspect_changes", arguments: { includePatch: true, maxPatchBytes: 1024 } },
      { tool: "engineering.git.inspect_changes", arguments: {} }
    ])) as unknown as BatchResult;
    assert.equal(parallel.success, true);
    assert.equal(parallel.results.length, 4);
    for (const entry of parallel.results) assert.equal(entry.success, true);
    const after = git(root, ["status", "--porcelain"]) + git(root, ["rev-parse", "HEAD"]);
    assert.equal(after, before);
  });
});

test("T26 benchmark 2740766f no repositorio autorizado (skip se ausente)", async (t) => {
  const root = process.cwd();
  let benchmark = "";
  try {
    benchmark = git(root, ["rev-parse", "--verify", "--quiet", "2740766f^{commit}"]).trim();
  } catch {
    t.skip("commit benchmark 2740766f nao presente neste checkout");
    return;
  }
  const adapter = await adapterFor(root);
  const meta = (await adapter.gitInspectCommit({ ref: "2740766f", mode: "meta" })) as unknown as InspectCommitResult;
  assert.equal(meta.commit, benchmark);
  const stat = (await adapter.gitInspectCommit({ ref: "2740766f", mode: "stat" })) as unknown as InspectCommitResult;
  assert.ok((stat.files?.length ?? 0) > 0);
  assert.ok((stat.files ?? []).some((file) => file.path.startsWith("eng-mcp/")));
  const testPath = stat.files?.[0]?.path;
  assert.ok(testPath);
  const fileMode = (await adapter.gitInspectCommit({ ref: "2740766f", mode: "file", path: testPath })) as unknown as InspectCommitResult;
  assert.equal(typeof fileMode.content, "string");
  const patch = (await adapter.gitInspectCommit({ ref: "2740766f", mode: "patch", path: testPath, maxPatchBytes: 32768 })) as unknown as InspectCommitResult;
  assert.ok(patch.truncated === true || patch.truncated === false);
});
