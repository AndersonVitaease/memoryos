// BASE44-CLI-01 — engineering.base44.secret.write: governed writer for Base44
// project secrets (AGENT_MEMORY_MCP_SECRET rotation and friends) via the
// governed CLI spawn layer (src/base44Cli.ts).
//
// Leak-surface design (mirrors engineering.vps.secret.write):
//   - The secret VALUE is never an input field. It is read server-side from an
//     owner-only env var or an operator-staged 0600 regular non-symlink file
//     under /data/.staging-secret-* — channels `ps aux` cannot observe.
//   - The value reaches the CLI ONLY through a 0600 env-file inside a throwaway
//     0700 temp dir (base44 secrets set --env-file <path>): the PATH in argv is
//     process-visible but carries no secret. The temp dir is unlinked in
//     finally.
//   - CLI outputs are scrubbed by the spawn layer; value fragments never reach
//     payloads or errors. The audit carries hashes only.
//   - Invalid credentials fail closed: the spawn layer throws
//     BASE44_AUTH_REJECTED (canonical zero-side-effect error) — execute
//     happens only after credential + listing succeed.
// Honest idempotency: the CLI lists secret NAMES only (values are masked), so
// byte-identity cannot be proven — every confirmed write is reported as WRITE
// with redeployWarning:true (Base44 redeploys backend functions after a
// secret set; there is no NO_OP status here by design, not by accident).
import * as z from "zod/v4";
import { appendFileSync, chmodSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import * as pathModule from "node:path";
import { EngineeringError } from "./policy.js";
import { assertCliOk, classifyBase44CliFailure, makeBase44CliRunner, parseSecretNames, runBase44Cli, type Base44CliRun } from "./base44Cli.ts";

export const BASE44_SECRET_WRITE_STATUSES = ["PLAN", "BLOCKED", "WRITE"] as const;
export type Base44SecretWriteStatus = (typeof BASE44_SECRET_WRITE_STATUSES)[number];

export const BASE44_SECRET_WRITE_DEFAULTS = {
  secretNames: ["AGENT_MEMORY_MCP_SECRET"] as readonly string[],
  stagingPrefix: "/data/.staging-secret-",
  auditFile: "/data/audit/base44-secret.jsonl",
} as const;

export const base44SecretWriteInputSchema = z.object({
  secretName: z.string().min(1).max(100),
  source: z.union([
    z.object({ kind: z.literal("env"), name: z.string().min(1).max(200) }).strict(),
    z.object({ kind: z.literal("staging"), path: z.string().min(1).max(512) }).strict(),
  ]),
  appId: z.string().min(8).max(64).optional(),
  execute: z.boolean().optional(),
  approval: z.object({ approved: z.boolean() }).strict().optional(),
  acknowledgeWrite: z.literal(true),
}).strict();
export type Base44SecretWriteInput = z.infer<typeof base44SecretWriteInputSchema>;

export interface Base44SecretWriteDeps {
  runner?: (operation: Parameters<typeof runBase44Cli>[0], callDeps?: Parameters<typeof runBase44Cli>[1]) => Promise<Base44CliRun>;
  secretNames?: readonly string[];
  stagingPrefix?: string;
  auditFile?: string;
  authorizerHash16?: string;
  env?: NodeJS.ProcessEnv;
  apiKey?: string;
  apiKeyFile?: string;
  appId?: string;
  now?: () => number;
}

export interface Base44SecretWriteFinding {
  code: string;
  severity: "critical" | "warning" | "info";
  detail?: string;
}

export interface Base44SecretWriteResult {
  tool: "engineering.base44.secret.write";
  status: Base44SecretWriteStatus;
  mutationPerformed: boolean;
  secretName: string;
  valueSha16: string | null;
  source: { kind: "env" | "staging"; reference: string; bytes: number } | null;
  wouldChange: "unknown";
  plan: { action: "set_secret"; possible: boolean; requires: string[] };
  listedNames?: string[];
  targetListed?: boolean;
  cliRun?: { exitCode: number | null; timedOut: boolean; durationMs: number; stdoutSha16: string | null };
  postcheck?: { listed: boolean; names: string[] };
  redeployWarning: boolean;
  blockers?: string[];
  findings: Base44SecretWriteFinding[];
}

const sha16 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

// Production runner: common CLI deps (credential channel + app id) fixed once;
// per-call overrides (e.g. a temp cwd) merge on top. Callers may inject their
// own runner (tests).
function makeRunner(deps: Base44SecretWriteDeps, appIdInput: string | undefined): (operation: Parameters<typeof runBase44Cli>[0], callDeps?: Parameters<typeof runBase44Cli>[1]) => Promise<Base44CliRun> {
  return makeBase44CliRunner({
    apiKey: deps.apiKey,
    apiKeyFile: deps.apiKeyFile,
    appId: appIdInput ?? deps.appId,
    env: deps.env,
  });
}

function emitAudit(auditFile: string, line: Record<string, unknown>): void {
  try {
    mkdirSync(pathModule.dirname(auditFile), { recursive: true });
    appendFileSync(auditFile, `${JSON.stringify(line)}\n`);
  } catch {
    // audit is observability-only; never block the governed action on it
  }
}

// Source resolution — server-side only. env: a set non-empty variable.
// staging: an operator-staged 0600 regular non-symlink file under the staging
// prefix (same checks as engineering.vps.secret.write). Failures are blockers
// (PLAN possible=false / BLOCKED), never thrown — the PLAN must be able to
// show exactly why nothing happened.
function resolveSource(
  input: Base44SecretWriteInput,
  cfg: { stagingPrefix: string; env: NodeJS.ProcessEnv },
): { bytes: Buffer | null; reference: string | null; blockers: string[]; findings: Base44SecretWriteFinding[] } {
  const blockers: string[] = [];
  const findings: Base44SecretWriteFinding[] = [];
  const fail = (code: string, detail: string): void => {
    blockers.push(code);
    findings.push({ code, severity: "critical", detail });
  };
  if (input.source.kind === "env") {
    const value = cfg.env[input.source.name];
    if (typeof value !== "string" || value.length === 0) {
      fail("BASE44_SOURCE_EMPTY", `env var ${input.source.name} is unset or empty`);
      return { bytes: null, reference: null, blockers, findings };
    }
    return { bytes: Buffer.from(value, "utf8"), reference: `env:${input.source.name}`, blockers, findings };
  }
  const stagingPath = input.source.path;
  if (!stagingPath.startsWith(cfg.stagingPrefix)) {
    fail("BASE44_SOURCE_NOT_ALLOWED", `staging files must live under ${cfg.stagingPrefix}*`);
    return { bytes: null, reference: null, blockers, findings };
  }
  let info: ReturnType<typeof lstatSync> | null = null;
  try {
    info = lstatSync(stagingPath);
  } catch {
    info = null;
  }
  if (!info) {
    fail("BASE44_SOURCE_NOT_FOUND", `staging file ${stagingPath} does not exist`);
    return { bytes: null, reference: null, blockers, findings };
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    fail("BASE44_SOURCE_NOT_REGULAR_FILE", `${stagingPath} is not a regular non-symlink file`);
    return { bytes: null, reference: null, blockers, findings };
  }
  if ((info.mode & 0o077) !== 0) {
    fail("BASE44_SOURCE_PERMS_REFUSED", `${stagingPath} is not owner-only (group/other bits set)`);
    return { bytes: null, reference: null, blockers, findings };
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(stagingPath);
  } catch {
    fail("BASE44_SOURCE_NOT_FOUND", `staging file ${stagingPath} became unreadable`);
    return { bytes: null, reference: null, blockers, findings };
  }
  if (bytes.byteLength === 0) {
    fail("BASE44_SOURCE_EMPTY", `${stagingPath} is empty`);
    return { bytes: null, reference: null, blockers, findings };
  }
  return { bytes, reference: `staging:${stagingPath}`, blockers, findings };
}

export async function runBase44SecretWrite(rawInput: unknown, deps: Base44SecretWriteDeps = {}): Promise<Base44SecretWriteResult> {
  const input = base44SecretWriteInputSchema.parse(rawInput ?? {});
  const cfg = {
    secretNames: deps.secretNames ?? BASE44_SECRET_WRITE_DEFAULTS.secretNames,
    stagingPrefix: deps.stagingPrefix ?? BASE44_SECRET_WRITE_DEFAULTS.stagingPrefix,
    auditFile: deps.auditFile ?? BASE44_SECRET_WRITE_DEFAULTS.auditFile,
    env: deps.env ?? process.env,
  };
  if (!cfg.secretNames.includes(input.secretName)) {
    // allowlist is structural: unknown secret names are refused outright
    throw new EngineeringError("BASE44_SECRET_NOT_ALLOWED");
  }
  const resolved = resolveSource(input, cfg);
  const valueBytes = resolved.bytes;
  const valueSha16 = valueBytes ? sha16(valueBytes) : null;
  const source = resolved.reference
    ? { kind: input.source.kind, reference: resolved.reference, bytes: valueBytes?.byteLength ?? 0 }
    : null;
  const findings: Base44SecretWriteFinding[] = [...resolved.findings];

  // PLAN evidence: names-only listing (the CLI never returns values). This is
  // also the credential+app-id sanity probe: a bad b44k_ fails here with the
  // canonical auth error and zero mutation.
  let listedNames: string[] | undefined;
  let targetListed: boolean | undefined;
  const runner = deps.runner ?? makeRunner(deps, input.appId);
  if (resolved.blockers.length === 0) {
    try {
      const run = await runner({ kind: "secretsList" });
      assertCliOk(run);
      listedNames = parseSecretNames(run.stdout);
      targetListed = listedNames.includes(input.secretName);
    } catch (error) {
      const code = error instanceof EngineeringError ? error.code : "BASE44_CLI_FAILED";
      findings.push({ code, severity: "critical", detail: "secrets list probe failed" });
    }
  }

  const mutationApproved = input.execute === true && input.approval?.approved === true;
  const plan = { action: "set_secret" as const, possible: resolved.blockers.length === 0, requires: ["execute=true", "approval.approved=true"] };
  const base: Omit<Base44SecretWriteResult, "status" | "mutationPerformed"> = {
    tool: "engineering.base44.secret.write",
    secretName: input.secretName,
    valueSha16,
    source,
    wouldChange: "unknown",
    plan,
    ...(listedNames !== undefined ? { listedNames, targetListed } : {}),
    redeployWarning: true,
    findings,
  };
  if (!mutationApproved) {
    return {
      ...base,
      status: resolved.blockers.length > 0 ? "BLOCKED" : "PLAN",
      mutationPerformed: false,
      ...(resolved.blockers.length > 0 ? { blockers: resolved.blockers } : {}),
    };
  }
  if (resolved.blockers.length > 0 || !valueBytes) {
    return {
      ...base,
      status: "BLOCKED",
      mutationPerformed: false,
      blockers: resolved.blockers,
    };
  }

  // Execute: 0600 env-file inside a throwaway 0700 temp dir; the value never
  // touches argv — the path is the only ps-visible artifact.
  const tmp = pathModule.join(tmpdir(), `base44-secret-${process.pid}-${Date.now().toString(36)}`);
  try {
    mkdirSync(tmp, { recursive: true });
    chmodSync(tmp, 0o700);
    const envFile = pathModule.join(tmp, "secrets.env");
    const fd = openSync(envFile, "wx", 0o600);
    try {
      writeSync(fd, Buffer.concat([Buffer.from(`${input.secretName}=`), valueBytes, Buffer.from("\n")]));
      closeSync(fd);
    } finally {
      try { closeSync(fd); } catch { /* already closed */ }
    }
    const run = await runner({ kind: "secretsSet", envFile });
    const cliRun = {
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      durationMs: run.durationMs,
      stdoutSha16: run.stdout ? sha16(Buffer.from(run.stdout, "utf8")) : null,
    };
    if (!run.ok) {
      // temp dir (and the env-file inside it) is destroyed by the finally —
      // zero side effect beyond the refused CLI call
      throw classifyBase44CliFailure(run);
    }
    // postcheck: name present in a fresh names-only listing. Value is never
    // readable back — presence is the honest best evidence available.
    let postcheck: { listed: boolean; names: string[] } = { listed: false, names: [] };
    let postcheckIncomplete = false;
    try {
      const verify = await runner({ kind: "secretsList" });
      const names = parseSecretNames(verify.stdout);
      postcheck = { listed: names.includes(input.secretName), names };
      postcheckIncomplete = !postcheck.listed;
    } catch {
      postcheckIncomplete = true;
    }
    if (postcheckIncomplete) findings.push({ code: "BASE44_POSTCHECK_INCOMPLETE", severity: "warning", detail: "fresh names-only listing did not confirm the secret; re-run PLAN to verify" });
    emitAudit(cfg.auditFile, {
      ts: new Date((deps.now ?? Date.now)()).toISOString(),
      tool: "engineering.base44.secret.write",
      secret_name: input.secretName,
      value_sha16: valueSha16,
      action: "set",
      result: "WRITE",
      exit_code: run.exitCode,
      redeploy_warning: true,
      authorizerHash16: deps.authorizerHash16 ?? null,
    });
    return {
      ...base,
      status: "WRITE",
      mutationPerformed: true,
      cliRun,
      postcheck,
      findings,
    };
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp dir best-effort */ }
  }
}