import { createHash, timingSafeEqual } from "node:crypto";
import { realpath, lstat, readFile, access } from "node:fs/promises";
import path from "node:path";

export class EngineeringError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = "EngineeringError";
    this.code = code;
  }
}

export type TokenRecord = {
  tokenHash: string;
  subject: string;
  scopes: string[];
  allowedRepositoryIds: string[];
  expiresAt: string;
  revokedAt?: string | null;
};

export type AuthenticatedSubject = Pick<TokenRecord, "subject" | "scopes">;

const sensitiveNames = new Set([
  ".npmrc", ".pypirc", ".netrc", "id_rsa", "id_ed25519", "credentials.json",
  "service-account.json", "secrets.json", "secret.json"
]);
const sensitiveDirs = new Set([".git", ".ssh", ".aws", ".gnupg", ".agents", ".codex"]);
const allowedExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".yaml",
  ".yml", ".toml", ".md", ".txt", ".css", ".html", ".ps1", ".sh"
]);

function isHighImpactPath(relativePath: string): boolean {
  return /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i.test(relativePath) ||
    relativePath.startsWith(".github/workflows/") || /^(infra|infrastructure|deploy)\//i.test(relativePath);
}

// MANIFEST-GOVERNED-EDIT-01: the EXACT, root-level paths the governed manifest-edit
// flow (engineering.manifest.edit) may touch. Everything else - including every other
// isHighImpactPath match and every extension-denied file - keeps its existing hard
// block; the governed flow re-checks this allowlist and is audited end to end.
export const MANIFEST_GOVERNED_PATHS: readonly string[] = ["package.json", "package-lock.json", "Dockerfile"];
export function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/");
  const name = segments.at(-1) ?? "";
  return segments.some((segment) => sensitiveDirs.has(segment)) ||
    name === ".env" || name.startsWith(".env.") || sensitiveNames.has(name) ||
    /^(oauth-client|firebase-adminsdk).*\.json$/i.test(name) ||
    /\.(pem|key|p12|pfx|kdbx)$/i.test(name);
}

export function assertNoSensitiveContent(value: string | Buffer): void {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\b(?:client_secret|access_token|refresh_token|password|private_key)\s*[:=]\s*["']?[^\s"']{8,}/i
  ];
  if (patterns.some((pattern) => pattern.test(text))) {
    throw new EngineeringError("SENSITIVE_CONTENT_BLOCKED");
  }
}

export function parseBearerAuthorization(header: string | undefined): string {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
  if (!match) throw new EngineeringError("AUTHENTICATION_REQUIRED");
  return match[1];
}

export function authenticateBearer(
  authorization: string | undefined,
  records: TokenRecord[],
  repositoryId: string,
  now = new Date(), requiredScope: string | null | undefined = "engineering:read"
): AuthenticatedSubject {
  const token = parseBearerAuthorization(authorization);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = records.find((candidate) => {
    const candidateHash = Buffer.from(candidate.tokenHash, "hex");
    const actualHash = Buffer.from(tokenHash, "hex");
    return candidateHash.length === actualHash.length && timingSafeEqual(candidateHash, actualHash);
  });
  if (!record) throw new EngineeringError("AUTHENTICATION_INVALID");
  if (record.revokedAt) throw new EngineeringError("AUTHENTICATION_REVOKED");
  if (Date.parse(record.expiresAt) <= now.getTime()) throw new EngineeringError("AUTHENTICATION_EXPIRED");
  if (requiredScope && !record.scopes.includes(requiredScope)) throw new EngineeringError("AUTHORIZATION_SCOPE_REQUIRED");
  if (!record.allowedRepositoryIds.includes(repositoryId)) throw new EngineeringError("AUTHORIZATION_REPOSITORY_DENIED");
  return { subject: record.subject, scopes: record.scopes };
}

export class RepositoryPolicy {
  readonly authorizedRoot: string;
  private constructor(authorizedRoot: string) { this.authorizedRoot = authorizedRoot; }

