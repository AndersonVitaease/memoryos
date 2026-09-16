// ENG-MCP-UNTRACKED-PATCH-01 — testes targeted do gate de versionamento do
// engineering.file.patch: TRACKED mantém o gate atual inalterado; UNTRACKED
// exige acknowledgeWrite + baseHash SHA-256 do conteúdo atual (optimistic
// concurrency por content-hash), com revalidação anti-race pós-escrita.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RepositoryAdapter } from "../src/repository.ts";
import { EngineeringError } from "../src/policy.ts";

const sha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const isConflict = (error: unknown) =>
  error instanceof EngineeringError && `${(error as { code?: string }).code}${(error as Error).message}`.includes("FILE_VERSION_CONFLICT");

async function makeAdapter() {
  const root = await mkdtemp(path.join(tmpdir(), "eng-mcp-untracked-patch-"));
  await writeFile(path.join(root, "seed.txt"), "seed\n");
  execSync("git init -q", { cwd: root });
  execSync("git config user.email t@t.invalid", { cwd: root });
  execSync("git config user.name t", { cwd: root });
  execSync("git add -A && git commit -qm seed", { cwd: root });
  await writeFile(path.join(root, "tracked.ts"), "export const tracked = 'v1';\n");
  await writeFile(path.join(root, "untracked.ts"), "export const untracked = 'v1';\n");
  execSync("git add tracked.ts && git commit -qm tracked", { cwd: root });
  const policy = {
    authorizedRoot: root,
    lintRuntime: {},
    resolve: async (relativePath: string) => ({ absolutePath: path.join(root, relativePath), relativePath }),
    resolveWritable: async (relativePath: string) => ({
      absolutePath: path.join(root, relativePath),
      parentPath: path.dirname(path.join(root, relativePath)),
      relativePath
    }),
    assertReadableExtension: () => true
  } as unknown as ConstructorParameters<typeof RepositoryAdapter>[0];
  return { adapter: new RepositoryAdapter(policy), root };
}

const edit = (from: string, to: string) => [{ startLine: 1, deleteLines: [from], insertLines: [to] }];

test("01 tracked + baseHash correto + acknowledgeWrite: aplica (gate atual intacto)", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    const result = await adapter.patch({ path: "tracked.ts", baseHash: sha256("export const tracked = 'v1';\n"), hunks: edit("export const tracked = 'v1';", "export const tracked = 'v2';"), acknowledgeWrite: true });
    assert.equal(result.filesChanged[0], "tracked.ts");
    assert.ok(/^[a-f0-9]{64}$/.test(result.newHash));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("02 tracked + baseHash errado: FILE_VERSION_CONFLICT (comportamento atual mantido)", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    await assert.rejects(
      adapter.patch({ path: "tracked.ts", baseHash: sha256("conteudo-diferente"), hunks: edit("export const tracked = 'v1';", "export const tracked = 'v2';"), acknowledgeWrite: true }),
      isConflict
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("03 untracked + baseHash correto + acknowledgeWrite=true: PASS", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    const result = await adapter.patch({ path: "untracked.ts", baseHash: sha256("export const untracked = 'v1';\n"), hunks: edit("export const untracked = 'v1';", "export const untracked = 'v2';"), acknowledgeWrite: true });
    assert.equal(result.filesChanged[0], "untracked.ts");
    assert.ok(/^[a-f0-9]{64}$/.test(result.newHash));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("04 untracked + baseHash errado (sha256 válido de outro conteúdo): FILE_VERSION_CONFLICT", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    await assert.rejects(
      adapter.patch({ path: "untracked.ts", baseHash: sha256("outro-conteudo"), hunks: edit("export const untracked = 'v1';", "export const untracked = 'v2';"), acknowledgeWrite: true }),
      isConflict
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("05 untracked sem baseHash (vazio): rejeitado", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    await assert.rejects(
      adapter.patch({ path: "untracked.ts", baseHash: "", hunks: edit("export const untracked = 'v1';", "export const untracked = 'v2';"), acknowledgeWrite: true }),
      isConflict
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("06 untracked sem acknowledgeWrite: rejeitado", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    await assert.rejects(
      adapter.patch({ path: "untracked.ts", baseHash: sha256("export const untracked = 'v1';\n"), hunks: edit("export const untracked = 'v1';", "export const untracked = 'v2';"), acknowledgeWrite: false }),
      (error: unknown) => error instanceof EngineeringError && `${(error as { code?: string }).code}${(error as Error).message}`.includes("WRITE_ACKNOWLEDGEMENT_REQUIRED")
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("07 arquivo alterado depois do hash: hash diverge e patch falha (anti-race)", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    const stale = sha256("export const untracked = 'v1';\n");
    const result = await adapter.patch({ path: "untracked.ts", baseHash: stale, hunks: edit("export const untracked = 'v1';", "export const untracked = 'v2';"), acknowledgeWrite: true });
    assert.equal(result.filesChanged[0], "untracked.ts");
    await assert.rejects(
      adapter.patch({ path: "untracked.ts", baseHash: stale, hunks: edit("export const untracked = 'v2';", "export const untracked = 'v3';"), acknowledgeWrite: true }),
      isConflict
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("08 hunks nao aplicam limpo sobre o conteudo do hash: rejeitado (protecao de contexto)", async () => {
  const { adapter, root } = await makeAdapter();
  try {
    await assert.rejects(
      adapter.patch({ path: "untracked.ts", baseHash: sha256("export const untracked = 'v1';\n"), hunks: edit("export const inexistente = 'x';", "export const outro = 'y';"), acknowledgeWrite: true }),
      (error: unknown) => error instanceof EngineeringError && `${(error as { code?: string }).code}${(error as Error).message}`.includes("PATCH_CONTEXT_MISMATCH")
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});
