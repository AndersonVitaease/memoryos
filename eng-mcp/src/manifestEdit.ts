// engineering.manifest.edit — MANIFEST-GOVERNED-EDIT-01: caminho GOVERNADO para os
// três manifests de raiz HIGH_IMPACT (package.json, package-lock.json, Dockerfile).
//
// Decisão do operador: trocar o bloqueio TOTAL desses três arquivos por um fluxo
// bind/apply com aprovação humana OBRIGATÓRIA — nunca bypass silencioso. O fluxo:
//   propose — lê o estado real (hash + tracked) via repository.manifestPreviewPatch
//     (write) ou repository.manifestStagePreview (stage), valida os hunks contra o
//     conteúdo ATUAL (PATCH_CONTEXT_MISMATCH falha o propose; zero mutação) e
//     registra uma proposta imutável com fingerprint SHA-256 canônico + TTL.
//     A resposta carrega o diff proposto completo (hunks ou diff de stage) para
//     aprovação VISÍVEL antes de qualquer escrita.
//   refuse — marca a proposta como refused PERMANENTEMENTE. Uma proposta recusada
//     nunca pode ser aplicada (apply → PROPOSAL_REFUSED, zero mutação, sempre).
//     Idempotente para propostas já recusadas.
//   apply — só executa com acknowledgeApply + approval artifact data-only
//     {version:1, proposalId, proposalFingerprint, approvedBy, observedAt} com
//     fingerprint idêntico ao da proposta, observedAt coerente (>= proposedAt,
//     não no futuro), escopo correspondente ao kind ARMAZENADO na proposta
//     (write→engineering:write, stage→engineering:git) e revalidação de estado
//     no momento da mutação (baseHash otimista do repository.patch machinery —
//     drift externo → FILE_VERSION_CONFLICT). A escrita em si é delegada
//     INTEGRALMENTE às peças certificadas: repository.patchManifest (núcleo
//     extraído de file.patch: write lock, atomicReplace anti-race, assertBaseline)
//     e repository.gitStageManifest (espelho de git.stage para um caminho
//     governado). Guardian Core não é tocado.
// Auditoria: JSONL (default /data/manifest-edit-audit.jsonl, env
// ENG_MCP_MANIFEST_AUDIT_FILE). No apply a escrita PRÉ-MUTAÇÃO (quem aprovou,
// quando, o diff exato) é OBRIGATÓRIA — falha ⇒ AUDIT_LOG_WRITE_FAILED com zero
// mutação. propose/refuse auditam best-effort (nunca bloqueiam leitura).
// Estado: registro em memória (Map) com vida honesta — perdida em restart
// (mesmo padrão SBW_BATCH_NOT_FOUND); propostas expiram em 15 min, teto de 20
// pendentes, propostas terminais podadas.
// Fora de escopo: qualquer outro caminho (os outros HIGH_IMPACT mantêm bloqueio
// total em policy.resolveWritable/resolveGitStageable — esta ferramenta NÃO os
// alcança: resolveManifestPath só aceita os três caminhos exatos de raiz).
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { EngineeringError, MANIFEST_GOVERNED_PATHS } from "./policy.ts";

export const PROPOSAL_TTL_MS = 900_000; // 15 minutos
export const MAX_PENDING_PROPOSALS = 20;
const MAX_RETAINED_PROPOSALS = 200;
const APPROVAL_CLOCK_SKEW_MS = 60_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

const hunkSchema = z.object({
  startLine: z.number().int().min(1),
  deleteLines: z.array(z.string()),
  insertLines: z.array(z.string())
}).strict();

const approvalArtifactSchema = z.object({
  version: z.literal(1),
  proposalId: z.string().regex(UUID_PATTERN),
  proposalFingerprint: z.string().regex(HASH_PATTERN),
  approvedBy: z.string().min(1).max(200),
  observedAt: z.number().int().positive()
}).strict();

export const manifestEditInputSchema = z.object({
  action: z.enum(["propose", "refuse", "apply"]),
  kind: z.enum(["write", "stage"]).optional(),
  path: z.string().max(200).optional(),
  baseHash: z.string().regex(HASH_PATTERN).optional(),
  hunks: z.array(hunkSchema).max(200).optional(),
  expectedChangeCount: z.number().int().min(0).optional(),
  proposalId: z.string().regex(UUID_PATTERN).optional(),
  approval: approvalArtifactSchema.optional(),
  refuseReason: z.string().min(1).max(500).optional(),
  acknowledgeApply: z.literal(true).optional()
}).strict();

