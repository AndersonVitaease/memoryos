// MCP-IMPORT-GATE-01 — Barrier 1: static pre-install scanner (module M6
// "mcp-import-scan" of SECURITY-SCAN-01).
//
// ENGINE IS A DEPENDENCY, NEVER CODE IN THE TOOL. Engines are entries of the
// engine registry (src/mcp-import/engines.json): {id, kind, format, package|path,
// version, contentSha256, entry, args, ...}. Adding an engine = one config entry
// (+ its golden contract test); the gate code never changes. Each entry is
// verified BEFORE it runs: installed version must equal the pinned one and the
// sha256 over the engine files (+ its declared dependency closure) must equal
// the audited contentSha256 — a tampered/updated engine fails CLOSED
// (ENGINE_INTEGRITY_MISMATCH), it never silently scans with unaudited bytes.
// Engines run as a SUBPROCESS with a minimal env (no credential variables), a
// private cwd, a timeout and an output cap; output is parsed by a FORMAT adapter
// (mcpguard-json | sarif) — formats are code, engines are config.
//
// GH YAML rules (src/mcp-import/gh-rules.yaml) run on top of every engine as the
// complement (bidi, boundary breaks, authority claims, schema poisoning, GH
// denylist). Grading reuses the audited engine's weights so grades compare.
//
// DATA, NEVER INSTRUCTION: every string that originates in the candidate (tool
// names, descriptions, engine evidence/messages carrying them) is neutralized
// before it reaches any output (invisible/bidi/control code points rendered as
// ⟦U+XXXX⟧, truncated); raw evidence NEVER leaves — only its sha256-16.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as z from "zod/v4";
import { parse as parseYaml } from "yaml";

export type McpSeverity = "critical" | "high" | "medium" | "low";
export type McpGrade = "A" | "B" | "C" | "D" | "F";
export const MCP_GRADES: readonly McpGrade[] = ["A", "B", "C", "D", "F"];

export type McpFinding = {
  rule: string;
  name: string;
  category: string;
  severity: McpSeverity;
  owaspMcp: string;
  file: string | null;
  line: number | null;
  engine: string;
  scope: "code" | "announced";
  message: string;
  evidenceHash16: string | null;
  disqualifying: boolean;
};

export type McpToolAnnounced = { name: string; description?: string; title?: string; inputSchema?: unknown };
export type ExtractedTool = { name: string; descriptionSha256: string; file: string | null; line: number | null };

export type EngineRunOutput = {
  engine: string;
  scope: "code" | "announced";
  status: "ok" | "error";
  grade: McpGrade | null;
  score: number | null;
  findings: McpFinding[];
  lockRef: string | null;
  toolsExtracted: ExtractedTool[];
  error: string | null;
};

/** The StaticScanEngine contract: input = a materialized dir (regular files only), output = {grade, findings, lockRef}. */
export interface StaticScanEngine {
  readonly id: string;
  readonly descriptor: EngineDescriptor;
  scan(input: { root: string; scope: "code" | "announced" }): Promise<EngineRunOutput>;
}

export type StaticScanReport = {
  module: "mcp-import-scan";
  grade: McpGrade;
  score: number;
  findings: McpFinding[];
  engines: { id: string; version: string; format: string; scope: "code" | "announced"; status: "ok" | "error"; grade: McpGrade | null; score: number | null; findings: number; lockRef: string | null; error: string | null }[];
  engineRegistry: { file: string; sha16: string; engines: string[] };
  ghRules: { file: string; sha16: string; rules: number };
  toolsExtracted: ExtractedTool[];
  failClosed: boolean;
  reasons: string[];
};

// ---- helpers ---------------------------------------------------------------

export const sha256Hex = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
export const sha16 = (data: string | Buffer): string => sha256Hex(data).slice(0, 16);

