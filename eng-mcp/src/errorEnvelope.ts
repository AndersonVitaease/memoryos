/**
 * ERROR-01 — canonical structured-error envelope for every engineering.* tool.
 *
 * Missions organically invented typed UPPER_SNAKE codes
 * (FETCH_LOCAL_STATE_MUTATED, REGISTRY_SELF_GRANT_REFUSED, JUDGE_INPUT_INVALID,
 * AUTHORIZATION_SCOPE_REQUIRED, NOTHING_TO_MERGE, ...). This module formalizes
 * that convention as the single taxonomy: ONE registry of codes → {category,
 * retryable, remediation}, deterministic family rules for unseen codes, and a
 * redaction pass that runs BEFORE the envelope is mounted.
 *
 * REGRA INVIOLÁVEL (leak surface): an error message is a classic credential/raw
 * input leak path. `message` and `remediation` are redacted before the envelope
 * leaves this module — token fragments (sk-*, gh*_*, github_pat_*, Bearer ...),
 * 64-hex secrets, credential file paths and key=value secret forms never reach
 * the caller or the audit file.
 *
 * Migration (ERROR-01 design point 5): existing typed codes are mapped into the
 * envelope WITHOUT behavior change — `code` keeps its exact string so callers
 * matching `text.includes("CODE")` keep working; `rollbackRequired` semantics
 * stay untouched. Curated entries win over family rules; unseen codes fall
 * through deterministic family rules; anything left is `internal`.
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";

export const ERROR_CATEGORIES = ["auth", "scope", "validation", "state", "provider", "dependency", "internal"] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** Canonical envelope mounted on every tool error result (and audited in full). */
export type ErrorEnvelope = {
  code: string;
  category: ErrorCategory;
  retryable: boolean;
  remediation: string;
  message: string;
  evidenceRefs: string[];
  tool?: string;
};

/** Code for SDK-level tool-input validation failures (no typed code exists there today). */
export const TOOL_INPUT_INVALID = "TOOL_INPUT_INVALID";
/** Code used only when neither the registry nor any family rule can classify. */
export const UNCLASSIFIED_ERROR_CODE = "ENGINEERING_TOOL_ERROR";

type Taxonomy = { category: ErrorCategory; retryable: boolean; remediation: string };

// Deterministic family rules — first match wins. They classify any code not
// curated below, so the taxonomy never regresses to ad-hoc strings.
export const ERROR_FAMILY_RULES: ReadonlyArray<{ match: RegExp; taxonomy: Taxonomy }> = [
  { match: /^AUTHENTICATION_/, taxonomy: { category: "auth", retryable: false, remediation: "Present a valid registry-issued bearer; renew or re-issue the token if it is invalid, revoked or expired." } },
  { match: /^AUTHORIZATION_|_SCOPE_REQUIRED$|^SCOPE_/, taxonomy: { category: "scope", retryable: false, remediation: "Ask the operator to grant the required engineering:* scope to the calling bearer (grants are operator-issued)." } },
  { match: /^OPERATOR_ENTRY_/, taxonomy: { category: "scope", retryable: false, remediation: "Mutating an operator-* registry entry requires an operator bearer as authorizer; re-run with an operator token." } },
  { match: /^REGISTRY_/, taxonomy: { category: "scope", retryable: false, remediation: "Registry governance refusal; follow the code-specific guidance (subject spelling, scope catalog, no self-grant) and re-run." } },
  { match: /_ACKNOWLEDG(EMENT|MENT)_REQUIRED$|_APPROVAL_REQUIRED$/, taxonomy: { category: "validation", retryable: true, remediation: "Supply the required acknowledgement/approval artifact (or the operator approval object) and re-run the call." } },
  { match: /^INPUT_|_INVALID$|_FORBIDDEN$|_DENIED$/, taxonomy: { category: "validation", retryable: false, remediation: "Fix the tool arguments against the declared input schema/path policy, then retry the call." } },
  { match: /^PATH_/, taxonomy: { category: "validation", retryable: false, remediation: "Use a repo-relative POSIX path inside the authorized repository; verify the file exists and is a readable text source." } },
  { match: /_CONFLICT$|_MISMATCH$|_VERSION_/, taxonomy: { category: "state", retryable: true, remediation: "Re-read the current state (fresh hash/content) and re-apply the operation against it." } },
  { match: /_MUTATED$/, taxonomy: { category: "state", retryable: false, remediation: "Local state changed unexpectedly; investigate what moved before any retry (no blind retries)." } },
  { match: /_LOCK_TIMEOUT$|_LIMIT_EXCEEDED$|^BASELINE_LIMIT_/, taxonomy: { category: "state", retryable: true, remediation: "Transient contention or limit under load; wait for the load to drop, then retry." } },
  { match: /^COMMAND_|^GIT_OUTPUT_|^GIT_POLICY_/, taxonomy: { category: "dependency", retryable: false, remediation: "The underlying local tool (git/rg/tsc) failed or emitted unexpected output; inspect the environment before retrying." } },
  { match: /_UNAVAILABLE$/, taxonomy: { category: "dependency", retryable: true, remediation: "A local dependency is unreachable; check it is installed/reachable, then retry." } },
  { match: /^GITHUB_/, taxonomy: { category: "provider", retryable: false, remediation: "GitHub-side refusal or credential issue; the operator fixes the PAT/scope, then the call may be retried." } },
  { match: /_TIMEOUT$/, taxonomy: { category: "provider", retryable: true, remediation: "Remote/timeout boundary; poll the durable status (job record / release-state) instead of blind-retrying." } },
];

