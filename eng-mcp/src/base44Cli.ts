// BASE44-CLI-01: governed spawn layer for the Base44 CLI (npm package
// base44@0.1.16). Purpose: give the MCP server a least-authority path to the
// Base44 CLI so secrets rotation and single-function deploys can retire the
// painel flow. Design invariants (mirrors vps.secret.write / git-fetch
// governance):
//   1. Fixed argv — the caller never chooses the command. buildBase44CliArgs()
//      is the ONLY argv builder and accepts no caller strings beyond a
//      validated function name / env-file path it constructed itself.
//   2. The API key NEVER crosses argv or a file path argument (ps aux rule).
//      It is read server-side from an owner-only credential file (default
//      /data/credentials/base44-api-key, ENG_MCP_BASE44_API_KEY_FILE) or a
//      deps.apiKey injection (tests) and handed to the child ONLY through the
//      BASE44_API_KEY environment variable — a channel ps aux cannot observe.
//   3. The CLI's destructive surface is structurally unreachable: no `deploy`
//      (whole-project), no `functions delete`, no `secrets delete`, no
//      `--force`, no `--branch` (sandbox), no `link`, no `login`. Deploys are
//      always per-function with an explicit name (the CLI's "deploys all when
//      omitted" is exactly the accident this layer prevents).
//   4. Every run gets a throwaway 0700 HOME and a shared npm cache outside the
//      repository; the child cwd is the base44 project dir, so the CLI can
//      never write repo state unless the deploy module explicitly runs a pull
//      into its own temp dir.
//   5. Output is capped and scrubbed: the key value (when >= 12 chars) and any
//      bare b44k_ fragment are replaced by [REDACTED] before anything leaves
//      this module. Audits carry hashes only.
//   6. Fail-closed: missing/empty credential -> BASE44_CREDENTIAL_MISSING
//      before any spawn; app id absent -> BASE44_APP_ID_REQUIRED (never
//      implied); auth-shaped CLI failure -> BASE44_AUTH_REJECTED (the
//      canonical zero-side-effect invalid-key error); other non-zero exits ->
//      BASE44_CLI_FAILED; timeout -> BASE44_CLI_TIMEOUT.
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as pathModule from "node:path";
import { fileURLToPath } from "node:url";
import { EngineeringError } from "./policy.js";

export const BASE44_CLI_SPEC = "base44@0.1.16";
export const BASE44_API_KEY_FILE_DEFAULT = "/data/credentials/base44-api-key";
export const BASE44_OUTPUT_CAP_CHARS = 40_000;
export const BASE44_CLI_TIMEOUT_MS_DEFAULT = 120_000;

// The CLI runs with the repo's base44/ project dir as cwd (functions/ lives
// there). Derived from this module's own location: <repo>/eng-mcp/src ->
// <repo>/base44 (parent repo), so dev + container layouts both resolve right.
const DERIVED_PROJECT_DIR = pathModule.resolve(
  pathModule.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "base44",
);

// Note: ENG_MCP_REPOSITORY_ROOT points at the eng-mcp SUBREPO root, so joining
// base44 onto it would be wrong — the project dir lives in the PARENT repo.
export function defaultBase44ProjectDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ENG_MCP_BASE44_PROJECT_DIR ?? DERIVED_PROJECT_DIR;
}

export function isValidFunctionName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name);
}

export function isValidAppId(appId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(appId);
}

export type Base44CliOperation =
  | { kind: "whoami" }
  | { kind: "functionsList" }
  | { kind: "secretsList" }
  | { kind: "functionPull"; name: string }
  | { kind: "secretsSet"; envFile: string }
  | { kind: "functionsDeploy"; name: string };

// Fixed argv builder: the only place CLI arguments are constructed. Caller
// influence is limited to a validated function name; everything else is
// constant. --app-id is intentionally NOT passed: the app id travels in the
// BASE44_APP_ID child env (explicit server-side configuration — never argv
// and never implied by a directory guess). Destructive CLI forms (--force,
// functions delete, secrets delete, bare deploy, --branch, link) are
// structurally unreachable: no operation builds them.
export function buildBase44CliArgs(operation: Base44CliOperation, spec: string = BASE44_CLI_SPEC): string[] {
  const prefix = ["-y", spec];
  switch (operation.kind) {
    case "whoami":
      return [...prefix, "whoami", "--json"];
    case "functionsList":
      return [...prefix, "functions", "list", "--json"];
    case "secretsList":
      return [...prefix, "secrets", "list", "--json"];
    case "functionPull":
      return [...prefix, "functions", "pull", operation.name];
    case "secretsSet":
      return [...prefix, "secrets", "set", "--env-file", operation.envFile];
    case "functionsDeploy":
      return [...prefix, "functions", "deploy", operation.name];
  }
}