const SEVERITY_WEIGHT: Record<McpSeverity, number> = { critical: 25, high: 12, medium: 5, low: 2 };
const SEVERITY_ORDER: Record<McpSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Same weights/thresholds as the audited engine (mcpguard 0.1.0 computeGrade) so engine and GH grades compare. */
export function gradeFindings(findings: readonly McpFinding[]): { grade: McpGrade; score: number } {
  let penalty = 0;
  for (const finding of findings) penalty += SEVERITY_WEIGHT[finding.severity];
  const score = Math.max(0, 100 - penalty);
  const poisoned = findings.some((f) => (f.category === "tool-poisoning" && f.severity === "critical") || f.disqualifying);
  const grade: McpGrade = poisoned ? "F" : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { grade, score };
}

export const worstGrade = (grades: readonly (McpGrade | null)[]): McpGrade => {
  let worst = 0;
  for (const grade of grades) if (grade) worst = Math.max(worst, MCP_GRADES.indexOf(grade));
  return MCP_GRADES[worst];
};
export const gradeBelow = (grade: McpGrade, threshold: McpGrade): boolean => MCP_GRADES.indexOf(grade) > MCP_GRADES.indexOf(threshold);

// Invisible / bidi / control code points — rendered visibly, never passed through.
const HIDDEN_CODEPOINT_RANGES: readonly [number, number][] = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160],
  [0x180e, 0x180e], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0x3164, 0x3164],
  [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xe0000, 0xe01ef]
];
const cpEscape = (cp: number): string => `${String.fromCharCode(92)}u{${cp.toString(16)}}`;
const UNTRUSTED_HIDDEN = new RegExp(`[${HIDDEN_CODEPOINT_RANGES.map(([a, b]) => (a === b ? cpEscape(a) : `${cpEscape(a)}-${cpEscape(b)}`)).join("")}]`, "gu");

/** DATA, NEVER INSTRUCTION: renders hidden code points as ⟦U+XXXX⟧ and truncates. */
export function neutralizeUntrusted(text: unknown, max = 300): string {
  const raw = typeof text === "string" ? text : text == null ? "" : String(text);
  const visible = raw.replace(UNTRUSTED_HIDDEN, (ch) => `⟦U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}⟧`).replace(/\s+/g, " ").trim();
  return visible.length > max ? `${visible.slice(0, max)}…[+${visible.length - max}]` : visible;
}

export const countHiddenCodePoints = (text: string): number => (text.match(UNTRUSTED_HIDDEN) ?? []).length;

const asRecord = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asStr = (value: unknown): string | null => (typeof value === "string" ? value : null);
const asNum = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const MCP_IMPORT_CONFIG_DIR = join(MODULE_DIR, "mcp-import");
export const ENGINE_REGISTRY_FILE_DEFAULT = join(MCP_IMPORT_CONFIG_DIR, "engines.json");
export const GH_RULES_FILE_DEFAULT = join(MCP_IMPORT_CONFIG_DIR, "gh-rules.yaml");

export class McpImportScanError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "McpImportScanError"; }
}

// ---- engine registry (config) ------------------------------------------------

const OWASP_ID = z.string().regex(/^MCP(0[1-9]|10)$/);
const engineDescriptorSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  enabled: z.boolean(),
  kind: z.literal("node-cli"),
  format: z.enum(["mcpguard-json", "sarif"]),
  package: z.string().min(1).max(200).optional(),
  path: z.string().min(1).max(400).optional(),
  version: z.string().min(1).max(40),
  integrity: z.string().max(200).optional(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  closure: z.record(z.string(), z.string()).optional(),
  entry: z.string().min(1).max(200).refine((value) => !value.includes("..") && !isAbsolute(value), "entry must be relative and inside the engine dir"),
  args: z.array(z.string().max(200)).max(20).refine((args) => args.includes("{root}"), "args must carry the {root} placeholder"),
  timeoutMs: z.number().int().min(1000).max(300_000),
  owaspMap: z.record(z.string(), OWASP_ID).optional(),
  owaspDefault: OWASP_ID,
  audit: z.object({ auditedAt: z.string(), auditedBy: z.string(), notes: z.string().max(2000) }).strict()
}).strict().refine((entry) => (entry.package ? 1 : 0) + (entry.path ? 1 : 0) === 1, "exactly one of package|path");
export type EngineDescriptor = z.infer<typeof engineDescriptorSchema>;

