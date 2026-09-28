// GITHUB-APP-BOOTSTRAP-01: GitHub App private-key rotation (host side).
//   1. GitHub UI: App settings -> Private keys -> Generate a private key (the OLD key stays valid).
//   2. Put the new .pem on the VPS at $SECRETS/github-app.private-key.pem.new (mode 0600).
//   3. node --import tsx scripts/github-app-rotate.ts
//      -> validates the new key (RSA, 0600), proves GitHub accepts it (GET /app with a JWT
//         signed by the NEW key), swaps it in atomically (old kept as .prev, 0600).
//   4. Reload: runner restart (LoadCredential copies are taken at unit start) + redeploy;
//      the token cache is keyed by the key file identity, so the next call mints with the new key.
//   5. E2E: scripts/github-app-verify.sh GREEN + engineering.github.read get_repo in production.
//   6. GitHub UI: delete the OLD key (fingerprint printed as oldKeySha16) — operator decision.
//   --rollback restores .prev. Output: JSON verdicts + key fingerprints (sha16 of SPKI) only.
import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadPrivateKey, mintAppJwt, publicKeyFingerprint, scrubGitHubAppSecrets } from "../src/githubAppAuth.ts";

const secretsDir = process.env.GITHUB_APP_SECRETS_DIR?.trim() || "/opt/eng-mcp-secrets";
const current = join(secretsDir, "github-app.private-key.pem");
const incoming = `${current}.new`;
const previous = `${current}.prev`;
const envPath = join(secretsDir, "github-app.env");
const base = (process.env.ENG_MCP_GITHUB_APP_API_BASE?.trim() || "https://api.github.com").replace(/\/$/, "");

function out(obj: Record<string, unknown>, code = 0): never {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
  process.exit(code);
}

function appIdFromEnv(): string {
  const m = /^GITHUB_APP_ID=(\d{1,20})$/m.exec(existsSync(envPath) ? readFileSync(envPath, "utf8") : "");
  if (!m) out({ result: "RED", error: "NOT_BOOTSTRAPPED" }, 1);
  return m[1];
}

function fingerprint(file: string, appId: string): string {
  return publicKeyFingerprint(loadPrivateKey({ appId, installationId: "0", privateKeyFile: file }));
}

// The fingerprint GitHub shows next to each private key in the App settings
// (SHA256 of the public key DER, base64) — public, lets the operator pick the old key to delete.
export function githubUiFingerprint(key: KeyObject): string {
  return `SHA256:${createHash("sha256").update(createPublicKey(key).export({ type: "spki", format: "der" })).digest("base64")}`;
}

async function main(): Promise<void> {
  const appId = appIdFromEnv();
  if (process.argv.includes("--rollback")) {
    if (!existsSync(previous)) out({ result: "RED", error: "NO_PREVIOUS_KEY" }, 1);
    renameSync(previous, current);
    out({ result: "ROLLED_BACK", keySha16: fingerprint(current, appId) });
  }
  if (!existsSync(incoming)) out({ result: "RED", error: "NEW_KEY_MISSING", expected: "github-app.private-key.pem.new" }, 1);
  if ((statSync(incoming).mode & 0o077) !== 0) out({ result: "RED", error: "NEW_KEY_MODE", hint: "chmod 600" }, 1);
  const newKey = loadPrivateKey({ appId, installationId: "0", privateKeyFile: incoming });
  const newKeySha16 = publicKeyFingerprint(newKey);
  const oldKeySha16 = existsSync(current) ? fingerprint(current, appId) : null;
  const oldKeyGithubFingerprint = existsSync(current) ? githubUiFingerprint(loadPrivateKey({ appId, installationId: "0", privateKeyFile: current })) : null;
  if (oldKeySha16 === newKeySha16) out({ result: "RED", error: "SAME_KEY", keySha16: newKeySha16 }, 1);
  const res = await fetch(`${base}/app`, {
    headers: { authorization: `Bearer ${mintAppJwt(appId, newKey)}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "memoryos-eng-mcp" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!res.ok) out({ result: "RED", error: "NEW_KEY_REJECTED_BY_GITHUB", status: res.status, newKeySha16 }, 1);
  const app = await res.json() as { id?: number; slug?: string };
  if (String(app.id) !== appId) out({ result: "RED", error: "APP_ID_MISMATCH", newKeySha16 }, 1);
  if (existsSync(current)) renameSync(current, previous);
  renameSync(incoming, current);
  chmodSync(current, 0o600);
  out({ result: "SWAPPED", appId, slug: app.slug ?? null, newKeySha16, oldKeySha16, newKeyGithubFingerprint: githubUiFingerprint(newKey), oldKeyGithubFingerprint, next: ["runner restart + redeploy", "scripts/github-app-verify.sh GREEN + github.read get_repo", "operator: delete old key in GitHub UI (oldKeySha16)"] });
}

main().catch((e: unknown) => out({ result: "RED", error: "ROTATE_FAILED", detail: scrubGitHubAppSecrets(e instanceof Error ? e.message : String(e)) }, 1));
