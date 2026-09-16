// MANIFEST-GOVERNED-EDIT-01 — testes do caminho governado para os três manifests
// de raiz (package.json, package-lock.json, Dockerfile). O centro de gravidade é
// o TESTE DE RECUSA (02): recusar tem que IMPEDIR a escrita — zero mutação,
// byte-idêntico, índice intocado — e uma proposta recusada jamais pode ser
// aplicada. A aprovação (03) prova o lado positivo com hash revalidado. Os
// gates antigos de HIGH_IMPACT (policy.resolveWritable/resolveGitStageable) têm
// que continuar bloqueando TUDO fora dos três caminhos governados (08).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RepositoryAdapter } from "../src/repository.ts";
import { RepositoryPolicy, EngineeringError } from "../src/policy.ts";
import { runManifestEdit, type ManifestEditDeps } from "../src/manifestEdit.ts";

const sha256 = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const hasCode = (code: string) => (error: unknown) =>
  error instanceof EngineeringError && `${(error as { code?: string }).code}${(error as Error).message}`.includes(code);

const PKG_V1 = '{"name":"demo","version":"1.0.0"}\n';
const PKG_V2 = '{"name":"demo","version":"2.0.0"}\n';
const pkgBump = [{ startLine: 1, deleteLines: ['{"name":"demo","version":"1.0.0"}'], insertLines: ['{"name":"demo","version":"2.0.0"}'] }];
const DOCKER_V1 = "FROM node:20\nRUN echo hi\n";
const dockerBump = [{ startLine: 1, deleteLines: ["FROM node:20"], insertLines: ["FROM node:22-alpine"] }];

type Proposal = { proposalId: string; proposalFingerprint: string; status: string; baseHash: string; tracked: boolean; nextLength?: number; diff?: string | null };
type Refusal = { status: string; refuseReason: string | null };
type Applied = { status: string; result: { filesChanged: string[]; oldHash: string; newHash: string; diff: string }; approvedBy: string };
type Staged = { status: string; result: { pathsStaged: string[]; indexHashBefore: string; indexHashAfter: string } };

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), "eng-mcp-manifest-governed-"));
  execSync("git init -q", { cwd: root });
  execSync("git config user.email t@t.invalid", { cwd: root });
  execSync("git config user.name t", { cwd: root });
  await writeFile(path.join(root, "seed.txt"), "seed\n");
  execSync("git add -A && git commit -qm seed", { cwd: root });
  const policy = await RepositoryPolicy.create(root);
  const adapter = new RepositoryAdapter(policy);
  const auditDir = await mkdtemp(path.join(tmpdir(), "eng-mcp-manifest-audit-"));
  const auditFile = path.join(auditDir, "audit.jsonl");
  const deps: ManifestEditDeps = { repository: adapter, repositoryId: root, scopes: { write: true, git: true }, auditFile };
  const cleanup = async () => { await rm(root, { recursive: true, force: true }); await rm(auditDir, { recursive: true, force: true }); };
  return { root, policy, adapter, deps, auditFile, cleanup };
}

const approve = (proposal: { proposalId: string; proposalFingerprint: string }, observedAt = Date.now()) => ({
  version: 1 as const,
  proposalId: proposal.proposalId,
  proposalFingerprint: proposal.proposalFingerprint,
  approvedBy: "operator-test",
  observedAt
});

async function trackedPackageRepo() {
  const ctx = await makeRepo();
  await writeFile(path.join(ctx.root, "package.json"), PKG_V1);
  execSync("git add package.json && git commit -qm pkg", { cwd: ctx.root });
  return ctx;
}

test("01 propose (write) mostra o diff proposto e NÃO muta nada", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump, expectedChangeCount: 1 }, deps) as Proposal;
    assert.equal(proposal.status, "pending");
    assert.ok(/^[0-9a-f]{64}$/.test(proposal.proposalFingerprint));
    assert.equal(proposal.baseHash, sha256(PKG_V1));
    assert.equal(proposal.nextLength, PKG_V2.length);
    // zero mutação: worktree e índice intocado, byte-idêntico
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V1);
    assert.equal(execSync("git status --porcelain", { cwd: root, encoding: "utf8" }), "");
  } finally { await cleanup(); }
});