const engineRegistrySchema = z.object({ version: z.literal(1), engines: z.array(engineDescriptorSchema).min(1).max(20) }).strict()
  .refine((registry) => new Set(registry.engines.map((e) => e.id)).size === registry.engines.length, "duplicate engine id");

export type EngineRegistry = { file: string; sha16: string; engines: EngineDescriptor[] };

export function loadEngineRegistry(file = process.env.ENG_MCP_MCP_IMPORT_ENGINES_FILE ?? ENGINE_REGISTRY_FILE_DEFAULT): EngineRegistry {
  let bytes: Buffer;
  try { bytes = readFileSync(file); } catch (error) { throw new McpImportScanError("ENGINE_REGISTRY_UNREADABLE", `engine registry ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  let parsed: z.infer<typeof engineRegistrySchema>;
  try { parsed = engineRegistrySchema.parse(JSON.parse(bytes.toString("utf8"))); } catch (error) { throw new McpImportScanError("ENGINE_REGISTRY_INVALID", `engine registry ${file} invalid: ${error instanceof Error ? error.message.slice(0, 400) : String(error)}`); }
  return { file, sha16: sha16(bytes), engines: parsed.engines };
}

const requireFromHere = createRequire(import.meta.url);

/** Directory of the engine (package in node_modules, or path relative to the registry file). */
export function engineDir(descriptor: EngineDescriptor, registryFile: string): string {
  if (descriptor.path) return isAbsolute(descriptor.path) ? descriptor.path : resolve(dirname(registryFile), descriptor.path);
  try { return dirname(requireFromHere.resolve(`${descriptor.package}/package.json`)); } catch { throw new McpImportScanError("ENGINE_NOT_INSTALLED", `engine package ${descriptor.package} is not installed`); }
}

function listFilesSorted(root: string, skipNodeModules: boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      if (skipNodeModules && entry === "node_modules") continue;
      const full = join(dir, entry);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) { out.push(`${relative(root, full)}\u0000symlink`); continue; }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(relative(root, full));
    }
  };
  walk(root);
  return out;
}

/** sha256 over (relpath, sha256(bytes)) of every file of the given dirs (sorted); symlinks are hashed as markers, never followed. */
export function dirsContentSha256(dirs: { label: string; dir: string }[]): string {
  const rows: string[] = [];
  for (const { label, dir } of dirs) {
    for (const rel of listFilesSorted(dir, true)) {
      rows.push(rel.endsWith("\u0000symlink") ? `${label}/${rel}` : `${label}/${rel}\u0000${sha256Hex(readFileSync(join(dir, rel)))}`);
    }
  }
  return sha256Hex(rows.join("\n"));
}

/** Node resolution walk (node_modules up the tree) WITHOUT require.resolve: packages with an "exports" map hide ./package.json. */
function findDependencyDir(fromDir: string, dep: string, engineId: string): string {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, "node_modules", dep);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new McpImportScanError("ENGINE_DEPENDENCY_MISSING", `engine ${engineId} dependency ${dep} is not installed`);
    dir = parent;
  }
}

export function engineContentSha256(descriptor: EngineDescriptor, registryFile: string): string {
  const dir = engineDir(descriptor, registryFile);
  const dirs = [{ label: descriptor.package ?? descriptor.id, dir }];
  for (const dep of Object.keys(descriptor.closure ?? {}).sort()) {
    dirs.push({ label: dep, dir: findDependencyDir(dir, dep, descriptor.id) });
  }
  return dirsContentSha256(dirs);
}

export type EngineIntegrity = { ok: boolean; reason: string | null; contentSha256: string | null };

export function verifyEngineIntegrity(descriptor: EngineDescriptor, registryFile: string): EngineIntegrity {
  try {
    const dir = engineDir(descriptor, registryFile);
    const pkgFile = join(dir, "package.json");
    if (descriptor.package) {
      const version = asStr(asRecord(JSON.parse(readFileSync(pkgFile, "utf8")))?.version);
      if (version !== descriptor.version) return { ok: false, reason: `ENGINE_VERSION_MISMATCH: installed ${version ?? "?"} != pinned ${descriptor.version}`, contentSha256: null };
    }
    for (const [dep, pinned] of Object.entries(descriptor.closure ?? {})) {
      const depPkg = join(findDependencyDir(dir, dep, descriptor.id), "package.json");
      const version = asStr(asRecord(JSON.parse(readFileSync(depPkg, "utf8")))?.version);
      if (version !== pinned) return { ok: false, reason: `ENGINE_DEPENDENCY_VERSION_MISMATCH: ${dep} ${version ?? "?"} != pinned ${pinned}`, contentSha256: null };
    }
    const actual = engineContentSha256(descriptor, registryFile);
    if (actual !== descriptor.contentSha256) return { ok: false, reason: `ENGINE_INTEGRITY_MISMATCH: content ${actual.slice(0, 16)} != audited ${descriptor.contentSha256.slice(0, 16)}`, contentSha256: actual };
    if (!existsSync(join(dir, descriptor.entry))) return { ok: false, reason: "ENGINE_ENTRY_MISSING", contentSha256: actual };
    return { ok: true, reason: null, contentSha256: actual };
  } catch (error) {
    return { ok: false, reason: error instanceof McpImportScanError ? `${error.code}: ${error.message}` : `ENGINE_UNVERIFIABLE: ${error instanceof Error ? error.message : String(error)}`, contentSha256: null };
  }
}

// ---- format adapters (code) ---------------------------------------------------

const toSeverity = (value: unknown): McpSeverity => {
  const s = asStr(value)?.toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  if (s === "error") return "high";
  if (s === "warning") return "medium";
  return "low";
};
const toGrade = (value: unknown): McpGrade | null => (typeof value === "string" && (MCP_GRADES as readonly string[]).includes(value) ? value as McpGrade : null);

function owaspFor(descriptor: EngineDescriptor, rule: string, category: string, explicit: string | null): string {
  if (explicit && /^MCP(0[1-9]|10)$/.test(explicit)) return explicit;
  return descriptor.owaspMap?.[rule] ?? descriptor.owaspMap?.[category] ?? descriptor.owaspDefault;
}

const safeRel = (file: unknown): string | null => {
  const s = asStr(file);
  if (!s) return null;
  return neutralizeUntrusted(s.replace(/^file:\/\//, ""), 200);
};

function parseMcpguardJson(descriptor: EngineDescriptor, scope: "code" | "announced", stdout: string): Omit<EngineRunOutput, "engine" | "scope" | "status" | "error"> {
  const doc = asRecord(JSON.parse(stdout));
  if (!doc) throw new Error("mcpguard-json: output is not an object");
  const findings: McpFinding[] = asArray(doc.findings).map((raw) => {
    const f = asRecord(raw) ?? {};
    const rule = asStr(f.ruleId) ?? "unknown";
    const category = asStr(f.category) ?? "unknown";
    return {
      rule, name: asStr(f.ruleName) ?? rule, category, severity: toSeverity(f.severity), owaspMcp: owaspFor(descriptor, rule, category, null),
      file: safeRel(f.file), line: asNum(f.line), engine: descriptor.id, scope,
      message: neutralizeUntrusted(f.message, 240), evidenceHash16: asStr(f.evidence) ? sha16(asStr(f.evidence) as string) : null,
      disqualifying: f.disqualifying === true
    };
  });
  const toolsExtracted: ExtractedTool[] = asArray(doc.tools).map((raw) => {
    const t = asRecord(raw) ?? {};
    return { name: neutralizeUntrusted(t.name, 120), descriptionSha256: sha256Hex(asStr(t.description) ?? ""), file: safeRel(t.file), line: asNum(t.line) };
  });
  return { grade: toGrade(doc.grade), score: asNum(doc.score), findings, lockRef: null, toolsExtracted };
}

function parseSarif(descriptor: EngineDescriptor, scope: "code" | "announced", stdout: string): Omit<EngineRunOutput, "engine" | "scope" | "status" | "error"> {
  const doc = asRecord(JSON.parse(stdout));
  if (!doc) throw new Error("sarif: output is not an object");
  const findings: McpFinding[] = [];
  let lockRef: string | null = null;
  for (const runRaw of asArray(doc.runs)) {
    const run = asRecord(runRaw) ?? {};
    const driver = asRecord(asRecord(run.tool)?.driver) ?? {};
    const rules = new Map<string, Record<string, unknown>>();
    for (const ruleRaw of asArray(driver.rules)) { const rule = asRecord(ruleRaw); const id = asStr(rule?.id); if (rule && id) rules.set(id, rule); }
    lockRef = lockRef ?? asStr(asRecord(run.properties)?.lockRef);
    for (const resultRaw of asArray(run.results)) {
      const result = asRecord(resultRaw) ?? {};
      const ruleId = asStr(result.ruleId) ?? "unknown";
      const ruleMeta = rules.get(ruleId) ?? {};
      const props = { ...(asRecord(ruleMeta.properties) ?? {}), ...(asRecord(result.properties) ?? {}) };
      const tags = asArray(props.tags).map(asStr).filter((t): t is string => t !== null);
      const category = asStr(props.category) ?? tags.find((t) => !/^MCP\d{2}$/.test(t)) ?? "unknown";
      const location = asRecord(asRecord(asArray(result.locations)[0])?.physicalLocation) ?? {};
      findings.push({
        rule: ruleId, name: asStr(ruleMeta.name) ?? ruleId, category, severity: toSeverity(props.severity ?? result.level), owaspMcp: owaspFor(descriptor, ruleId, category, asStr(props.owaspMcp) ?? tags.find((t) => /^MCP\d{2}$/.test(t)) ?? null),
        file: safeRel(asRecord(location.artifactLocation)?.uri), line: asNum(asRecord(location.region)?.startLine), engine: descriptor.id, scope,
        message: neutralizeUntrusted(asRecord(result.message)?.text, 240), evidenceHash16: asStr(asRecord(asRecord(location.region)?.snippet)?.text) ? sha16(asStr(asRecord(asRecord(location.region)?.snippet)?.text) as string) : null,
        disqualifying: props.disqualifying === true
      });
    }
  }
  const { grade, score } = gradeFindings(findings);
  return { grade, score, findings, lockRef, toolsExtracted: [] };
}

const FORMAT_ADAPTERS = { "mcpguard-json": parseMcpguardJson, sarif: parseSarif } as const;

// ---- node-cli engine ------------------------------------------------------------

const ENGINE_OUTPUT_CAP = 32 * 1024 * 1024;

export type EngineExec = (file: string, args: string[], opts: { cwd: string; env: Record<string, string>; timeoutMs: number }) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>;

export const defaultEngineExec: EngineExec = (file, args, opts) => new Promise((resolveExec) => {
  execFile(file, args, { cwd: opts.cwd, env: opts.env, timeout: opts.timeoutMs, maxBuffer: ENGINE_OUTPUT_CAP, killSignal: "SIGKILL", windowsHide: true }, (error, stdout, stderr) => {
    const err = error as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
    resolveExec({ code: err ? (typeof err.code === "number" ? err.code : null) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), timedOut: Boolean(err?.killed) });
  });
});

export function createEngine(descriptor: EngineDescriptor, registryFile: string, runEngineProcess: EngineExec = defaultEngineExec): StaticScanEngine {
  const adapter = FORMAT_ADAPTERS[descriptor.format];
  return {
    id: descriptor.id,
    descriptor,
    async scan({ root, scope }) {
      const base = { engine: descriptor.id, scope, grade: null, score: null, findings: [], lockRef: null, toolsExtracted: [] } as const;
      const integrity = verifyEngineIntegrity(descriptor, registryFile);
      if (!integrity.ok) return { ...base, findings: [], toolsExtracted: [], status: "error", error: integrity.reason };
      const dir = engineDir(descriptor, registryFile);
      const home = mkdtempSync(join(tmpdir(), `mcp-engine-${descriptor.id}-`));
      try {
        // minimal env: no credential variable of this server ever reaches a third-party engine
        const env = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: home, NODE_ENV: "production", NO_COLOR: "1", LANG: "C.UTF-8" };
        const args = [join(dir, descriptor.entry), ...descriptor.args.map((a) => (a === "{root}" ? root : a))];
        const run = await runEngineProcess(process.execPath, args, { cwd: home, env, timeoutMs: descriptor.timeoutMs });
        if (run.timedOut) return { ...base, findings: [], toolsExtracted: [], status: "error", error: `ENGINE_TIMEOUT after ${descriptor.timeoutMs}ms` };
        if (run.code !== 0 && run.code !== 1) return { ...base, findings: [], toolsExtracted: [], status: "error", error: `ENGINE_EXIT_${run.code}: ${neutralizeUntrusted(run.stderr, 200)}` };
        const parsed = adapter(descriptor, scope, run.stdout);
        return { engine: descriptor.id, scope, status: "ok", error: null, ...parsed };
      } catch (error) {
        return { ...base, findings: [], toolsExtracted: [], status: "error", error: `ENGINE_OUTPUT_INVALID: ${neutralizeUntrusted(error instanceof Error ? error.message : String(error), 200)}` };
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }
  };
}

// ---- GH YAML rules (complement) -----------------------------------------------

const ghRuleSchema = z.object({
  id: z.string().regex(/^GH-MCP-\d{3}$/),
  name: z.string().min(1).max(80),
  category: z.string().min(1).max(40),
  severity: z.enum(["critical", "high", "medium", "low"]),
  owaspMcp: OWASP_ID,
  context: z.enum(["tool-text", "file-path", "code"]),
  caseSensitive: z.boolean().optional(),
  extensions: z.array(z.string().regex(/^\.[a-z0-9]{1,6}$/)).optional(),
  description: z.string().min(1).max(400),
  pattern: z.string().min(1).max(2000)
}).strict();
export type GhRule = z.infer<typeof ghRuleSchema> & { regex: RegExp };

export function loadGhRules(file = process.env.ENG_MCP_MCP_IMPORT_RULES_FILE ?? GH_RULES_FILE_DEFAULT): { file: string; sha16: string; rules: GhRule[] } {
  let bytes: Buffer;
  try { bytes = readFileSync(file); } catch (error) { throw new McpImportScanError("GH_RULES_UNREADABLE", `GH rules ${file}: ${error instanceof Error ? error.message : String(error)}`); }
  try {
    const doc = asRecord(parseYaml(bytes.toString("utf8")));
    const rules = z.array(ghRuleSchema).min(1).parse(doc?.rules).map((rule) => ({ ...rule, regex: new RegExp(rule.pattern, rule.caseSensitive ? "u" : "iu") }));
    if (new Set(rules.map((r) => r.id)).size !== rules.length) throw new Error("duplicate GH rule id");
    return { file, sha16: sha16(bytes), rules };
  } catch (error) {
    throw new McpImportScanError("GH_RULES_INVALID", `GH rules ${file} invalid: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
  }
}

/** Every text an agent would trust about a tool: name, title, description and every nested inputSchema description/title. */
export function toolTexts(tool: McpToolAnnounced): { where: string; text: string }[] {
  const texts: { where: string; text: string }[] = [{ where: "name", text: tool.name }];
  if (typeof tool.title === "string") texts.push({ where: "title", text: tool.title });
  if (typeof tool.description === "string") texts.push({ where: "description", text: tool.description });
  const walk = (node: unknown, path: string, depth: number) => {
    if (depth > 12) return;
    const record = asRecord(node);
    if (!record) { if (Array.isArray(node)) node.forEach((child, i) => walk(child, `${path}[${i}]`, depth + 1)); return; }
    for (const [key, value] of Object.entries(record)) {
      if ((key === "description" || key === "title") && typeof value === "string") texts.push({ where: `inputSchema${path}.${key}`, text: value });
      else if (key === "enum" && Array.isArray(value)) value.forEach((v, i) => { if (typeof v === "string") texts.push({ where: `inputSchema${path}.enum[${i}]`, text: v }); });
      else walk(value, `${path}.${key}`, depth + 1);
    }
  };
  walk(tool.inputSchema, "", 0);
  return texts;
}

const CODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx", ".py", ".json", ".yaml", ".yml", ".toml", ".sh"]);
const GH_MAX_FILE_BYTES = 1024 * 1024;

export function runGhRules(rules: readonly GhRule[], input: { root: string | null; tools: readonly McpToolAnnounced[]; extractedTexts?: readonly { name: string; text: string; file: string | null; line: number | null }[] }): McpFinding[] {
  const findings: McpFinding[] = [];
  const seen = new Set<string>();
  const push = (rule: GhRule, scope: "code" | "announced", file: string | null, line: number | null, message: string, evidence: string) => {
    const key = `${rule.id}|${scope}|${file}|${line}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ rule: rule.id, name: rule.name, category: rule.category, severity: rule.severity, owaspMcp: rule.owaspMcp, file, line, engine: "gh-rules", scope, message, evidenceHash16: sha16(evidence), disqualifying: false });
  };
  for (const rule of rules) {
    if (rule.context === "tool-text") {
      for (const tool of input.tools) {
        for (const { where, text } of toolTexts(tool)) {
          const m = rule.regex.exec(text);
          if (m) push(rule, "announced", `announced:${neutralizeUntrusted(tool.name, 80)}`, null, `${rule.description} [tool ${neutralizeUntrusted(tool.name, 80)} · ${neutralizeUntrusted(where, 80)}]`, m[0]);
        }
      }
      for (const extracted of input.extractedTexts ?? []) {
        const m = rule.regex.exec(extracted.text);
        if (m) push(rule, "code", extracted.file, extracted.line, `${rule.description} [static tool ${neutralizeUntrusted(extracted.name, 80)}]`, m[0]);
      }
    }
  }
  if (input.root) {
    let files: string[] = [];
    try { files = listFilesSorted(input.root, true).filter((f) => !f.endsWith("\u0000symlink")); } catch { files = []; }
    for (const rel of files) {
      for (const rule of rules.filter((r) => r.context === "file-path")) {
        const m = rule.regex.exec(rel);
        if (m) push(rule, "code", neutralizeUntrusted(rel, 200), null, rule.description, m[0]);
      }
      const ext = rel.includes(".") ? rel.slice(rel.lastIndexOf(".")) : "";
      const codeRules = rules.filter((r) => r.context === "code" && (!r.extensions || r.extensions.includes(ext)));
      if (codeRules.length === 0 || !CODE_EXTENSIONS.has(ext)) continue;
      const full = join(input.root, rel);
      if (lstatSync(full).size > GH_MAX_FILE_BYTES) continue;
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((lineText, i) => {
        for (const rule of codeRules) {
          const m = rule.regex.exec(lineText);
          if (m) push(rule, "code", neutralizeUntrusted(rel, 200), i + 1, rule.description, m[0]);
        }
      });
    }
  }
  return findings;
}

// ---- orchestration: engines × {code, announced} + GH rules -----------------------

export type StaticScanDeps = { engineRegistryFile?: string; ghRulesFile?: string; runEngineProcess?: EngineExec; extractedDescriptions?: (root: string) => { name: string; text: string; file: string | null; line: number | null }[] };

/** Writes the announced inventory as a JSON tool manifest so every engine also scans what the server PRESENTS at runtime. */
function materializeAnnounced(tools: readonly McpToolAnnounced[]): string {
  const dir = mkdtempSync(join(tmpdir(), "mcp-announced-"));
  mkdirSync(join(dir, "announced"), { recursive: true });
  writeFileSync(join(dir, "announced", "tools.manifest.json"), JSON.stringify({ tools: tools.map((t) => ({ name: t.name, description: t.description ?? t.title ?? "", inputSchema: t.inputSchema ?? null })) }, null, 2), { mode: 0o600 });
  return dir;
}

export async function runStaticScan(input: { root: string | null; tools: readonly McpToolAnnounced[] }, deps: StaticScanDeps = {}): Promise<StaticScanReport> {
  const registry = loadEngineRegistry(deps.engineRegistryFile);
  const gh = loadGhRules(deps.ghRulesFile);
  const enabled = registry.engines.filter((e) => e.enabled);
  const reasons: string[] = [];
  const runs: EngineRunOutput[] = [];
  const announcedDir = input.tools.length > 0 ? materializeAnnounced(input.tools) : null;
  try {
    for (const descriptor of enabled) {
      const engine = createEngine(descriptor, registry.file, deps.runEngineProcess);
      if (input.root) runs.push(await engine.scan({ root: input.root, scope: "code" }));
      if (announcedDir) runs.push(await engine.scan({ root: announcedDir, scope: "announced" }));
    }
  } finally {
    if (announcedDir) rmSync(announcedDir, { recursive: true, force: true });
  }
  const toolsExtracted = runs.filter((r) => r.scope === "code").flatMap((r) => r.toolsExtracted);
  const extractedTexts = input.root && deps.extractedDescriptions ? deps.extractedDescriptions(input.root) : [];
  const ghFindings = runGhRules(gh.rules, { root: input.root, tools: input.tools, extractedTexts });
  const engineFindings = runs.flatMap((r) => r.findings);
  const all = [...engineFindings, ...ghFindings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule));
  const failedRuns = runs.filter((r) => r.status === "error");
  const failClosed = enabled.length === 0 || failedRuns.length > 0 || (input.root === null && input.tools.length === 0);
  if (enabled.length === 0) reasons.push("NO_ENABLED_ENGINE: Barrier 1 cannot certify without an audited engine");
  for (const run of failedRuns) reasons.push(`ENGINE_FAILED ${run.engine}/${run.scope}: ${run.error}`);
  if (input.root === null && input.tools.length === 0) reasons.push("NOTHING_TO_SCAN: no code and no announced tools");
  const ghGrade = gradeFindings(ghFindings);
  const engineGrades = runs.map((r) => r.grade);
  const combined = gradeFindings(all);
  // worst of every independent verdict; a failed engine forces F (fail closed — never "clean because the scanner died")
  const grade = failClosed ? "F" : worstGrade([...engineGrades, ghGrade.grade, combined.grade]);
  const score = failClosed ? 0 : Math.min(combined.score, ...runs.map((r) => r.score ?? 100));
  return {
    module: "mcp-import-scan",
    grade,
    score,
    findings: all,
    engines: runs.map((r) => {
      const descriptor = enabled.find((e) => e.id === r.engine) as EngineDescriptor;
      return { id: r.engine, version: descriptor.version, format: descriptor.format, scope: r.scope, status: r.status, grade: r.grade, score: r.score, findings: r.findings.length, lockRef: r.lockRef, error: r.error };
    }),
    engineRegistry: { file: registry.file, sha16: registry.sha16, engines: enabled.map((e) => `${e.id}@${e.version}`) },
    ghRules: { file: gh.file, sha16: gh.sha16, rules: gh.rules.length },
    toolsExtracted,
    failClosed,
    reasons
  };
}

/** Engine fingerprint component of the approval: registry entries in use + their audited content hashes + GH rules hash. */
export function engineFingerprint(report: StaticScanReport, registry: EngineRegistry = loadEngineRegistry(report.engineRegistry.file)): string {
  const used = registry.engines.filter((e) => e.enabled).map((e) => `${e.id}@${e.version}#${e.contentSha256}`).sort();
  return sha256Hex(JSON.stringify({ used, ghRules: report.ghRules.sha16 }));
}
