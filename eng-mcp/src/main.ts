import { execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngineeringHttpServer } from "./server.ts";
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

export async function startOperationalServer(env: NodeJS.ProcessEnv = process.env) {
  const config = await loadOperationalConfig(env); const server = await createEngineeringHttpServer({ repositoryId: config.repositoryId, configuredRoot: config.repositoryRoot, tokenRegistry: config.tokens });
  await new Promise<void>((resolve, reject) => { server.once("error", (error: NodeJS.ErrnoException) => reject(new Error(error.code === "EADDRINUSE" ? "ENG_MCP_PORT_IN_USE" : "ENG_MCP_START_FAILED"))); server.listen(config.port, config.host, resolve); });
  console.log(`ENG-MCP started host=${config.host} port=${config.port} repositoryId=${config.repositoryId} repositoryRoot=${config.repositoryRoot} tokens=${config.tokens.length} protocol=streamable-http endpoint=/mcp`);
  return { server, config };
}

async function main() { const { server } = await startOperationalServer(); let closed = false; const shutdown = () => { if (closed) return; closed = true; server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5_000).unref(); }; process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main().catch((error) => { console.error(error instanceof Error ? error.message : "ENG_MCP_START_FAILED"); process.exitCode = 1; });