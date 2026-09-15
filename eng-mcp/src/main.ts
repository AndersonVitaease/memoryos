import { execFile, execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngineeringHttpServer } from "./server.ts";
import { provisionComplianceEngines } from "./complianceAssess.ts";
import type { TokenRecord } from "./policy.ts";

export type OperationalConfig = { host: "127.0.0.1"; port: number; repositoryId: string; repositoryRoot: string; tokenRegistryFile: string; tokens: TokenRecord[] };
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadOperationalConfig(env: NodeJS.ProcessEnv = process.env): Promise<OperationalConfig> {
  const host = env.ENG_MCP_HOST ?? "127.0.0.1"; if (host !== "127.0.0.1") throw new Error("ENG_MCP_HOST_INVALID");
  const port = Number(env.ENG_MCP_PORT ?? "8787"); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ENG_MCP_PORT_INVALID");
  const repositoryId = env.ENG_MCP_REPOSITORY_ID ?? "memoryos"; if (!repositoryId) throw new Error("ENG_MCP_REPOSITORY_ID_INVALID");
  const repositoryRoot = await realpath(env.ENG_MCP_REPOSITORY_ROOT ?? defaultRoot).catch(() => { throw new Error("ENG_MCP_REPOSITORY_ROOT_INVALID"); });
  const tokenRegistryFile = env.ENG_MCP_TOKEN_REGISTRY_FILE; if (!tokenRegistryFile) throw new Error("ENG_MCP_TOKEN_REGISTRY_FILE_REQUIRED");
  let parsed: { tokens?: unknown }; try { parsed = JSON.parse(await readFile(tokenRegistryFile, "utf8")); } catch { throw new Error("ENG_MCP_TOKEN_REGISTRY_INVALID"); }
  if (!Array.isArray(parsed.tokens) || !parsed.tokens.length) throw new Error("ENG_MCP_TOKEN_REGISTRY_INVALID");
  for (const candidate of parsed.tokens) { const token = candidate as Partial<TokenRecord>; if (typeof token.tokenHash !== "string" || !/^[a-f0-9]{64}$/i.test(token.tokenHash) || typeof token.subject !== "string" || !Array.isArray(token.scopes) || !Array.isArray(token.allowedRepositoryIds) || !Number.isFinite(Date.parse(token.expiresAt ?? ""))) throw new Error("ENG_MCP_TOKEN_REGISTRY_INVALID"); }
  try { execFileSync("git", ["--version"], { stdio: "ignore" }); } catch { throw new Error("ENG_MCP_GIT_UNAVAILABLE"); }
  return { host, port, repositoryId, repositoryRoot, tokenRegistryFile, tokens: parsed.tokens as TokenRecord[] };
}