// Curated taxonomy — exact-match wins over family rules. Codes already in
// production get the legible next-step remediation; NOT an error boundary,
// just classification + guidance (the caller still decides).
export const ERROR_TAXONOMY: Readonly<Record<string, Taxonomy>> = {
  // ---- auth / scope ----
  AUTHENTICATION_REQUIRED: { category: "auth", retryable: false, remediation: "Attach an Authorization: Bearer <token> header with a registry-issued bearer." },
  AUTHENTICATION_INVALID: { category: "auth", retryable: false, remediation: "The bearer is not registered; get a registered token from the operator." },
  AUTHENTICATION_REVOKED: { category: "auth", retryable: false, remediation: "Token revoked; request a replacement from the operator." },
  AUTHENTICATION_EXPIRED: { category: "auth", retryable: false, remediation: "Token expired; request a renewal from the operator." },
  AUTHORIZATION_REPOSITORY_DENIED: { category: "scope", retryable: false, remediation: "Token lacks access to this repository; ask the operator to extend its allowedRepositoryIds." },
  AUTHORIZATION_SCOPE_REQUIRED: { category: "scope", retryable: false, remediation: "Ask the operator to grant the required engineering:* scope to the calling bearer (grants are operator-issued)." },
  OPERATOR_ENTRY_OPERATOR_AUTHORIZER_REQUIRED: { category: "scope", retryable: false, remediation: "Operator-* registry entries only mutate with an operator bearer as authorizer; service bearers are refused by design." },
  REGISTRY_SELF_GRANT_REFUSED: { category: "scope", retryable: false, remediation: "A subject never grants scopes to its own registry entry; choose a different authorizer." },
  REGISTRY_SCOPE_UNKNOWN: { category: "scope", retryable: false, remediation: "Use only scopes from the known scope catalog (src/registryScopeGrant.ts) and re-run." },
  REGISTRY_SUBJECT_NOT_FOUND: { category: "scope", retryable: false, remediation: "Check the subject spelling against the registry entries, then re-run." },
  REGISTRY_SUBJECT_AMBIGUOUS: { category: "scope", retryable: false, remediation: "The subject matches more than one entry; use the exact, unique subject." },
  REGISTRY_GRANT_NO_OP: { category: "scope", retryable: false, remediation: "The entry already carries the requested scopes; nothing to grant." },
  REGISTRY_BACKUP_FAILED: { category: "state", retryable: false, remediation: "Backup write failed before mutation; check registry-directory permissions, then retry the grant." },
  REGISTRY_DRIFT_DETECTED: { category: "state", retryable: false, remediation: "The registry changed since the plan; re-run PLAN mode and redo against the fresh state." },
  REGISTRY_SCOPE_HASH_MISMATCH: { category: "state", retryable: false, remediation: "Registry file changed during the grant; re-read it and redo the operation." },
  REGISTRY_SCOPE_RESTORE_FAILED: { category: "state", retryable: false, remediation: "Automatic restore failed; restore the registry from the recorded backup manually with the operator." },
  // ---- validation ----
  INPUT_INVALID: { category: "validation", retryable: false, remediation: "Fix the tool arguments against the declared input schema and retry." },
  TOOL_INPUT_INVALID: { category: "validation", retryable: false, remediation: "Fix the tool arguments against the tool's declared input schema (field names and types), then retry." },
  PATH_INVALID: { category: "validation", retryable: false, remediation: "Use a repo-relative POSIX path (no leading -, :, /, drive letters, .. segments, glob chars or control chars)." },
  PATH_DENIED: { category: "validation", retryable: false, remediation: "The path is outside the authorized repository or sensitive by policy; pick an allowed repo path." },
  PATH_NOT_FOUND: { category: "validation", retryable: false, remediation: "Verify the file exists in the authorized repository, then retry." },
  PATH_NOT_DIRECTORY: { category: "validation", retryable: false, remediation: "Point at a directory, not a file." },
  PATH_NOT_AVAILABLE: { category: "validation", retryable: false, remediation: "No historical content exists for this ref/path; pick another ref or path." },
  PATH_REQUIRED: { category: "validation", retryable: false, remediation: "Supply the path parameter (required for file-mode inspection)." },
  REF_INVALID: { category: "validation", retryable: false, remediation: "Use a valid git ref (no leading -, ~^:?*[\\, @{, .. or control chars)." },
  FILE_TYPE_DENIED: { category: "validation", retryable: false, remediation: "Only allowed source extensions are readable; pick a file with an allowed extension." },
  BINARY_FILE_DENIED: { category: "validation", retryable: false, remediation: "Only UTF-8 text sources are readable; pick a text file." },
  FILE_LIMIT_EXCEEDED: { category: "validation", retryable: false, remediation: "Size cap reached; read fewer lines or operate on a smaller file." },
  SENSITIVE_CONTENT_BLOCKED: { category: "validation", retryable: false, remediation: "The content matches secret patterns and is blocked; remove the secrets and retry." },
  MEMORY_GATE_REFUSED: { category: "validation", retryable: false, remediation: "Capture refused by the memory admission gate (MEMORY-GATE-01): rewrite it with durable, artifact-backed content and re-send - the judge never edits or deletes text. Operator override: pass force=true (audit-marked as band=forced)." },
  SENSITIVE_OUTPUT_BLOCKED: { category: "validation", retryable: false, remediation: "The inspected content matches secret patterns and is withheld; ask the operator." },
  HIGH_IMPACT_WRITE_BLOCKED: { category: "validation", retryable: false, remediation: "Use engineering.manifest.edit for package.json/package-lock.json/Dockerfile; other high-impact paths are hard-blocked." },
  HIGH_IMPACT_GIT_BLOCKED: { category: "validation", retryable: false, remediation: "Manifests/high-impact paths never stage through plain git; use engineering.manifest.edit." },
  MANIFEST_PATH_NOT_GOVERNED: { category: "validation", retryable: false, remediation: "Only package.json, package-lock.json and Dockerfile are governed; target one of those paths." },
  WRITE_ACKNOWLEDGEMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgeWrite=true to confirm the intended mutation, then retry." },
  GIT_STAGE_ACKNOWLEDGEMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgeStage=true to confirm the staging, then retry." },
  GIT_UNSTAGE_ACKNOWLEDGEMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgeUnstage=true to confirm the unstaging, then retry." },
  GIT_COMMIT_ACKNOWLEDGEMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgeCommit=true to confirm the commit, then retry." },
  MERGE_ACKNOWLEDGMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgeMerge=true (merge declaration itself is required for non-main branches), then retry." },
  PUSH_ACKNOWLEDGMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgePush=true to confirm the governed push, then retry." },
  FETCH_ACKNOWLEDGMENT_REQUIRED: { category: "validation", retryable: true, remediation: "Set acknowledgeFetch=true to confirm the governed fetch, then retry." },
  COMMIT_MESSAGE_INVALID: { category: "validation", retryable: false, remediation: "Single line, <=512 chars, no control chars, ending with the Claude Code co-author trailer." },
  MERGE_INPUT_FORBIDDEN: { category: "validation", retryable: false, remediation: "Remove the forbidden input (raw command/credential/refspec); governed git tools take no caller transport inputs." },
  PUSH_INPUT_FORBIDDEN: { category: "validation", retryable: false, remediation: "Remove the forbidden input (token/URL/remote/refspec); governed git tools take no caller transport inputs." },
  FETCH_INPUT_FORBIDDEN: { category: "validation", retryable: false, remediation: "The fetch accepts zero caller input; re-run with an empty body." },
  PUSH_EXPECTED_HEAD_REQUIRED: { category: "validation", retryable: false, remediation: "Pass expectedHead = local HEAD sha as read by the PLAN call." },
  JUDGE_INPUT_INVALID: { category: "validation", retryable: false, remediation: "Fix the judge payload: noul takes no criteria; choice needs criteria as a record with 2-10 keys; score needs criteria as an array of 2-10 labels." },
  TEST_JOB_NOT_FOUND: { category: "validation", retryable: false, remediation: "Check the executionId; persisted jobs live in release-state, older in-memory jobs expire with the process." },
  RELEASE_JOB_ID_INVALID: { category: "validation", retryable: false, remediation: "Pass the durable deployJobId exactly as returned by the accepted deploy stage." },
  SBW_DUPLICATE_PATH: { category: "validation", retryable: false, remediation: "Each batch op targets a distinct path; dedupe the batch." },
  SBW_TARGET_NOT_MATERIALIZED: { category: "validation", retryable: false, remediation: "Materialize the repository file into the sandbox before writing to it." },
  SBW_INVALID_CONTENT: { category: "validation", retryable: false, remediation: "Content exceeds the 128 KiB per-op cap; split or trim before writing." },
  SBW_VALIDATION_REQUIRED: { category: "validation", retryable: true, remediation: "Run the validate action before sync; validation is a required gate." },
  // ---- state ----
  FILE_VERSION_CONFLICT: { category: "state", retryable: true, remediation: "Re-read the file (its current hash becomes the new baseHash) and re-apply the patch." },
  INDEX_VERSION_CONFLICT: { category: "state", retryable: true, remediation: "Re-read git status/index fingerprint and re-stage against the fresh index." },
  FILE_ALREADY_EXISTS: { category: "state", retryable: false, remediation: "Pick a new path or remove the existing file first." },
  NOTHING_TO_COMMIT: { category: "state", retryable: false, remediation: "Stage changes first (engineering.git.stage), then commit." },
  NOTHING_TO_MERGE: { category: "state", retryable: true, remediation: "Branch has no divergence to merge; use engineering.git.push if the branch is ahead." },
  UNEXPECTED_WORKTREE_CHANGE: { category: "state", retryable: false, remediation: "The worktree moved outside the operation; re-read state and investigate before retrying." },
  UNEXPECTED_VERIFICATION_MUTATION: { category: "state", retryable: false, remediation: "Something wrote to the repo during verification; investigate before any retry (no blind retries)." },
  BASELINE_LIMIT_EXCEEDED: { category: "state", retryable: true, remediation: "Repo-manifest walk hit its load-sensitive limit; retry after host load drops." },
  GIT_LOCK_TIMEOUT: { category: "state", retryable: true, remediation: "Another git operation holds the lock; wait a moment and retry." },
  FILE_LOCK_TIMEOUT: { category: "state", retryable: true, remediation: "A write lock is held on the target; wait a moment and retry." },
  PATCH_CHANGE_COUNT_MISMATCH: { category: "validation", retryable: false, remediation: "expectedChangeCount counts HUNKS (not lines); set it to hunks.length or omit it." },
  PATCH_CONTEXT_MISMATCH: { category: "validation", retryable: false, remediation: "Re-read the target lines; deletions above the hunk shift later line numbers." },
  PATCH_NO_EFFECT: { category: "validation", retryable: false, remediation: "The hunks are byte-identical to current content; re-derive them from a fresh read." },
  PATCH_HUNKS_OVERLAP: { category: "validation", retryable: false, remediation: "Hunks must be ascending and non-overlapping; re-order or split them." },
  MIXED_LINE_ENDINGS_UNSUPPORTED: { category: "validation", retryable: false, remediation: "File mixes CRLF and LF; normalize line endings, then re-apply." },
  ATOMIC_REPLACE_FAILED: { category: "state", retryable: false, remediation: "Atomic write failed; check filesystem state before retrying." },
  ATOMIC_CREATE_UNSUPPORTED: { category: "state", retryable: false, remediation: "Atomic exclusive create unsupported on this filesystem; ask the operator." },
  MERGE_BLOCKED: { category: "state", retryable: false, remediation: "Resolve the listed blockers (uncommitted changes, detached head, missing refs) before executing." },
  MERGE_DETACHED_HEAD: { category: "state", retryable: false, remediation: "Check out a branch before merging." },
  MERGE_POSTCHECK_FAILED: { category: "state", retryable: false, remediation: "Postcheck failed and the pre-merge head was restored; inspect the evidence before retrying." },
  MERGE_RESTORE_FAILED: { category: "state", retryable: false, remediation: "Automatic restore failed; recover manually with the operator (git reset --hard only with proven state)." },
  PUSH_STATE_DIVERGED: { category: "state", retryable: false, remediation: "Remote head is unknown locally; fetch/reconcile first — reconciliation is operator work." },
  PUSH_NON_FAST_FORWARD_BLOCKED: { category: "state", retryable: false, remediation: "Diverged history; the operator reconciles (no force push by design)." },
  PUSH_HEAD_MISMATCH: { category: "state", retryable: true, remediation: "Local HEAD moved between PLAN and execute; re-run PLAN and execute against the fresh head." },
  PUSH_NOTHING_TO_PUSH: { category: "state", retryable: true, remediation: "Local main equals remote; nothing to push (confirm with engineering.github_read compare)." },
  PUSH_BRANCH_NOT_FOUND: { category: "state", retryable: false, remediation: "Local branch missing; verify the checkout before pushing." },
  PUSH_REMOTE_MISSING: { category: "state", retryable: false, remediation: "The origin remote is not configured; ask the operator." },
  PUSH_IN_FLIGHT: { category: "state", retryable: true, remediation: "Another push is in flight; wait for its terminal status." },
  PUSH_POSTCHECK_FAILED: { category: "state", retryable: false, remediation: "Post-push head did not match; inspect remote state before any retry." },
  FETCH_BRANCH_NOT_FOUND: { category: "state", retryable: false, remediation: "The local branch or its origin counterpart is missing; verify refs before fetching." },
  FETCH_REMOTE_MISSING: { category: "state", retryable: false, remediation: "The origin remote is not configured; ask the operator." },
  FETCH_LOCAL_STATE_MUTATED: { category: "state", retryable: false, remediation: "Fetch mutates only remote-tracking refs; local state moved during fetch — investigate before retrying." },
  FETCH_NETWORK_UNREACHABLE: { category: "provider", retryable: true, remediation: "Origin unreachable; check network/credentials and retry." },
  FETCH_CREDENTIAL_MISSING: { category: "scope", retryable: false, remediation: "Operator must mount the git credential file (GIT_CREDENTIALS_FILE)." },
  SBW_DRIFT_DETECTED: { category: "state", retryable: false, remediation: "Target changed since materialization; re-materialize and redo the batch." },
  SBW_BATCH_NOT_FOUND: { category: "state", retryable: false, remediation: "Batch state is in-memory and dies with the process; recreate the batch." },
  SBW_INTEGRITY_MISMATCH: { category: "state", retryable: false, remediation: "Materialized copy diverged from the repo; recreate the sandbox batch." },
  SBW_VALIDATION_FAILED: { category: "state", retryable: false, remediation: "In-sandbox TypeScript check failed (sandbox destroyed); fix the errors and re-materialize." },
  SBW_ALREADY_SYNCED: { category: "state", retryable: true, remediation: "Batch already applied; nothing to sync." },
  ENGINEERING_CAPACITY_EXCEEDED: { category: "state", retryable: true, remediation: "Concurrent-session cap hit; wait a moment and retry." },
  // ---- provider ----
  GITHUB_CREDENTIAL_MISSING: { category: "provider", retryable: false, remediation: "Operator must provision the fine-grained PAT (GITHUB_TOKEN / GITHUB_TOKEN_FILE)." },
  GITHUB_AUTH_REJECTED: { category: "provider", retryable: false, remediation: "PAT rejected; operator fixes the credential." },
  GITHUB_FORBIDDEN: { category: "provider", retryable: false, remediation: "PAT lacks the required repo access; operator extends the credential." },
  GITHUB_NOT_FOUND: { category: "provider", retryable: false, remediation: "Repo missing or invisible to this PAT; check the allowlisted repository id." },
  GITHUB_VALIDATION_FAILED: { category: "provider", retryable: false, remediation: "GitHub refused the request shape; fix the arguments and retry." },
  GITHUB_RATE_LIMIT_EXCEEDED: { category: "provider", retryable: true, remediation: "Quota exhausted; wait for the TTL window and retry." },
  GITHUB_RATE_LIMIT_LOW: { category: "provider", retryable: true, remediation: "Quota close to exhausted; defer non-urgent GitHub calls." },
  GITHUB_TIMEOUT: { category: "provider", retryable: true, remediation: "GitHub call timed out; retry after checking connectivity." },
  GITHUB_UNREACHABLE: { category: "provider", retryable: true, remediation: "GitHub unreachable; check network and retry." },
  GITHUB_FILE_TOO_LARGE: { category: "provider", retryable: false, remediation: "Requested file exceeds the read cap; narrow the ref/path or read locally." },
  GITHUB_FILE_BINARY: { category: "provider", retryable: false, remediation: "Target file is binary; use a text file or a raw transport." },
  JUDGE_PROVIDER_UNAVAILABLE: { category: "provider", retryable: true, remediation: "Judge provider offline; fail-open per convention — the mission continues without judgment." },
  JUDGE_PROVIDER_ERROR: { category: "provider", retryable: true, remediation: "Judge provider errored; retry once after checking the provider status, never fabricating a judgment." },
  LOCAL_EDITOR_OFFLINE: { category: "provider", retryable: true, remediation: "The local Photopea executor is offline; bring it up, then retry." },
  RELAY_TIMEOUT: { category: "provider", retryable: true, remediation: "Relay timed out; check the executor link and retry." },
  RELAY_INVALID_RESPONSE: { category: "provider", retryable: false, remediation: "Relay returned an unparseable response; check the executor version." },
  RELAY_DISCONNECTED: { category: "provider", retryable: true, remediation: "Relay socket dropped; reconnect the executor and retry." },
  SANDBOX_PROVIDER_UNAVAILABLE: { category: "provider", retryable: true, remediation: "E2B is unavailable; retry later or use the host runner instead." },
  VISION_PROVIDER_UNAVAILABLE: { category: "provider", retryable: true, remediation: "Vision provider offline; retry later." },
  VISION_PROVIDER_ERROR: { category: "provider", retryable: true, remediation: "Vision provider errored; retry once after checking provider status." },
  GENERATION_PROVIDER_UNAVAILABLE: { category: "provider", retryable: true, remediation: "Image generation provider offline; retry later." },
  // ---- dependency ----
  DEPENDENCY_UNAVAILABLE: { category: "dependency", retryable: true, remediation: "A required local tool (git/ripgrep/tsc) is missing or broken; fix the environment, then retry." },
  COMMAND_FAILED: { category: "dependency", retryable: true, remediation: "The underlying command exited non-zero; inspect its cause, fix the environment, then retry." },
  COMMAND_TIMEOUT: { category: "dependency", retryable: true, remediation: "The command exceeded its timeout; retry or raise the timeout." },
  GIT_OUTPUT_INVALID: { category: "dependency", retryable: false, remediation: "Git emitted unexpected output; inspect repo state before retrying." },
  GIT_POLICY_UNSUPPORTED: { category: "dependency", retryable: false, remediation: "Repo git config sets hooksPath/commit.template/signing; operator aligns the git policy." },
  // ---- internal ----
  UNCLASSIFIED: { category: "internal", retryable: false, remediation: "No typed code matched; inspect the raw message and open an ERROR-01 taxonomy gap if it recurs." },
  ENGINEERING_REQUEST_FAILED: { category: "internal", retryable: false, remediation: "Unexpected server failure; check server logs." },
  ENGINEERING_TOOL_ERROR: { category: "internal", retryable: false, remediation: "No typed code matched the failure text; inspect the message and, if it recurs, add the code to the ERROR-01 taxonomy." },
  TOOL_CATALOG_INVALID: { category: "internal", retryable: false, remediation: "Duplicate tool names in the catalog; fix the registration." },
  RELEASE_STAGE_FAILED: { category: "internal", retryable: false, remediation: "A pipeline stage failed; inspect the stage and its logs — do not blind-retry." },
  RELEASE_DEPLOY_NOT_ACCEPTED: { category: "internal", retryable: false, remediation: "Deploy stage was not accepted by the runner; inspect runner state before retrying." },
  RELEASE_DEPLOY_FAILED: { category: "internal", retryable: false, remediation: "Deploy job failed; read the durable job status and runner logs before retrying." },
  RELEASE_DEPLOY_TIMEOUT: { category: "state", retryable: true, remediation: "Deploy polling exceeded its budget; the job keeps running server-side — poll engineering.test.status/release-state." },
  RELEASE_DEPLOY_JOB_INVALID: { category: "validation", retryable: false, remediation: "Deploy job record does not match the expected operation; verify the jobId." },
  RELEASE_RESPONSE_INVALID: { category: "internal", retryable: true, remediation: "Runner returned unparseable output; check runner health and retry." },
  RELEASE_RESPONSE_TOO_LARGE: { category: "internal", retryable: false, remediation: "Runner response exceeded the cap; narrow the request." },
  RELEASE_REQUEST_TIMEOUT: { category: "provider", retryable: true, remediation: "Runner socket timed out; poll the persisted release-state/job status instead of blind-retrying." },
  RELEASE_IN_FLIGHT: { category: "state", retryable: true, remediation: "A release operation is in flight; wait for its terminal status." },
  INFRASTRUCTURE_ERROR: { category: "internal", retryable: false, remediation: "Infrastructure failure is never a test verdict; check runner health, then re-run." },
};

