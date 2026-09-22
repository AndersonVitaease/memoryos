// BASE44-CLI-01 — unit tests for the governed Base44 CLI spawn layer
// (src/base44Cli.ts). Coverage: fixed argv for all six operations (destructive
// CLI forms structurally unreachable), validators, fail-closed credential/app-id
// gates BEFORE any spawn, the child-env-only key channel (ps aux rule), scrub of
// key material, canonical failure classification, and the defensive output
// parsers (parseSecretNames / scrubWhoami) against CLI-shaped goldens.
// Deterministic: no network, no LLM, no SSH/shell; zero mutation. The spawn
// injection point lets every CLI call be answered by a local fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as pathModule from "node:path";
import {
  BASE44_CLI_SPEC,
  assertCliOk,
  buildBase44CliArgs,
  classifyBase44CliFailure,
  defaultBase44ProjectDir,
  isValidAppId,
  isValidFunctionName,
  makeBase44CliRunner,
  parseSecretNames,
  runBase44Cli,
  scrubWhoami,
  type Base44CliOperation,
  type Base44CliRun,
} from "../src/base44Cli.ts";

const APP = "testapp01";
const KEY = "b44k_TESTKEY_value_0123456789abcdef";

type SpawnOpts = { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; maxBuffer?: number; windowsHide?: boolean; shell?: boolean };
type SpawnCall = { cmd: string; args: string[]; env: NodeJS.ProcessEnv; opts: SpawnOpts };
type ChildResponse = { error?: (Error & { code?: unknown; killed?: boolean; signal?: unknown }) | null; stdout?: string; stderr?: string };
type SpawnImpl = (call: { args: string[]; env: NodeJS.ProcessEnv; opts: SpawnOpts }, respond: (response: ChildResponse) => void) => void;

function makeSpawn(impl: SpawnImpl): { calls: SpawnCall[]; fake: typeof execFile } {
  const calls: SpawnCall[] = [];
  const fake = (
    cmd: string,
    args: readonly string[],
    options: SpawnOpts,
    callback: (error: (Error & { code?: unknown; killed?: boolean; signal?: unknown }) | null, stdout: string, stderr: string) => void,
  ): void => {
    const call: SpawnCall = { cmd, args: [...args], env: { ...(options.env ?? {}) }, opts: options };
    calls.push(call);
    impl(call, (response) => {
      callback(response.error ?? null, response.stdout ?? "", response.stderr ?? "");
    });
  };
  return { calls, fake: fake as unknown as typeof execFile };
}

const okSpawn = makeSpawn((_call, respond) => respond({ stdout: "ok" }));

const ALL_OPERATIONS: Base44CliOperation[] = [
  { kind: "whoami" },
  { kind: "functionsList" },
  { kind: "secretsList" },
  { kind: "functionPull", name: "agentMemoryBridge" },
  { kind: "secretsSet", envFile: "/tmp/throwaway/secrets.env" },
  { kind: "functionsDeploy", name: "agentMemoryBridge" },
];

test("buildBase44CliArgs: fixed argv for all six operations", () => {
  assert.deepEqual(buildBase44CliArgs({ kind: "whoami" }), ["-y", BASE44_CLI_SPEC, "whoami", "--json"]);
  assert.deepEqual(buildBase44CliArgs({ kind: "functionsList" }), ["-y", BASE44_CLI_SPEC, "functions", "list", "--json"]);
  assert.deepEqual(buildBase44CliArgs({ kind: "secretsList" }), ["-y", BASE44_CLI_SPEC, "secrets", "list", "--json"]);
  assert.deepEqual(buildBase44CliArgs({ kind: "functionPull", name: "agentMemoryBridge" }), ["-y", BASE44_CLI_SPEC, "functions", "pull", "agentMemoryBridge"]);
  assert.deepEqual(buildBase44CliArgs({ kind: "secretsSet", envFile: "/tmp/0700/secrets.env" }), ["-y", BASE44_CLI_SPEC, "secrets", "set", "--env-file", "/tmp/0700/secrets.env"]);
  assert.deepEqual(buildBase44CliArgs({ kind: "functionsDeploy", name: "agentMemoryBridge" }), ["-y", BASE44_CLI_SPEC, "functions", "deploy", "agentMemoryBridge"]);
});