  static async create(configuredRoot: string): Promise<RepositoryPolicy> {
    return new RepositoryPolicy(await realpath(configuredRoot));
  }

  async resolve(relativePath = ""): Promise<{ absolutePath: string; relativePath: string }> {
    if (typeof relativePath !== "string" || /[\0\x00-\x1f\x7f]/.test(relativePath)) {
      throw new EngineeringError("PATH_INVALID");
    }
    if (relativePath.includes("\\") || relativePath === ".." || relativePath.startsWith("../") ||
      path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
      /^[A-Za-z]:/.test(relativePath) || relativePath.startsWith("//")) {
      throw new EngineeringError("PATH_DENIED");
    }
    if (isSensitivePath(relativePath)) throw new EngineeringError("PATH_DENIED");
    const lexical = path.resolve(this.authorizedRoot, relativePath || ".");
    const realTarget = await realpath(lexical).catch(() => { throw new EngineeringError("PATH_NOT_FOUND"); });
    const relative = path.relative(this.authorizedRoot, realTarget);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new EngineeringError("PATH_DENIED");
    }
    const portable = relative.replaceAll(path.sep, "/");
    if (isSensitivePath(portable)) throw new EngineeringError("PATH_DENIED");
    return { absolutePath: realTarget, relativePath: portable };
  }

  assertReadableExtension(relativePath: string): void {
    if (!allowedExtensions.has(path.extname(relativePath).toLowerCase())) {
      throw new EngineeringError("FILE_TYPE_DENIED");
    }
  }

  async resolveWritable(relativePath: string): Promise<{ absolutePath: string; relativePath: string; parentPath: string }> {
    if (typeof relativePath !== "string" || /[\0\x00-\x1f\x7f]/.test(relativePath) || relativePath.includes("\\") || relativePath === ".." || relativePath.startsWith("../") || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath) || relativePath.startsWith("//") || isSensitivePath(relativePath)) throw new EngineeringError("PATH_DENIED");
    this.assertReadableExtension(relativePath);
    const absolutePath = path.resolve(this.authorizedRoot, relativePath);
    const parentPath = await realpath(path.dirname(absolutePath)).catch(() => { throw new EngineeringError("PATH_NOT_FOUND"); });
    const relativeParent = path.relative(this.authorizedRoot, parentPath);
    if (path.isAbsolute(relativeParent) || relativeParent === ".." || relativeParent.startsWith(`..${path.sep}`)) throw new EngineeringError("PATH_DENIED");
    const portable = path.relative(this.authorizedRoot, absolutePath).replaceAll(path.sep, "/");
    if (portable.startsWith("../") || isSensitivePath(portable) || isHighImpactPath(portable)) throw new EngineeringError("HIGH_IMPACT_WRITE_BLOCKED");
    return { absolutePath, relativePath: portable, parentPath };
  }

  async resolveGitStageable(relativePath: string): Promise<{ absolutePath: string; relativePath: string }> {
    const target = await this.resolve(relativePath); this.assertReadableExtension(target.relativePath);
    if (isHighImpactPath(target.relativePath)) throw new EngineeringError("HIGH_IMPACT_GIT_BLOCKED");
    const info = await lstat(target.absolutePath); if (!info.isFile() || info.isSymbolicLink()) throw new EngineeringError("PATH_DENIED");
    return target;
  }

  async readUtf8(relativePath: string, maxBytes: number): Promise<{ text: string; relativePath: string }> {
    const target = await this.resolve(relativePath);
    this.assertReadableExtension(target.relativePath);
    const info = await lstat(target.absolutePath);
    if (!info.isFile() || info.size > maxBytes) throw new EngineeringError("FILE_LIMIT_EXCEEDED");
    const content = await readFile(target.absolutePath);
    if (content.includes(0)) throw new EngineeringError("BINARY_FILE_DENIED");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(content); }
    catch { throw new EngineeringError("BINARY_FILE_DENIED"); }
    assertNoSensitiveContent(text);
    return { text, relativePath: target.relativePath };
  }
}
