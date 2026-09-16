// GLGPD-01 — engineering.compliance.assess (READ_ONLY)
// First Guardian LGPD scanner. Composes three proven READ_ONLY engines
// (GLGPD-00 KEEP list) over one repository target and aggregates findings
// deterministically. Epistemic honesty is a hard requirement:
//   - absence of evidence is NEVER compliance
//   - unavailable scanner != "no vulnerability"
//   - unknowns and human-input-required are preserved, never resolved silently
//   - no LGPD_COMPLIANT / CERTIFIED conclusion is ever produced
// Zero mutation: this module never writes, patches, commits, deploys or fixes.
// Provisioning (boot, background, idempotent) only installs the three engines:
//   - LGPD MCP      : node, npm package @lordmendes/lgpd-mcp (9 READ_ONLY tools)
//   - GDPR ShiftLeft: python venv (mcp<2), module gdpr_shift_left_mcp
//   - SAST read-only: python venv (mcp>=2/fastmcp), module sast_mcp_server
// GDPR and SAST use SEPARATE venvs (proven dependency conflict mcp<2 vs mcp>=2).
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

export const complianceAssessInputSchema = z.object({
  targetPath: z.string().min(1).max(512),
  maxFindingsPerEngine: z.number().int().min(1).max(100).optional()
}).strict();
export type ComplianceAssessInput = z.infer<typeof complianceAssessInputSchema>;

const FINDING_STATUSES = ["EVIDENCED", "PARTIAL", "NOT_EVIDENCED", "NOT_APPLICABLE", "UNKNOWN", "HUMAN_INPUT_REQUIRED"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type ComplianceFinding = {
  id: string; category: string; severity: "high" | "medium" | "low" | "info";
  status: FindingStatus; title: string; description: string;
  evidence: unknown; legalReferences?: string[]; technicalReferences?: string[];
  remediation?: string; source: string;
};
export type EngineResult = { engine: "lgpd" | "gdpr" | "sast"; status: "AVAILABLE" | "UNAVAILABLE"; toolsProbed: number; detail: string };

const DISCLAIMER = "This is an automated, evidence-based technical readiness assessment only. It is NOT a legal opinion, NOT an ANPD certification, and NEVER a claim of LGPD compliance. Absence of evidence is not evidence of compliance. Legal review by qualified counsel is required.";
const NO_COMPLIANCE_CLAIM = true; // structural: the aggregator can never emit compliance language

function repoRoot(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.ENG_MCP_REPOSITORY_ROOT && existsSync(env.ENG_MCP_REPOSITORY_ROOT) ? env.ENG_MCP_REPOSITORY_ROOT : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return existsSync(path.join(base, "package.json")) ? base : path.join(base, "eng-mcp");
}
function enginesRoot(env: NodeJS.ProcessEnv = process.env): string { return env.GLGPD_ENGINES_ROOT ?? path.join(repoRoot(env), ".glgpd"); }
export function lgpdEntry(env: NodeJS.ProcessEnv = process.env): string { return env.GLGPD_LGPD_ENTRY ?? path.join(enginesRoot(env), "lgpd", "node_modules", "@lordmendes", "lgpd-mcp", "dist", "index.js"); }
export function gdprPython(env: NodeJS.ProcessEnv = process.env): string { return env.GLGPD_GDPR_PYTHON ?? path.join(enginesRoot(env), "venvs", "gdpr", "bin", "python"); }
export function sastPython(env: NodeJS.ProcessEnv = process.env): string { return env.GLGPD_SAST_PYTHON ?? path.join(enginesRoot(env), "venvs", "sast", "bin", "python"); }
// GLGPD-02 FASE 1/2: pinned scanner binaries provisioned for the SAST engine.
// Deterministic (fixed release URLs) + sha256-verified; no credentials; install
// failure leaves the scanner UNAVAILABLE (never PASS). The SAST engine resolves
// these binaries via its own PATH (check_dependency spawns `<name> version`).
export const SAST_BINARIES = [
  { name: "gitleaks", url: "https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz", archive: true, sha256: "e18325d568268b6efb6cd0cc721f8bea5667f4cd1c8d03618ab61987f41269ad" },
  { name: "osv-scanner", url: "https://github.com/google/osv-scanner/releases/download/v1.9.2/osv-scanner_linux_amd64", archive: false, sha256: "d6af4b67fa5de658598bd2d445efb99e90d1734b3146962418719c4350ecb74b" }
] as const;
export function sastBinDir(env: NodeJS.ProcessEnv = process.env): string { return env.GLGPD_SAST_BIN_DIR ?? path.join(enginesRoot(env), "bin"); }

function provisionLog(env: NodeJS.ProcessEnv, message: string): void {
  try { mkdirSync(path.join(repoRoot(env), "tmp"), { recursive: true }); appendFileSync(path.join(repoRoot(env), "tmp", "glgpd-provision.log"), `${new Date().toISOString()} ${message}\n`); } catch { /* observability only */ }
}

// Boot-time, background, idempotent provisioning of the three KEEP engines.
// Never mutates anything outside the engines root inside the container.
export function provisionComplianceEngines(env: NodeJS.ProcessEnv = process.env): void {
  const root = repoRoot(env); if (!existsSync(path.join(root, "package.json"))) return;
  const base = enginesRoot(env);
  const log = (m: string) => provisionLog(env, m);
  const run = (command: string, args: string[], marker?: string, timeout = 900_000) => new Promise<void>((resolve) => {
    if (marker && existsSync(marker)) { log(`skip ${command} (marker present)`); return resolve(); }
    log(`step-start ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { cwd: root, stdio: "ignore", timeout });
    child.on("error", (e) => { log(`step-failed ${command}: ${e.message}`); resolve(); });
    child.on("close", (code) => {
      if (code === 0 && marker) { try { mkdirSync(path.dirname(marker), { recursive: true }); appendFileSync(marker, new Date().toISOString()); } catch { /* observability */ } }
      log(code === 0 ? `step-ok ${command}` : `step-failed ${command} exit=${code}`);
      resolve();
    });
  });
  void (async () => {
    mkdirSync(base, { recursive: true });
    // Engine 1: LGPD MCP (node). npm package ships prebuilt dist/.
    await run("npm", ["install", "--prefix", path.join(base, "lgpd"), "--no-audit", "--no-fund", "@lordmendes/lgpd-mcp@0.1.3"], path.join(base, "lgpd", ".done"));
    // Engines 2/3: separate venvs (proven conflict mcp<2 vs mcp>=2). get-pip bootstrap (ensurepip absent in image).
    const gdprVenv = path.join(base, "venvs", "gdpr"); const sastVenv = path.join(base, "venvs", "sast");
    await run("python3", ["-m", "venv", "--without-pip", gdprVenv]);
    await run("sh", ["-c", `curl -sSfL https://bootstrap.pypa.io/get-pip.py | ${gdprVenv}/bin/python -`], path.join(gdprVenv, ".pip"));
    await run(path.join(gdprVenv, "bin", "pip"), ["install", "mcp<2", "gdpr-shift-left-mcp==0.4.0"], path.join(gdprVenv, ".done"));
    await run("python3", ["-m", "venv", "--without-pip", sastVenv]);
    await run("sh", ["-c", `curl -sSfL https://bootstrap.pypa.io/get-pip.py | ${sastVenv}/bin/python -`], path.join(sastVenv, ".pip"));
    await run(path.join(sastVenv, "bin", "pip"), ["install", "sast-mcp-server", "bandit"], path.join(sastVenv, ".done"));
    // GLGPD-02: pinned secret/dependency scanner binaries (gitleaks + osv-scanner)
    // installed ONLY inside the engines root (.glgpd/bin). Deterministic release
    // URLs + sha256 verification; idempotent via <binary>.ok markers. Install
    // failure leaves the scanner UNAVAILABLE (honest) — never a silent skip.
    const binDir = sastBinDir(env);
    for (const b of SAST_BINARIES) {
      const dest = path.join(binDir, b.name);
      const marker = `${dest}.ok`;
      if (existsSync(marker)) { log(`skip binary ${b.name} (marker present)`); continue; }
      const stage = path.join(binDir, `.staging-${b.name}`);
      const steps = [
        `mkdir -p ${stage}`,
        `curl -sSfL ${b.url} -o ${stage}/pkg`,
        b.archive ? `tar -xzf ${stage}/pkg -C ${stage}` : `cp ${stage}/pkg ${stage}/${b.name}`,
        `echo ${b.sha256}  ${stage}/${b.name} | sha256sum -c - --quiet`,
        `mv ${stage}/${b.name} ${dest} && chmod +x ${dest}`,
        `chmod -R u+w ${stage} && rm -rf ${stage}`
      ];
      await run("sh", ["-c", steps.join(" && ")], marker, 600_000);
    }
    log("provision-pass-complete");
  })();
}

// --- minimal MCP stdio JSON-RPC client (one fresh process per call) ---
type JsonRpcResponse = { id?: unknown; result?: any; error?: { message?: string; code?: number } };
function extractBalancedJson(text: string): any | null {
  const start = text.indexOf("{"); if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === "\"") inStr = false; continue; }
    if (c === "\"") inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}