test("buildBase44CliArgs: destructive CLI surface is structurally unreachable", () => {
  for (const op of ALL_OPERATIONS) {
    const args = buildBase44CliArgs(op);
    assert.ok(!args.includes("--force"), "--force must never be constructed");
    assert.ok(!args.includes("delete"), "delete commands must never be constructed");
    assert.ok(!args.includes("login"), "login must never be constructed");
    assert.ok(!args.includes("link"), "link must never be constructed");
    assert.ok(!args.includes("--branch"), "--branch (sandbox) must never be constructed");
    if (args.includes("deploy")) {
      // deploy is always the per-function form: functions deploy <name>
      assert.equal(args[args.indexOf("deploy") - 1], "functions");
      assert.ok(args.length >= 3, "a bare whole-project deploy is never built");
    }
  }
});

test("validators: function name and app id shapes", () => {
  assert.equal(isValidFunctionName("agentMemoryBridge"), true);
  assert.equal(isValidFunctionName("a".repeat(64)), true);
  assert.equal(isValidFunctionName("1startsWithDigit"), false);
  assert.equal(isValidFunctionName("has-dash"), false);
  assert.equal(isValidFunctionName("has.dot"), false);
  assert.equal(isValidFunctionName(""), false);
  assert.equal(isValidFunctionName("a".repeat(65)), false);
  assert.equal(isValidAppId("abcdefgh"), true);
  assert.equal(isValidAppId("app_1234-xyz"), true);
  assert.equal(isValidAppId("abcdefg"), false);
  assert.equal(isValidAppId("-leadingdash"), false);
  assert.equal(isValidAppId("has space"), false);
});

test("defaultBase44ProjectDir: env override wins; the default derives from the module location", () => {
  assert.equal(defaultBase44ProjectDir({ ENG_MCP_BASE44_PROJECT_DIR: "/x/y" }), "/x/y");
  assert.ok(defaultBase44ProjectDir({}).endsWith("base44"));
});

test("runBase44Cli: missing credential fails closed BEFORE any spawn", async () => {
  const { calls, fake } = okSpawn;
  await assert.rejects(
    runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, appId: APP, apiKeyFile: "/nonexistent/base44-api-key" }),
    /BASE44_CREDENTIAL_MISSING/,
  );
  assert.equal(calls.length, 0);
});

test("runBase44Cli: empty credential file fails closed too", async () => {
  const dir = mkdtempSync("b44cli-cred-");
  const file = `${dir}/k`;
  writeFileSync(file, "   \n");
  const { calls, fake } = okSpawn;
  await assert.rejects(
    runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, appId: APP, apiKeyFile: file }),
    /BASE44_CREDENTIAL_MISSING/,
  );
  assert.equal(calls.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("runBase44Cli: credential file is resolved when deps.apiKey is absent", async () => {
  const dir = mkdtempSync("b44cli-credfile-");
  const file = `${dir}/key`;
  writeFileSync(file, `${KEY}\n`);
  const { calls, fake } = makeSpawn((_call, respond) => respond({ stdout: "who" }));
  const run = await runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, appId: APP, apiKeyFile: file });
  assert.equal(run.ok, true);
  assert.equal(calls[0]!.env.BASE44_API_KEY, KEY);
  rmSync(dir, { recursive: true, force: true });
});

test("runBase44Cli: app id required/invalid fail closed before any spawn", async () => {
  const { calls, fake } = okSpawn;
  await assert.rejects(
    runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, apiKey: KEY }),
    /BASE44_APP_ID_REQUIRED/,
  );
  await assert.rejects(
    runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, apiKey: KEY, appId: "short" }),
    /BASE44_APP_ID_INVALID/,
  );
  assert.equal(calls.length, 0);
});

