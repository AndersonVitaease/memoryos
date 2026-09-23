// SECURITY-SCAN-01 check catalog + M1 matchers (deterministic, hash16-only).
// Every check is versioned SEC-NNN with severity, structured remediation text and
// a known-false-positive note (golden rule: a missing REAL finding means the rule
// is wrong, never "clean environment"). Secret VALUES are hashed at capture —
// nothing here ever returns raw secret material.
import * as z from "zod/v4";

export const SECURITY_SCAN_MODULES = ["secrets", "exposure", "hygiene", "registry"] as const;
export type SecurityScanModule = (typeof SECURITY_SCAN_MODULES)[number];

export const securityScanInputSchema = z
  .object({
    target: z.string().min(1).max(200),
    modules: z.array(z.enum(SECURITY_SCAN_MODULES)).max(SECURITY_SCAN_MODULES.length).optional(),
    mode: z.enum(["scan", "plan"]).optional()
  })
  .strict();
export type SecurityScanInput = z.infer<typeof securityScanInputSchema>;

export type SecSeverity = "info" | "warn" | "critical";

export type SecCheckMeta = {
  checkId: string;
  module: SecurityScanModule;
  kind: string;
  severity: SecSeverity;
  remediation: string;
  fpNote: string;
};

export const SEC_CHECKS: Record<string, SecCheckMeta> = {
  "SEC-001": { checkId: "SEC-001", module: "secrets", kind: "token-format-in-content", severity: "critical", remediation: "Rotate/revoke the credential immediately and purge it from the file; keep credentials in 0600 files under /data/credentials or systemd LoadCredential, never in tree content.", fpNote: "Synthetic test fixtures and regex-literal pattern strings in source can hit; judge triage flags them as noise." },
  "SEC-002": { checkId: "SEC-002", module: "secrets", kind: "pem-private-key", severity: "critical", remediation: "Remove the private key from the tree; serve it via systemd LoadCredential (0600) instead.", fpNote: "Fixture keys in tests are synthetic; still reviewed by the operator." },
  "SEC-003": { checkId: "SEC-003", module: "secrets", kind: "high-entropy-string", severity: "warn", remediation: "Move the high-entropy value into a credential store (LoadCredential/0600 file) and reference it by path.", fpNote: "Long hex hashes (sha256) never pass the 4.5-bit threshold; base64 literals in code may hit — judge triages." },
  "SEC-004": { checkId: "SEC-004", module: "secrets", kind: "sensitive-filename", severity: "warn", remediation: "Rename/move the sensitive file out of the tree into /data/credentials (0600) and keep it gitignored.", fpNote: "Filenames are weak evidence (examples, templates); operator confirms." },
  "SEC-005": { checkId: "SEC-005", module: "secrets", kind: "token-in-git-history", severity: "critical", remediation: "Rotate the credential NOW — history cannot be reliably rewritten; BFG/force-push is an operator decision.", fpNote: "Diff context lines and committed test fixtures may hit." },
  "SEC-006": { checkId: "SEC-006", module: "secrets", kind: "sensitive-filename-in-git-history", severity: "info", remediation: "Verify the historical file content was not secret; if it was, rotate and clean via BFG.", fpNote: "Filename alone is weak evidence." },
  "SEC-007": { checkId: "SEC-007", module: "secrets", kind: "systemd-env-secret", severity: "critical", remediation: "Replace Environment= secrets with LoadCredential= files (0600) — see engineering.vps.systemd.credential.", fpNote: "Env values are hashed runner-side; names alone never hit." },
  "SEC-008": { checkId: "SEC-008", module: "secrets", kind: "process-cmdline-secret", severity: "critical", remediation: "Make the process read the token from a 0600 file/env, never from argv (argv is world-readable via /proc).", fpNote: "cmdline is a point-in-time snapshot; unrelated long base64 args can hit." },
  "SEC-009": { checkId: "SEC-009", module: "secrets", kind: "caddyfile-plaintext-credential", severity: "critical", remediation: "Replace inline Authorization keys in the Caddyfile with an import of a 0600 file or an auth backend.", fpNote: "Route paths rarely look like values; review any hit manually." },
  "SEC-010": { checkId: "SEC-010", module: "secrets", kind: "sensitive-inventory-file", severity: "warn", remediation: "Keep the sensitive inventory 0600 and outside default listings; prefer the governed credential layout.", fpNote: "/data/tokens.json is the ACTIVE registry (documented location) — existence alone is expected inventory." },
  "SEC-011": { checkId: "SEC-011", module: "secrets", kind: "secret-in-transcript", severity: "critical", remediation: "Rotate the leaked credential and expire/purge the transcripts that carry it.", fpNote: "Transcripts legitimately quote code and fixtures; judge triages." },
  "SEC-020": { checkId: "SEC-020", module: "exposure", kind: "firewall-disabled", severity: "critical", remediation: "Enable UFW (ufw enable) with explicit allow rules for the published services; deny by default.", fpNote: "Cloud-provider security groups can replace UFW — if a different firewall is documented, this is a documented exception." },
  "SEC-021": { checkId: "SEC-021", module: "exposure", kind: "public-listener", severity: "warn", remediation: "Bind internal services to 127.0.0.1 or front them with the authenticated proxy; document intentional exceptions.", fpNote: "0.0.0.0 behind a reverse proxy or a real firewall may be intentional; cross-check with SEC-020." },
  "SEC-022": { checkId: "SEC-022", module: "exposure", kind: "route-without-auth", severity: "warn", remediation: "Add an auth matcher (@auth/basic_auth/forward_auth) to the public route in the Caddyfile.", fpNote: "Health/metrics endpoints are legitimately public; heuristic counts are noisy." },
  "SEC-023": { checkId: "SEC-023", module: "exposure", kind: "missing-tls-hardening", severity: "info", remediation: "Add a tls directive or an HSTS header to the exposed site block.", fpNote: "Caddy auto-HTTPS already covers standard ports; :80-only sites are the real gap." },
  "SEC-030": { checkId: "SEC-030", module: "hygiene", kind: "wide-file-perms", severity: "warn", remediation: "chmod 0600 the credential/inventory file and 0700 its directory.", fpNote: "Files inside containers may show 0644 by mount semantics — verify on the host." },
  "SEC-031": { checkId: "SEC-031", module: "hygiene", kind: "repo-sensitive-file-perms", severity: "warn", remediation: "chmod 0600 the sensitive repo file and confirm it stays gitignored.", fpNote: "Read-only worktrees may report container-side modes; verify on the host." },
  "SEC-032": { checkId: "SEC-032", module: "hygiene", kind: "systemd-hardening-missing", severity: "warn", remediation: "Add NoNewPrivileges=true and ProtectSystem=strict (or full) to the unit drop-in.", fpNote: "Some units legitimately need wider access (documented exceptions)." },
  "SEC-033": { checkId: "SEC-033", module: "hygiene", kind: "legacy-artifact", severity: "info", remediation: "Archive or delete *.bak/*.backup/*.old/*-baseline leftovers from the tree.", fpNote: "Intentional reference baselines (documented freezes) are acceptable." },
  "SEC-040": { checkId: "SEC-040", module: "registry", kind: "registry-expired-active", severity: "warn", remediation: "Revoke the expired registry entry (expiresAt passed, revokedAt still empty) via engineering.registry.entry.revoke.", fpNote: "Entries revoked in the same second as expiry are normal." },
  "SEC-041": { checkId: "SEC-041", module: "registry", kind: "credential-of-revoked-subject", severity: "warn", remediation: "Remove the 0600 credential file of the revoked subject after confirming nothing authenticates with it.", fpNote: "A file kept for forensic provenance is a documented exception." },
  "SEC-042": { checkId: "SEC-042", module: "registry", kind: "registry-unknown-scope", severity: "warn", remediation: "Align the entry scopes with KNOWN_REGISTRY_SCOPES — catalog drift or a typo in a grant.", fpNote: "New scopes are added by operator decision; the catalog test guards drift." },
  "SEC-043": { checkId: "SEC-043", module: "registry", kind: "ids-degraded", severity: "info", remediation: "Investigate the IDS trail/judge availability before trusting the behavior-based security layer.", fpNote: "IDS unavailability is fail-open by design; this is a hygiene signal, not an exposure." }
};