export type ManifestEditInput = z.infer<typeof manifestEditInputSchema>;

type ManifestHunks = Array<{ startLine: number; deleteLines: string[]; insertLines: string[] }>;

// Structural view of the certified repository pieces this flow delegates to.
export type ManifestEditRepository = {
  manifestPreviewPatch(input: { path: string; baseHash?: string; hunks: ManifestHunks; expectedChangeCount?: number }): Promise<{ relativePath: string; baseHash: string; tracked: boolean; nextLength: number; hunkCount: number; touchedLines: number; warnings: string[] }>;
  patchManifest(input: { path: string; baseHash: string; hunks: ManifestHunks; expectedChangeCount?: number; acknowledgeWrite: boolean }): Promise<{ filesChanged: string[]; oldHash: string; newHash: string; diff: string; truncated: boolean; warnings: string[] }>;
  manifestStagePreview(input: { path: string }): Promise<{ relativePath: string; baseHash: string; tracked: boolean; diff: string; diffTruncated: boolean }>;
  gitStageManifest(input: { path: string; expectedHash: string; acknowledgeStage: boolean }): Promise<{ pathsStaged: string[]; indexHashBefore: string; indexHashAfter: string; warnings: string[] }>;
};

export type ManifestEditDeps = {
  repository: ManifestEditRepository;
  repositoryId: string;
  scopes: { write: boolean; git: boolean };
  now?: () => number;
  ttlMs?: number;
  auditFile?: string;
};

type ProposalStatus = "pending" | "refused" | "applied" | "expired";

type ManifestProposal = {
  proposalId: string;
  root: string;
  kind: "write" | "stage";
  path: string;
  baseHash: string;
  tracked: boolean;
  hunks: ManifestHunks | null;
  expectedChangeCount: number | null;
  nextLength: number | null;
  touchedLines: number | null;
  diff: string | null;
  diffTruncated: boolean | null;
  proposedAt: number;
  expiresAt: number;
  fingerprint: string;
  status: ProposalStatus;
  refusedAt: number | null;
  refuseReason: string | null;
  appliedAt: number | null;
  approval: { approvedBy: string; observedAt: number } | null;
  appliedResult: Record<string, unknown> | null;
};

const proposals = new Map<string, ManifestProposal>();