test("02 RECUSA bloqueia: refuse → apply falha PROPOSAL_REFUSED, arquivo byte-idêntico, índice intocado", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const before = await readFile(path.join(root, "package.json"));
    const indexBefore = execSync("git diff --cached --name-only", { cwd: root, encoding: "utf8" });
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    const refusal = await runManifestEdit({ action: "refuse", proposalId: proposal.proposalId, refuseReason: "operador disse não" }, deps) as Refusal;
    assert.equal(refusal.status, "refused");
    assert.equal(refusal.refuseReason, "operador disse não");
    // Mesmo com approval artifact VÁLIDO (fingerprint correto), apply morre.
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, deps),
      hasCode("PROPOSAL_REFUSED")
    );
    const after = await readFile(path.join(root, "package.json"));
    assert.ok(before.equals(after), "arquivo foi alterado apesar da recusa");
    assert.equal(execSync("git diff --cached --name-only", { cwd: root, encoding: "utf8" }), indexBefore);
    assert.equal(execSync("git status --porcelain", { cwd: root, encoding: "utf8" }), "");
    // refuse é idempotente para proposta já recusada
    const again = await runManifestEdit({ action: "refuse", proposalId: proposal.proposalId, refuseReason: "segunda vez" }, deps) as Refusal;
    assert.equal(again.status, "refused");
    assert.ok((await readFile(path.join(root, "package.json"))).equals(before));
  } finally { await cleanup(); }
});

test("03 APROVAÇÃO permite: apply executa com hash revalidado e conteúdo aplicado", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump, expectedChangeCount: 1 }, deps) as Proposal;
    const applied = await runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, deps) as Applied;
    assert.equal(applied.status, "applied");
    assert.equal(applied.approvedBy, "operator-test");
    assert.deepEqual(applied.result.filesChanged, ["package.json"]);
    assert.equal(applied.result.oldHash, sha256(PKG_V1));
    assert.equal(applied.result.newHash, sha256(PKG_V2));
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V2);
  } finally { await cleanup(); }
});

test("04 drift externo entre propose e apply: FILE_VERSION_CONFLICT, proposta não clobberiza", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    const external = '{"name":"demo","version":"1.5.0"}\n';
    await writeFile(path.join(root, "package.json"), external);
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, deps),
      hasCode("FILE_VERSION_CONFLICT")
    );
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), external);
  } finally { await cleanup(); }
});

test("05 expiração: proposta com TTL vencido não aplica (PROPOSAL_EXPIRED)", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    let clock = Date.now();
    const timed: ManifestEditDeps = { ...deps, now: () => clock, ttlMs: 1 };
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, timed) as Proposal;
    clock += 10;
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal, clock), acknowledgeApply: true }, timed),
      hasCode("PROPOSAL_EXPIRED")
    );
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V1);
  } finally { await cleanup(); }
});

test("06 apply é single-use: replay do mesmo artifact → PROPOSAL_ALREADY_APPLIED", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    const artifact = approve(proposal);
    await runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: artifact, acknowledgeApply: true }, deps);
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: artifact, acknowledgeApply: true }, deps),
      hasCode("PROPOSAL_ALREADY_APPLIED")
    );
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V2);
  } finally { await cleanup(); }
});

test("07 fingerprint divergente no artifact: APPROVAL_FINGERPRINT_MISMATCH, zero mutação", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    const forged = { version: 1 as const, proposalId: proposal.proposalId, proposalFingerprint: "0".repeat(64), approvedBy: "operator-test", observedAt: Date.now() };
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: forged, acknowledgeApply: true }, deps),
      hasCode("APPROVAL_FINGERPRINT_MISMATCH")
    );
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V1);
  } finally { await cleanup(); }
});

test("08 gates antigos intactos: resolveWritable/resolveGitStageable continuam bloqueando todo o resto", async () => {
  const { root, policy, cleanup } = await makeRepo();
  try {
    await writeFile(path.join(root, "package.json"), PKG_V1);
    await writeFile(path.join(root, "package-lock.json"), "{}\n");
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lock\n");
    await writeFile(path.join(root, "Dockerfile"), DOCKER_V1);
    await mkdir(path.join(root, "sub"), { recursive: true });
    await writeFile(path.join(root, "sub", "package.json"), "{}\n");
    await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
    await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "on: push\n");
    await mkdir(path.join(root, "infra"), { recursive: true });
    await writeFile(path.join(root, "infra", "deploy.sh"), "echo hi\n");
    for (const blocked of ["package.json", "package-lock.json", "pnpm-lock.yaml", "sub/package.json", ".github/workflows/ci.yml", "infra/deploy.sh"]) {
      await assert.rejects(() => policy.resolveWritable(blocked), hasCode("HIGH_IMPACT_WRITE_BLOCKED"), `resolveWritable(${blocked}) deveria continuar bloqueado`);
    }
    for (const blocked of ["package.json", "package-lock.json", "pnpm-lock.yaml", "sub/package.json"]) {
      await assert.rejects(() => policy.resolveGitStageable(blocked), hasCode("HIGH_IMPACT_GIT_BLOCKED"), `resolveGitStageable(${blocked}) deveria continuar bloqueado`);
    }
    // Dockerfile segue negado no caminho NORMAL (extensão) — só o fluxo governado o alcança.
    await assert.rejects(() => policy.resolveWritable("Dockerfile"), hasCode("FILE_TYPE_DENIED"));
    await assert.rejects(() => policy.resolveGitStageable("Dockerfile"), hasCode("FILE_TYPE_DENIED"));
  } finally { await cleanup(); }
});