// SEC-001 token formats — captured values are hashed, never returned.
export const SEC_TOKEN_RULES: { kind: string; regex: RegExp; group?: number }[] = [
  { kind: "github-finegrained-token", regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { kind: "github-classic-token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { kind: "openai-style-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { kind: "openai-secret-key", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { kind: "base44-key", regex: /\bb44k_[A-Za-z0-9_-]{16,}\b/ },
  { kind: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { kind: "bearer-token", regex: /\bBearer\s+([A-Za-z0-9._-]{20,})\b/, group: 1 },
  { kind: "assigned-secret", regex: /\b((?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token))\s*[:=]\s*["']?([^\s"']{8,})/i, group: 2 }
];

export const SEC_PEM_REGEX = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g;
export const SEC_HIGH_ENTROPY_REGEX = /\b[A-Za-z0-9+/=_-]{32,}\b/g;
export const SEC_HIGH_ENTROPY_CONTEXT = /(key|token|secret|password|bearer|credential|auth|authorization)/i;
export const SEC_HIGH_ENTROPY_MIN_BITS = 4.5;

export const SEC_FILENAME_PATTERNS: { kind: string; regex: RegExp }[] = [
  { kind: "pat-filename", regex: /\b(?:github[_-]?pat|personal[_-]?access[_-]?token)\b/i },
  { kind: "env-file", regex: /(^|\/)\.env(?:\.[^/]+)?$/ },
  { kind: "token-json", regex: /\.token\.json$/ },
  { kind: "private-key-file", regex: /\.(?:pem|key|p12|pfx)$/ },
  { kind: "credential-file", regex: /(?:^|\/)credentials?\.(?:json|txt|env)$/ }
];

export const SEC_LEGACY_FILE_REGEX = /\.(?:bak|backup|old|orig|rej)$|\.sb01-baseline$/;
export const SEC_SKIP_DIRS = new Set([".git", "node_modules", "dist", ".claude", "coverage", ".cache", ".next", "jobs", "__pycache__"]);

// Output contamination guard — name-only in errors (no substring of the match).
export const SEC_OUTPUT_GUARD: { kind: string; regex: RegExp }[] = [
  { kind: "github-finegrained-token", regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { kind: "github-classic-token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { kind: "openai-style-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { kind: "openai-secret-key", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { kind: "base44-key", regex: /\bb44k_[A-Za-z0-9_-]{16,}\b/ },
  { kind: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { kind: "pem-private-key", regex: /-----BEGIN [^-]*PRIVATE KEY-----/ }
];