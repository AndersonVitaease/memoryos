// SourceAudit.ts — Sprint EF-39.5
// Real source analysis using Vite ?raw imports.
// Every finding contains file, line, column, snippet, severity, rule.
// All output is immutable. Never modifies any source file.

// ── Raw source imports (Vite ?raw) ─────────────────────────────────────────────
// These give us the actual TypeScript source text at build time.
import memoryStoreRaw          from "../memory/MemoryStore.ts?raw";
import memoryStoreIndexRaw     from "../memory/MemoryStoreIndex.ts?raw";
import memoryStoreQueryRaw     from "../memory/MemoryStoreQuery.ts?raw";
import memoryStoreSearchRaw    from "../memory/MemoryStoreSearch.ts?raw";
import memoryStoreStatsRaw     from "../memory/MemoryStoreStatistics.ts?raw";
import memoryStoreVersionsRaw  from "../memory/MemoryStoreVersionManager.ts?raw";
import memoryStoreArchiveRaw   from "../memory/MemoryStoreArchive.ts?raw";
import memoryStoreSnapshotsRaw from "../memory/MemoryStoreSnapshots.ts?raw";
import metricsRaw              from "../KnowledgeStoreMetrics.ts?raw";

// ── Types ──────────────────────────────────────────────────────────────────────
export type Severity = "critical" | "error" | "warning" | "info";

export interface SourceFinding {
  readonly file:        string;
  readonly line:        number;
  readonly column:      number;
  readonly snippet:     string;
  readonly severity:    Severity;
  readonly rule:        string;
  readonly description: string;
}

export interface FileMetrics {
  readonly file:       string;
  readonly lines:      number;
  readonly blankLines: number;
  readonly codeLines:  number;
  readonly commentLines:number;
  readonly functions:  number;
  readonly classes:    number;
  readonly imports:    number;
}

export interface SourceAuditReport {
  readonly ok:          boolean;
  readonly critical:    number;
  readonly errors:      number;
  readonly warnings:    number;
  readonly findings:    readonly SourceFinding[];
  readonly fileMetrics: readonly FileMetrics[];
  readonly files:       number;
  readonly totalLines:  number;
  readonly durationMs:  number;
}

// ── Rules ──────────────────────────────────────────────────────────────────────
interface Rule {
  id:          string;
  re:          RegExp;
  severity:    Severity;
  description: string;
  // if true: skip lines that are pure comments (rule applies to code only)
  codeOnly?:   boolean;
}