// GN05 minimal provisioning: make GitNexus 1.6.11 available to the ephemeral
// `gitnexus mcp` stdio child used by engineering.code.impact, and index the real
// ENG-MCP source this process serves. One-shot at boot, fail-closed: any
// provisioning gap leaves engineering.code.impact degraded (UNKNOWN), never
// wrong. No daemon, no proxy, no new infrastructure.
export function provisionGitNexus(env: NodeJS.ProcessEnv = process.env): void {
  const base = env.ENG_MCP_REPOSITORY_ROOT && existsSync(env.ENG_MCP_REPOSITORY_ROOT) ? env.ENG_MCP_REPOSITORY_ROOT : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const provisionRoot = existsSync(path.join(base, "package.json")) ? base : path.join(base, "eng-mcp");
  if (!existsSync(path.join(provisionRoot, "package.json"))) return;
  const bin = path.join(provisionRoot, "node_modules", ".bin", "gitnexus");
  const log = (message: string) => { try { appendFileSync(path.join(provisionRoot, "tmp", "gitnexus-provision.log"), `${new Date().toISOString()} ${message}\n`); } catch { /* observability only */ } };
  try { mkdirSync(path.join(provisionRoot, "tmp"), { recursive: true }); } catch { /* observability only */ }
  log(`provision-start provisionRoot=${provisionRoot} binExists=${existsSync(bin)}`);
  const run = (command: string, args: string[]) => new Promise<void>((resolve) => {
    execFile(command, args, { cwd: provisionRoot, stdio: "ignore", timeout: 180_000 }, (error) => {
      if (error) { console.error(`ENG_MCP_GITNEXUS_STEP_FAILED: ${command} ${args.join(" ")}: ${error.message}`); log(`step-failed command=${command} args=${args.join(" ")} error=${error.message}`); }
      else log(`step-ok command=${command} args=${args.join(" ")}`);
      resolve();
    });
  });
  void (async () => {
    // Background provisioning: the server becomes healthy first (the release
    // runner validates the candidate catalog while GitNexus is still
    // installing/indexing). engineering.code.impact fail-closes until ready.
    if (!existsSync(bin)) await run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "gitnexus@1.6.11"]);
    if (!existsSync(bin)) { console.error("ENG_MCP_GITNEXUS_UNAVAILABLE: gitnexus@1.6.11 not provisioned; engineering.code.impact stays fail-closed"); log("unavailable: bin still absent after npm install step"); return; }
    process.env.ENG_MCP_GITNEXUS_COMMAND = env.ENG_MCP_GITNEXUS_COMMAND ?? bin;
    log(`command-resolved command=${process.env.ENG_MCP_GITNEXUS_COMMAND}`);
    await run(bin, ["analyze", "--skip-git"]);
    console.log(`ENG-MCP GitNexus provisioned command=${process.env.ENG_MCP_GITNEXUS_COMMAND} version=1.6.11 index=ready`);
    log("provision-complete index=ready");
  })();
}

// SB-01 minimal external dependency provisioning: make the official E2B SDK
// (e2b@2.49.1) available to engineering.sandbox.create/destroy without touching
// package.json (HIGH_IMPACT manifest, no authorized write channel). One-shot at
// boot, fail-closed: any provisioning gap leaves the sandbox tools answering
// SANDBOX_PROVIDER_UNAVAILABLE, never fake data. Same proven pattern as GitNexus
// above (npm install --no-save); no new package manager, no generic installer,
// no new abstraction.
export function provisionSandboxSdk(env: NodeJS.ProcessEnv = process.env): void {
  const base = env.ENG_MCP_REPOSITORY_ROOT && existsSync(env.ENG_MCP_REPOSITORY_ROOT) ? env.ENG_MCP_REPOSITORY_ROOT : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const provisionRoot = existsSync(path.join(base, "package.json")) ? base : path.join(base, "eng-mcp");
  if (!existsSync(path.join(provisionRoot, "package.json"))) return;
  const sdk = path.join(provisionRoot, "node_modules", "e2b");
  const log = (message: string) => { try { appendFileSync(path.join(provisionRoot, "tmp", "sandbox-sdk-provision.log"), `${new Date().toISOString()} ${message}\n`); } catch { /* observability only */ } };
  try { mkdirSync(path.join(provisionRoot, "tmp"), { recursive: true }); } catch { /* observability only */ }
  log(`provision-start provisionRoot=${provisionRoot} sdkExists=${existsSync(sdk)}`);
  if (existsSync(sdk)) { log("sdk-already-present"); return; }
  const run = (command: string, args: string[]) => new Promise<void>((resolve) => {
    execFile(command, args, { cwd: provisionRoot, stdio: "ignore", timeout: 300_000 }, (error) => {
      if (error) { console.error(`ENG_MCP_SANDBOX_SDK_STEP_FAILED: ${command} ${args.join(" ")}: ${error.message}`); log(`step-failed command=${command} args=${args.join(" ")} error=${error.message}`); }
      else log(`step-ok command=${command} args=${args.join(" ")}`);
      resolve();
    });
  });
  void (async () => {
    // Background provisioning: the server becomes healthy first; the sandbox
    // tools fail closed (SANDBOX_PROVIDER_UNAVAILABLE) until the SDK is present.
    await run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "e2b@2.49.1"]);
    if (!existsSync(sdk)) { console.error("ENG_MCP_SANDBOX_SDK_UNAVAILABLE: e2b@2.49.1 not provisioned; engineering.sandbox.* stays fail-closed"); log("unavailable: sdk still absent after npm install step"); return; }
    console.log("ENG-MCP sandbox SDK provisioned package=e2b@2.49.1");
    log("provision-complete sdk=ready");
  })();
}