function mcpCall(command: string, args: string[], method: string, params: any, timeoutMs: number, env?: Record<string, string>): Promise<JsonRpcResponse> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env: env ? { ...process.env, ...env } : undefined }); }
    catch (e: any) { return resolve({ error: { message: `SPAWN_FAILED:${e?.message ?? "unknown"}` } }); }
    let out = "", err = "", settled = false;
    const done = (r: JsonRpcResponse) => { if (settled) return; settled = true; clearTimeout(timer); try { child.kill(); } catch { /* already gone */ } resolve(r); };
    const send = (obj: any) => { try { child.stdin.write(JSON.stringify(obj) + "\n"); } catch { /* stream gone */ } };
    const tryParse = () => { const lines = out.split("\n").filter((l) => l.trim().startsWith("{")); for (let i = lines.length - 1; i >= 0; i--) { const parsed = extractBalancedJson(lines[i]) ?? extractBalancedJson(out); if (parsed && (parsed.result || parsed.error) && parsed.id !== 1) return done(parsed); } };
    const timer = setTimeout(() => done({ error: { message: `ENGINE_TIMEOUT:${timeoutMs} tail=${(out + err).slice(-200)}` } }), timeoutMs);
    child.stdout.on("data", (d) => { out += d.toString(); tryParse(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => done({ error: { message: `SPAWN_FAILED:${e.message}` } }));
    child.on("close", () => {
      if (settled) return;
      const lines = out.split("\n").filter((l) => l.trim().startsWith("{"));
      for (let i = lines.length - 1; i >= 0; i--) { const parsed = extractBalancedJson(lines[i]); if (parsed && (parsed.result || parsed.error) && parsed.id !== 1) return done(parsed); }
      done({ error: { message: `ENGINE_NO_RESPONSE tail=${(out + err).slice(-200)}` } });
    });
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "eng-mcp-compliance-assess", version: "1.0.0" } } });
    setTimeout(() => { send({ jsonrpc: "2.0", method: "notifications/initialized" }); send({ jsonrpc: "2.0", id: 2, method, params }); }, 300);
  });
}
type EngineSpec = { name: "lgpd" | "gdpr" | "sast"; command: string; args: string[]; env?: Record<string, string> };
export function engineSpecs(env: NodeJS.ProcessEnv): EngineSpec[] {
  return [
    { name: "lgpd", command: process.execPath, args: [lgpdEntry(env)] },
    { name: "gdpr", command: gdprPython(env), args: ["-m", "gdpr_shift_left_mcp"] },
    { name: "sast", command: sastPython(env), args: ["-m", "sast_mcp_server", "--transport", "stdio"], env: { PATH: `${sastBinDir(env)}:${process.env.PATH ?? ""}` } }
  ];
}
type ToolDef = { name: string; schema: any };
async function listTools(spec: EngineSpec): Promise<{ ok: boolean; tools: ToolDef[]; detail: string }> {
  const res = await mcpCall(spec.command, spec.args, "tools/list", {}, 30_000, spec.env);
  if (res.error) return { ok: false, tools: [], detail: res.error.message ?? "unknown" };
  const tools: ToolDef[] = (res.result?.tools ?? []).map((t: any) => ({ name: t?.name, schema: t?.inputSchema ?? {} })).filter((t: ToolDef) => !!t.name);
  return { ok: true, tools, detail: `handshake ok, ${tools.length} tools` };
}
async function callTool(spec: EngineSpec, tool: string, toolArgs: any, timeoutMs: number): Promise<{ ok: boolean; result?: any; detail: string }> {
  const res = await mcpCall(spec.command, spec.args, "tools/call", { name: tool, arguments: toolArgs }, timeoutMs, spec.env);
  if (res.error) return { ok: false, detail: res.error.message ?? "unknown" };
  const content = res.result?.content;
  const text = Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("\n") : "";
  const structured = res.result?.structuredContent ?? undefined;
  let parsed: any = structured ?? undefined;
  if (parsed === undefined) { const j = extractBalancedJson(text); if (j) parsed = j; }
  // GLGPD-02: single redaction choke point — NO engine output can carry a full
  // secret value into findings/evidence. Redaction is deterministic and fail-safe.
  return { ok: !res.result?.isError, result: redactSecrets(parsed ?? text), detail: res.result?.isError ? "tool error" : "ok" };
}

// Read-only tool selection. Mutating capabilities are structurally excluded.
export const MUTATING_TOOL_PATTERN = /fix|patch|apply|autofix|write|upload|delete|_create|create_|generate|remediat|report|integration|jira|slack|teams|defectdojo|github|gitlab|comment|triage|import|baseline|active_scan|ignore/i;
export const SAST_ELIGIBLE = /^(list_scanners|scan_all|scan_vulnerabilities|scan_git_history)$/i;
export const GDPR_ELIGIBLE = /^(analyze_code_ast|analyze_data_flow|analyze_dsr_capabilities|analyze_cross_border_transfers|analyze_breach_readiness|assess_dpia_need|check_deletion_requirements|assess_retention_policy|analyze_infrastructure_code)$/i;
export const LGPD_ELIGIBLE = /^(validar_base_legal|verificar_consentimento|mapear_dados_sensiveis|avaliar_necessidade_pia|avaliar_risco_tratamento|consultar_direitos_titular|checklist_compliance)$/i;

