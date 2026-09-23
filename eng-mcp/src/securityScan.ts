// SECURITY-SCAN-01: engineering.security.scan — READ-ONLY security supertool:
// M1 secrets (raw bytes + git history + host vectors), M2 exposure, M3 config
// hygiene, M4 registry/internal. ONE engine, ANY target ("eng-mcp" | "vps" |
// allowlisted path under /opt or /data). Check catalog + matchers live in
// ./securityScanChecks.ts.
//
// GOLDEN RULES (mission spec):
// 1. Calibration baseline: the first live scan MUST reproduce the known real
//    findings (3 Caddyfile keys, Notion token via ps, legacy tokens.json, PAT in
//    filename, 422 password, src/*.token.json pair) — a missing REAL finding
//    means the rule is wrong, never "clean environment".
// 2. Jev triages noise (ONE batched evaluate per scan, fail-open verdict
//    "unavailable"); judgment is advisory, the operator owns every decision.
// 3. Drift: deterministic per-target snapshot (findingId hashes); NEW finding =
//    high attention, ABSENT finding = closed with proof (IDS 97e485f7 pattern).
// 4. Card per target: deterministic score, counts by severity, delta, top
//    remediations — evidence always travels with the verdict.
// 5. NEVER remediates: remediation is structured text; a sensor is never an
//    authorizer. Applying anything is a separate operator-approved mission.
// 6. Audit /data/audit/security-scan.jsonl is hash16-only.
// 7. The raw secret value NEVER crosses output, audit or logs: values are hashed
//    at capture (runner-side for host vectors) and the final result passes a
//    contamination guard that FAILS CLOSED (SEC_OUTPUT_CONTAMINATION).
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { basename, isAbsolute, join, relative } from "node:path";
import { EngineeringError } from "./policy.ts";
import { runJudgeEvaluate, defaultJudgeDeps, type JudgeDeps } from "./judge.ts";
import { validateTokenRegistry, KNOWN_REGISTRY_SCOPES } from "./registryScopeGrant.ts";
import { SEC_CHECKS, SEC_FILENAME_PATTERNS, SEC_HIGH_ENTROPY_CONTEXT, SEC_HIGH_ENTROPY_MIN_BITS, SEC_HIGH_ENTROPY_REGEX, SEC_LEGACY_FILE_REGEX, SEC_OUTPUT_GUARD, SEC_PEM_REGEX, SEC_SKIP_DIRS, SEC_TOKEN_RULES, SECURITY_SCAN_MODULES } from "./securityScanChecks.ts";
import { securityScanInputSchema } from "./securityScanChecks.ts";
export { securityScanInputSchema };
import type { SecurityScanInput, SecurityScanModule, SecCheckMeta, SecSeverity } from "./securityScanChecks.ts";

const SEC_ENGINE = "security-scan-01";
const SEC_ADVISORY = "READ-ONLY sensor — this scan never mutates, never remediates, never revokes anything; remediation is structured text and the operator owns every decision. Calibrated judgment is not a security boundary.";
const SEC_AUDIT_DIR_DEFAULT = "/data/audit";
const SEC_OUT_AUDIT_FILE_DEFAULT = "/data/audit/security-scan.jsonl";
const SEC_DRIFT_DIR_DEFAULT = "/data/security-scan";
const SEC_DATA_DIR_DEFAULT = "/data";
const SEC_REGISTRY_FILE_DEFAULT = "/data/tokens.json";
const SEC_IDS_AUDIT_FILE_DEFAULT = "/data/audit/ids.jsonl";
const SEC_MAX_FILES_REPO = 2000;
const SEC_MAX_FILES_DATA = 1500;
const SEC_MAX_DEPTH = 8;
const SEC_MAX_FILE_BYTES = 262144;
const SEC_MAX_SENSITIVE_FILE_BYTES = 524288;
const SEC_MAX_HITS_PER_TEXT = 20;
const SEC_MAX_JUDGE_FINDINGS = 18;
const SEC_MAX_STAT_ENTRIES = 50;

export type SecurityScanRunnerOperation = "inspect" | "status" | "security_probe";
export interface SecurityScanRunnerResponse { httpStatus: number; body: unknown; }

export interface SecurityScanDeps {
  now?: () => Date;
  authorizerHash16?: string | null;
  callerSubject?: string | null;
  judgeDeps?: JudgeDeps;
  runRunner?: (operation: SecurityScanRunnerOperation, jobId?: string, params?: Record<string, unknown>) => Promise<SecurityScanRunnerResponse>;
  runGit?: (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string; code: number }>;
  auditDir?: string; auditFile?: string; driftDir?: string; dataDir?: string; registryFile?: string; idsAuditFile?: string;
}

export type SecurityScanFinding = {
  findingId: string;
  checkId: string;
  module: SecurityScanModule;
  kind: string;
  local: string;
  line: number | null;
  entropy: number | null;
  value_hash16: string | null;
  severity: SecSeverity;
  verdict: "judged" | "noise" | "unavailable" | "unjudged_cost_cap" | "plan";
  drift: "new" | "recurring" | "plan";
  reasons: string[];
  remediation: string;
  fpNote: string;
  probability: number | null;
};

export type SecurityScanResult = {
  tool: "engineering.security.scan";
  status: "SCANNED" | "PLAN";
  target: { id: string; kind: "eng-mcp" | "vps" | "path"; root: string };
  modulesRun: string[];
  checksRun: { checkId: string; module: string; source: string; ok: boolean; note?: string }[];
  findings: SecurityScanFinding[];
  readErrors: { source: string; path: string; error: string }[];
  card: { score: number; bySeverity: Record<string, number>; delta: { new: number; recurring: number; closed: number }; topRemediations: string[] };
  judgeCalls: number;
  judgeCostUsd: number;
  failOpen: boolean;
  drift: { snapshot: string; previousAt: string | null; closed: { findingId: string; checkId: string; severity: string; local: string }[] };
  registry: { entries: number; activeEntries: number; error: string | null };
  advisory: string;
  audit: string;
};