// TYPECHECK minimal provisioning: make TypeScript ^5.9.3 and @types/node@^20
// (node globals for the compiler) available to the
// engineering.typecheck.run "typescript-noemit" profile, which resolves
// <authorizedRoot>/node_modules/typescript/bin/tsc on the repository bind
// mount. typescript is now declared in package.json, but @types/node is not
// (HIGH_IMPACT manifest, no authorized write channel) and undeclared
// node_modules content is pruned by any npm reconciliation, so the node types
// must be re-asserted at boot. One-shot at boot, fail-closed: a provisioning
// gap leaves engineering.typecheck.run reporting the missing compiler,
// never a fake pass. The typecheck profile reads the compiler from the
// authorized root, so the repository tree wins here - the reverse of
// provisionClaudeAgentSdk below. Same proven pattern as provisionSandboxSdk
// above (npm install --no-save); no new package manager, no generic
// installer, no new abstraction.
export function provisionTypeScript(env: NodeJS.ProcessEnv = process.env): void {
  const base = env.ENG_MCP_REPOSITORY_ROOT && existsSync(env.ENG_MCP_REPOSITORY_ROOT) ? env.ENG_MCP_REPOSITORY_ROOT : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const provisionRoot = existsSync(path.join(base, "package.json")) ? base : path.join(base, "eng-mcp");
  if (!existsSync(path.join(provisionRoot, "package.json"))) return;
  const compiler = path.join(provisionRoot, "node_modules", "typescript");
  const nodeTypes = path.join(provisionRoot, "node_modules", "@types", "node");
  const log = (message: string) => { try { appendFileSync(path.join(provisionRoot, "tmp", "typescript-provision.log"), `${new Date().toISOString()} ${message}\n`); } catch { /* observability only */ } };
  try { mkdirSync(path.join(provisionRoot, "tmp"), { recursive: true }); } catch { /* observability only */ }
  log(`provision-start provisionRoot=${provisionRoot} compilerExists=${existsSync(compiler)}`);
  if (existsSync(compiler) && existsSync(nodeTypes)) { log("compiler-and-node-types-already-present"); return; }
  const run = (command: string, args: string[]) => new Promise<void>((resolve) => {
    execFile(command, args, { cwd: provisionRoot, stdio: "ignore", timeout: 300_000 }, (error) => {
      if (error) { console.error(`ENG_MCP_TYPESCRIPT_STEP_FAILED: ${command} ${args.join(" ")}: ${error.message}`); log(`step-failed command=${command} args=${args.join(" ")} error=${error.message}`); }
      else log(`step-ok command=${command} args=${args.join(" ")}`);
      resolve();
    });
  });
  void (async () => {
    // Background provisioning: the server becomes healthy first; the typecheck
    // profile fails visibly (MODULE_NOT_FOUND) until the compiler is present.
    await run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "typescript@^5.9.3", "@types/node@^20"]);
    if (!existsSync(compiler) || !existsSync(nodeTypes)) { console.error("ENG_MCP_TYPESCRIPT_UNAVAILABLE: typescript@^5.9.3 or @types/node@^20 not provisioned; engineering.typecheck.run stays fail-visible"); log("unavailable: compiler or node types still absent after npm install step"); return; }
    console.log("ENG-MCP TypeScript provisioned package=typescript@^5.9.3 node-types=@types/node@^20");
    log("provision-complete compiler=ready node-types=ready");
  })();
}