/** Redaction applied to message and remediation BEFORE the envelope leaves the module. */
const REDACTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]"],
  [/\b(?:ghp|gho|ghs|ghu|ghr|ghz)_[A-Za-z0-9_]{10,}\b/g, "[REDACTED]"],
  [/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, "[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]"],
  [/\b[a-f0-9]{64}\b/gi, "[REDACTED_64HEX]"],
  [/\/(?:[\w.\-]+\/)*(?:credentials|tokens\.json)(?:\.json)?(?:\/[\w.\-]+)*/g, "[REDACTED_CREDENTIAL_PATH]"],
  [/\b(authorization|token|secret|password|api_?key)\s*[:=]\s*"?[^\s"]{8,}/gi, "$1=[REDACTED]"],
];

export function redactErrorText(text: string, cap = 500): string {
  let out = typeof text === "string" ? text : String(text ?? "");
  for (const [pattern, replacement] of REDACTION_PATTERNS) out = out.replace(pattern, replacement);
  return out.length > cap ? `${out.slice(0, cap)}…[TRUNCATED]` : out;
}

/** Exact taxonomy entry first, then deterministic family rules, then internal. */
export function classifyErrorCode(code: string): Taxonomy {
  const curated = ERROR_TAXONOMY[code];
  if (curated) return curated;
  for (const rule of ERROR_FAMILY_RULES) {
    if (rule.match.test(code)) return rule.taxonomy;
  }
  return { category: "internal", retryable: false, remediation: "No typed code matched; inspect the raw message and, if it recurs, add the code to the ERROR-01 taxonomy." };
}

