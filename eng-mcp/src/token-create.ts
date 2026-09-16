import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function createToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const file = env.ENG_MCP_TOKEN_REGISTRY_FILE; const subject = env.ENG_MCP_TOKEN_SUBJECT; const expiresAt = env.ENG_MCP_TOKEN_EXPIRES_AT; const scopes = env.ENG_MCP_TOKEN_SCOPES?.split(",").filter(Boolean); const repositoryId = env.ENG_MCP_REPOSITORY_ID ?? "memoryos";
  if (!file || !subject || !expiresAt || !scopes?.length || !Number.isFinite(Date.parse(expiresAt))) throw new Error("ENG_MCP_TOKEN_CREATE_CONFIG_INVALID");
  await mkdir(path.dirname(file), { recursive: true }); let registry: { tokens: unknown[] } = { tokens: [] }; try { const parsed: unknown = JSON.parse(await readFile(file, "utf8")); if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { tokens?: unknown }).tokens)) throw new Error("ENG_MCP_TOKEN_REGISTRY_INVALID"); registry = parsed as { tokens: unknown[] }; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("ENG_MCP_TOKEN_REGISTRY_INVALID"); }
  const bearer = randomBytes(32).toString("base64url"); registry.tokens.push({ tokenHash: createHash("sha256").update(bearer).digest("hex"), subject, scopes, allowedRepositoryIds: [repositoryId], expiresAt, revokedAt: null });
  const temporary = `${file}.tmp`; await writeFile(temporary, JSON.stringify(registry, null, 2), { encoding: "utf8", mode: 0o600 }); await rename(temporary, file); return bearer;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void createToken().then((bearer) => console.log(`ENG_MCP_BEARER=${bearer}`)).catch((error) => { console.error(error instanceof Error ? error.message : "ENG_MCP_TOKEN_CREATE_FAILED"); process.exitCode = 1; });
}