test("runBase44Cli: invalid function name fails closed before any spawn", async () => {
  const { calls, fake } = okSpawn;
  await assert.rejects(
    runBase44Cli({ kind: "functionsDeploy", name: "../evil" }, { spawn: fake, env: {}, apiKey: KEY, appId: APP }),
    /BASE44_FUNCTION_NAME_INVALID/,
  );
  await assert.rejects(
    runBase44Cli({ kind: "functionPull", name: "bad-name" }, { spawn: fake, env: {}, apiKey: KEY, appId: APP }),
    /BASE44_FUNCTION_NAME_INVALID/,
  );
  assert.equal(calls.length, 0);
});

test("runBase44Cli: the key travels ONLY in the child env (never argv), throwaway HOME is destroyed", async () => {
  const { calls, fake } = makeSpawn((_call, respond) => respond({ stdout: "{}" }));
  const projectDir = "/some/base44-project";
  const run = await runBase44Cli(
    { kind: "secretsSet", envFile: "/tmp/x/secrets.env" },
    { spawn: fake, env: {}, apiKey: KEY, appId: APP, projectDir },
  );
  assert.equal(run.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.cmd, "npx");
  assert.equal(calls[0]!.args[0], "-y");
  assert.equal(calls[0]!.args[1], BASE44_CLI_SPEC);
  assert.equal(calls[0]!.env.BASE44_API_KEY, KEY);
  assert.equal(calls[0]!.env.BASE44_APP_ID, APP);
  assert.equal(calls[0]!.env.CI, "1");
  assert.equal(calls[0]!.env.npm_config_update_notifier, "false");
  assert.ok(calls[0]!.env.HOME, "the child gets a throwaway HOME");
  assert.ok(!calls[0]!.args.some((arg) => arg.includes(KEY)), "the key never appears in argv");
  assert.ok(!calls.some((call) => call.cmd.includes(KEY) || call.args.some((arg) => arg.includes(KEY)) || (call.opts.cwd ?? "").includes(KEY)), "the key never appears on the ps-visible surface (cmd/args/cwd); the child env is the sanctioned channel by design");
  assert.equal(calls[0]!.opts.cwd, projectDir);
  assert.equal(calls[0]!.opts.shell, false);
  assert.ok(calls[0]!.opts.windowsHide, true);
  assert.equal(existsSync(calls[0]!.env.HOME as string), false, "the throwaway HOME is unlinked in finally");
});

test("runBase44Cli: key value and bare b44k_ fragments are scrubbed from outputs", async () => {
  const leaky = `debug: ${KEY} echoed\nalso b44k_shortish here`;
  const { fake } = makeSpawn((_call, respond) => respond({ stdout: leaky, stderr: `stderr sees ${KEY}` }));
  const run = await runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, apiKey: KEY, appId: APP });
  assert.ok(!run.stdout.includes(KEY), "the full key value is scrubbed");
  assert.ok(!run.stderr.includes(KEY), "the full key value is scrubbed from stderr too");
  assert.ok(!/\bb44k_[A-Za-z0-9_-]{4,}\b/.test(run.stdout), "bare b44k_ fragments are scrubbed");
  assert.ok(run.stdout.includes("[REDACTED]"));
});

test("runBase44Cli: auth-shaped failure -> BASE44_AUTH_REJECTED; killed -> BASE44_CLI_TIMEOUT; other -> BASE44_CLI_FAILED", async () => {
  {
    const { fake } = makeSpawn((_call, respond) => respond({
      error: Object.assign(new Error("Command failed"), { code: 1 }),
      stderr: "Error: invalid api key",
    }));
    const run = await runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, apiKey: KEY, appId: APP });
    assert.equal(run.ok, false);
    assert.equal(run.authRejected, true);
    assert.equal(run.timedOut, false);
    assert.equal(run.exitCode, 1);
    assert.equal(classifyBase44CliFailure(run).code, "BASE44_AUTH_REJECTED");
  }
  {
    const { fake } = makeSpawn((_call, respond) => respond({
      error: Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" }),
    }));
    const run = await runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, apiKey: KEY, appId: APP });
    assert.equal(run.timedOut, true);
    assert.equal(run.authRejected, false);
    assert.equal(classifyBase44CliFailure(run).code, "BASE44_CLI_TIMEOUT");
  }
  {
    const { fake } = makeSpawn((_call, respond) => respond({
      error: Object.assign(new Error("boom"), { code: 2 }),
      stderr: "kaputt",
    }));
    const run = await runBase44Cli({ kind: "whoami" }, { spawn: fake, env: {}, apiKey: KEY, appId: APP });
    assert.equal(run.ok, false);
    assert.equal(run.authRejected, false, "an unrelated stderr must not be misread as auth rejection");
    assert.equal(classifyBase44CliFailure(run).code, "BASE44_CLI_FAILED");
  }
});