// Fingerprint canônico: SHA-256 sobre JSON com ordem de chaves FIXA. O artifact
// de aprovação precisa carregar exatamente este valor — cobre proposalId, kind,
// path, baseHash, hunks (diff exato) e proposedAt.
function computeFingerprint(proposal: Pick<ManifestProposal, "proposalId" | "kind" | "path" | "baseHash" | "hunks" | "expectedChangeCount" | "proposedAt">): string {
  const canonical = JSON.stringify({
    proposalId: proposal.proposalId,
    kind: proposal.kind,
    path: proposal.path,
    baseHash: proposal.baseHash,
    hunks: proposal.kind === "write" ? proposal.hunks : null,
    expectedChangeCount: proposal.kind === "write" ? proposal.expectedChangeCount : null,
    proposedAt: proposal.proposedAt
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function auditTarget(deps: ManifestEditDeps): string {
  return deps.auditFile ?? process.env.ENG_MCP_MANIFEST_AUDIT_FILE ?? "/data/manifest-edit-audit.jsonl";
}

async function appendAudit(deps: ManifestEditDeps, entry: Record<string, unknown>): Promise<void> {
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`;
  const file = auditTarget(deps);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, line, "utf8");
  } catch (cause) {
    throw new EngineeringError("AUDIT_LOG_WRITE_FAILED", cause instanceof Error ? cause.message : String(cause));
  }
}

async function auditBestEffort(deps: ManifestEditDeps, entry: Record<string, unknown>): Promise<string | undefined> {
  // propose/refuse (e o pós-mutação do apply) são best-effort: um problema de
  // auditoria NUNCA bloqueia uma ação não-mutante; é reportado honestamente.
  // Awaited: o append completa antes do retorno — a leitura do JSONL logo após
  // apply/propose encontra a entrada (fire-and-forget perdia a pós-mutação).
  try {
    await appendAudit(deps, entry);
    return undefined;
  } catch (cause) {
    return `AUDIT_LOG_WRITE_FAILED: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

function sweepExpired(now: number): void {
  for (const proposal of proposals.values()) {
    if (proposal.status === "pending" && now >= proposal.expiresAt) proposal.status = "expired";
  }
}

function pruneTerminal(): void {
  if (proposals.size <= MAX_RETAINED_PROPOSALS) return;
  for (const [key, proposal] of proposals) {
    if (proposals.size <= MAX_RETAINED_PROPOSALS) break;
    if (proposal.status !== "pending") proposals.delete(key);
  }
}

function requireGovernedPath(input: { path?: string }): string {
  if (!input.path) throw new EngineeringError("INPUT_INVALID", "path is required");
  if (!MANIFEST_GOVERNED_PATHS.includes(input.path)) {
    throw new EngineeringError("MANIFEST_PATH_NOT_GOVERNED", `path "${input.path}" is not in the governed manifest allowlist [${MANIFEST_GOVERNED_PATHS.join(", ")}]; other HIGH_IMPACT paths keep their total block`);
  }
  return input.path;
}

function rejectWrongActionFields(input: ManifestEditInput, allowed: ReadonlySet<string>): void {
  const present = new Set<string>();
  for (const key of Object.keys(input)) if (key !== "action") present.add(key);
  for (const key of present) if (!allowed.has(key)) throw new EngineeringError("INPUT_INVALID", `field "${key}" is not accepted for action ${input.action}`);
}

function getProposal(proposalId: string | undefined): ManifestProposal {
  if (!proposalId) throw new EngineeringError("INPUT_INVALID", "proposalId is required");
  const proposal = proposals.get(proposalId);
  if (!proposal) throw new EngineeringError("PROPOSAL_NOT_FOUND", `no proposal registered under id ${proposalId} (registry state is in-memory and lost on server restart)`);
  return proposal;
}

async function proposeManifestEdit(input: ManifestEditInput, deps: ManifestEditDeps): Promise<Record<string, unknown>> {
  const now = (deps.now ?? Date.now)();
  sweepExpired(now);
  if (!input.kind) throw new EngineeringError("KIND_REQUIRED", "action propose requires kind (\"write\" | \"stage\")");
  const governedPath = requireGovernedPath(input);
  // Escopo também no propose: só quem poderia aplicar pode estacionar proposta.
  if (input.kind === "write" && !deps.scopes.write) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED", "engineering:write scope required to propose a manifest write");
  if (input.kind === "stage" && !deps.scopes.git) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED", "engineering:git scope required to propose a manifest stage");
  for (const proposal of proposals.values()) {
    if (proposal.status === "pending" && proposal.root === deps.repositoryId && proposal.kind === input.kind && proposal.path === governedPath) {
      throw new EngineeringError("PROPOSAL_ALREADY_PENDING", `a pending ${input.kind} proposal for ${governedPath} already exists (${proposal.proposalId}); refuse or apply it first`);
    }
  }
  const pendingCount = [...proposals.values()].filter((proposal) => proposal.status === "pending").length;
  if (pendingCount >= MAX_PENDING_PROPOSALS) throw new EngineeringError("PROPOSAL_LIMIT_EXCEEDED", `pending proposal ceiling reached (${MAX_PENDING_PROPOSALS})`);

  let baseHash: string;
  let tracked: boolean;
  let hunks: ManifestHunks | null = null;
  let expectedChangeCount: number | null = null;
  let nextLength: number | null = null;
  let touchedLines: number | null = null;
  let diff: string | null = null;
  let diffTruncated: boolean | null = null;
  if (input.kind === "write") {
    if (!input.hunks || input.hunks.length < 1) throw new EngineeringError("HUNKS_REQUIRED", "action propose with kind \"write\" requires hunks (the exact proposed diff)");
    // Dry-run contra o conteúdo ATUAL: PATCH_CONTEXT_MISMATCH/FILE_LIMIT_EXCEEDED/
    // PATCH_CHANGE_COUNT_MISMATCH falham o propose com zero mutação.
    const preview = await deps.repository.manifestPreviewPatch({ path: governedPath, baseHash: input.baseHash, hunks: input.hunks, expectedChangeCount: input.expectedChangeCount });
    baseHash = preview.baseHash;
    tracked = preview.tracked;
    hunks = input.hunks;
    expectedChangeCount = input.expectedChangeCount ?? null;
    nextLength = preview.nextLength;
    touchedLines = preview.touchedLines;
  } else {
    const preview = await deps.repository.manifestStagePreview({ path: governedPath });
    baseHash = preview.baseHash;
    tracked = preview.tracked;
    diff = preview.diff;
    diffTruncated = preview.diffTruncated;
    // UNTRACKED é sempre stageable (é exatamente o caso de convergência dos três
    // manifests); apenas tracked sem diff nenhum não tem o que stagear.
    if (preview.tracked && preview.diff === "") throw new EngineeringError("STAGE_NOTHING_TO_STAGE", `${governedPath} is tracked with no working-tree difference — nothing to stage`);
  }

  const proposalId = randomUUID();
  const ttlMs = deps.ttlMs ?? PROPOSAL_TTL_MS;
  const proposal: ManifestProposal = {
    proposalId, root: deps.repositoryId, kind: input.kind, path: governedPath,
    baseHash, tracked, hunks, expectedChangeCount, nextLength, touchedLines, diff, diffTruncated,
    proposedAt: now, expiresAt: now + ttlMs,
    fingerprint: "",
    status: "pending", refusedAt: null, refuseReason: null, appliedAt: null, approval: null, appliedResult: null
  };
  proposal.fingerprint = computeFingerprint(proposal);
  proposals.set(proposalId, proposal);
  pruneTerminal();
  const auditWarning = await auditBestEffort(deps, { event: "propose", proposalId, kind: proposal.kind, path: proposal.path, baseHash, tracked, status: "pending" });
  return {
    action: "propose", proposalId, proposalFingerprint: proposal.fingerprint, kind: proposal.kind, path: proposal.path,
    baseHash, tracked, status: "pending",
    hunks, expectedChangeCount, nextLength, touchedLines, diff, diffTruncated,
    proposedAt: new Date(now).toISOString(), expiresAt: new Date(proposal.expiresAt).toISOString(), ttlMs,
    zeroMutationUntilApply: true,
    ...(auditWarning ? { auditWarning } : {})
  };
}

async function refuseManifestEdit(input: ManifestEditInput, deps: ManifestEditDeps): Promise<Record<string, unknown>> {
  const now = (deps.now ?? Date.now)();
  sweepExpired(now);
  const proposal = getProposal(input.proposalId);
  if (proposal.status === "applied") throw new EngineeringError("PROPOSAL_ALREADY_APPLIED", `proposal ${proposal.proposalId} was already applied and cannot be refused retroactively`);
  if (proposal.status === "expired") throw new EngineeringError("PROPOSAL_EXPIRED", `proposal ${proposal.proposalId} expired and can no longer be refused or applied`);
  if (proposal.status === "pending") {
    proposal.status = "refused";
    proposal.refusedAt = now;
    proposal.refuseReason = input.refuseReason ?? null;
  }
  const auditWarning = await auditBestEffort(deps, { event: "refuse", proposalId: proposal.proposalId, kind: proposal.kind, path: proposal.path, refuseReason: proposal.refuseReason, status: "refused" });
  return {
    action: "refuse", proposalId: proposal.proposalId, kind: proposal.kind, path: proposal.path, status: "refused",
    refuseReason: proposal.refuseReason, refusedAt: proposal.refusedAt === null ? null : new Date(proposal.refusedAt).toISOString(),
    mutationGuarantee: "zero — a refused proposal can never be applied (apply → PROPOSAL_REFUSED)",
    ...(auditWarning ? { auditWarning } : {})
  };
}

async function applyManifestEdit(input: ManifestEditInput, deps: ManifestEditDeps): Promise<Record<string, unknown>> {
  const now = (deps.now ?? Date.now)();
  sweepExpired(now);
  if (!input.acknowledgeApply) throw new EngineeringError("APPLY_ACKNOWLEDGEMENT_REQUIRED", "action apply requires acknowledgeApply: true");
  const proposal = getProposal(input.proposalId);
  // Estado ANTES do artifact: uma proposta recusada/expirada/aplicada morre aqui,
  // independente do que o chamador apresentar.
  if (proposal.status === "refused") throw new EngineeringError("PROPOSAL_REFUSED", `proposal ${proposal.proposalId} was explicitly refused by the operator and can never be applied`);
  if (proposal.status === "expired") throw new EngineeringError("PROPOSAL_EXPIRED", `proposal ${proposal.proposalId} expired; propose again`);
  if (proposal.status === "applied") throw new EngineeringError("PROPOSAL_ALREADY_APPLIED", `proposal ${proposal.proposalId} was already applied (single-use)`);
  if (!input.approval) throw new EngineeringError("APPROVAL_ARTIFACT_REQUIRED", "action apply requires a data-only approval artifact {version: 1, proposalId, proposalFingerprint, approvedBy, observedAt}");
  const approval = input.approval;
  if (approval.proposalId !== proposal.proposalId) throw new EngineeringError("APPROVAL_ARTIFACT_INVALID", "approval.proposalId does not match the addressed proposal");
  if (approval.observedAt < proposal.proposedAt) throw new EngineeringError("APPROVAL_ARTIFACT_INVALID", "approval.observedAt precedes the proposal's proposedAt");
  if (approval.observedAt > now + APPROVAL_CLOCK_SKEW_MS) throw new EngineeringError("APPROVAL_ARTIFACT_INVALID", "approval.observedAt is in the future beyond the tolerated clock skew");
  if (approval.proposalFingerprint !== proposal.fingerprint) throw new EngineeringError("APPROVAL_FINGERPRINT_MISMATCH", "approval.proposalFingerprint does not cover the current proposal state (id/kind/path/baseHash/hunks/proposedAt)");
  // Escopo pelo kind ARMAZENADO na proposta (não pelo que o chamador diz agora).
  if (proposal.kind === "write" && !deps.scopes.write) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED", "engineering:write scope required to apply a manifest write");
  if (proposal.kind === "stage" && !deps.scopes.git) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED", "engineering:git scope required to apply a manifest stage");
  // Auditoria PRÉ-MUTAÇÃO OBRIGATÓRIA: quem aprovou, quando e o diff exato.
  // Falha ⇒ AUDIT_LOG_WRITE_FAILED com ZERO mutação.
  await appendAudit(deps, {
    event: "apply", phase: "pre-mutation", proposalId: proposal.proposalId, kind: proposal.kind, path: proposal.path,
    baseHash: proposal.baseHash, fingerprint: proposal.fingerprint,
    approvedBy: approval.approvedBy, approvalObservedAt: new Date(approval.observedAt).toISOString(),
    hunks: proposal.hunks, expectedChangeCount: proposal.expectedChangeCount
  });
  let result: Record<string, unknown>;
  if (proposal.kind === "write") {
    result = await deps.repository.patchManifest({ path: proposal.path, baseHash: proposal.baseHash, hunks: proposal.hunks as ManifestHunks, expectedChangeCount: proposal.expectedChangeCount ?? undefined, acknowledgeWrite: true });
  } else {
    result = await deps.repository.gitStageManifest({ path: proposal.path, expectedHash: proposal.baseHash, acknowledgeStage: true });
  }
  proposal.status = "applied";
  proposal.appliedAt = Date.now();
  proposal.approval = { approvedBy: approval.approvedBy, observedAt: approval.observedAt };
  proposal.appliedResult = result;
  const auditWarning = await auditBestEffort(deps, {
    event: "apply", phase: "post-mutation", proposalId: proposal.proposalId, kind: proposal.kind, path: proposal.path, status: "applied",
    result: proposal.kind === "write"
      ? { filesChanged: (result as { filesChanged?: string[] }).filesChanged, oldHash: (result as { oldHash?: string }).oldHash, newHash: (result as { newHash?: string }).newHash }
      : { pathsStaged: (result as { pathsStaged?: string[] }).pathsStaged, indexHashAfter: (result as { indexHashAfter?: string }).indexHashAfter }
  });
  return {
    action: "apply", proposalId: proposal.proposalId, kind: proposal.kind, path: proposal.path, status: "applied",
    approvedBy: approval.approvedBy, result,
    governance: "state revalidated at mutation time (baseHash optimistic concurrency); guardian core untouched",
    ...(auditWarning ? { auditWarning } : {})
  };
}

// ---- dispatcher (the single registered tool) ----

export async function runManifestEdit(input: ManifestEditInput, deps: ManifestEditDeps): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "propose": {
      rejectWrongActionFields(input, new Set(["kind", "path", "baseHash", "hunks", "expectedChangeCount"]));
      return proposeManifestEdit(input, deps);
    }
    case "refuse": {
      rejectWrongActionFields(input, new Set(["proposalId", "refuseReason"]));
      return refuseManifestEdit(input, deps);
    }
    case "apply": {
      rejectWrongActionFields(input, new Set(["proposalId", "approval", "acknowledgeApply"]));
      return applyManifestEdit(input, deps);
    }
  }
}