type RegistryEntry = { subject: string; tokenHash: string; hash16: string; scopes: string[]; revoked: boolean; active: boolean; expiresAt: string };
type WalkFile = { path: string; rel: string; size: number; mode: number };
type SecHit = { line: number | null; kind: string; hash16: string; entropy: number | null; context: string | null };

const sha16 = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);
const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const asRecord = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function shannonEntropy(text: string): number {
  if (!text) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) { const p = count / text.length; entropy -= p * Math.log2(p); }
  return Math.round(entropy * 100) / 100;
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(4_096, buffer.length));
  return sample.includes(0);
}


// Classify a text buffer into hash16-only hits (SEC-001 formats, SEC-002 PEM,
// SEC-003 high entropy with context heuristic). Never returns raw material.
export function classifyText(text: string): SecHit[] {
  const hits: SecHit[] = [];
  const seen = new Set<string>();
  const push = (hit: SecHit) => {
    const key = `${hit.hash16}|${hit.kind}`;
    if (seen.has(key) || hits.length >= SEC_MAX_HITS_PER_TEXT) return;
    seen.add(key);
    hits.push(hit);
  };
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of SEC_TOKEN_RULES) {
      const match = rule.regex.exec(line);
      if (!match) continue;
      const value = typeof rule.group === "number" ? match[rule.group] : match[0];
      if (!value) continue;
      const context = rule.kind === "assigned-secret" ? (asString(match[1]) ?? "unknown-key") : rule.kind === "bearer-token" ? "Bearer" : keyNameOf(line, value);
      push({ line: index + 1, kind: rule.kind, hash16: sha16(value), entropy: shannonEntropy(value), context });
    }
  }
  let pemMatch: RegExpExecArray | null;
  const pemRegex = new RegExp(SEC_PEM_REGEX.source, "g");
  while ((pemMatch = pemRegex.exec(text)) !== null) {
    const block = pemMatch[0];
    const before = text.slice(0, pemMatch.index);
    const line = before.split("\n").length;
    const body = block.replace(/-----[A-Z ]+(KEY|KEYS)-----/g, "").replace(/\s+/g, "");
    push({ line, kind: "pem-private-key", hash16: sha16(block.trim()), entropy: shannonEntropy(body), context: "pem-block" });
    if (hits.length >= SEC_MAX_HITS_PER_TEXT) break;
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const regex = new RegExp(SEC_HIGH_ENTROPY_REGEX.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const token = match[0];
      const entropy = shannonEntropy(token);
      if (entropy < SEC_HIGH_ENTROPY_MIN_BITS) continue;
      if (!SEC_HIGH_ENTROPY_CONTEXT.test(line)) continue;
      push({ line: index + 1, kind: "high-entropy-string", hash16: sha16(token), entropy, context: null });
      if (hits.length >= SEC_MAX_HITS_PER_TEXT) break;
    }
    if (hits.length >= SEC_MAX_HITS_PER_TEXT) break;
  }
  return hits;
}

function keyNameOf(line: string, matchedValue: string): string {
  const index = line.indexOf(matchedValue);
  if (index < 0) return "unknown-key";
  const before = line.slice(Math.max(0, index - 48), index);
  const keyMatch = /([A-Za-z][A-Za-z0-9_-]{1,32})\s*[:=]\s*["']?\s*$/.exec(before);
  return keyMatch?.[1] ? keyMatch[1] : "unknown-key";
}

function defaultRunGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 30_000, maxBuffer: 24 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error && typeof (error as { code?: unknown }).code === "number" ? (error as { code?: number }).code ?? 1 : 0;
      resolve({ stdout: typeof stdout === "string" ? stdout : "", stderr: typeof stderr === "string" ? stderr : "", code });
    });
  });
}

function readTextFile(path: string, cap: number): { text: string | null; size: number; mode: number; error: string | null } {
  try {
    const stat = statSync(path);
    const mode = stat.mode & 0o777;
    if (stat.size > cap) return { text: null, size: stat.size, mode, error: `FILE_TOO_LARGE_${stat.size}` };
    const buffer = readFileSync(path);
    if (isProbablyBinary(buffer)) return { text: null, size: stat.size, mode, error: "BINARY_SKIPPED" };
    return { text: buffer.toString("utf8"), size: stat.size, mode, error: null };
  } catch (error) {
    return { text: null, size: -1, mode: -1, error: error instanceof Error ? error.message : String(error) };
  }
}

