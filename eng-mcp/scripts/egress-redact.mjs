// SEC-FIX-01: egress redaction for LLM-bound request bodies (gpu-bridge messages-shim
// and proxy, before fetch to OpenRouter). Dependency-free ESM so the host bridge can
// import a pinned copy. Union of the patterns already used by src/judge.ts and
// src/errorEnvelope.ts. Order matters: specific token shapes before generic key=value.
const PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/gi, "Bearer [REDACTED]"],
  [/\bsk-or-v1-[A-Za-z0-9]{8,}\b/g, "[REDACTED_OPENROUTER_KEY]"],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_SK]"],
  [/\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, "[REDACTED_GITHUB_PAT]"],
  [/\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "[REDACTED_STRIPE]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g, "[REDACTED_JWT]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\b(authorization|token|secret|password|passwd|api[_-]?key)(\s*[:=]\s*)"?(?!\[REDACTED)[^\s"',;]{8,}/gi, "$1$2[REDACTED]"],
];

/** Redacts secret-shaped substrings; returns the text and how many were replaced. */
export function redactEgressTextCounted(text) {
  let out = String(text);
  let redactions = 0;
  for (const [re, rep] of PATTERNS) out = out.replace(re, (...m) => { redactions++; return rep.replace(/\$(\d)/g, (_, i) => m[+i] ?? ""); });
  return { text: out, redactions };
}

export function redactEgressText(text) {
  return redactEgressTextCounted(text).text;
}

/** Deep-redacts every string in a JSON-able body (never mutates the input). */
export function redactEgressBody(body) {
  let redactions = 0;
  const walk = (v, depth) => {
    if (typeof v === "string") { const r = redactEgressTextCounted(v); redactions += r.redactions; return r.text; }
    if (depth > 32 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = walk(x, depth + 1);
    return o;
  };
  return { body: walk(body, 0), redactions };
}