test("09 stage governado: refuse bloqueia (arquivo segue untracked), approve stageia de verdade", async () => {
  const { root, deps, cleanup } = await makeRepo();
  try {
    await writeFile(path.join(root, "Dockerfile"), DOCKER_V1);
    // untracked é SEMPRE stageable (o caso de convergência dos três manifests)
    const proposal = await runManifestEdit({ action: "propose", kind: "stage", path: "Dockerfile" }, deps) as Proposal;
    assert.equal(proposal.tracked, false);
    await runManifestEdit({ action: "refuse", proposalId: proposal.proposalId }, deps);
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, deps),
      hasCode("PROPOSAL_REFUSED")
    );
    assert.equal(execSync("git status --porcelain", { cwd: root, encoding: "utf8" }), "?? Dockerfile\n");
    // nova proposta (a recusada não bloqueia caminho) → aprovação stageia
    const proposal2 = await runManifestEdit({ action: "propose", kind: "stage", path: "Dockerfile" }, deps) as Proposal;
    const staged = await runManifestEdit({ action: "apply", proposalId: proposal2.proposalId, approval: approve(proposal2), acknowledgeApply: true }, deps) as Staged;
    assert.deepEqual(staged.result.pathsStaged, ["Dockerfile"]);
    assert.match(execSync("git status --porcelain", { cwd: root, encoding: "utf8" }), /^A  Dockerfile$/m);
  } finally { await cleanup(); }
});

test("10 escopo: propose e apply exigem o escopo do kind; apply usa o kind ARMAZENADO", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const noWrite: ManifestEditDeps = { ...deps, scopes: { write: false, git: true } };
    const noGit: ManifestEditDeps = { ...deps, scopes: { write: true, git: false } };
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, noWrite), hasCode("AUTHORIZATION_SCOPE_REQUIRED"));
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "stage", path: "package.json" }, noGit), hasCode("AUTHORIZATION_SCOPE_REQUIRED"));
    // proposta criada COM escopo; apply sem escopo é negado (kind armazenado = write)
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    await assert.rejects(
      () => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, noWrite),
      hasCode("AUTHORIZATION_SCOPE_REQUIRED")
    );
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V1);
  } finally { await cleanup(); }
});

test("11 artifacts inválidos: sem approval, proposalId errado, observedAt coerente, sem acknowledgeApply", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    await assert.rejects(() => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, acknowledgeApply: true }, deps), hasCode("APPROVAL_ARTIFACT_REQUIRED"));
    const wrongId = { version: 1 as const, proposalId: "00000000-0000-4000-8000-000000000000", proposalFingerprint: proposal.proposalFingerprint, approvedBy: "operator-test", observedAt: Date.now() };
    await assert.rejects(() => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: wrongId, acknowledgeApply: true }, deps), hasCode("APPROVAL_ARTIFACT_INVALID"));
    const early = { ...approve(proposal, Date.now()), observedAt: Date.now() - 3_600_000 };
    await assert.rejects(() => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: early, acknowledgeApply: true }, deps), hasCode("APPROVAL_ARTIFACT_INVALID"));
    const future = { ...approve(proposal, Date.now()), observedAt: Date.now() + 3_600_000 };
    await assert.rejects(() => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: future, acknowledgeApply: true }, deps), hasCode("APPROVAL_ARTIFACT_INVALID"));
    await assert.rejects(() => runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal) }, deps), hasCode("APPLY_ACKNOWLEDGEMENT_REQUIRED"));
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V1);
    assert.equal(execSync("git status --porcelain", { cwd: root, encoding: "utf8" }), "");
  } finally { await cleanup(); }
});

test("12 Dockerfile governed write: extensão negada no caminho normal, escrita OK no governado", async () => {
  const { root, deps, cleanup } = await makeRepo();
  try {
    await writeFile(path.join(root, "Dockerfile"), DOCKER_V1);
    execSync("git add Dockerfile && git commit -qm dockerfile", { cwd: root });
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "Dockerfile", hunks: dockerBump, expectedChangeCount: 1 }, deps) as Proposal;
    const applied = await runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, deps) as Applied;
    assert.equal(applied.result.newHash, sha256("FROM node:22-alpine\nRUN echo hi\n"));
    assert.equal(await readFile(path.join(root, "Dockerfile"), "utf8"), "FROM node:22-alpine\nRUN echo hi\n");
  } finally { await cleanup(); }
});