export interface Base44CliRun {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  authRejected: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface Base44CliDeps {
  env?: NodeJS.ProcessEnv;
  apiKey?: string;            // direct injection (tests); production resolves from apiKeyFile
  apiKeyFile?: string;        // owner-only file holding the API key
  appId?: string;             // configured app id (BASE44_APP_ID child env)
  projectDir?: string;        // child cwd
  spec?: string;              // CLI package spec (default base44@0.1.16)
  timeoutMs?: number;         // default 120_000
  spawn?: typeof execFile;    // injection point (tests; production uses execFile)
  npmCacheDir?: string;       // shared cache (default <tmpdir>/eng-mcp-base44-cli-cache)
  homeDir?: string;           // per-run throwaway HOME (default: generated)
}

const AUTH_SIGNAL_PATTERN = /login|log ?in|authenticat|unauthorized|forbidden|api key|invalid key|invalid api|not authorized|401|403/i;

function resolveApiKey(deps: Base44CliDeps, env: NodeJS.ProcessEnv): string {
  if (typeof deps.apiKey === "string" && deps.apiKey.length > 0) return deps.apiKey;
  const file = deps.apiKeyFile ?? env.ENG_MCP_BASE44_API_KEY_FILE ?? BASE44_API_KEY_FILE_DEFAULT;
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new EngineeringError("BASE44_CREDENTIAL_MISSING");
  }
  const value = bytes.toString("utf8").trim();
  if (!value) throw new EngineeringError("BASE44_CREDENTIAL_MISSING");
  return value;
}

const cap = (text: string): string =>
  text.length > BASE44_OUTPUT_CAP_CHARS
    ? text.slice(0, BASE44_OUTPUT_CAP_CHARS) + "\n...[TRUNCATED]"
    : text;

function scrub(text: string, apiKey: string): string {
  let out = text;
  if (apiKey.length >= 12) out = out.split(apiKey).join("[REDACTED]");
  // bare key fragments that might appear in echoes of the raw value
  out = out.replace(/\bb44k_[A-Za-z0-9_-]{4,}\b/g, "[REDACTED]");
  return out;
}