const RULES: Rule[] = [
  { id: "no-as-any",       re: /\bas\s+any\b/,                severity: "critical", description: "Type-unsafe 'as any' cast bypasses type safety" },
  { id: "no-ts-ignore",    re: /@ts-ignore/,                   severity: "critical", description: "@ts-ignore suppresses TypeScript errors unsafely" },
  { id: "no-ts-nocheck",   re: /@ts-nocheck/,                  severity: "critical", description: "@ts-nocheck disables type checking for entire file" },
  { id: "no-eslint-dis",   re: /eslint-disable(?!-next-line)/, severity: "error",    description: "eslint-disable suppresses linting rules broadly" },
  { id: "no-debugger",     re: /\bdebugger\b/,                 severity: "critical", description: "debugger statement must not be in production code", codeOnly: true },
  { id: "no-console-log",  re: /console\.log\s*\(/,            severity: "error",    description: "console.log must not be in production code",         codeOnly: true },
  { id: "no-console-warn", re: /console\.warn\s*\(/,           severity: "warning",  description: "console.warn should not be in production code",      codeOnly: true },
  { id: "no-console-error",re: /console\.error\s*\(/,          severity: "warning",  description: "console.error should not be in production code",     codeOnly: true },
  { id: "no-todo",         re: /\/\/\s*TODO\b/i,               severity: "warning",  description: "TODO comment indicates incomplete implementation" },
  { id: "no-fixme",        re: /\/\/\s*FIXME\b/i,              severity: "error",    description: "FIXME comment indicates known defect" },
  { id: "no-hack",         re: /\/\/\s*HACK\b/i,               severity: "error",    description: "HACK comment indicates technical debt" },
  { id: "no-xxx",          re: /\/\/\s*XXX\b/i,                severity: "warning",  description: "XXX comment indicates problematic code" },
];

// ── Per-file metrics ───────────────────────────────────────────────────────────
function computeMetrics(file: string, source: string): FileMetrics {
  const lines       = source.split("\n");
  let blankLines    = 0;
  let commentLines  = 0;
  let functions     = 0;
  let classes       = 0;
  let imports       = 0;

  for (const line of lines) {
    const t = line.trim();
    if (t === "")                              blankLines++;
    else if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) commentLines++;
    if (/\b(function\s+\w+|=>\s*[{(]|\basync\s+function|\bget\s+\w+\s*\()/.test(t)) functions++;
    if (/^\s*(export\s+)?(abstract\s+)?class\s+/.test(line)) classes++;
    if (/^\s*import\s/.test(line)) imports++;
  }

  return Object.freeze({
    file,
    lines:        lines.length,
    blankLines,
    codeLines:    lines.length - blankLines - commentLines,
    commentLines,
    functions,
    classes,
    imports,
  });
}

// ── Large function detector ────────────────────────────────────────────────────
function detectLargeFunctions(file: string, source: string): SourceFinding[] {
  const findings: SourceFinding[] = [];
  const lines = source.split("\n");
  const MAX_FN_LINES = 60;

  // Simple heuristic: track brace depth; when we enter a function, count lines
  const FN_RE = /(?:async\s+)?(?:function\s+\w+|\w+\s*\([^)]*\)\s*(?::\s*\S+\s*)?{|(?:private|public|protected|readonly)?\s+(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\S+\s*)?{)/;

  let depth = 0;
  let fnStart = -1;
  let fnName = "";

  lines.forEach((line, idx) => {
    const opens  = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;

    if (depth === 0 && FN_RE.test(line)) {
      fnStart = idx;
      const m = line.match(/(?:async\s+)?(?:function\s+(\w+)|\s+(\w+)\s*\()/);
      fnName = m ? (m[1] || m[2] || "anonymous") : "anonymous";
    }

    depth += opens - closes;

    if (depth <= 0 && fnStart >= 0) {
      const len = idx - fnStart + 1;
      if (len > MAX_FN_LINES) {
        findings.push(Object.freeze({
          file,
          line:        fnStart + 1,
          column:      1,
          snippet:     lines[fnStart].trim().slice(0, 120),
          severity:    "warning" as Severity,
          rule:        "max-function-lines",
          description: `Function '${fnName}' is ${len} lines (max: ${MAX_FN_LINES})`,
        }));
      }
      fnStart = -1;
      depth = Math.max(0, depth);
    }
  });

  return findings;
}

// ── Main analysis ──────────────────────────────────────────────────────────────
function analyzeSource(file: string, source: string): SourceFinding[] {
  const findings: SourceFinding[] = [];
  const lines = source.split("\n");

  lines.forEach((line, idx) => {
    const trimmed    = line.trim();
    const isComment  = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");

    for (const rule of RULES) {
      if (rule.codeOnly && isComment) continue;
      const match = rule.re.exec(line);
      if (match) {
        findings.push(Object.freeze({
          file,
          line:        idx + 1,
          column:      match.index + 1,
          snippet:     line.trim().slice(0, 120),
          severity:    rule.severity,
          rule:        rule.id,
          description: rule.description,
        }));
      }
    }
  });

  // Large file check
  const lineCount = lines.length;
  if (lineCount > 400) {
    findings.push(Object.freeze({
      file,
      line:        1,
      column:      1,
      snippet:     `File has ${lineCount} lines`,
      severity:    "warning" as Severity,
      rule:        "max-file-lines",
      description: `File exceeds 400 lines (${lineCount} lines) — consider splitting`,
    }));
  }

  return [...findings, ...detectLargeFunctions(file, source)];
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function runSourceAudit(): SourceAuditReport {
  const t0 = performance.now();

  const SOURCES: Array<[string, string]> = [
    ["MemoryStore.ts",               memoryStoreRaw],
    ["MemoryStoreIndex.ts",          memoryStoreIndexRaw],
    ["MemoryStoreQuery.ts",          memoryStoreQueryRaw],
    ["MemoryStoreSearch.ts",         memoryStoreSearchRaw],
    ["MemoryStoreStatistics.ts",     memoryStoreStatsRaw],
    ["MemoryStoreVersionManager.ts", memoryStoreVersionsRaw],
    ["MemoryStoreArchive.ts",        memoryStoreArchiveRaw],
    ["MemoryStoreSnapshots.ts",      memoryStoreSnapshotsRaw],
    ["KnowledgeStoreMetrics.ts",     metricsRaw],
  ];

  const allFindings: SourceFinding[] = [];
  const fileMetrics: FileMetrics[]   = [];

  for (const [file, src] of SOURCES) {
    allFindings.push(...analyzeSource(file, src));
    fileMetrics.push(computeMetrics(file, src));
  }

  const totalLines = fileMetrics.reduce((a, m) => a + m.lines, 0);
  const critical   = allFindings.filter(f => f.severity === "critical").length;
  const errors     = allFindings.filter(f => f.severity === "error").length;
  const warnings   = allFindings.filter(f => f.severity === "warning").length;

  return Object.freeze({
    ok:          critical === 0 && errors === 0,
    critical,
    errors,
    warnings,
    findings:    Object.freeze(allFindings),
    fileMetrics: Object.freeze(fileMetrics),
    files:       SOURCES.length,
    totalLines,
    durationMs:  Math.round((performance.now() - t0) * 100) / 100,
  });
}

// Re-export structural audit for convenience
export type { StructuralAuditReport, StructuralCheck } from "./SourceAuditStructural";
export { runStructuralAudit } from "./SourceAuditStructural";

// Synchronous — no async needed (raw strings are available at module load)
// runSourceAudit() is already exported above