function isUpperSnake(value: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(value);
}

function deriveCodeFromMessage(message: string): string | null {
  const trimmed = message.trim();
  if (isUpperSnake(trimmed)) return trimmed;
  // Known code token anywhere in the text (e.g. "Error: FILE_VERSION_CONFLICT ...").
  const candidates = trimmed.match(/\b[A-Z][A-Z0-9_]{5,}\b/g) ?? [];
  for (const candidate of candidates) {
    if (Object.hasOwn(ERROR_TAXONOMY, candidate)) return candidate;
  }
  // SDK-level input validation has no code today — canonicalize it.
  // Non-anchored: the SDK sometimes prefixes the validation text ("Input validation error: ...").
  if (/Invalid arguments for tool\b/.test(trimmed)) return TOOL_INPUT_INVALID;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCanonicalEnvelope(value: unknown): value is ErrorEnvelope {
  return isRecord(value)
    && typeof value.code === "string" && isUpperSnake(value.code)
    && typeof value.category === "string" && (ERROR_CATEGORIES as readonly string[]).includes(value.category)
    && typeof value.retryable === "boolean"
    && typeof value.remediation === "string"
    && typeof value.message === "string"
    && Array.isArray(value.evidenceRefs);
}

/**
 * Mount the canonical envelope. `message` may be raw error text (SDK strings,
 * zod validation text) — it is redacted + capped here, never echoed raw.
 */
export function buildErrorEnvelope(input: {
  code?: string | null;
  message?: string;
  tool?: string;
  evidenceRefs?: string[];
}): ErrorEnvelope {
  const rawMessage = typeof input.message === "string" ? input.message : "";
  const code = (input.code && isUpperSnake(input.code) ? input.code : null)
    ?? deriveCodeFromMessage(rawMessage)
    ?? UNCLASSIFIED_ERROR_CODE;
  const taxonomy = classifyErrorCode(code);
  const envelope: ErrorEnvelope = {
    code,
    category: taxonomy.category,
    retryable: taxonomy.retryable,
    remediation: redactErrorText(taxonomy.remediation),
    message: rawMessage.length > 0 ? redactErrorText(rawMessage) : redactErrorText(code),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.slice(0, 8).map((ref) => redactErrorText(String(ref), 300)) : [],
  };
  if (typeof input.tool === "string" && input.tool.length > 0) envelope.tool = redactErrorText(input.tool, 200);
  return envelope;
}

/**
 * ERROR-01 point 6 — extract the structured semantics from an MCP tool result
 * for the judge's PostToolUse triage (candidate #13): {code, category,
 * retryable} or null when the response is not a canonical envelope.
 */
export function extractErrorEnvelope(response: unknown): { code: string; category: ErrorCategory; retryable: boolean } | null {
  let text: string | null = null;
  if (typeof response === "string") {
    text = response;
  } else if (isRecord(response)) {
    if (Array.isArray(response.content)) {
      const part = response.content.find((item) => isRecord(item) && item.type === "text" && typeof item.text === "string") as { text: string } | undefined;
      if (part) text = part.text;
    } else if (typeof response.text === "string") {
      text = response.text;
    }
  }
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (isCanonicalEnvelope(parsed)) return { code: parsed.code, category: parsed.category, retryable: parsed.retryable };
  } catch {
    // not JSON — legacy/unknown error text
  }
  return null;
}

// ERROR-01 point 3 — every tool error is audited with the FULL envelope.
// Content is never trusted as secret-safe except via redactErrorText (applied
// by buildErrorEnvelope); a write failure degrades to a marker and never
// fails the tool response.
const ERROR_AUDIT_FILE_DEFAULT = "/data/audit/tool-errors.jsonl";

export function writeErrorAudit(entry: { ts: string; tool: string; envelope: ErrorEnvelope }): string {
  const file = process.env.ENG_MCP_ERROR_AUDIT_FILE ?? ERROR_AUDIT_FILE_DEFAULT;
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    return "written";
  } catch (error) {
    return `failed:${error instanceof Error ? error.message : String(error)}`;
  }
}