export async function runBase44Cli(operation: Base44CliOperation, deps: Base44CliDeps = {}): Promise<Base44CliRun> {
  const env = deps.env ?? process.env;
  const apiKey = resolveApiKey(deps, env); // fail-closed BEFORE any spawn
  const appId = deps.appId ?? env.ENG_MCP_BASE44_APP_ID ?? "";
  if (!appId) throw new EngineeringError("BASE44_APP_ID_REQUIRED");
  if (!isValidAppId(appId)) throw new EngineeringError("BASE44_APP_ID_INVALID");
  if (operation.kind === "functionPull" || operation.kind === "functionsDeploy") {
    if (!isValidFunctionName(operation.name)) throw new EngineeringError("BASE44_FUNCTION_NAME_INVALID");
  }
  const args = buildBase44CliArgs(operation, deps.spec ?? BASE44_CLI_SPEC);
  const projectDir = deps.projectDir ?? defaultBase44ProjectDir(env);
  const tmpHome = deps.homeDir
    ?? pathModule.join(tmpdir(), `base44-home-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    mkdirSync(tmpHome, { recursive: true });
    chmodSync(tmpHome, 0o700);
    const cacheDir = deps.npmCacheDir ?? pathModule.join(tmpdir(), "eng-mcp-base44-cli-cache");
    try { mkdirSync(cacheDir, { recursive: true }); } catch { /* cache is best-effort */ }
    const childEnv: NodeJS.ProcessEnv = {
      ...env,
      BASE44_API_KEY: apiKey, // env channel only — never argv, never a file path
      BASE44_APP_ID: appId,
      HOME: tmpHome,
      TMPDIR: tmpHome,
      npm_config_cache: cacheDir,
      npm_config_update_notifier: "false",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_yes: "true",
      CI: "1",
    };
    const spawnFn = deps.spawn ?? execFile;
    const startedAt = Date.now();
    const result = await new Promise<{ error: (Error & { code?: unknown; killed?: boolean; signal?: unknown }) | null; stdout: string; stderr: string }>((resolve) => {
      spawnFn("npx", args, {
        cwd: projectDir,
        env: childEnv,
        timeout: deps.timeoutMs ?? BASE44_CLI_TIMEOUT_MS_DEFAULT,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        shell: false,
      }, (error, stdout, stderr) => resolve({
        error: (error ?? null) as (Error & { code?: unknown; killed?: boolean; signal?: unknown }) | null,
        stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
        stderr: typeof stderr === "string" ? stderr : String(stderr ?? ""),
      }));
    });
    const err = result.error;
    const timedOut = err?.killed === true || err?.signal === "SIGTERM";
    const stdout = cap(scrub(result.stdout, apiKey));
    const stderr = cap(scrub(result.stderr, apiKey));
    return {
      ok: err === null,
      exitCode: typeof err?.code === "number" ? err.code : null,
      timedOut,
      authRejected: err !== null && !timedOut && AUTH_SIGNAL_PATTERN.test(`${stderr}\n${stdout}`),
      stdout,
      stderr,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* temp home best-effort */ }
  }
}

// Throwing classifier shared by the governed tool modules: turns a failed run
// into the canonical error codes. The run object itself (capped + scrubbed) is
// the evidence the caller keeps in its result/audit.
export function classifyBase44CliFailure(run: Base44CliRun): EngineeringError {
  if (run.timedOut) return new EngineeringError("BASE44_CLI_TIMEOUT");
  if (run.authRejected) return new EngineeringError("BASE44_AUTH_REJECTED");
  return new EngineeringError("BASE44_CLI_FAILED");
}

export function assertCliOk(run: Base44CliRun): void {
  if (run.ok) return;
  throw classifyBase44CliFailure(run);
}

export function makeBase44CliRunner(common: Base44CliDeps): (operation: Base44CliOperation, callDeps?: Base44CliDeps) => Promise<Base44CliRun> {
  return (operation, callDeps = {}) => runBase44Cli(operation, { ...common, ...callDeps });
}

// ---- output parsing helpers (defensive: CLI shapes pinned by goldens) ----

// secrets list --json: name-only listing; values are masked by the CLI. Accepts
// [{name|key|secret|id}, ...], [string, ...], {names|secrets|data|items: [...]},
// or a plain-text fallback of bare identifier lines.
export function parseSecretNames(stdout: string): string[] {
  const text = stdout.trim();
  if (!text) return [];
  const fromArray = (entries: unknown[]): string[] => entries
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        for (const field of ["name", "key", "secret", "id"]) {
          const value = record[field];
          if (typeof value === "string") return value;
        }
      }
      return null;
    })
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return fromArray(parsed);
    if (parsed && typeof parsed === "object") {
      for (const field of ["names", "secrets", "data", "items"]) {
        const value = (parsed as Record<string, unknown>)[field];
        if (Array.isArray(value)) return fromArray(value);
      }
    }
  } catch {
    // fall through to plain text
  }
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(line));
}

// whoami --json: output only workspace/account identity, never the key. The
// allowlist keeps identity fields and drops everything else (including any
// credential-shaped field); non-JSON output maps to { authenticated: true }.
const WHOAMI_ALLOWED_FIELDS = new Set([
  "id", "name", "email", "username",
  "workspace", "workspaceId", "workspace_id",
  "account", "accountId", "account_id", "user",
]);
export function scrubWhoami(stdout: string): Record<string, unknown> {
  const text = stdout.trim();
  const pick = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
      if (!WHOAMI_ALLOWED_FIELDS.has(key)) continue;
      if (typeof field === "string" || typeof field === "boolean" || typeof field === "number") out[key] = field;
    }
    return out;
  };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const direct = pick(parsed);
      if (Object.keys(direct).length > 0) return direct;
      const record = parsed as Record<string, unknown>;
      for (const field of ["data", "user", "result", "me"]) {
        const inner = pick(record[field]);
        if (Object.keys(inner).length > 0) return inner;
      }
    }
  } catch {
    // non-JSON output: no structured fields to expose
  }
  return { authenticated: true };
}