// GH-02 minimal provisioning: make the official Claude Agent SDK
// (@anthropic-ai/claude-agent-sdk@0.3.268) available to
// src/harness/ClaudeAgentRuntime.ts without touching package.json (HIGH_IMPACT
// manifest, no authorized write channel). One-shot at boot, fail-closed: a
// provisioning gap leaves the runtime failing closed with
// CLAUDE_AGENT_SDK_UNAVAILABLE, never a fake/mock. Same proven pattern as
// provisionSandboxSdk above (npm install --no-save); no new package manager,
// no generic installer, no new abstraction.
export function provisionClaudeAgentSdk(env: NodeJS.ProcessEnv = process.env): void {
  // GH-03A.2: install into the module tree the RUNNING PROCESS uses (in the
  // official image that is /app, this file being /app/src/main.ts).
  // ENG_MCP_REPOSITORY_ROOT points at the host bind mount, whose node_modules
  // the /app process cannot resolve modules from, so the process tree wins
  // whenever it already has a package.json. Behavior elsewhere unchanged.
  const processRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const base = existsSync(path.join(processRoot, "package.json")) ? processRoot : env.ENG_MCP_REPOSITORY_ROOT && existsSync(env.ENG_MCP_REPOSITORY_ROOT) ? env.ENG_MCP_REPOSITORY_ROOT : processRoot;
  const provisionRoot = existsSync(path.join(base, "package.json")) ? base : path.join(base, "eng-mcp");
  if (!existsSync(path.join(provisionRoot, "package.json"))) return;
  const sdk = path.join(provisionRoot, "node_modules", "@anthropic-ai", "claude-agent-sdk");
  const log = (message: string) => { try { appendFileSync(path.join(provisionRoot, "tmp", "claude-agent-sdk-provision.log"), `${new Date().toISOString()} ${message}\n`); } catch { /* observability only */ } };
  try { mkdirSync(path.join(provisionRoot, "tmp"), { recursive: true }); } catch { /* observability only */ }
  log(`provision-start provisionRoot=${provisionRoot} sdkExists=${existsSync(sdk)}`);
  if (existsSync(sdk)) { log("sdk-already-present"); return; }
  const run = (command: string, args: string[]) => new Promise<void>((resolve) => {
    execFile(command, args, { cwd: provisionRoot, stdio: "ignore", timeout: 300_000 }, (error) => {
      if (error) { console.error(`ENG_MCP_CLAUDE_AGENT_SDK_STEP_FAILED: ${command} ${args.join(" ")}: ${error.message}`); log(`step-failed command=${command} args=${args.join(" ")} error=${error.message}`); }
      else log(`step-ok command=${command} args=${args.join(" ")}`);
      resolve();
    });
  });
  void (async () => {
    // Background provisioning: the server becomes healthy first; the runtime
    // fails closed (CLAUDE_AGENT_SDK_UNAVAILABLE) until the SDK is present.
    await run("npm", ["install", "--no-save", "--no-audit", "--no-fund", "@anthropic-ai/claude-agent-sdk@0.3.268"]);
    if (!existsSync(sdk)) { console.error("ENG_MCP_CLAUDE_AGENT_SDK_UNAVAILABLE: @anthropic-ai/claude-agent-sdk@0.3.268 not provisioned; ClaudeAgentRuntime stays fail-closed"); log("unavailable: sdk still absent after npm install step"); return; }
    console.log("ENG-MCP Claude Agent SDK provisioned package=@anthropic-ai/claude-agent-sdk@0.3.268");
    log("provision-complete sdk=ready");
  })();
}

export async function startOperationalServer(env: NodeJS.ProcessEnv = process.env) {
  provisionGitNexus(env);
  provisionSandboxSdk(env);
  provisionClaudeAgentSdk(env);
  provisionTypeScript(env);
  provisionComplianceEngines(env);
  const config = await loadOperationalConfig(env); const server = await createEngineeringHttpServer({ repositoryId: config.repositoryId, configuredRoot: config.repositoryRoot, tokenRegistry: config.tokens });
  await new Promise<void>((resolve, reject) => { server.once("error", (error: NodeJS.ErrnoException) => reject(new Error(error.code === "EADDRINUSE" ? "ENG_MCP_PORT_IN_USE" : "ENG_MCP_START_FAILED"))); server.listen(config.port, config.host, resolve); });
  console.log(`ENG-MCP started host=${config.host} port=${config.port} repositoryId=${config.repositoryId} repositoryRoot=${config.repositoryRoot} tokens=${config.tokens.length} protocol=streamable-http endpoint=/mcp`);
  return { server, config };
}

async function main() { const { server } = await startOperationalServer(); let closed = false; const shutdown = () => { if (closed) return; closed = true; server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5_000).unref(); }; process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch((error) => { console.error(error instanceof Error ? error.message : "ENG_MCP_START_FAILED"); process.exitCode = 1; });