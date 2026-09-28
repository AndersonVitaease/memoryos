// GITHUB-APP-BOOTSTRAP-01: host-side one-time manifest-code conversion.
//   printf '%s' '<redirect URL or code>' | node --import tsx scripts/github-app-convert.ts
//   node --import tsx scripts/github-app-convert.ts --resolve-installation
// The code is read from STDIN (never argv — argv is visible in ps). Writes:
//   $SECRETS/github-app.private-key.pem  0600 (refuses to overwrite; rotation is scripts/github-app-rotate.ts)
//   $SECRETS/github-app.env              0600 GITHUB_APP_ID=..., GITHUB_INSTALLATION_ID=... (when installed)
// Prints only JSON verdicts with ids, slug, permissions and sha16s — never the PEM/JWT/token.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { convertManifestCode, conversionSummary, parseManifestCode, GitHubAppBootstrapError } from "../src/githubAppBootstrap.ts";
import { loadPrivateKey, mintAppJwt, scrubGitHubAppSecrets, sha16 } from "../src/githubAppAuth.ts";

const secretsDir = process.env.GITHUB_APP_SECRETS_DIR?.trim() || "/opt/eng-mcp-secrets";
const pemPath = join(secretsDir, "github-app.private-key.pem");
const envPath = join(secretsDir, "github-app.env");
const repo = process.env.ENG_MCP_GITHUB_REPO?.trim() || "AndersonVitaease/memoryos";
const base = (process.env.ENG_MCP_GITHUB_APP_API_BASE?.trim() || "https://api.github.com").replace(/\/$/, "");
const statePath = process.env.GITHUB_APP_LAUNCH_STATE_FILE?.trim() || "";

function out(obj: Record<string, unknown>, code = 0): never {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
  process.exit(code);
}

function writeSecret(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, { mode: 0o600, flag: "wx" });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

function readEnvFile(): Record<string, string> {
  if (!existsSync(envPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(\d+)$/.exec(line.trim());
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

function writeEnvFile(appId: string, installationId: string | null): void {
  const lines = [`GITHUB_APP_ID=${appId}`];
  if (installationId) lines.push(`GITHUB_INSTALLATION_ID=${installationId}`);
  if (existsSync(envPath)) renameSync(envPath, `${envPath}.prev`);
  writeSecret(envPath, `${lines.join("\n")}\n`);
}

async function resolveInstallation(appId: string): Promise<string | null> {
  const key = loadPrivateKey({ appId, installationId: "0", privateKeyFile: pemPath });
  const jwt = mintAppJwt(appId, key);
  const res = await fetch(`${base}/repos/${repo}/installation`, {
    headers: { authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "memoryos-eng-mcp" },
    signal: AbortSignal.timeout(15_000)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(scrubGitHubAppSecrets(`installation lookup status=${res.status} ${await res.text()}`));
  const body = await res.json() as { id?: number };
  return typeof body.id === "number" ? String(body.id) : null;
}

async function main(): Promise<void> {
  if (process.argv.includes("--resolve-installation")) {
    const env = readEnvFile();
    if (!env.GITHUB_APP_ID || !existsSync(pemPath)) out({ result: "RED", error: "NOT_BOOTSTRAPPED" }, 1);
    const installationId = await resolveInstallation(env.GITHUB_APP_ID);
    if (!installationId) out({ result: "PENDING_INSTALL", appId: env.GITHUB_APP_ID, repo, hint: "Install App no repositorio e rode de novo" }, 3);
    writeEnvFile(env.GITHUB_APP_ID, installationId);
    out({ result: "GREEN", appId: env.GITHUB_APP_ID, installationId, envFile: envPath });
  }
  if (existsSync(pemPath)) out({ result: "RED", error: "PEM_ALREADY_PRESENT", pemPathSha16: sha16(pemPath), hint: "rotacao = scripts/github-app-rotate.ts" }, 1);
  const input = readFileSync(0, "utf8");
  let expectedState: string | undefined;
  if (statePath && existsSync(statePath)) expectedState = (JSON.parse(readFileSync(statePath, "utf8")) as { state?: string }).state;
  const code = parseManifestCode(input, expectedState);
  const conversion = await convertManifestCode(code);
  writeSecret(pemPath, conversion.pem.endsWith("\n") ? conversion.pem : `${conversion.pem}\n`);
  const appId = String(conversion.appId);
  let installationId: string | null = null;
  try { installationId = await resolveInstallation(appId); } catch { installationId = null; }
  writeEnvFile(appId, installationId);
  out({ result: installationId ? "GREEN" : "PENDING_INSTALL", ...conversionSummary(conversion), installationId, pemFile: pemPath, envFile: envPath, stateChecked: Boolean(expectedState) }, installationId ? 0 : 3);
}

main().catch((e: unknown) => {
  const code = e instanceof GitHubAppBootstrapError ? e.code : "CONVERT_FAILED";
  out({ result: "RED", error: code, detail: scrubGitHubAppSecrets(e instanceof Error ? e.message : String(e)) }, 1);
});