function walkFiles(root: string, maxFiles: number, readErrors: SecurityScanResult["readErrors"]): { files: WalkFile[]; truncated: boolean } {
  const files: WalkFile[] = [];
  let truncated = false;
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (stack.length > 0) {
    if (files.length >= maxFiles) { truncated = true; break; }
    const top = stack.shift() as { dir: string; depth: number };
    let entries: string[] = [];
    try {
      entries = readdirSync(top.dir).sort();
    } catch (error) {
      readErrors.push({ source: "walk", path: top.dir, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const name of entries) {
      if (files.length >= maxFiles) { truncated = true; break; }
      const full = join(top.dir, name);
      try {
        if (lstatSync(full).isSymbolicLink()) continue;
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (top.depth + 1 <= SEC_MAX_DEPTH && !SEC_SKIP_DIRS.has(name) && !name.startsWith(".staging-secret-")) stack.push({ dir: full, depth: top.depth + 1 });
          continue;
        }
        if (!stat.isFile()) continue;
        files.push({ path: full, rel: relative(root, full).replaceAll("\\", "/"), size: stat.size, mode: stat.mode & 0o777 });
      } catch (error) {
        readErrors.push({ source: "walk", path: full, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { files, truncated };
}

// ---- scan state -----------------------------------------------------------

type ScanState = {
  targetId: string;
  findings: Map<string, SecurityScanFinding>;
  readErrors: SecurityScanResult["readErrors"];
  checksRun: SecurityScanResult["checksRun"];
  modulesRun: Set<SecurityScanModule>;
};

function check(state: ScanState, checkId: string, source: string, ok: boolean, note?: string): void {
  const meta = SEC_CHECKS[checkId];
  state.checksRun.push({ checkId, module: meta.module, source, ok, ...(note !== undefined ? { note } : {}) });
}

function addFinding(state: ScanState, meta: SecCheckMeta, opts: { local: string; hash16?: string | null; entropy?: number | null; line?: number | null; reasons: string[] }): void {
  const findingId = sha16(`${state.targetId}|${meta.checkId}|${meta.kind}|${opts.local}|${opts.hash16 ?? "-"}`);
  if (state.findings.has(findingId)) return;
  state.findings.set(findingId, {
    findingId, checkId: meta.checkId, module: meta.module, kind: meta.kind, local: opts.local,
    line: opts.line ?? null, entropy: opts.entropy ?? null, value_hash16: opts.hash16 ?? null,
    severity: meta.severity, verdict: "plan" as const, drift: "recurring",
    reasons: opts.reasons.slice(0, 8), remediation: meta.remediation, fpNote: meta.fpNote, probability: null
  });
}

function checkIdForHit(kind: string): string {
  return kind === "pem-private-key" ? "SEC-002" : kind === "high-entropy-string" ? "SEC-003" : "SEC-001";
}

function mapProbeHit(hit: unknown): SecHit | null {
  const record = asRecord(hit);
  if (!record) return null;
  const hash = asString(record.hash16);
  if (!hash) return null;
  return { line: asNumber(record.line), kind: asString(record.kind) ?? "unknown", hash16: hash, entropy: asNumber(record.entropy), context: asString(record.context) };
}

// ---- filesystem tree scan (repo / path / data targets) ---------------------

function scanTree(state: ScanState, root: string, maxFiles: number): void {
  const walk = walkFiles(root, maxFiles, state.readErrors);
  check(state, "SEC-001", `tree:${root}`, true, walk.truncated ? `file cap ${maxFiles} reached - content scan truncated (reported honestly)` : "content classification ran over the whole tree");
  const wants = (checkId: string) => state.modulesRun.has(SEC_CHECKS[checkId].module);
  let skippedBinary = 0;
  let skippedLarge = 0;
  for (const file of walk.files) {
    const local = file.rel;
    if (wants("SEC-004")) {
      for (const pattern of SEC_FILENAME_PATTERNS) {
        if (!pattern.regex.test(local)) continue;
        addFinding(state, SEC_CHECKS["SEC-004"], { local, reasons: [`filename_matches_${pattern.kind}`, `mode_${file.mode.toString(8)}`] });
      }
    }
    if (wants("SEC-033") && SEC_LEGACY_FILE_REGEX.test(basename(local))) {
      addFinding(state, SEC_CHECKS["SEC-033"], { local, reasons: [`legacy_filename_${basename(local)}`] });
    }
    const isSensitive = SEC_FILENAME_PATTERNS.some((pattern) => pattern.regex.test(local));
    if (wants("SEC-031") && isSensitive && file.mode !== 0o600) {
      addFinding(state, SEC_CHECKS["SEC-031"], { local, reasons: [`mode_${file.mode.toString(8)}_expected_0600`] });
    }
    if (!state.modulesRun.has("secrets")) continue;
    const read = readTextFile(file.path, isSensitive ? SEC_MAX_SENSITIVE_FILE_BYTES : SEC_MAX_FILE_BYTES);
    if (read.error !== null) {
      if (read.error === "BINARY_SKIPPED") skippedBinary += 1;
      else if (read.error.startsWith("FILE_TOO_LARGE")) skippedLarge += 1;
      else state.readErrors.push({ source: "tree", path: local, error: read.error });
      continue;
    }
    if (read.text === null) continue;
    for (const hit of classifyText(read.text)) {
      addFinding(state, SEC_CHECKS[checkIdForHit(hit.kind)], {
        local, hash16: hit.hash16, entropy: hit.entropy, line: hit.line,
        reasons: [`content_${hit.kind}`, hit.context !== null ? `context_${hit.context}` : "context_unavailable"]
      });
    }
  }
  if (skippedBinary > 0 || skippedLarge > 0) {
    check(state, "SEC-001", `tree:${root}`, true, `skips: ${skippedBinary} binary, ${skippedLarge} oversized (caps, not access errors)`);
  }
}

// ---- /data inventory (legacy registry + credentials perms) ------------------

function scanDataInventory(state: ScanState, registryFile: string, credentialsDir: string): void {
  if (existsSync(registryFile)) {
    const read = readTextFile(registryFile, 1024 * 1024);
    if (read.text !== null) {
      addFinding(state, SEC_CHECKS["SEC-010"], { local: registryFile, hash16: sha16(read.text), reasons: [`legacy_registry_present_size_${read.size}`, `mode_${read.mode.toString(8)}`] });
    } else {
      state.readErrors.push({ source: "data", path: registryFile, error: read.error ?? "UNKNOWN" });
    }
    if (read.mode >= 0 && read.mode !== 0o600) {
      addFinding(state, SEC_CHECKS["SEC-030"], { local: registryFile, reasons: [`mode_${read.mode.toString(8)}_expected_0600`] });
    }
  }
  let entries: { name: string; mode: number; isDirectory: boolean }[] = [];
  try {
    entries = readdirSync(credentialsDir, { withFileTypes: true }).slice(0, SEC_MAX_STAT_ENTRIES).map((entry) => {
      const stats = lstatSync(join(credentialsDir, entry.name));
      return { name: entry.name, mode: stats.mode & 0o777, isDirectory: entry.isDirectory() };
    });
  } catch (error) {
    state.readErrors.push({ source: "data", path: credentialsDir, error: error instanceof Error ? error.message : String(error) });
  }
  for (const entry of entries) {
    const local = `${credentialsDir}/${entry.name}`;
    const expected = entry.isDirectory ? 0o700 : 0o600;
    if (entry.mode !== expected) {
      addFinding(state, SEC_CHECKS["SEC-030"], { local, reasons: [`mode_${entry.mode.toString(8)}_expected_${expected.toString(8)}`] });
    }
  }
}

// ---- registry module (M4) ---------------------------------------------------

function parseRegistry(registryFile: string): { entries: RegistryEntry[]; error: string | null } {
  try {
    const parsed = JSON.parse(readFileSync(registryFile, "utf8")) as { tokens?: unknown } | null;
    const tokens = validateTokenRegistry(parsed?.tokens);
    const nowMs = Date.now();
    const entries = tokens.map((token) => {
      const revoked = typeof token.revokedAt === "string" && token.revokedAt.length > 0;
      const expiresMs = Date.parse(token.expiresAt);
      return {
        subject: token.subject,
        tokenHash: token.tokenHash,
        hash16: token.tokenHash.slice(0, 16).toLowerCase(),
        scopes: [...token.scopes],
        revoked,
        active: !revoked && Number.isFinite(expiresMs) && expiresMs > nowMs,
        expiresAt: token.expiresAt
      };
    });
    return { entries, error: null };
  } catch (error) {
    return { entries: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function scanRegistry(state: ScanState, registryFile: string, credentialsDir: string, idsAuditFile: string, nowMs: number): { entries: RegistryEntry[]; error: string | null } {
  const inventory = parseRegistry(registryFile);
  if (inventory.error !== null) {
    state.readErrors.push({ source: "registry", path: registryFile, error: inventory.error });
    check(state, "SEC-040", "registry", false, inventory.error);
    return inventory;
  }
  const unknownScopes = new Set<string>();
  for (const entry of inventory.entries) {
    if (!entry.revoked && !entry.active) {
      addFinding(state, SEC_CHECKS["SEC-040"], { local: `registry:${entry.subject}`, hash16: entry.hash16, reasons: ["expired_or_invalid_expiry_not_revoked", `expires_${entry.expiresAt}`] });
    }
    if (entry.revoked && existsSync(`${credentialsDir}/${entry.subject}`)) {
      addFinding(state, SEC_CHECKS["SEC-041"], { local: `${credentialsDir}/${entry.subject}`, hash16: entry.hash16, reasons: [`revoked_subject_credential_file_present_${entry.subject}`] });
    }
    for (const scope of entry.scopes) {
      if (!KNOWN_REGISTRY_SCOPES.includes(scope)) unknownScopes.add(scope);
      if (scope === "engineering:registry:scope:grant" && !entry.subject.startsWith("operator-")) {
        addFinding(state, SEC_CHECKS["SEC-042"], { local: `registry:${entry.subject}`, hash16: entry.hash16, reasons: [`privilege_creep_grant_scope_on_non_operator_${entry.subject}`] });
      }
    }
  }
  for (const scope of unknownScopes) {
    addFinding(state, SEC_CHECKS["SEC-042"], { local: `registry-scope:${scope}`, reasons: [`scope_outside_known_catalog_${scope}`] });
  }
  let idsCount = 0;
  const idsRead = readTextFile(idsAuditFile, 262144);
  if (idsRead.text !== null) {
    const lines = idsRead.text.split("\n").filter((line) => line.trim().length > 0);
    const last = lines.length > 0 ? lines[lines.length - 1] : null;
    if (last !== null) {
      try {
        const record = JSON.parse(last) as { findings?: unknown; verdict?: unknown };
        for (const item of asArray(record.findings).slice(0, 5)) {
          const entry = asRecord(item);
          addFinding(state, SEC_CHECKS["SEC-043"], { local: `ids:${asString(entry?.subject) ?? "unknown"}`, reasons: [`ids_finding_present_${asString(entry?.kind) ?? "unknown"}`] });
        }
        if (record.verdict === "unavailable") {
          addFinding(state, SEC_CHECKS["SEC-043"], { local: "ids:verdict", reasons: ["ids_judge_verdict_unavailable_fail_open"] });
        }
        idsCount = asArray(record.findings).length;
      } catch {
        state.readErrors.push({ source: "ids-audit", path: idsAuditFile, error: "LAST_LINE_MALFORMED" });
      }
    }
  }
  check(state, "SEC-043", "ids-audit", true, `last ids record findings: ${idsCount}`);
  return inventory;
}

// ---- git history (M1, repo targets) ------------------------------------------

async function scanGitHistory(state: ScanState, root: string, runGit: NonNullable<SecurityScanDeps["runGit"]>): Promise<void> {
  if (!existsSync(join(root, ".git"))) {
    check(state, "SEC-005", `git:${root}`, true, "no .git directory - history checks skipped (honest)");
    check(state, "SEC-006", `git:${root}`, true, "no .git directory - history checks skipped (honest)");
    return;
  }
  const history = await runGit(["log", "-50", "--no-color", "--no-ext-diff", "--format=commit:%H", "-p", "--"], root);
  if (history.code !== 0) {
    state.readErrors.push({ source: "git", path: `${root} (git log -p)`, error: history.stderr.slice(0, 200) || `exit_${history.code}` });
    check(state, "SEC-005", `git:${root}`, false, "git log failed - see readErrors");
  } else {
    let currentCommit = "unknown";
    const seen = new Set<string>();
    for (const line of history.stdout.split("\n")) {
      const commitMatch = /^commit:([0-9a-f]{40})$/.exec(line.trim());
      if (commitMatch !== null) { currentCommit = commitMatch[1].slice(0, 10); continue; }
      if (line.length === 0 || line.startsWith("diff --git") || line.startsWith("commit:")) continue;
      for (const hit of classifyText(line)) {
        const key = `${hit.hash16}|${hit.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        addFinding(state, SEC_CHECKS[checkIdForHit(hit.kind)], {
          local: `${root} git@${currentCommit}`,
          hash16: hit.hash16, entropy: hit.entropy,
          reasons: [`git_history_${hit.kind}`, `commit_${currentCommit}`]
        });
      }
      if (seen.size >= 50) break;
    }
    check(state, "SEC-005", `git:${root}`, true, `last 50 commits scanned; ${seen.size} distinct secret-shaped hits`);
  }
  const names = await runGit(["log", "--all", "--diff-filter=A", "--name-only", "--format="], root);
  if (names.code !== 0) {
    state.readErrors.push({ source: "git", path: `${root} (git log --name-only)`, error: names.stderr.slice(0, 200) || `exit_${names.code}` });
    check(state, "SEC-006", `git:${root}`, false, "git name-only failed - see readErrors");
    return;
  }
  const nameSet = new Set(names.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0));
  let nameHits = 0;
  for (const name of nameSet) {
    for (const pattern of SEC_FILENAME_PATTERNS) {
      if (!pattern.regex.test(name)) continue;
      nameHits += 1;
      addFinding(state, SEC_CHECKS["SEC-006"], { local: `${root} git:${name}`, reasons: [`history_filename_${pattern.kind}`, "path_once_added_to_history"] });
    }
  }
  check(state, "SEC-006", `git:${root}`, true, `${nameSet.size} paths ever added; ${nameHits} secret-shaped filenames`);
}

// ---- host probe mapping (vps target; values already hashed runner-side) ------

function mapHostProbe(state: ScanState, body: unknown): void {
  const root = asRecord(body);
  if (!root) {
    state.readErrors.push({ source: "runner:security_probe", path: "payload", error: "PAYLOAD_SHAPE" });
    return;
  }
  for (const entry of asArray(root.readErrors).map(asRecord)) {
    state.readErrors.push({ source: `runner:${asString(entry?.source) ?? "unknown"}`, path: asString(entry?.path) ?? "unknown", error: asString(entry?.error) ?? "unknown" });
  }
  for (const file of asArray(asRecord(root.caddy)?.files).map(asRecord)) {
    const path = asString(file?.path) ?? "unknown-caddy-file";
    for (const hit of asArray(file?.findings).map(mapProbeHit)) {
      if (!hit) continue;
      addFinding(state, SEC_CHECKS["SEC-009"], {
        local: `${path}:${hit.line ?? 0}`, hash16: hit.hash16, entropy: hit.entropy,
        reasons: [`caddyfile_${hit.kind}`, hit.context !== null ? `context_${hit.context}` : "context_unavailable"]
      });
    }
    const stats = asRecord(file?.routeAuthStats);
    if (stats) {
      const withoutAuth = asNumber(stats.routesWithoutAuth) ?? 0;
      const total = asNumber(stats.routesTotal) ?? 0;
      if (withoutAuth > 0) {
        const samples = asArray(stats.samples).map((sample) => asString(sample)).filter((sample): sample is string => sample !== null).slice(0, 3);
        addFinding(state, SEC_CHECKS["SEC-022"], { local: path, reasons: [`routes_without_auth_${withoutAuth}_of_${total}`, ...samples.map((sample) => `sample_${sample}`)] });
      }
      const tls = asRecord(file?.tls);
      if (tls && (tls.hasTlsDirective === false || tls.hasHstsHeader === false)) {
        addFinding(state, SEC_CHECKS["SEC-023"], { local: path, reasons: [tls.hasTlsDirective === false ? "missing_tls_directive" : "tls_directive_present", tls.hasHstsHeader === false ? "missing_hsts_header" : "hsts_header_present"] });
      }
    }
  }
  for (const proc of asArray(root.procs).map(asRecord)) {
    const pid = asNumber(proc?.pid) ?? 0;
    const argv0 = asString(proc?.argv0) ?? "unknown";
    for (const hit of asArray(proc?.hits).map(mapProbeHit)) {
      if (!hit) continue;
      addFinding(state, SEC_CHECKS["SEC-008"], {
        local: `pid:${pid}:${argv0}`, hash16: hit.hash16, entropy: hit.entropy,
        reasons: [`proc_cmdline_${hit.kind}`, hit.context !== null ? `context_${hit.context}` : "context_unavailable"]
      });
    }
  }
  for (const unit of asArray(root.units).map(asRecord)) {
    const unitName = asString(unit?.unit) ?? "unknown-unit";
    const hardening = asRecord(unit?.hardening);
    if (hardening) {
      const missing: string[] = [];
      const noNewPrivileges = asString(hardening.noNewPrivileges);
      if (noNewPrivileges !== "true" && noNewPrivileges !== "yes") missing.push("NoNewPrivileges");
      const protectSystem = asString(hardening.protectSystem);
      if (!protectSystem || protectSystem === "no") missing.push("ProtectSystem");
      if (missing.length > 0) {
        addFinding(state, SEC_CHECKS["SEC-032"], { local: unitName, reasons: [`missing_directives_${missing.join("+")}`] });
      }
    }
    for (const hit of asArray(unit?.envHits).map(mapProbeHit)) {
      if (!hit) continue;
      addFinding(state, SEC_CHECKS["SEC-007"], {
        local: `${unitName}:env:${hit.context ?? "unknown-key"}`, hash16: hit.hash16, entropy: hit.entropy,
        reasons: [`unit_env_${hit.kind}`, `unit_${unitName}`]
      });
    }
  }
  for (const dir of asArray(root.secretDirs).map(asRecord)) {
    const dirPath = asString(dir?.path) ?? "unknown-dir";
    const dirError = asString(dir?.error);
    if (dirError !== null) {
      state.readErrors.push({ source: "runner:secretDirs", path: dirPath, error: dirError });
    }
    for (const entry of asArray(dir?.entries).map(asRecord)) {
      const name = asString(entry?.name) ?? "";
      if (!name) continue;
      const local = `${dirPath}/${name}`;
      const isDir = asString(entry?.type) === "dir";
      const mode = asNumber(entry?.mode);
      if (state.modulesRun.has(SEC_CHECKS["SEC-004"].module)) {
        for (const pattern of SEC_FILENAME_PATTERNS) {
          if (!pattern.regex.test(name)) continue;
          addFinding(state, SEC_CHECKS["SEC-004"], { local, reasons: [`filename_matches_${pattern.kind}`, mode !== null ? `mode_${mode.toString(8)}` : "mode_unknown"] });
        }
      }
      if (state.modulesRun.has(SEC_CHECKS["SEC-030"].module) && mode !== null) {
        const expected = isDir ? 0o700 : 0o600;
        if (mode !== expected) {
          addFinding(state, SEC_CHECKS["SEC-030"], { local, reasons: [`mode_${mode.toString(8)}_expected_${expected.toString(8)}`] });
        }
      }
      for (const hit of asArray(entry?.hits).map(mapProbeHit)) {
        if (!hit) continue;
        addFinding(state, SEC_CHECKS[checkIdForHit(hit.kind)], {
          local, hash16: hit.hash16, entropy: hit.entropy,
          reasons: [`dir_entry_name_${hit.kind}`, `dir_${dirPath}`]
        });
      }
    }
  }
  for (const file of asArray(root.dataHostFiles).map(asRecord)) {
    const path = asString(file?.path) ?? "unknown-host-file";
    const fileError = asString(file?.error);
    if (fileError !== null) {
      state.readErrors.push({ source: "runner:dataHostFiles", path, error: fileError });
      continue;
    }
    const hash = asString(file?.hash16);
    if (!hash) continue;
    addFinding(state, SEC_CHECKS["SEC-010"], { local: path, hash16: hash, reasons: [`host_file_present_${asString(file?.kind) ?? "unknown"}`] });
  }
  const ufw = asRecord(root.ufw);
  if (ufw) {
    const confEnabled = asString(ufw.ufwConfEnabled);
    const unitWants = typeof ufw.ufwUnitWants === "boolean" ? (ufw.ufwUnitWants ? "enabled" : "disabled") : "unknown";
    if (confEnabled === "no" || unitWants === "disabled") {
      addFinding(state, SEC_CHECKS["SEC-020"], { local: "host:ufw", reasons: [`ufw_conf_enabled_${confEnabled ?? "unknown"}`, `ufw_unit_${unitWants}`] });
    } else if (confEnabled === null && unitWants === "unknown") {
      state.readErrors.push({ source: "runner:ufw", path: "host:ufw", error: "UFW_STATE_UNAVAILABLE" });
    }
  }
  for (const listener of asArray(root.listeners).map(asRecord)) {
    const proto = asString(listener?.proto) ?? "tcp";
    const port = asNumber(listener?.port);
    const bind = asString(listener?.bind) ?? "";
    if (port === null) continue;
    if (bind === "0.0.0.0" || bind === "::") {
      addFinding(state, SEC_CHECKS["SEC-021"], { local: `${proto}:${port}@${bind}`, reasons: [`public_bind_${bind}`, "listening_socket_from_proc_net"] });
    }
  }
  const transcripts = asRecord(root.transcripts);
  for (const dir of asArray(transcripts?.dirs).map(asRecord)) {
    const dirPath = asString(dir?.dir) ?? "unknown-transcript-dir";
    const dirError = asString(dir?.error);
    if (dirError !== null) {
      state.readErrors.push({ source: "runner:transcripts", path: dirPath, error: dirError });
      continue;
    }
    for (const hit of asArray(dir?.hits).map(asRecord)) {
      const file = asString(hit?.file) ?? "unknown-file";
      const hash = asString(hit?.hash16);
      if (!hash) continue;
      const context = asString(hit?.context);
      addFinding(state, SEC_CHECKS["SEC-011"], {
        local: `${file}:${asNumber(hit?.line) ?? 0}`, hash16: hash, entropy: asNumber(hit?.entropy),
        reasons: [`transcript_${asString(hit?.kind) ?? "unknown"}`, context !== null ? `context_${context}` : "context_unavailable"]
      });
    }
  }
}

// docker ps -a published ports via the inspect channel (exposure)
function mapInspectDocker(state: ScanState, body: unknown): void {
  const docker = asArray(asRecord(body)?.docker);
  if (docker.length === 0) {
    check(state, "SEC-021", "runner:inspect", true, "docker evidence empty (ITEM-3 quirk) - container exposure unavailable");
    return;
  }
  for (const row of docker) {
    const text = typeof row === "string" ? row : (() => {
      const record = asRecord(row);
      return record ? `${asString(record.names) ?? asString(record.name) ?? ""} ${asString(record.ports) ?? ""}` : "";
    })();
    if (!text) continue;
    const match = /0\.0\.0\.0:(\d+)->/.exec(text);
    if (!match) continue;
    const container = text.split(/\s+/)[0] || "unknown";
    addFinding(state, SEC_CHECKS["SEC-021"], { local: `docker:${container}:${match[1]}`, reasons: ["docker_published_port_0_0_0_0", "inspect_channel"] });
  }
  check(state, "SEC-021", "runner:inspect", true, `docker rows scanned: ${docker.length}`);
}

// ---- judge triage (one batched evaluate, fail-open) --------------------------

type TriageMeta = { judgeCalls: number; judgeCostUsd: number; failOpen: boolean };

async function triageWithJudge(state: ScanState, mode: "scan" | "plan", deps: SecurityScanDeps): Promise<TriageMeta> {
  const findings = [...state.findings.values()];
  if (mode === "plan") {
    for (const finding of findings) { finding.verdict = "plan"; finding.drift = "plan"; }
    return { judgeCalls: 0, judgeCostUsd: 0, failOpen: false };
  }
  if (findings.length === 0) return { judgeCalls: 0, judgeCostUsd: 0, failOpen: false };
  const judged = findings.slice(0, SEC_MAX_JUDGE_FINDINGS);
  const questions = judged.map((finding, index) => ({
    id: `q_f${index}`,
    type: "noul" as const,
    instructions: `Question q_f${index}: security finding ${finding.findingId} (check ${finding.checkId}, kind=${finding.kind}, at ${finding.local}${finding.line !== null ? `:${finding.line}` : ""}) represents a REAL security exposure, not scanner noise or a documented false positive. Evidence: ${finding.reasons.join("; ")}. Known-FP note: ${finding.fpNote}`
  }));
  const statePayload = {
    target: state.targetId,
    findings: judged.map((finding) => ({
      findingId: finding.findingId, checkId: finding.checkId, kind: finding.kind, local: finding.local,
      line: finding.line, severity: finding.severity, entropy: finding.entropy,
      value_hash16: finding.value_hash16, reasons: finding.reasons.slice(0, 3), fpNote: finding.fpNote
    }))
  };
  const judgeDeps: JudgeDeps = deps.judgeDeps ?? { ...defaultJudgeDeps(), authorizerHash16: deps.authorizerHash16 ?? null };
  const overCap = findings.slice(SEC_MAX_JUDGE_FINDINGS);
  try {
    const result = (await runJudgeEvaluate({ state: statePayload, questions }, judgeDeps)) as { answers?: { id?: string; probability?: number }[]; provider?: { cost?: number } };
    let failOpen = false;
    for (let index = 0; index < judged.length; index += 1) {
      const finding = judged[index];
      const answer = result.answers?.find((entry) => entry?.id === `q_f${index}`);
      const probability = answer?.probability;
      if (typeof probability !== "number") {
        finding.verdict = "unavailable";
        finding.reasons.push("judge_answer_missing_fail_open");
        failOpen = true;
        continue;
      }
      finding.probability = probability;
      finding.verdict = probability >= 0.6 ? "judged" : "noise";
      finding.reasons.push(`judge_${probability >= 0.6 ? "real" : "noise"}_p_${probability.toFixed(2)}`);
    }
    for (const finding of overCap) {
      finding.verdict = "unjudged_cost_cap";
      finding.reasons.push(`judge_batch_cap_${SEC_MAX_JUDGE_FINDINGS}`);
    }
    const cost = asNumber(result.provider?.cost) ?? 0;
    return { judgeCalls: 1, judgeCostUsd: Math.round(cost * 1000000) / 1000000, failOpen };
  } catch (error) {
    for (const finding of judged) {
      finding.verdict = "unavailable";
      finding.reasons.push(`judge_unavailable_fail_open_${error instanceof Error ? error.name : "error"}`);
    }
    for (const finding of overCap) {
      finding.verdict = "unjudged_cost_cap";
      finding.reasons.push(`judge_batch_cap_${SEC_MAX_JUDGE_FINDINGS}`);
    }
    return { judgeCalls: 0, judgeCostUsd: 0, failOpen: true };
  }
}

// ---- drift (snapshot per target; new = flagged, absent = closed) ----------------

type DriftSnapshot = { ts: string; findings: { findingId: string; checkId: string; kind: string; severity: string; local: string }[] };

function loadDriftSnapshot(driftFile: string): { snapshot: DriftSnapshot | null; error: string | null } {
  if (!existsSync(driftFile)) return { snapshot: null, error: null };
  const read = readTextFile(driftFile, 1024 * 1024);
  if (read.error !== null || read.text === null) return { snapshot: null, error: read.error ?? "UNKNOWN" };
  try {
    const parsed = JSON.parse(read.text) as { ts?: string; findings?: DriftSnapshot["findings"] };
    if (!Array.isArray(parsed?.findings)) return { snapshot: null, error: "SNAPSHOT_SHAPE" };
    return { snapshot: parsed as DriftSnapshot, error: null };
  } catch (error) {
    return { snapshot: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeDriftSnapshot(driftDir: string, driftFile: string, snapshot: DriftSnapshot): string {
  try {
    mkdirSync(driftDir, { recursive: true });
    const tmp = `${driftFile}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(snapshot), { mode: 0o600 });
    renameSync(tmp, driftFile);
    return "written";
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function applyDrift(state: ScanState, driftDir: string, now: () => Date): { snapshot: string; previousAt: string | null; closed: SecurityScanResult["drift"]["closed"] } {
  const driftFile = `${driftDir}/${state.targetId}.json`;
  const loaded = loadDriftSnapshot(driftFile);
  if (loaded.error !== null) {
    state.readErrors.push({ source: "drift", path: driftFile, error: loaded.error });
  }
  const previous = loaded.snapshot;
  const currentIds = new Set(state.findings.keys());
  for (const finding of state.findings.values()) {
    finding.drift = previous !== null && previous.findings.some((prior) => prior.findingId === finding.findingId) ? "recurring" : "new";
  }
  const closed = previous === null ? [] : previous.findings.filter((prior) => !currentIds.has(prior.findingId)).map((prior) => ({ findingId: prior.findingId, checkId: prior.checkId, severity: prior.severity, local: prior.local }));
  const snapshotRecord: DriftSnapshot = {
    ts: now().toISOString(),
    findings: [...state.findings.values()].map((finding) => ({ findingId: finding.findingId, checkId: finding.checkId, kind: finding.kind, severity: finding.severity, local: finding.local }))
  };
  return { snapshot: writeDriftSnapshot(driftDir, driftFile, snapshotRecord), previousAt: previous?.ts ?? null, closed };
}

// ---- card ----------------------------------------------------------------------

function buildCard(state: ScanState, drift: { closed: SecurityScanResult["drift"]["closed"] }): SecurityScanResult["card"] {
  const findings = [...state.findings.values()];
  const bySeverity: Record<string, number> = { critical: 0, warn: 0, info: 0 };
  for (const finding of findings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  const score = Math.max(0, Math.min(100, 100 - 15 * (bySeverity.critical ?? 0) - 7 * (bySeverity.warn ?? 0) - 2 * (bySeverity.info ?? 0)));
  const delta = {
    new: findings.filter((finding) => finding.drift === "new").length,
    recurring: findings.filter((finding) => finding.drift === "recurring").length,
    closed: drift.closed.length
  };
  const topRemediations = [...new Set(findings.filter((finding) => finding.severity !== "info").map((finding) => finding.remediation))].slice(0, 5);
  return { score, bySeverity, delta, topRemediations };
}

// ---- output contamination guard (fails closed) ----------------------------------

function assertNoSecretInOutput(result: SecurityScanResult): void {
  const serialized = JSON.stringify(result);
  for (const guard of SEC_OUTPUT_GUARD) {
    if (guard.regex.test(serialized)) {
      throw new EngineeringError("SEC_OUTPUT_CONTAMINATION", `scan output materialized a secret-shaped value (guard kind: ${guard.kind}); failing closed - raw values must never leave the scanner`);
    }
  }
}

// ---- audit (hash16-only) ---------------------------------------------------------

function writeSecAudit(deps: SecurityScanDeps, record: Record<string, unknown>): string {
  const file = deps.auditFile ?? process.env.ENG_MCP_SEC_AUDIT_FILE ?? SEC_OUT_AUDIT_FILE_DEFAULT;
  try {
    const lastSlash = file.lastIndexOf("/");
    if (lastSlash > 0) mkdirSync(file.slice(0, lastSlash), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`);
    return "written";
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ---- main entry --------------------------------------------------------------------

export async function runSecurityScan(input: SecurityScanInput, deps: SecurityScanDeps = {}): Promise<SecurityScanResult> {
  const parsed = securityScanInputSchema.parse(input);
  const now = deps.now ?? (() => new Date());
  const nowMs = now().getTime();
  const mode = parsed.mode ?? "scan";
  const modulesRun = new Set<SecurityScanModule>(parsed.modules ?? [...SECURITY_SCAN_MODULES]);
  const dataDir = deps.dataDir ?? process.env.ENG_MCP_SEC_DATA_DIR ?? SEC_DATA_DIR_DEFAULT;
  const registryFile = deps.registryFile ?? process.env.ENG_MCP_SEC_REGISTRY_FILE ?? SEC_REGISTRY_FILE_DEFAULT;
  const idsAuditFile = deps.idsAuditFile ?? process.env.ENG_MCP_SEC_IDS_AUDIT_FILE ?? SEC_IDS_AUDIT_FILE_DEFAULT;
  const auditDir = deps.auditDir ?? process.env.ENG_MCP_SEC_AUDIT_DIR ?? SEC_AUDIT_DIR_DEFAULT;
  const driftDir = deps.driftDir ?? process.env.ENG_MCP_SEC_DRIFT_DIR ?? SEC_DRIFT_DIR_DEFAULT;
  const repoRoot = process.env.ENG_MCP_SEC_REPO_ROOT ?? "/opt/memoryos/eng-mcp";
  const rootOverride = process.env.ENG_MCP_SEC_ROOT_OVERRIDE ?? "";
  const raw = parsed.target.trim();
  let target: SecurityScanResult["target"];
  if (raw === "eng-mcp") {
    target = { id: "eng-mcp", kind: "eng-mcp", root: repoRoot };
  } else if (raw === "vps") {
    target = { id: "vps", kind: "vps", root: dataDir };
  } else if (isAbsolute(raw) && (raw.startsWith("/opt/") || raw.startsWith("/data/") || (rootOverride.length > 0 && raw === rootOverride))) {
    target = { id: `path-${sha16(raw).slice(0, 12)}`, kind: "path", root: raw.replace(/\/+$/, "") || raw };
  } else {
    throw new EngineeringError("TARGET_NOT_ALLOWED", `target "${raw.slice(0, 80)}" must be "eng-mcp", "vps", or an absolute path under /opt/ or /data/`);
  }
  const state: ScanState = { targetId: target.id, findings: new Map(), readErrors: [], checksRun: [], modulesRun: new Set(modulesRun) };
  const isVps = target.kind === "vps";
  if (state.modulesRun.has("secrets")) {
    scanTree(state, target.root, isVps ? SEC_MAX_FILES_DATA : SEC_MAX_FILES_REPO);
    if (target.kind !== "path") scanDataInventory(state, registryFile, `${dataDir}/credentials`);
    await scanGitHistory(state, target.root, deps.runGit ?? defaultRunGit);
  }
  if (isVps) {
    if (state.modulesRun.size > 0 && deps.runRunner) {
      try {
        const response = await deps.runRunner("security_probe");
        if (response.httpStatus === 200) mapHostProbe(state, response.body);
        else state.readErrors.push({ source: "runner:security_probe", path: "http", error: `HTTP_${response.httpStatus}` });
      } catch (error) {
        state.readErrors.push({ source: "runner:security_probe", path: "http", error: error instanceof Error ? error.message : String(error) });
      }
    } else if (state.modulesRun.size > 0) {
      state.readErrors.push({ source: "runner:security_probe", path: "channel", error: "RUNNER_CHANNEL_UNAVAILABLE" });
    }
    if (state.modulesRun.has("exposure") && deps.runRunner) {
      try {
        const inspect = await deps.runRunner("inspect");
        if (inspect.httpStatus === 200) mapInspectDocker(state, inspect.body);
        else state.readErrors.push({ source: "runner:inspect", path: "http", error: `HTTP_${inspect.httpStatus}` });
      } catch (error) {
        state.readErrors.push({ source: "runner:inspect", path: "http", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  let registryInventory: { entries: RegistryEntry[]; error: string | null } = { entries: [], error: null };
  if (state.modulesRun.has("registry") && target.kind !== "path") {
    registryInventory = scanRegistry(state, registryFile, `${dataDir}/credentials`, idsAuditFile, nowMs);
  }
  const driftInfo = mode === "scan" ? applyDrift(state, driftDir, now) : { snapshot: "skipped_plan", previousAt: null, closed: [] as SecurityScanResult["drift"]["closed"] };
  const triage = await triageWithJudge(state, mode, deps);
  const card = buildCard(state, driftInfo);
  const result: SecurityScanResult = {
    tool: "engineering.security.scan",
    status: mode === "plan" ? "PLAN" : "SCANNED",
    target,
    modulesRun: [...state.modulesRun],
    checksRun: state.checksRun,
    findings: [...state.findings.values()],
    readErrors: state.readErrors,
    card,
    judgeCalls: triage.judgeCalls,
    judgeCostUsd: triage.judgeCostUsd,
    failOpen: triage.failOpen,
    drift: { snapshot: driftInfo.snapshot, previousAt: driftInfo.previousAt, closed: driftInfo.closed },
    registry: { entries: registryInventory.entries.length, activeEntries: registryInventory.entries.filter((entry) => entry.active).length, error: registryInventory.error },
    advisory: SEC_ADVISORY,
    audit: "pending"
  };
  assertNoSecretInOutput(result);
  result.audit = writeSecAudit({ auditDir, auditFile: deps.auditFile }, {
    tool: "engineering.security.scan", engine: SEC_ENGINE, at: now().toISOString(),
    target: target.id, targetKind: target.kind, root: target.root, mode,
    modulesRun: result.modulesRun, checks: result.checksRun.length, readErrors: result.readErrors.length,
    findings: result.findings.map((finding) => ({ findingId: finding.findingId, checkId: finding.checkId, kind: finding.kind, severity: finding.severity, verdict: finding.verdict, drift: finding.drift, local: finding.local, hash16: finding.value_hash16 })),
    judgeCalls: result.judgeCalls, judgeCostUsd: result.judgeCostUsd, failOpen: result.failOpen,
    delta: result.card.delta, score: result.card.score, registry: result.registry,
    callerSubject: deps.callerSubject ?? null, callerHash16: deps.authorizerHash16 ?? null
  });
  return result;
}