test("13 unicidade: uma proposta pendente por (root, kind, path); kinds distintos coexistem; refuse libera", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const first = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps), hasCode("PROPOSAL_ALREADY_PENDING"));
    await runManifestEdit({ action: "refuse", proposalId: first.proposalId }, deps);
    const next = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    assert.notEqual(next.proposalId, first.proposalId);
    // stage (kind diferente, mesmo caminho) coexiste — arquivo modificado externamente p/ ter diff
    await writeFile(path.join(root, "package.json"), '{"name":"demo","version":"1.1.0"}\n');
    const stageProposal = await runManifestEdit({ action: "propose", kind: "stage", path: "package.json" }, deps) as Proposal;
    assert.equal(stageProposal.status, "pending");
  } finally { await cleanup(); }
});

test("14 contexto divergente no propose: PATCH_CONTEXT_MISMATCH, estado não envenenado", async () => {
  const { root, deps, cleanup } = await trackedPackageRepo();
  try {
    const bad = [{ startLine: 1, deleteLines: ["const nao_existe = true;"], insertLines: ["const x = 1;"] }];
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: bad }, deps), hasCode("PATCH_CONTEXT_MISMATCH"));
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), PKG_V1);
    // proposta válida subsequente funciona (falha no propose não criou registro)
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    assert.equal(proposal.status, "pending");
  } finally { await cleanup(); }
});

test("15 auditoria JSONL: propose/refuse/apply registrados; apply pré-mutação tem quem aprovou, quando e o diff exato", async () => {
  const { deps, auditFile, cleanup } = await trackedPackageRepo();
  try {
    const refused = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    await runManifestEdit({ action: "refuse", proposalId: refused.proposalId, refuseReason: "não" }, deps);
    const proposal = await runManifestEdit({ action: "propose", kind: "write", path: "package.json", hunks: pkgBump }, deps) as Proposal;
    await runManifestEdit({ action: "apply", proposalId: proposal.proposalId, approval: approve(proposal), acknowledgeApply: true }, deps);
    const lines = (await readFile(auditFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown> & { event: string; phase?: string; proposalId: string });
    assert.ok(lines.some((line) => line.event === "propose" && line.proposalId === refused.proposalId));
    assert.ok(lines.some((line) => line.event === "refuse" && line.proposalId === refused.proposalId && line.refuseReason === "não"));
    const pre = lines.find((line) => line.event === "apply" && line.phase === "pre-mutation" && line.proposalId === proposal.proposalId);
    assert.ok(pre, "entrada pré-mutação ausente");
    assert.equal(pre.approvedBy, "operator-test");
    assert.ok(typeof pre.approvalObservedAt === "string");
    const hunks = pre.hunks as Array<{ insertLines: string[] }>;
    assert.equal(hunks[0].insertLines[0], '{"name":"demo","version":"2.0.0"}');
    const post = lines.find((line) => line.event === "apply" && line.phase === "post-mutation" && line.proposalId === proposal.proposalId);
    assert.ok(post, "entrada pós-mutação ausente");
    const result = post.result as { newHash?: string };
    assert.equal(result.newHash, sha256(PKG_V2));
  } finally { await cleanup(); }
});

test("16 caminho fora da allowlist: MANIFEST_PATH_NOT_GOVERNED (nada alcançável fora dos três)", async () => {
  const { deps, cleanup } = await trackedPackageRepo();
  try {
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "write", path: "src/index.ts", hunks: pkgBump }, deps), hasCode("MANIFEST_PATH_NOT_GOVERNED"));
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "write", path: "pnpm-lock.yaml", hunks: pkgBump }, deps), hasCode("MANIFEST_PATH_NOT_GOVERNED"));
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "stage", path: "../outside/package.json" }, deps), hasCode("MANIFEST_PATH_NOT_GOVERNED"));
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "write", path: "package.json" }, deps), hasCode("HUNKS_REQUIRED"));
  } finally { await cleanup(); }
});

test("17 stage tracked sem diff: STAGE_NOTHING_TO_STAGE (untracked nunca é rejeitado por isso)", async () => {
  const { deps, cleanup } = await trackedPackageRepo();
  try {
    // package.json tracked e limpo → nada a stagear
    await assert.rejects(() => runManifestEdit({ action: "propose", kind: "stage", path: "package.json" }, deps), hasCode("STAGE_NOTHING_TO_STAGE"));
  } finally { await cleanup(); }
});