const PII_PATTERN = /email|e-mail|cpf|cnpj|phone|telefone|address|endereco|health|saude|medical|birth|nascimento|passport|rg\b|ssn|credit.?card|personal data|dados pessoais|pii/i;
const RETENTION_PATTERN = /retention|retencao|expir|ttl|purge|delete.*after|cleanup.*old/i;
const CONSENT_PATTERN = /consent|consentimento|opt.?in|opt.?out|cookie.?banner|lgpd/i;
const SECRETS_PATTERN = /(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|-----BEGIN|aws_secret_access_key|password\s*=\s*["'][^"']{8,})/i;

function truncate(value: unknown, max = 2400): unknown { const s = typeof value === "string" ? value : JSON.stringify(value); if (s === undefined) return value; return s.length > max ? s.slice(0, max) + `...[truncated ${s.length - max} chars]` : value; }
// GLGPD-02: secrets are NEVER echoed in full. Every engine-produced text passes
// through redactSecrets before reaching findings/evidence. Deterministic: keep
// only a 4-char prefix plus a [REDACTED …] marker with the original length so
// evidence stays auditable without leaking the value.
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g,
  /gh[po]_[A-Za-z0-9]{30,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,4000}?-----END [A-Z ]*PRIVATE KEY-----|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,4000}/g,
  /(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)["']?\s*[:=]\s*["']?[^\s"',;})\\]{8,}/gi
];
export function redactSecrets(input: unknown): string {
  let text: string;
  try { text = typeof input === "string" ? input : JSON.stringify(input) ?? ""; } catch { text = "[UNSERIALIZABLE_EVIDENCE]"; }
  for (const re of SECRET_VALUE_PATTERNS) text = text.replace(re, (m) => /PRIVATE KEY/.test(m) ? "[REDACTED PRIVATE KEY BLOCK]" : `${m.slice(0, 4)}…[REDACTED ${m.length - 4} chars]`);
  return text;
}
// GLGPD-02: git-history classification. A git repository whose history scan
// fails is UNKNOWN — NEVER NOT_APPLICABLE (a failed scan is not evidence of a
// clean history). NOT_APPLICABLE requires double evidence: no .git directory on
// disk AND the engine itself reporting the target is not a git repository.
export function classifyGitHistoryStatus(input: { isGitRepo: boolean; scanOk: boolean; engineSaysNotRepo: boolean }): "EVIDENCED" | "UNKNOWN" | "NOT_APPLICABLE" {
  if (!input.scanOk) {
    if (input.isGitRepo) return "UNKNOWN";
    return input.engineSaysNotRepo ? "NOT_APPLICABLE" : "UNKNOWN";
  }
  return input.engineSaysNotRepo ? "NOT_APPLICABLE" : "EVIDENCED";
}
// LGPD-01 mission: RETENTION + DATA_DELETION composition. These two GDPR
// engine capabilities were already allowlisted (GDPR_ELIGIBLE) but never
// invoked by the composition. They run ONLY on real, observed context —
// never on fabricated policy text (same honesty rule as validar_base_legal).
export type RetentionDeletionCall = (tool: string, toolArgs: any, timeoutMs: number) => Promise<{ ok: boolean; result?: any; detail: string }>;
// RETENTION input decision: the tool receives ONLY retention policy text that
// actually exists in the target (bounded). With no policy artifact there is no
// honest input — an invented description would make the engine analyze OUR
// sentinel, producing fabricated evidence about the target.
export function retentionPolicyContext(targetPath: string): { executed: boolean; reason: string; policyFile?: string; policyDescription?: string } {
  const policyFile = [path.join(targetPath, "PRIVACY.md"), path.join(targetPath, "privacy-policy.md")].find((p) => existsSync(p));
  if (!policyFile) return { executed: false, reason: "no retention policy artifact (PRIVACY.md / privacy-policy.md) in the target; retention periods cannot be inferred from code — tool NOT executed to avoid fabricated context" };
  let policyDescription: string;
  try { policyDescription = readFileSync(policyFile, "utf8"); } catch { return { executed: false, reason: `retention policy artifact ${path.basename(policyFile)} exists but is unreadable — tool NOT executed (no fabricated context)` }; }
  return { executed: true, reason: "real retention policy text observed in the target", policyFile, policyDescription: policyDescription.slice(0, 4000) };
}
// Composition of the two previously-uncalled capabilities into findings.
// callTool is injected (production passes the redacting engine callTool; tests
// pass a deterministic stub) so composition behavior is testable without LLMs.
export async function composeRetentionDeletionFindings(input: { targetPath: string; observed: { filesAnalyzed: number; piiObserved: boolean; retentionCodeObserved: boolean; deletionEvidenceObserved: boolean }; filesCount: number; hasTool: (name: string) => boolean; callTool: RetentionDeletionCall }): Promise<{ findings: ComplianceFinding[]; humanInput: string[]; unknowns: string[] }> {
  const findings: ComplianceFinding[] = [], humanInput: string[] = [], unknowns: string[] = [];
  if (input.hasTool("assess_retention_policy")) {
    const ctx = retentionPolicyContext(input.targetPath);
    if (ctx.executed) {
      const call = await input.callTool("assess_retention_policy", { policy_description: ctx.policyDescription }, 60_000);
      const text = typeof call.result === "string" ? call.result : call.result == null ? "" : JSON.stringify(call.result);
      const indefinite = /indefinite|forever|unlimited|permanent/i.test(text);
      findings.push({ id: "PRIV-RETENTION-POLICY", category: "privacy-engineering", severity: call.ok ? (indefinite ? "high" : "medium") : "info", status: call.ok ? "PARTIAL" : "UNKNOWN", title: call.ok ? "Retention policy assessed by GDPR engine (observed policy text)" : "assess_retention_policy failed", description: call.ok ? "Engine assessed the retention policy text actually present in the target (bounded). Engine output is technical evidence about that text only; the real retention policy requires human/legal validation (Art. 5(1)(e))." : "Tool failed; no conclusion drawn. Engine failure is never treated as PASS.", legalReferences: ["GDPR Art. 5(1)(e)"], evidence: { policyFile: ctx.policyFile, indefiniteRetentionSignal: indefinite, result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "gdpr-shift-left-mcp" });
      if (!call.ok) unknowns.push("GDPR: assess_retention_policy failed; retention assessment UNKNOWN");
    } else {
      findings.push({ id: "PRIV-RETENTION-POLICY", category: "privacy-engineering", severity: "medium", status: "HUMAN_INPUT_REQUIRED", title: "Retention policy (Art. 5(1)(e)) — no policy text found in repository", description: "No retention policy artifact (PRIVACY.md / privacy-policy.md) was found and retention periods cannot be inferred from code. The tool assess_retention_policy was NOT executed with an invented description — analyzing a fabricated policy would produce false evidence. Provide the real retention policy for assessment.", legalReferences: ["GDPR Art. 5(1)(e)"], evidence: { reason: ctx.reason, retentionCodeObserved: input.observed.retentionCodeObserved }, source: "gdpr-shift-left-mcp" });
      humanInput.push("GDPR/retention: informar a política de retenção real do sistema (Art. 5(1)(e))");
    }
  } else {
    unknowns.push("GDPR: assess_retention_policy not present in engine");
  }
  // DATA_DELETION (GDPR Art. 17 right to erasure): check_deletion_requirements
  // is a pure deterministic guidance tool (no I/O); it runs on observed system
  // signals with explicit UNKNOWN markers (same pattern as assess_dpia_need).
  // NOTE: the name contains "delete" which collides with the generic
  // MUTATING_TOOL_PATTERN — the explicit GDPR_ELIGIBLE allowlist and the tool's
  // verified side-effect-free implementation govern here; the call is byName,
  // like every other GDPR-layer tool in this file.
  if (input.hasTool("check_deletion_requirements")) {
    if (input.filesCount > 0) {
      const sysCtx = `Automated read-only repository observation: files=${input.observed.filesAnalyzed}, pii_observed=${input.observed.piiObserved}, deletion_code_evidence=${input.observed.deletionEvidenceObserved}, retention_code_evidence=${input.observed.retentionCodeObserved}, real_data_stores=UNKNOWN (not inferable from repository)`;
      const call = await input.callTool("check_deletion_requirements", { system_context: sysCtx }, 60_000);
      findings.push({ id: "PRIV-DELETION-REQUIREMENTS", category: "privacy-engineering", severity: "info", status: call.ok ? "PARTIAL" : "UNKNOWN", title: call.ok ? "Deletion/erasure capability requirements checklist (GDPR Art. 17)" : "check_deletion_requirements failed", description: call.ok ? "Engine-produced mandatory deletion capability checklist (Art. 17 / Art. 5(1)(e) / Art. 20). Requirements are knowledge evidence: whether THIS system implements them remains NOT_EVIDENCED unless deletion code was observed in the target." : "Tool failed; no conclusion drawn. Engine failure is never treated as PASS.", legalReferences: ["GDPR Art. 17", "GDPR Art. 5(1)(e)", "GDPR Art. 20"], evidence: { deletionCodeObserved: input.observed.deletionEvidenceObserved, result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "gdpr-shift-left-mcp" });
      if (!call.ok) unknowns.push("GDPR: check_deletion_requirements produced no usable result");
    } else {
      findings.push({ id: "PRIV-DELETION-REQUIREMENTS", category: "privacy-engineering", severity: "medium", status: "NOT_EVIDENCED", title: "No source files analyzed — deletion capability evidence NOT collected", description: "No analyzable source files were found in the target, so there is no observed system context: check_deletion_requirements was NOT executed. Absence of analysis is NOT evidence of deletion capability.", legalReferences: ["GDPR Art. 17"], evidence: { filesAnalyzed: 0, reason: "no observed system context; tool not executed to avoid fabricated context" }, source: "gdpr-shift-left-mcp" });
      unknowns.push("GDPR: no source files; deletion requirements not assessed");
    }
  } else {
    unknowns.push("GDPR: check_deletion_requirements not present in engine");
  }
  return { findings, humanInput, unknowns };
}
// LGPD-02 mission: ACCESS CONTROL composition. The GDPR Shift-Left engine has
// exactly one existing capability that evaluates access-control configuration:
// analyze_infrastructure_code (GDPR-ACC-001 "Access control / RBAC", Art. 25/32;
// GDPR-NET-001 network isolation; deterministic keyword checks, no I/O). It was
// never invoked by the composition (LGPD-00: ACCESS_CONTROL=NOT_IMPLEMENTED).
// Input is ONLY real IaC/config artifacts observed in the target (bounded);
// with none, the tool is NOT executed — no fabricated configuration. The
// engine's markdown does not distinguish an explicit misconfiguration from an
// absent keyword, so composition findings stay configuration-level (PARTIAL):
// observed config is NOT operational proof — no database, IAM system or live
// environment is ever connected here, so grants/RLS/ACL state remains UNKNOWN.
export function accessControlContext(targetPath: string, max = 4): { executed: boolean; reason: string; files: { path: string; fileType: "bicep" | "terraform" | "arm"; code: string }[] } {
  const files: { path: string; fileType: "bicep" | "terraform" | "arm"; code: string }[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", ".glgpd"]);
  const read = (full: string): string | null => { try { const c = readFileSync(full, "utf8"); return c.length > 200_000 ? null : c; } catch { return null; } };
  const walk = (dir: string) => {
    if (files.length >= max) return;
    let entries: string[] = []; try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (files.length >= max) return;
      const full = path.join(dir, e);
      let st: any; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (!skip.has(e)) walk(full); continue; }
      const ext = path.extname(e).toLowerCase();
      if (ext === ".bicep") { const code = read(full); if (code) files.push({ path: full, fileType: "bicep", code: code.slice(0, 60_000) }); }
      else if (ext === ".tf" || ext === ".tfvars") { const code = read(full); if (code) files.push({ path: full, fileType: "terraform", code: code.slice(0, 60_000) }); }
      else if (ext === ".json") { try { if (/schema\.management\.azure\.com/i.test(readFileSync(full, "utf8").slice(0, 4000))) { const code = read(full); if (code) files.push({ path: full, fileType: "arm", code: code.slice(0, 60_000) }); } } catch { /* not an ARM template */ } }
    }
  };
  try { if (!statSync(targetPath).isDirectory()) return { executed: false, reason: "target is not a readable directory", files }; } catch { return { executed: false, reason: "target is not readable", files }; }
  walk(targetPath);
  if (files.length === 0) return { executed: false, reason: "no IaC/config artifact (.bicep, .tf, .tfvars, ARM template JSON) observed in the target; access-control configuration could NOT be assessed — tool NOT executed to avoid fabricated context", files };
  return { executed: true, reason: `${files.length} real IaC/config artifact(s) observed in the target`, files };
}
// Deterministic normalization of the engine's markdown output: extract
// "[ID] Title (SEVERITY)" entries. Engine verdicts stay as reported; the
// composition never upgrades an engine signal into an operational conclusion.
function parseIacFindings(text: string): { id: string; title: string; severity: string }[] {
  const out: { id: string; title: string; severity: string }[] = [];
  for (const m of String(text).matchAll(/\[(GDPR-[A-Z]+-\d+)\]\s*(.+?)\s*\((CRITICAL|HIGH|MEDIUM)\)/g)) out.push({ id: m[1], title: m[2], severity: m[3] });
  return out;
}
export async function composeAccessControlFindings(input: { targetPath: string; hasTool: (name: string) => boolean; callTool: RetentionDeletionCall }): Promise<{ findings: ComplianceFinding[]; humanInput: string[]; unknowns: string[] }> {
  const findings: ComplianceFinding[] = [], humanInput: string[] = [], unknowns: string[] = [];
  const NOT_OPERATIONAL = "Configuration-level evidence only: observed config is NOT operational proof — no database, IAM system or live environment was connected (read-only repository assessment), so the real access-control state (roles, grants, RLS, ACLs) remains UNKNOWN.";
  if (!input.hasTool("analyze_infrastructure_code")) { unknowns.push("GDPR: analyze_infrastructure_code not present in engine"); return { findings, humanInput, unknowns }; }
  const ctx = accessControlContext(input.targetPath);
  if (!ctx.executed) {
    findings.push({ id: "PRIV-ACCESS-CONTROL", category: "privacy-engineering", severity: "medium", status: "HUMAN_INPUT_REQUIRED", title: "Access control (Art. 25/32) — no IaC/config artifacts found in repository", description: `No IaC/config artifact (.bicep, .tf, .tfvars, ARM template JSON) was observed in the target, so analyze_infrastructure_code was NOT executed: no access-control evidence was collected and none is fabricated. ${NOT_OPERATIONAL} Provide the real IaC/config files (or operational access-control evidence) for assessment.`, legalReferences: ["GDPR Art. 25", "GDPR Art. 32(1)(b)"], evidence: { reason: ctx.reason }, source: "gdpr-shift-left-mcp" });
    humanInput.push("GDPR/access-control: informar os artefatos IaC/config reais (ou evidência operacional de controle de acesso)");
    return { findings, humanInput, unknowns };
  }
  const perFile: { file: string; fileType: string; ok: boolean; flagged: { id: string; title: string; severity: string }[]; detail?: string }[] = [];
  for (const f of ctx.files) {
    const call = await input.callTool("analyze_infrastructure_code", { code: f.code, file_type: f.fileType, file_path: f.path }, 60_000);
    const flagged = call.ok ? parseIacFindings(typeof call.result === "string" ? call.result : JSON.stringify(call.result)).filter((x) => /GDPR-(ACC|NET)-001/.test(x.id)) : [];
    perFile.push({ file: f.path, fileType: f.fileType, ok: call.ok, flagged, detail: call.ok ? undefined : call.detail });
  }
  const allFailed = perFile.length > 0 && perFile.every((p) => !p.ok);
  const flaggedAny = perFile.some((p) => p.flagged.length > 0);
  if (allFailed) {
    findings.push({ id: "PRIV-ACCESS-CONTROL", category: "privacy-engineering", severity: "info", status: "UNKNOWN", title: "analyze_infrastructure_code failed for every observed IaC artifact", description: `The tool failed on all ${perFile.length} observed IaC/config artifact(s); no conclusion is drawn — engine unavailability is never treated as absence of vulnerability. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 25", "GDPR Art. 32(1)(b)"], evidence: { files: perFile.map((p) => p.file), details: perFile.map((p) => p.detail) }, source: "gdpr-shift-left-mcp" });
    unknowns.push("GDPR: analyze_infrastructure_code failed for all observed IaC artifacts; access-control assessment UNKNOWN");
  } else if (flaggedAny) {
    findings.push({ id: "PRIV-ACCESS-CONTROL", category: "privacy-engineering", severity: "high", status: "PARTIAL", title: "Access-control signals flagged by GDPR engine on observed IaC/config", description: `Engine analyze_infrastructure_code flagged access-control/network-isolation checks (GDPR-ACC-001 / GDPR-NET-001) on real IaC/config files observed in the target. The engine output does not distinguish an explicit misconfiguration from an absent keyword; both are configuration-level signals, not conclusions. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 25", "GDPR Art. 32(1)(b)", "GDPR Art. 32"], evidence: { files: perFile.map((p) => ({ file: p.file, fileType: p.fileType, accessControlFlags: p.flagged })), result: truncate(perFile.filter((p) => p.ok).map((p) => p.flagged.map((x) => `${x.id} ${x.title} (${x.severity})`).join("; ")).join(" | ")) }, source: "gdpr-shift-left-mcp" });
  } else {
    findings.push({ id: "PRIV-ACCESS-CONTROL", category: "privacy-engineering", severity: "info", status: "PARTIAL", title: "Access-control assessment over observed IaC/config — no engine flags", description: `Engine analyze_infrastructure_code ran on real IaC/config artifacts observed in the target and flagged no access-control/network-isolation check. This is a configuration-level observation for the analyzed files only, NOT a pass: absence of a flag in a config file does not prove the control exists operationally. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 25", "GDPR Art. 32(1)(b)"], evidence: { files: perFile.map((p) => ({ file: p.file, fileType: p.fileType, accessControlFlags: p.flagged })) }, source: "gdpr-shift-left-mcp" });
  }
  return { findings, humanInput, unknowns };
}
// LGPD-03 mission: AUDITABILITY of the TARGET (audit trail / security logging).
// REUSE: the GDPR engine already has exactly one existing capability for this —
// analyze_breach_readiness (Art. 33/34), whose BREACH_NOTIFICATION_PATTERNS
// ["security_logging"] deterministically detects audit log/trail, security and
// access logs, authentication events, SIEM (proven in the engine source:
// re.findall over the code string, no target I/O). It was already allowlisted
// (GDPR_ELIGIBLE) but never invoked by the composition. Input is ONLY real code
// files observed in the target (bounded); with none, the tool is NOT executed.
// Regex matches prove DECLARED mechanisms in code — never OPERATIONALLY_PROVEN:
// no runtime, log store or SIEM is ever connected here, so whether logging is
// active in production (and its retention/delivery) remains UNKNOWN.
const AUDIT_CODE_EXTS: Record<string, string> = { ".py": "python", ".js": "javascript", ".ts": "typescript", ".jsx": "javascript", ".tsx": "typescript", ".java": "java", ".go": "go", ".rb": "ruby", ".php": "php", ".c": "c", ".cpp": "cpp" };
// T4 (sensitive logging): a log call whose argument mentions a PII/credential
// shape. Only {file, line, id} is recorded — the matched value itself is NEVER
// captured, so the sensitive content can never leak through findings.
const SENSITIVE_LOG_PATTERN = /log(ger)?\s*\.\s*(info|warn|error|debug|log|trace)\s*\([^)]*\b(password|passwd|secret|token|api[_-]?key|cpf|email|telefone|phone|address|credit[_-]?card)\b/i;
export function auditabilityContext(targetPath: string, max = 4): { executed: boolean; reason: string; files: { path: string; language: string; code: string }[]; sensitiveLoggingFlags: { file: string; line: number; id: string }[] } {
  const files: { path: string; language: string; code: string }[] = [];
  const sensitiveLoggingFlags: { file: string; line: number; id: string }[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", ".glgpd"]);
  const walk = (dir: string) => {
    if (files.length >= max) return;
    let entries: string[] = []; try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (files.length >= max) return;
      const full = path.join(dir, e);
      let st: any; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (!skip.has(e)) walk(full); continue; }
      const language = AUDIT_CODE_EXTS[path.extname(e).toLowerCase()];
      if (!language) continue;
      let code: string; try { code = readFileSync(full, "utf8"); } catch { continue; }
      if (code.length > 200_000) continue;
      code.split("\n").forEach((line, i) => { if (sensitiveLoggingFlags.length < 8 && SENSITIVE_LOG_PATTERN.test(line)) sensitiveLoggingFlags.push({ file: full, line: i + 1, id: "LOG-SENSITIVE-001" }); });
      files.push({ path: full, language, code: code.slice(0, 60_000) });
    }
  };
  try { if (!statSync(targetPath).isDirectory()) return { executed: false, reason: "target is not a readable directory", files, sensitiveLoggingFlags }; } catch { return { executed: false, reason: "target is not readable", files, sensitiveLoggingFlags }; }
  walk(targetPath);
  if (files.length === 0) return { executed: false, reason: "no application code artifact observed in the target; audit/security-logging evidence could NOT be collected — tool NOT executed to avoid fabricated context", files, sensitiveLoggingFlags };
  return { executed: true, reason: `${files.length} real code artifact(s) observed in the target`, files, sensitiveLoggingFlags };
}
// Deterministic normalization of the engine's markdown table: one entry per
// capability row. An empty parse (no rows) stays distinguishable from "not
// found" — the composition never turns an unparseable output into a negative
// result (that would fabricate the absence of logging).
function parseBreachReadiness(text: string): { capability: string; article: string; detected: boolean; matches: string[] }[] {
  const out: { capability: string; article: string; detected: boolean; matches: string[] }[] = [];
  for (const m of String(text).matchAll(/\|\s*([^|]+?)\s*\|\s*(Art\.[^|]*?)\s*\|\s*(✅ Detected|❌ Not found)\s*\|\s*([^|]*?)\s*\|/g)) {
    out.push({ capability: m[1], article: m[2], detected: m[3].includes("✅"), matches: m[4].split(",").map((x) => x.trim().replace(/`/g, "")).filter((x) => x && x !== "—") });
  }
  return out;
}
export async function composeAuditabilityFindings(input: { targetPath: string; hasTool: (name: string) => boolean; callTool: RetentionDeletionCall }): Promise<{ findings: ComplianceFinding[]; humanInput: string[]; unknowns: string[] }> {
  const findings: ComplianceFinding[] = [], humanInput: string[] = [], unknowns: string[] = [];
  const NOT_OPERATIONAL = "Observed code-level evidence is DECLARED, not OPERATIONALLY_PROVEN: no runtime, log store, SIEM or live environment was connected (read-only repository assessment), so whether audit/security logging is active in production — and its retention/delivery — remains UNKNOWN.";
  if (!input.hasTool("analyze_breach_readiness")) { unknowns.push("GDPR: analyze_breach_readiness not present in engine"); return { findings, humanInput, unknowns }; }
  const ctx = auditabilityContext(input.targetPath);
  if (!ctx.executed) {
    findings.push({ id: "PRIV-AUDITABILITY", category: "privacy-engineering", severity: "medium", status: "HUMAN_INPUT_REQUIRED", title: "Audit trail / security logging (Art. 33/34) — no code artifacts found in repository", description: `No application code artifact was observed in the target, so analyze_breach_readiness was NOT executed: no auditability evidence was collected and none is fabricated. Absence of evidence does NOT mean absence of logging. ${NOT_OPERATIONAL} Provide the real source/config artifacts (or operational audit-logging evidence) for assessment.`, legalReferences: ["GDPR Art. 33", "GDPR Art. 34"], evidence: { reason: ctx.reason }, source: "gdpr-shift-left-mcp" });
    humanInput.push("GDPR/auditability: informar os artefatos reais de logging/audit trail (ou evidência operacional)");
    return { findings, humanInput, unknowns };
  }
  const perFile: { file: string; language: string; ok: boolean; rows: { capability: string; article: string; detected: boolean; matches: string[] }[]; detail?: string }[] = [];
  for (const f of ctx.files) {
    const call = await input.callTool("analyze_breach_readiness", { code: f.code, language: f.language, file_path: f.path }, 60_000);
    const rows = call.ok ? parseBreachReadiness(typeof call.result === "string" ? call.result : JSON.stringify(call.result)) : [];
    perFile.push({ file: f.path, language: f.language, ok: call.ok, rows, detail: call.ok ? undefined : call.detail });
  }
  const allFailed = perFile.length > 0 && perFile.every((p) => !p.ok);
  if (allFailed) {
    findings.push({ id: "PRIV-AUDITABILITY", category: "privacy-engineering", severity: "info", status: "UNKNOWN", title: "analyze_breach_readiness failed for every observed code artifact", description: `The tool failed on all ${perFile.length} observed code artifact(s); no conclusion is drawn — engine unavailability is never treated as absence of vulnerability. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 33", "GDPR Art. 34"], evidence: { files: perFile.map((p) => p.file), details: perFile.map((p) => p.detail) }, source: "gdpr-shift-left-mcp" });
    unknowns.push("GDPR: analyze_breach_readiness failed for all observed code artifacts; auditability UNKNOWN");
    return { findings, humanInput, unknowns };
  }
  const parsedAny = perFile.some((p) => p.ok && p.rows.length > 0);
  if (!parsedAny) {
    findings.push({ id: "PRIV-AUDITABILITY", category: "privacy-engineering", severity: "info", status: "UNKNOWN", title: "analyze_breach_readiness output not parseable", description: `The tool ran on ${perFile.length} observed code artifact(s) but no capability table could be parsed from the output (output not parseable); no conclusion (positive or negative) is drawn from an unparseable result — that would fabricate either presence or absence of logging. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 33", "GDPR Art. 34"], evidence: { files: perFile.map((p) => p.file) }, source: "gdpr-shift-left-mcp" });
    unknowns.push("GDPR: analyze_breach_readiness output not parseable; auditability UNKNOWN");
    return { findings, humanInput, unknowns };
  }
  const securityLoggingObserved = perFile.some((p) => p.rows.some((r) => /security/i.test(r.capability) && r.detected));
  const evidence: any = { files: perFile.map((p) => ({ file: p.file, language: p.language, capabilities: p.rows.map((r) => ({ capability: r.capability, article: r.article, detected: r.detected, matches: r.matches })) })), sensitiveLoggingFlags: ctx.sensitiveLoggingFlags };
  if (securityLoggingObserved) {
    findings.push({ id: "PRIV-AUDITABILITY", category: "privacy-engineering", severity: "info", status: "PARTIAL", title: "Audit/security-logging mechanism observed in target code (declared)", description: `Engine analyze_breach_readiness detected security-logging patterns (audit log/trail, security log, SIEM, authentication events — Art. 33/34) in real code files observed in the target. This is DECLARED evidence in code only. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 33", "GDPR Art. 34"], evidence, source: "gdpr-shift-left-mcp" });
  } else {
    findings.push({ id: "PRIV-AUDITABILITY", category: "privacy-engineering", severity: "medium", status: "NOT_EVIDENCED", title: "No audit/security-logging mechanism observed in analyzed code", description: `The engine ran on real code artifacts observed in the target and detected NO security-logging capability (Art. 33/34 lens, bounded file set). This is absence of EVIDENCE in the analyzed files — it is NOT proof that logging is absent from the system, and NOT a pass. ${NOT_OPERATIONAL}`, legalReferences: ["GDPR Art. 33", "GDPR Art. 34"], evidence, source: "gdpr-shift-left-mcp" });
  }
  if (ctx.sensitiveLoggingFlags.length > 0) {
    findings.push({ id: "PRIV-AUDITABILITY-SENSITIVE-LOG", category: "privacy-engineering", severity: "high", status: "EVIDENCED", title: "Possible logging of PII/credentials observed", description: "Logging statements possibly carrying PII/credentials were observed (pattern LOG-SENSITIVE-001). Only the file and line number are reported — the sensitive value itself is NEVER exposed by this finding. Confirmation and redaction belong to the owner; this tool never edits code.", legalReferences: ["LGPD Art. 46", "GDPR Art. 32"], evidence: { sensitiveLoggingFlags: ctx.sensitiveLoggingFlags }, source: "compliance.assess" });
  }
  return { findings, humanInput, unknowns };
}
function sevFromText(text: string): "high" | "medium" | "low" {
  const t = String(text);
  if (/critical|high/i.test(t)) return "high";
  if (/medium/i.test(t)) return "medium";
  return "low";
}

// Deterministic, bounded, read-only repository observation used as shared evidence
// context across layers (only what the filesystem itself proves).
function collectSourceFiles(target: string, max = 12): { path: string; code: string; language: string }[] {
  const exts: Record<string, string> = { ".py": "python", ".js": "javascript", ".ts": "typescript", ".jsx": "javascript", ".tsx": "typescript", ".java": "java", ".go": "go", ".rb": "ruby", ".php": "php", ".c": "c", ".cpp": "cpp" };
  const out: { path: string; code: string; language: string }[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", ".glgpd"]);
  const walk = (dir: string) => {
    if (out.length >= max) return;
    let entries: string[] = []; try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (out.length >= max) return;
      const full = path.join(dir, e);
      let st: any; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (!skip.has(e)) walk(full); continue; }
      const ext = path.extname(e).toLowerCase();
      if (!exts[ext]) continue;
      try { const code = readFileSync(full, "utf8"); if (code.length > 200_000) continue; out.push({ path: full, code, language: exts[ext] }); } catch { continue; }
    }
  };
  if (statSync(target).isDirectory()) walk(target);
  return out;
}

// ---- LGPD-04B: OSV/SAST evidence correctness -------------------------------------
// BUG 2 seam: the engine's list_scanners tool runs check_dependency() per scanner
// WITHOUT scanning, so its per-scanner status is independent evidence separating
// "not installed" from "installed but did not run" — the scan output labels every
// skip "not installed", including scan errors (e.g. exit 128 "No package sources
// found" on targets without lockfiles). Parsed from the engine's own output
// format: "#### <name>" section followed by "- **Status:** ✅ Installed (vX)" /
// "❌ Not installed". Absent/ambiguous entries stay absent (UNKNOWN, never invented).
export type ScannerInstallStatus = "installed" | "not_installed";
export function parseScannerInventory(listText: string): Record<string, ScannerInstallStatus> {
  const status: Record<string, ScannerInstallStatus> = {};
  for (const m of listText.matchAll(/####\s*([A-Za-z0-9._-]+)[^\n]*\n[\s\S]{0,600}?-\s*\*\*Status:\*\*\s*([^\n]+)/g)) {
    const name = m[1].trim().toLowerCase();
    const line = m[2];
    if (/not installed/i.test(line)) status[name] = "not_installed";
    else if (/installed/i.test(line)) status[name] = "installed";
  }
  return status;
}

// BUG 1: the scanner's own name ("osv-scanner") matches the OSV- prefix and was
// reported as a fake vulnerability ID when it appears in metadata lines
// ("Scanners used: ... osv-scanner ..."; live-proven in LGPD-04). A token
// identical to a scanner name is a scanner name, never a vulnerability
// identifier — real CVE-/GHSA-/OSV-/PYSEC-/RUSTSEC-/SNYK- identifiers are
// preserved untouched.
const KNOWN_SCANNER_NAME_TOKENS = ["osv-scanner"]; // the only scanner name sharing a vulnerability-ID prefix
export function osvVulnerabilityIds(scanText: string, used: string[], skipped: string[]): string[] {
  return [...new Set((scanText.match(/(?:GHSA|OSV|CVE|PYSEC|RUSTSEC|SNYK)-[A-Za-z0-9._-]+/gi) ?? [])
    .filter((x) => !KNOWN_SCANNER_NAME_TOKENS.includes(x.toLowerCase()) && !used.includes(x.toLowerCase()) && !skipped.includes(x.toLowerCase()))
    .map((x) => x.toUpperCase()))].slice(0, 20);
}

// Skip-detail wording for scanner coverage: states only what is evidenced. When
// list_scanners is silent, the engine's "not installed" label is reported AS the
// engine's label — never asserted as fact.
export function scannerSkipDetail(listStatusValue: ScannerInstallStatus | undefined): string {
  if (listStatusValue === "not_installed") return "not installed — NOT run; its silence is not evidence of security";
  if (listStatusValue === "installed") return "engine lists INSTALLED but scanner did not run (engine labels every skip 'not installed', including scan errors) — UNKNOWN, not evidence of security";
  return "did not run; engine skip label says 'not installed' but install state was not independently confirmed — UNKNOWN, not evidence of security";
}

// LGPD-04B composition of the OSV dependency finding. Conservative semantics
// unchanged: NOT_RUN / NOT_APPLICABLE / UNKNOWN / UNAVAILABLE are never converted
// into "no vulnerabilities", and a zero-finding run never fabricates a HIGH.
export function composeOsvDependencyFindings(scanText: string, used: string[], skipped: string[], listStatus: Record<string, ScannerInstallStatus>): { findings: ComplianceFinding[]; unknowns: string[] } {
  const findings: ComplianceFinding[] = [];
  const unknowns: string[] = [];
  if (used.includes("osv-scanner")) {
    const vulnIds = osvVulnerabilityIds(scanText, used, skipped);
    findings.push({ id: "SAST-OSV-DEPENDENCIES", category: "dependencies", severity: vulnIds.length ? "high" : "info", status: "EVIDENCED", title: vulnIds.length ? `OSV-Scanner reported ${vulnIds.length} dependency vulnerability identifier(s)` : "OSV-Scanner ran; no dependency vulnerability identifiers in bounded output", description: vulnIds.length ? "Dependency vulnerabilities reported by OSV-Scanner against the target's lockfiles. Identifiers are engine evidence only; exploitability review is the owner's decision. This tool never upgrades or patches dependencies." : "OSV-Scanner executed over the target and produced no vulnerability identifiers within the bounded output. Absence here is not a guarantee.", evidence: { scanner: "osv-scanner", vulnerabilityIds: vulnIds, result: scanText.slice(0, 1200) }, source: "sast-mcp-server" });
    return { findings, unknowns };
  }
  if (!skipped.includes("osv-scanner")) return { findings, unknowns };
  const ls = listStatus["osv-scanner"];
  if (ls === "installed") {
    findings.push({ id: "SAST-OSV-DEPENDENCIES-UNAVAILABLE", category: "dependencies", severity: "info", status: "UNKNOWN", title: "OSV-Scanner installed but did not run — dependency vulnerability exposure UNKNOWN", description: "The engine's list_scanners confirms osv-scanner IS installed, but this scan produced no osv-scanner results. The engine labels every skip 'not installed', including scan errors (e.g. a target without package sources/lockfiles), so the skip reason is NOT determinable from scan output alone. Dependency vulnerability status could NOT be determined and is never treated as 'no vulnerable dependencies'.", evidence: { scanner: "osv-scanner", status: "NOT_RUN", listScanners: "installed", engineSkipLabel: "not installed" }, source: "sast-mcp-server" });
    unknowns.push("SAST: osv-scanner installed but did not run; dependency vulnerability exposure UNKNOWN");
  } else if (ls === "not_installed") {
    findings.push({ id: "SAST-OSV-DEPENDENCIES-UNAVAILABLE", category: "dependencies", severity: "info", status: "UNKNOWN", title: "OSV-Scanner not installed — dependency vulnerability exposure UNKNOWN", description: "The engine's list_scanners confirms osv-scanner is not installed (independent dependency check, no scan involved). Dependency vulnerability status could NOT be determined and is never treated as 'no vulnerable dependencies'.", evidence: { scanner: "osv-scanner", status: "UNAVAILABLE", listScanners: "not installed" }, source: "sast-mcp-server" });
    unknowns.push("SAST: osv-scanner not installed; dependency vulnerability exposure UNKNOWN");
  } else {
    findings.push({ id: "SAST-OSV-DEPENDENCIES-UNAVAILABLE", category: "dependencies", severity: "info", status: "UNKNOWN", title: "OSV-Scanner did not run — dependency vulnerability exposure UNKNOWN", description: "The engine skipped osv-scanner in this scan (its skip label is 'not installed', which the engine also uses for scan errors) and list_scanners did not confirm the install state. Dependency vulnerability status could NOT be determined and is never treated as 'no vulnerable dependencies'.", evidence: { scanner: "osv-scanner", status: "NOT_RUN", listScanners: "unconfirmed" }, source: "sast-mcp-server" });
    unknowns.push("SAST: osv-scanner did not run; dependency vulnerability exposure UNKNOWN");
  }
  return { findings, unknowns };
}

export async function runComplianceAssess(input: ComplianceAssessInput, env: NodeJS.ProcessEnv = process.env): Promise<any> {
  const targetPath = String(input.targetPath ?? "").trim();
  if (!path.isAbsolute(targetPath)) return { assessmentStatus: "UNKNOWN", error: "TARGET_PATH_INVALID", detail: "targetPath must be an absolute path", mutations: 0 };
  if (!existsSync(targetPath)) return { assessmentStatus: "UNKNOWN", error: "TARGET_NOT_FOUND", detail: `targetPath does not exist: ${targetPath}`, mutations: 0 };
  const specs = engineSpecs(env);
  const maxPer = input.maxFindingsPerEngine ?? 40;

  const findings: ComplianceFinding[] = [];
  const unknowns: string[] = [];
  const humanInput: string[] = [];
  const scannerCoverage: { scanner: string; status: "AVAILABLE" | "UNAVAILABLE" | "NOT_APPLICABLE" | "UNKNOWN"; detail: string }[] = [];

  // Shared repo observation (filesystem-proven facts only).
  const files = collectSourceFiles(targetPath);
  const joined = files.map((f) => f.code).join("\n");
  const observed = {
    filesAnalyzed: files.length,
    piiObserved: PII_PATTERN.test(joined),
    piiInLoggingObserved: files.some((f) => /log(ger)?\.(info|warn|error|debug|log)\([^)]*(email|cpf|phone|user|customer|pacient|patient|nome|address)/i.test(f.code)) || /log(ging)?\..*\b(email|cpf|telefone)/i.test(joined),
    consentCodeObserved: CONSENT_PATTERN.test(joined),
    retentionCodeObserved: RETENTION_PATTERN.test(joined),
    hardcodedSecretObserved: SECRETS_PATTERN.test(joined),
    privacyPolicyFile: existsSync(path.join(targetPath, "PRIVACY.md")) || existsSync(path.join(targetPath, "privacy-policy.md")),
    deletionEvidenceObserved: /delete.*user|delete.*customer|erasure|right.*delet|anonimiz/i.test(joined)
  };
  findings.push({ id: "OBS-REPO-SIGNALS", category: "observation", severity: "info", status: "EVIDENCED", title: "Repository signals observed (filesystem evidence)", description: "Deterministic read-only observation over the target. These are observations, not conclusions.", evidence: { ...observed, scannedFiles: files.map((f) => f.path) }, source: "compliance.assess" });
  if (observed.hardcodedSecretObserved) findings.push({ id: "OBS-SECRETS-SIGNAL", category: "secrets", severity: "high", status: "EVIDENCED", title: "Hardcoded credential pattern observed in source", description: "A credential-shaped literal was observed in the analyzed source. Confirmed by direct filesystem evidence. This is technical evidence only; removal is a remediation decision for the owner.", evidence: { pattern: "credential-shaped literal in analyzed files", files: files.filter((f) => SECRETS_PATTERN.test(f.code)).map((f) => f.path) }, source: "compliance.assess" });
  if (observed.piiInLoggingObserved) findings.push({ id: "OBS-PII-LOGGING-SIGNAL", category: "privacy-engineering", severity: "high", status: "EVIDENCED", title: "PII-shaped values in logging statements observed", description: "Logging statements reference PII-shaped variables (email/cpf/phone/customer identifiers). Technical evidence only — not, by itself, a legal conclusion.", evidence: { files: files.filter((f) => /log(ging)?\..*\b(email|cpf|telefone)/i.test(f.code)).map((f) => f.path) }, source: "compliance.assess" });

  // ---- Engine availability probes (parallel — independent operations) ----
  const probes = await Promise.all(specs.map(async (spec) => ({ spec, probe: await listTools(spec) })));
  const engines: EngineResult[] = probes.map(({ spec, probe }) => ({ engine: spec.name, status: probe.ok ? "AVAILABLE" : "UNAVAILABLE", toolsProbed: probe.tools.length, detail: probe.detail }));
  const eligible = (tools: ToolDef[], pattern: RegExp) => tools.filter((t) => pattern.test(t.name) && !MUTATING_TOOL_PATTERN.test(t.name));
  const byName = (tools: ToolDef[], name: string) => tools.find((t) => t.name === name);

  // ---- Layer 2 first: GDPR Shift-Left (privacy engineering evidence feeds LGPD layer) ----
  const gdpr = probes.find((p) => p.spec.name === "gdpr")!;
  const piiCategories = new Set<string>();
  if (!gdpr.probe.ok) {
    findings.push({ id: "PRIV-ENGINE-UNAVAILABLE", category: "privacy-engineering", severity: "info", status: "UNKNOWN", title: "GDPR Shift-Left engine unavailable", description: "The GDPR Shift-Left engine did not complete its MCP handshake. AST privacy analysis could NOT run. No PII conclusion (positive or negative) can be drawn.", evidence: { detail: gdpr.probe.detail }, source: "gdpr-shift-left-mcp" });
    unknowns.push("GDPR engine unavailable: AST/PII/data-flow evidence not collected");
  } else {
    const ast = byName(gdpr.probe.tools, "analyze_code_ast");
    if (!ast) { unknowns.push("GDPR: analyze_code_ast not present"); findings.push({ id: "PRIV-AST-MISSING", category: "privacy-engineering", severity: "info", status: "UNKNOWN", title: "analyze_code_ast not available", description: "GDPR engine is up but analyze_code_ast was not found; AST evidence not collected.", evidence: { tools: gdpr.probe.tools.map((t) => t.name) }, source: "gdpr-shift-left-mcp" }); }
    let astFindings = 0;
    for (const f of files.slice(0, 10)) {
      const call = await callTool(gdpr.spec, "analyze_code_ast", { code: f.code, file_path: f.path, language: f.language }, 60_000);
      if (!call.ok) continue;
      astFindings++;
      const text = typeof call.result === "string" ? call.result : JSON.stringify(call.result);
      if (PII_PATTERN.test(text)) { for (const m of String(text).toLowerCase().matchAll(/(email|cpf|cnpj|phone|health|address|birth|passport|ssn|credit card)/g)) piiCategories.add(m[1]); }
      if (/violation|finding|risk|issue|warning/i.test(text)) findings.push({ id: `PRIV-AST-${path.basename(f.path)}`, category: "privacy-engineering", severity: sevFromText(text), status: "EVIDENCED", title: `GDPR AST privacy analysis flagged ${path.basename(f.path)}`, description: "AST-level privacy engineering analysis by the GDPR Shift-Left engine (offline knowledge; no Azure capabilities consumed). Technical evidence only.", evidence: { file: f.path, result: truncate(call.result) }, source: "gdpr-shift-left-mcp" });
      if (findings.length > maxPer) break;
    }
    if (astFindings === 0) unknowns.push("GDPR: analyze_code_ast produced no usable result for any analyzed file");
    else findings.push({ id: "PRIV-AST-COVERAGE", category: "privacy-engineering", severity: "info", status: "EVIDENCED", title: "GDPR AST analysis executed", description: "AST analysis ran over bounded file set; PII categories below are engine-reported observations.", evidence: { filesAnalyzed: Math.min(files.length, 10), piiCategoriesEngineReported: [...piiCategories] }, source: "gdpr-shift-left-mcp" });
    // DSR / data-flow / retention / deletion readiness (evidence of privacy engineering capability)
    const dsr = byName(gdpr.probe.tools, "analyze_dsr_capabilities");
    if (dsr && files[0]) {
      const call = await callTool(gdpr.spec, "analyze_dsr_capabilities", { code: joined.slice(0, 100_000), language: files[0].language, file_path: files[0].path }, 60_000);
      findings.push({ id: "PRIV-DSR", category: "privacy-engineering", severity: "info", status: call.ok ? "PARTIAL" : "UNKNOWN", title: "DSR (data subject rights) capability analysis", description: call.ok ? "Engine-analyzed DSR capability evidence. Code-level analysis can never prove that rights are honored in production (Art. 18) — operations require human verification." : "Tool failed; no conclusion drawn.", evidence: { result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "gdpr-shift-left-mcp" });
      if (!call.ok) unknowns.push("GDPR: DSR capability analysis did not produce a usable result");
      if (!observed.deletionEvidenceObserved) { findings.push({ id: "PRIV-DELETION-NOT-EVIDENCED", category: "privacy-engineering", severity: "medium", status: "NOT_EVIDENCED", title: "No deletion/erasure evidence found in code", description: "No pattern consistent with data deletion/erasure/anonymization was observed in the analyzed files. Absence of evidence is NOT proof of absence — and code evidence alone can never prove Art. 18 compliance in production.", evidence: { observed }, source: "gdpr-shift-left-mcp" }); }
    }
    const dpia = byName(gdpr.probe.tools, "assess_dpia_need");
    if (dpia) {
      const desc = `Automated read-only repository observation: files=${observed.filesAnalyzed}, pii_observed=${observed.piiObserved}, pii_in_logging=${observed.piiInLoggingObserved}, sensitive_data_possibly=${piiCategories.size > 0}, purpose=UNKNOWN (not inferable from repository)`;
      const call = await callTool(gdpr.spec, "assess_dpia_need", { processing_description: desc }, 60_000);
      findings.push({ id: "PRIV-DPIA-NEED", category: "privacy-engineering", severity: "info", status: call.ok ? "PARTIAL" : "UNKNOWN", title: "DPIA need indication (engine-assisted)", description: "Engine-assessed DPIA need from observed signals only. PIA/DPIA necessity (LGPD Art. 38 / GDPR Art. 35) requires human+legal determination.", evidence: { result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "gdpr-shift-left-mcp" });
    }
    // LGPD-01 mission: RETENTION + DATA_DELETION composition (capabilities
    // already allowlisted in GDPR_ELIGIBLE, now actually invoked). byName
    // direct, like every other GDPR-layer tool in this file.
    const rd = await composeRetentionDeletionFindings({
      targetPath, observed, filesCount: files.length,
      hasTool: (n) => !!byName(gdpr.probe.tools, n),
      callTool: (t, a, to) => callTool(gdpr.spec, t, a, to)
    });
    findings.push(...rd.findings);
    humanInput.push(...rd.humanInput);
    for (const u of rd.unknowns) unknowns.push(u);
    // LGPD-02 mission: ACCESS CONTROL composition (analyze_infrastructure_code
    // exists in the GDPR engine, now allowlisted and invoked). Same seam and
    // honesty pattern as the RETENTION/DELETION composition above.
    const ac = await composeAccessControlFindings({
      targetPath,
      hasTool: (n) => !!byName(gdpr.probe.tools, n),
      callTool: (t, a, to) => callTool(gdpr.spec, t, a, to)
    });
    findings.push(...ac.findings);
    humanInput.push(...ac.humanInput);
    for (const u of ac.unknowns) unknowns.push(u);
    // LGPD-03 mission: AUDITABILITY composition (analyze_breach_readiness,
    // already allowlisted in GDPR_ELIGIBLE, now actually invoked). Same seam
    // and honesty pattern as the ACCESS CONTROL composition above.
    const ab = await composeAuditabilityFindings({
      targetPath,
      hasTool: (n) => !!byName(gdpr.probe.tools, n),
      callTool: (t, a, to) => callTool(gdpr.spec, t, a, to)
    });
    findings.push(...ab.findings);
    humanInput.push(...ab.humanInput);
    for (const u of ab.unknowns) unknowns.push(u);
  }

  // ---- Layer 1: LGPD (knowledge engine over repo-observed facts) ----
  const lgpd = probes.find((p) => p.spec.name === "lgpd")!;
  if (!lgpd.probe.ok) {
    findings.push({ id: "LGPD-ENGINE-UNAVAILABLE", category: "lgpd", severity: "info", status: "UNKNOWN", title: "LGPD engine unavailable", description: "The LGPD MCP engine did not complete its MCP handshake. LGPD-specific evidence (bases legais, consentimento, PIA, direitos) could NOT be collected. This is not a pass.", evidence: { detail: lgpd.probe.detail }, source: "lgpd-mcp" });
    unknowns.push("LGPD engine unavailable: bases legais / consentimento / PIA / direitos do titular not assessed");
  } else {
    const lgpdTools = eligible(lgpd.probe.tools, LGPD_ELIGIBLE);
    const context = `Avaliação automatizada read-only de repositório. Observado no código: arquivos_analisados=${observed.filesAnalyzed}, pii_observada=${observed.piiObserved}, pii_em_logging=${observed.piiInLoggingObserved}, categorias_possíveis=${[...piiCategories].join(",") || "UNKNOWN"}, evidência_de_exclusão=${observed.deletionEvidenceObserved}, consentimento_no_código=${observed.consentCodeObserved}, retenção_no_código=${observed.retentionCodeObserved}, política_de_privacidade_no_repo=${observed.privacyPolicyFile}. Finalidade real do tratamento, categoria de titular e política de retenção NÃO puderam ser inferidas do repositório.`;
    // Tools that can run on observed facts:
    if (byName(lgpdTools, "checklist_compliance")) {
      const call = await callTool(lgpd.spec, "checklist_compliance", { cenario: context, ambito: "geral" }, 30_000);
      findings.push({ id: "LGPD-CHECKLIST", category: "lgpd", severity: "medium", status: call.ok ? "PARTIAL" : "UNKNOWN", title: "LGPD compliance checklist (engine, observed-signal scenario)", description: call.ok ? "Checklist executed by the LGPD MCP engine over repository-observed signals only. Business context gaps remain and require human/legal validation." : "Tool failed; no conclusion drawn.", legalReferences: ["LGPD Art. 7º/11º", "LGPD Art. 8º", "LGPD Art. 38", "LGPD Art. 17/18"], evidence: { result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "lgpd-mcp" });
    }
    if (byName(lgpdTools, "mapear_dados_sensiveis")) {
      const call = await callTool(lgpd.spec, "mapear_dados_sensiveis", { categorias_informadas: piiCategories.size ? [...piiCategories].join(", ") : "UNKNOWN (não inferido do repositório)", contexto: context }, 30_000);
      findings.push({ id: "LGPD-SENSITIVE-MAP", category: "lgpd", severity: "medium", status: call.ok ? (piiCategories.size ? "PARTIAL" : "UNKNOWN") : "UNKNOWN", title: "Sensitive data mapping (LGPD Art. 11/13 lens)", description: call.ok ? "Engine mapping over PII categories observed in code. Categories NOT observed in code remain UNKNOWN." : "Tool failed; no conclusion drawn.", legalReferences: ["LGPD Art. 11", "LGPD Art. 13"], evidence: { result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "lgpd-mcp" });
    }
    if (byName(lgpdTools, "avaliar_necessidade_pia")) {
      const call = await callTool(lgpd.spec, "avaliar_necessidade_pia", { criterios: { dados_sensiveis_presentes: piiCategories.size > 0, pii_em_logging: observed.piiInLoggingObserved, finalidade_definida: false, escala_processamento: "unknown", monitoramento_publico: "unknown" }, descricao_processamento: context }, 30_000);
      findings.push({ id: "LGPD-PIA-NEED", category: "lgpd", severity: "medium", status: call.ok ? "PARTIAL" : "UNKNOWN", title: "PIA necessity indication (LGPD Art. 38)", description: "Engine-assessed PIA need from observed signals only; finalidade real cannot be inferred from code. Human/legal determination required.", legalReferences: ["LGPD Art. 38"], evidence: { result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "lgpd-mcp" });
      humanInput.push("LGPD/PIA: necessidade de PIA exige validação humana e jurídica (Art. 38)");
    }
    if (byName(lgpdTools, "consultar_direitos_titular")) {
      const call = await callTool(lgpd.spec, "consultar_direitos_titular", { contexto: context }, 30_000);
      findings.push({ id: "LGPD-RIGHTS", category: "lgpd", severity: "medium", status: "PARTIAL", title: "Data subject rights (Art. 17/18) — knowledge evidence only", description: "Engine guidance collected. The repository " + (observed.deletionEvidenceObserved ? "shows deletion-related code patterns (PARTIAL evidence)" : "shows NO deletion/erasure implementation evidence (NOT_EVIDENCED)") + ". Code alone can never prove that titular rights are honored in production operations.", legalReferences: ["LGPD Art. 17", "LGPD Art. 18"], evidence: { result: truncate(call.result), observed }, source: "lgpd-mcp" });
    }
    // Declared-context tools cannot run honestly without business info:
    if (byName(lgpdTools, "validar_base_legal")) {
      findings.push({ id: "LGPD-BASE-LEGAL", category: "lgpd", severity: "medium", status: "HUMAN_INPUT_REQUIRED", title: "Bases legais (Art. 7º/11º) — cannot be inferred from code", description: "A base legal aplicável depende da finalidade real do tratamento, contexto de negócio e relação com o titular. Nenhuma declaração de base legal foi encontrada no repositório. A tool validar_base_legal NÃO foi executada com valores inventados — executá-la com contexto fabricado produziria evidência falsa.", legalReferences: ["LGPD Art. 7º", "LGPD Art. 11"], evidence: { reason: "finalidade real não inferível do repositório; tool não executada para evitar contexto fabricado" }, source: "lgpd-mcp" });
      humanInput.push("LGPD/bases legais: informar finalidade real e base legal pretendida (Art. 7º/11º)");
    }
    if (byName(lgpdTools, "verificar_consentimento")) {
      findings.push({ id: "LGPD-CONSENT", category: "lgpd", severity: "medium", status: observed.consentCodeObserved ? "PARTIAL" : "HUMAN_INPUT_REQUIRED", title: observed.consentCodeObserved ? "Consent-related code observed (Art. 8º) — quality unverifiable" : "Consent (Art. 8º) — no evidence found in repository", description: observed.consentCodeObserved ? "Consent-related patterns exist in code; whether they satisfy Art. 8º (livre, informado e inequívoco) requires human/legal review." : "No consent-related evidence observed. If personal data is processed based on consent, this is HUMAN_INPUT_REQUIRED.", legalReferences: ["LGPD Art. 8º"], evidence: { observed }, source: "lgpd-mcp" });
      humanInput.push("LGPD/consentimento: confirmar base de consentimento e mecanismo (Art. 8º)");
    }
    if (!lgpdTools.length) { findings.push({ id: "LGPD-TOOLS-UNMATCHED", category: "lgpd", severity: "info", status: "UNKNOWN", title: "No eligible LGPD assessment tools matched", description: "LGPD engine is up but none of the expected read-only assessment tools were found by name.", evidence: { tools: lgpd.probe.tools.map((t) => t.name) }, source: "lgpd-mcp" }); unknowns.push("LGPD: no eligible tools matched by name"); }
  }

  // ---- Layer 3: SAST read-only ----
  const sast = probes.find((p) => p.spec.name === "sast")!;
  if (!sast.probe.ok) {
    findings.push({ id: "SAST-ENGINE-UNAVAILABLE", category: "sast", severity: "info", status: "UNKNOWN", title: "SAST engine unavailable", description: "The SAST engine did not complete its MCP handshake. Static analysis, secrets and dependency evidence could NOT be collected. Absence of scanner output is NOT 'no vulnerabilities found'.", evidence: { detail: sast.probe.detail }, source: "sast-mcp-server" });
    unknowns.push("SAST engine unavailable: secrets/SAST/dependency evidence not collected");
    scannerCoverage.push({ scanner: "sast-all", status: "UNAVAILABLE", detail: sast.probe.detail });
  } else {
    const list = byName(sast.probe.tools, "list_scanners");
    let scanText = "";
    const scan = byName(sast.probe.tools, "scan_all") ?? byName(sast.probe.tools, "scan_vulnerabilities");
    if (scan) {
      const call = await callTool(sast.spec, scan.name, { target_path: targetPath }, 240_000);
      scanText = (typeof call.result === "string" ? call.result : call.result == null ? "" : JSON.stringify(call.result)).replace(/\\n/g, "\n");
      const hits = (scanText.match(/"?(severity|Severity)"?\s*[:=]\s*"?(CRITICAL|HIGH|MEDIUM|LOW)"?/gi) ?? []);
      const counts = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const h of hits) { const sv = h.toUpperCase(); if (sv.includes("CRITICAL")) counts.critical++; else if (sv.includes("HIGH")) counts.high++; else if (sv.includes("MEDIUM")) counts.medium++; else if (sv.includes("LOW")) counts.low++; }
      findings.push({ id: `SAST-${scan.name}`, category: "sast", severity: counts.critical || counts.high ? "high" : counts.medium ? "medium" : "low", status: call.ok ? "EVIDENCED" : "UNKNOWN", title: call.ok ? `SAST read-only scan (${scan.name})` : `SAST scan failed (${scan.name})`, description: call.ok ? "READ_ONLY scan executed over the target. Findings below are technical evidence; they are not legal conclusions." : "Tool failed; no conclusion drawn. Engine failure is never treated as PASS.", evidence: { severityCounts: counts, result: truncate(call.result), detail: call.ok ? undefined : call.detail }, source: "sast-mcp-server" });
      if (!call.ok) unknowns.push("SAST: scan produced no usable result");
    } else { scannerCoverage.push({ scanner: "scan_all", status: "UNKNOWN", detail: "no eligible scan tool found" }); unknowns.push("SAST: no eligible scan tool matched by name"); }
    // Scanner coverage derives from what the engines ACTUALLY produced — never from
    // install-instruction text. A missing scanner is UNAVAILABLE, never "no vulnerability".
    // LGPD-04B BUG 2 seam: list_scanners runs check_dependency() PER SCANNER
    // without scanning, so its status is independent evidence separating
    // "not installed" from "installed but did not run" (the scan output labels
    // every skip "not installed", including scan errors). Unparseable/failed
    // output leaves entries absent — unknown stays UNKNOWN, never invented.
    let listStatus: Record<string, ScannerInstallStatus> = {};
    if (list) {
      const call = await callTool(sast.spec, "list_scanners", {}, 30_000);
      if (!call.ok) {
        findings.push({ id: "SAST-LIST-SCANNERS-FAILED", category: "sast", severity: "info", status: "UNKNOWN", title: "list_scanners failed in engine", description: "The SAST engine's list_scanners tool failed (engine-side defect). Scanner availability is derived from actual scan output instead; unknown availability stays UNKNOWN.", evidence: { detail: call.detail }, source: "sast-mcp-server" });
        unknowns.push("SAST: list_scanners failed; full scanner inventory UNKNOWN");
      } else {
        const listText = (typeof call.result === "string" ? call.result : call.result == null ? "" : JSON.stringify(call.result)).replace(/\\n/g, "\n");
        listStatus = parseScannerInventory(listText);
      }
    }
    const usedMatch = scanText.match(/Scanners used:\**\s*([^\n]+)/i);
    const skippedMatch = scanText.match(/Scanners skipped \(not installed\):\**\s*([^\n]+)/i);
    const used = (usedMatch?.[1] ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    const skipped = (skippedMatch?.[1] ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (/No scanners are installed/i.test(scanText) || (!used.length && !skipped.length && scanText)) {
      for (const s of ["bandit", "semgrep", "gitleaks", "trivy", "grype", "checkov", "njsscan", "codeql", "bearer", "osv-scanner"]) scannerCoverage.push({ scanner: s, status: "UNAVAILABLE", detail: "engine reports no scanners installed — their silence is NOT evidence of security" });
      unknowns.push("SAST: zero scanners installed in this environment; no scanner-based evidence was produced");
    } else {
      for (const s of [...used, ...skipped]) scannerCoverage.push({ scanner: s, status: used.includes(s) ? "AVAILABLE" : "UNAVAILABLE", detail: used.includes(s) ? "ran in this assessment" : scannerSkipDetail(listStatus[s]) });
      findings.push({ id: "SAST-SCANNER-COVERAGE", category: "sast", severity: "info", status: "EVIDENCED", title: "Scanner coverage derived from scan output", description: "Coverage reflects only what actually ran (used) versus what the engine reports as not installed (skipped). UNAVAILABLE scanners were NOT run.", evidence: { used, skipped }, source: "sast-mcp-server" });
    }
    // GLGPD-02: dependency vulnerability evidence (OSV-Scanner). Derived ONLY from
    // actual scan output. If osv-scanner did not run, dependency exposure stays
    // UNKNOWN — never "no vulnerable dependencies".
    // LGPD-04B: BUG 1 (scanner name matched as fake vulnerability ID) and BUG 2
    // (skips conflated with "not installed") are fixed in the composition helpers;
    // conservative semantics unchanged (UNKNOWN is never converted to a clean result).
    const osv = composeOsvDependencyFindings(scanText, used, skipped, listStatus);
    for (const f of osv.findings) findings.push(f);
    for (const u of osv.unknowns) unknowns.push(u);
    const git = byName(sast.probe.tools, "scan_git_history");
    if (git) {
      const call = await callTool(sast.spec, "scan_git_history", { target_path: targetPath }, 120_000);
      const rawHistory = typeof call.result === "string" ? call.result : JSON.stringify(call.result);
      const text = redactSecrets(rawHistory);
      const engineSaysNotRepo = /not a (valid )?git repository|fatal: not a git repo/i.test(text);
      const isGitRepo = existsSync(path.join(targetPath, ".git"));
      const status = classifyGitHistoryStatus({ isGitRepo, scanOk: call.ok, engineSaysNotRepo });
      findings.push({ id: "SAST-GIT-HISTORY", category: "sast", severity: "info", status, title: "Git history scan (secrets leaked in history)", description: status === "EVIDENCED" ? "Git history scanned for leaked secrets. History evidence is bounded to what the engine can read." : status === "NOT_APPLICABLE" ? "Target provably has no git history (no .git directory on disk AND the engine reports it is not a repository): git-history evidence NOT_APPLICABLE here." : isGitRepo ? "Target IS a git repository but the history scan failed: absence of output is NOT a clean history — classified UNKNOWN, never NOT_APPLICABLE." : "History scan failed and repository status is not provable — classified UNKNOWN.", evidence: { result: text.slice(0, 1200), isGitRepo, engineSaysNotRepo, detail: call.ok ? undefined : call.detail }, source: "sast-mcp-server" });
      if (status === "UNKNOWN") unknowns.push("SAST: git-history scan failed; secrets-in-history presence UNKNOWN");
    }
  }

  // ---- Deterministic aggregation ----
  const availableEngines = engines.filter((e) => e.status === "AVAILABLE").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const evidenced = findings.filter((f) => f.status === "EVIDENCED").length;
  let summaryRisk: "HIGH_RISK" | "MEDIUM_RISK" | "LOW_RISK" | "INCOMPLETE" = "INCOMPLETE";
  if (availableEngines < 3 || unknowns.length > 2) summaryRisk = "INCOMPLETE";
  else if (high > 0) summaryRisk = "HIGH_RISK";
  else if (findings.some((f) => f.severity === "medium" && (f.status === "EVIDENCED" || f.status === "PARTIAL"))) summaryRisk = "MEDIUM_RISK";
  else if (evidenced > 0) summaryRisk = "LOW_RISK";

  return {
    assessmentStatus: availableEngines === 3 ? (unknowns.length || humanInput.length ? "PARTIAL" : "EVIDENCED") : "PARTIAL",
    summary: { risk: summaryRisk, complianceClaim: false, note: "Readiness assessment only. No conclusion of LGPD compliance or certification is ever produced by this tool." },
    target: targetPath,
    findings, unknowns, humanInputRequired: humanInput,
    scannerCoverage, engines,
    riskSummary: { critical: findings.filter((f) => f.severity === "high").length, high: findings.filter((f) => f.severity === "high").length, medium: findings.filter((f) => f.severity === "medium").length, low: findings.filter((f) => f.severity === "low").length, engineCoverage: `${availableEngines}/3` },
    remediation: findings.filter((f) => f.status === "EVIDENCED" && f.severity !== "info").map((f) => ({ id: f.id, recommendation: "Review with the engineering owner and qualified counsel. This tool never remediates automatically." })),
    evidence: findings.map((f) => ({ id: f.id, source: f.source, evidence: f.evidence })),    guardrails: { readOnly: true, mutations: 0, mutatingToolCalls: 0, guardianCoreChanged: false, venvsSeparated: true },
    disclaimer: DISCLAIMER,
    noComplianceClaim: NO_COMPLIANCE_CLAIM
  };
}