test("classifyBase44CliFailure / assertCliOk: canonical codes", () => {
  const mkRun = (over: Partial<Base44CliRun>): Base44CliRun => ({
    ok: false, exitCode: 1, timedOut: false, authRejected: false, stdout: "", stderr: "", durationMs: 1, ...over,
  });
  assert.equal(classifyBase44CliFailure(mkRun({ timedOut: true })).code, "BASE44_CLI_TIMEOUT");
  assert.equal(classifyBase44CliFailure(mkRun({ authRejected: true })).code, "BASE44_AUTH_REJECTED");
  assert.equal(classifyBase44CliFailure(mkRun({})).code, "BASE44_CLI_FAILED");
  assert.throws(() => assertCliOk(mkRun({ authRejected: true })), /BASE44_AUTH_REJECTED/);
  assert.doesNotThrow(() => assertCliOk(mkRun({ ok: true })));
});

test("parseSecretNames: JSON arrays of strings/objects, wrappers, plain text, garbage", () => {
  assert.deepEqual(parseSecretNames('["AGENT_MEMORY_MCP_SECRET","OTHER"]'), ["AGENT_MEMORY_MCP_SECRET", "OTHER"]);
  assert.deepEqual(parseSecretNames('[{"name":"A","masked":true},{"key":"B"},{"secret":"C"}]'), ["A", "B", "C"]);
  assert.deepEqual(parseSecretNames('{"names":["A"]}'), ["A"]);
  assert.deepEqual(parseSecretNames('{"secrets":[{"id":"X"}]}'), ["X"]);
  assert.deepEqual(parseSecretNames('{"data":[{"name":"N"}]}'), ["N"]);
  assert.deepEqual(parseSecretNames("PLAIN_NAME_1\nplain_name-2\n"), ["PLAIN_NAME_1", "plain_name-2"]);
  assert.deepEqual(parseSecretNames(""), []);
  assert.deepEqual(parseSecretNames("not json at all!\nOK_NAME_1"), ["OK_NAME_1"]);
  // masked value forms (NAME=xxxx) are never identifiers: names only
  assert.deepEqual(parseSecretNames("AGENT_MEMORY_MCP_SECRET=xxxxxxxx"), []);
});

test("scrubWhoami: identity allowlist, nested shapes, non-JSON fallback", () => {
  const out = scrubWhoami(JSON.stringify({ id: "u1", email: "a@b.c", apiKey: "b44k_LEAKKEY_0001", token: "x", workspaceId: "w1" }));
  assert.deepEqual(Object.keys(out).sort(), ["email", "id", "workspaceId"]);
  assert.ok(!JSON.stringify(out).includes("b44k_"));
  assert.deepEqual(scrubWhoami(JSON.stringify({ data: { id: "u2", secret: "s", accountId: "ac1" } })), { id: "u2", accountId: "ac1" });
  assert.deepEqual(scrubWhoami(JSON.stringify({ user: { id: "u3", email: "e@x.y" } })), { id: "u3", email: "e@x.y" });
  assert.deepEqual(scrubWhoami("plain text output"), { authenticated: true });
  assert.deepEqual(scrubWhoami(JSON.stringify({ totally: "unrelated" })), { authenticated: true });
});

test("makeBase44CliRunner: per-call deps override the common config", async () => {
  const { calls, fake } = makeSpawn((_call, respond) => respond({}));
  const runner = makeBase44CliRunner({ spawn: fake, env: {}, apiKey: KEY, appId: APP, projectDir: "/common" });
  await runner({ kind: "secretsList" }, { projectDir: "/per-call" });
  assert.equal(calls[0]!.opts.cwd, "/per-call");
  await runner({ kind: "whoami" });
  assert.equal(calls[1]!.opts.cwd, "/common");
});