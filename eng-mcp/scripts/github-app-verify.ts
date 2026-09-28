// GH-APP-TOKEN-01: read-only end-to-end check of the GitHub App setup, using
// the SAME module the eng-mcp runs (src/githubAppAuth.ts): config → PEM (mode
// 0600, RSA) → RS256 JWT → installation token → GET /repos/{repo}. Prints only
// verdicts, sha16 fingerprints, permission names and expiry — never the PEM,
// the JWT or the token. Exit 0 = all green, 1 = a check failed, 2 = App not
// configured. Mutates nothing (the token exchange is the only POST, and it
// only mints a short-lived read token that dies on its own).
import { statSync } from "node:fs";
import {
  GitHubAppAuthError, getInstallationToken, loadPrivateKey, mintAppJwt, publicKeyFingerprint,
  readGitHubAppConfig, scrubGitHubAppSecrets, sha16
} from "../src/githubAppAuth.ts";

const lines: string[] = [];
const say = (check: string, verdict: "OK" | "FAIL" | "SKIP", note = ""): void => { lines.push(`${verdict.padEnd(4)} ${check}${note ? ` — ${note}` : ""}`); };
const finish = (code: number): never => { for (const line of lines) console.log(scrubGitHubAppSecrets(line)); console.log(`RESULT ${code === 0 ? "GREEN" : code === 2 ? "NOT_CONFIGURED" : "RED"}`); process.exit(code); };

const repo = process.env.ENG_MCP_GITHUB_REPO?.trim() || "AndersonVitaease/memoryos";
const base = process.env.ENG_MCP_GITHUB_APP_API_BASE?.trim() || "https://api.github.com";

let config;
try { config = readGitHubAppConfig(); }
catch (error) { say("config", "FAIL", error instanceof Error ? error.message : String(error)); finish(1); }
if (!config) { say("config", "SKIP", "GITHUB_APP_ID/GITHUB_INSTALLATION_ID not set — eng-mcp would use the PAT fallback"); finish(2); }
say("config", "OK", `appId sha16=${sha16(config.appId)} installationId sha16=${sha16(config.installationId)}`);

try {
  const mode = statSync(config.privateKeyFile).mode & 0o777;
  if ((mode & 0o077) !== 0) { say("key file mode", "FAIL", `mode ${mode.toString(8)} — must be 0600 (chmod 600)`); finish(1); }
  say("key file mode", "OK", mode.toString(8));
} catch { say("key file mode", "FAIL", `not found (path sha16=${sha16(config.privateKeyFile)})`); finish(1); }

try {
  const key = loadPrivateKey(config);
  say("private key", "OK", `RSA, public fingerprint sha16=${publicKeyFingerprint(key)}`);
  const jwt = mintAppJwt(config.appId, key);
  const header = JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString("utf8"));
  say("jwt", header.alg === "RS256" ? "OK" : "FAIL", `alg=${header.alg}`);
} catch (error) { say("private key", "FAIL", error instanceof Error ? error.message : String(error)); finish(1); }

let token = "";
try {
  const installation = await getInstallationToken(config);
  token = installation.token;
  const perms = Object.entries(installation.permissions).map(([name, level]) => `${name}:${level}`).join(",") || "(none)";
  say("installation token", "OK", `sha16=${sha16(token)} expiresAt=${new Date(installation.expiresAtMs).toISOString()} permissions=${perms} selection=${installation.repositorySelection ?? "?"}`);
  const writes = Object.entries(installation.permissions).filter(([name, level]) => level !== "read" && name !== "metadata");
  if (writes.length > 0) say("least privilege", "FAIL", `non-read permissions granted: ${writes.map(([n, l]) => `${n}:${l}`).join(",")}`);
  else say("least privilege", "OK", "read-only");
} catch (error) { say("installation token", "FAIL", error instanceof GitHubAppAuthError ? error.message : String(error)); finish(1); }

try {
  const response = await fetch(`${base}/repos/${repo}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "memoryos-eng-mcp (github-app-verify)" }, redirect: "error" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status !== 200) { say(`GET /repos/${repo}`, "FAIL", `HTTP ${response.status} ${typeof body.message === "string" ? body.message : ""}`); finish(1); }
  say(`GET /repos/${repo}`, body.full_name === repo ? "OK" : "FAIL", `full_name=${String(body.full_name)} private=${String(body.private)}`);
} catch (error) { say(`GET /repos/${repo}`, "FAIL", error instanceof Error ? error.message : String(error)); finish(1); }

finish(lines.some((line) => line.startsWith("FAIL")) ? 1 : 0);
