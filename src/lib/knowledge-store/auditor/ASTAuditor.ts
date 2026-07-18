// ASTAuditor.ts — Sprint EF-39.5
// Token-level structural analysis of TypeScript source files.
// No TS compiler (unavailable in browser). Uses a deterministic tokenizer.
// All output is immutable.

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
export interface ASTClass {
  readonly name:           string;
  readonly line:           number;
  readonly methods:        readonly string[];
  readonly methodCount:    number;
  readonly isExported:     boolean;
  readonly isAbstract:     boolean;
  readonly implementsCount:number;
  readonly extendsCount:   number;
  readonly linesOfCode:    number;
}

export interface ASTImport {
  readonly from:   string;
  readonly line:   number;
  readonly named:  readonly string[];
}

export interface ComplexityMetric {
  readonly name:            string;
  readonly file:            string;
  readonly line:            number;
  readonly cyclomaticScore: number;  // decision points + 1
  readonly paramCount:      number;
  readonly blockDepth:      number;
  readonly linesOfCode:     number;
}

export interface FileASTReport {
  readonly file:       string;
  readonly classes:    readonly ASTClass[];
  readonly imports:    readonly ASTImport[];
  readonly exports:    readonly string[];
  readonly interfaces: readonly string[];
  readonly functions:  readonly ComplexityMetric[];
  readonly fanOut:     number;  // number of distinct imports
  readonly lineCount:  number;
}

export interface DependencyEdge {
  readonly from: string;
  readonly to:   string;
}

export interface DependencyReport {
  readonly edges:           readonly DependencyEdge[];
  readonly circularPairs:   readonly string[];
  readonly hasCircular:     boolean;
  readonly fanInMap:        Readonly<Record<string, number>>;
  readonly highCouplingFiles:readonly string[];
}

export interface ASTAuditReport {
  readonly files:       readonly FileASTReport[];
  readonly dependencies:DependencyReport;
  readonly complexity:  readonly ComplexityMetric[];
  readonly topComplex:  readonly ComplexityMetric[];
  readonly codeSmells:  readonly string[];
  readonly durationMs:  number;
}

// ── Tokenizer helpers ──────────────────────────────────────────────────────────
function extractClasses(source: string, file: string): ASTClass[] {
  const classes: ASTClass[] = [];
  const lines    = source.split("\n");
  const CLASS_RE = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?/;

  lines.forEach((line, idx) => {
    const m = CLASS_RE.exec(line);
    if (!m) return;

    const name        = m[4];
    const isExported  = !!m[2];
    const isAbstract  = !!m[3];
    const extendsCount = m[5] ? 1 : 0;
    const implStr     = m[6] ?? "";
    const implementsCount = implStr ? implStr.split(",").length : 0;

    // Find the class body lines
    let depth = 0;
    let started = false;
    let classStart = idx;
    let classEnd   = idx;
    const methods: string[] = [];

    for (let i = idx; i < lines.length; i++) {
      const opens  = (lines[i].match(/{/g) || []).length;
      const closes = (lines[i].match(/}/g) || []).length;
      if (!started && opens > 0) { started = true; }
      depth += opens - closes;

      // Collect method names inside the class body
      if (started && depth > 0) {
        const methodMatch = lines[i].match(/^\s+(?:(?:private|public|protected|readonly|static|async|override)\s+)*(\w+)\s*\(/);
        if (methodMatch && methodMatch[1] !== "constructor" && !["if","for","while","switch"].includes(methodMatch[1])) {
          methods.push(methodMatch[1]);
        }
      }

      if (started && depth <= 0) { classEnd = i; break; }
    }

    classes.push(Object.freeze({
      name, line: idx + 1,
      methods: Object.freeze(methods),
      methodCount:      methods.length,
      isExported, isAbstract,
      implementsCount, extendsCount,
      linesOfCode:      classEnd - classStart + 1,
    }));
  });

  return classes;
}

function extractImports(source: string): ASTImport[] {
  const imports: ASTImport[] = [];
  const lines = source.split("\n");
  const IMPORT_RE = /^\s*import\s+(?:type\s+)?(?:{([^}]*)}|\*\s+as\s+\w+|(\w+))\s+from\s+['"]([^'"]+)['"]/;

  lines.forEach((line, idx) => {
    const m = IMPORT_RE.exec(line);
    if (!m) return;
    const named = m[1] ? m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) : m[2] ? [m[2]] : [];
    imports.push(Object.freeze({ from: m[3], line: idx + 1, named: Object.freeze(named) }));
  });

  return imports;
}

function extractExports(source: string): string[] {
  const exports: string[] = [];
  const EXPORT_RE = /^\s*export\s+(?:(?:default|async)\s+)?(?:class|function|const|let|interface|type|enum)\s+(\w+)/;
  source.split("\n").forEach(line => {
    const m = EXPORT_RE.exec(line);
    if (m) exports.push(m[1]);
  });
  return exports;
}

function extractInterfaces(source: string): string[] {
  const ifaces: string[] = [];
  const IFACE_RE = /^\s*(?:export\s+)?interface\s+(\w+)/;
  source.split("\n").forEach(line => {
    const m = IFACE_RE.exec(line);
    if (m) ifaces.push(m[1]);
  });
  return ifaces;
}

function cyclomaticComplexity(body: string): number {
  // Count decision points: if, else if, for, while, case, catch, &&, ||, ??
  const decisions = (body.match(/\b(if|else\s+if|for|while|case|catch)\b|&&|\|\||\?\?/g) || []).length;
  return decisions + 1;
}

function maxBlockDepth(body: string): number {
  let depth = 0;
  let max   = 0;
  for (const ch of body) {
    if (ch === "{") { depth++; if (depth > max) max = depth; }
    else if (ch === "}") depth--;
  }
  return max;
}

function extractFunctions(source: string, file: string): ComplexityMetric[] {
  const metrics: ComplexityMetric[] = [];
  const lines = source.split("\n");
  const FN_RE = /^\s+(?:(?:private|public|protected|static|async|override|abstract)\s+)*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\S+\s*)?[{;]/;

  lines.forEach((line, idx) => {
    const m = FN_RE.exec(line);
    if (!m) return;
    const name      = m[1];
    if (["if","for","while","switch","catch","constructor"].includes(name)) return;
    const paramStr  = m[2];
    const paramCount= paramStr.trim() === "" ? 0 : paramStr.split(",").length;

    // Extract body
    let depth = 0;
    let started = false;
    let bodyLines: string[] = [];
    for (let i = idx; i < Math.min(idx + 150, lines.length); i++) {
      const opens  = (lines[i].match(/{/g) || []).length;
      const closes = (lines[i].match(/}/g) || []).length;
      if (!started && opens > 0) started = true;
      if (started) bodyLines.push(lines[i]);
      depth += opens - closes;
      if (started && depth <= 0) break;
    }
    const body = bodyLines.join("\n");
    metrics.push(Object.freeze({
      name, file, line: idx + 1,
      cyclomaticScore: cyclomaticComplexity(body),
      paramCount,
      blockDepth:      maxBlockDepth(body),
      linesOfCode:     bodyLines.length,
    }));
  });

  return metrics;
}

// ── Dependency analysis ────────────────────────────────────────────────────────
function buildDependencyReport(fileReports: FileASTReport[]): DependencyReport {
  const edges: DependencyEdge[] = [];
  const fanInMap: Record<string, number> = {};

  for (const fr of fileReports) {
    for (const imp of fr.imports) {
      // Only internal imports
      if (imp.from.startsWith(".") || imp.from.startsWith("@/lib/knowledge-store")) {
        const to = imp.from.split("/").pop() ?? imp.from;
        edges.push(Object.freeze({ from: fr.file, to }));
        fanInMap[to] = (fanInMap[to] ?? 0) + 1;
      }
    }
  }

  // Circular detection (A→B→A)
  const circularPairs: string[] = [];
  const edgeSet = new Set(edges.map(e => `${e.from}|${e.to}`));
  for (const e of edges) {
    const reverse = `${e.to}|${e.from}`;
    if (edgeSet.has(reverse)) {
      const pair = [e.from, e.to].sort().join(" ↔ ");
      if (!circularPairs.includes(pair)) circularPairs.push(pair);
    }
  }

  // High coupling = file that imports > 5 other internal modules
  const fanOutMap: Record<string, number> = {};
  for (const e of edges) fanOutMap[e.from] = (fanOutMap[e.from] ?? 0) + 1;
  const highCouplingFiles = Object.entries(fanOutMap)
    .filter(([, n]) => n > 5)
    .map(([f]) => f);

  return Object.freeze({
    edges:            Object.freeze(edges),
    circularPairs:    Object.freeze(circularPairs),
    hasCircular:      circularPairs.length > 0,
    fanInMap:         Object.freeze(fanInMap),
    highCouplingFiles:Object.freeze(highCouplingFiles),
  });
}

// ── Code smells ────────────────────────────────────────────────────────────────
function detectCodeSmells(fileReports: FileASTReport[], allComplexity: ComplexityMetric[]): string[] {
  const smells: string[] = [];

  for (const fr of fileReports) {
    if (fr.lineCount > 400)
      smells.push(`Large file: ${fr.file} (${fr.lineCount} lines)`);
    for (const cls of fr.classes) {
      if (cls.methodCount > 15)
        smells.push(`God class: ${cls.name} in ${fr.file} (${cls.methodCount} methods)`);
      if (cls.linesOfCode > 300)
        smells.push(`Large class: ${cls.name} in ${fr.file} (${cls.linesOfCode} lines)`);
    }
    if (fr.fanOut > 7)
      smells.push(`High coupling: ${fr.file} imports ${fr.fanOut} modules`);
  }

  for (const fn of allComplexity) {
    if (fn.cyclomaticScore > 10)
      smells.push(`High complexity: ${fn.name} in ${fn.file} (CC=${fn.cyclomaticScore})`);
    if (fn.paramCount > 5)
      smells.push(`Too many params: ${fn.name} in ${fn.file} (${fn.paramCount} params)`);
    if (fn.linesOfCode > 60)
      smells.push(`Long method: ${fn.name} in ${fn.file} (${fn.linesOfCode} lines)`);
  }

  return smells;
}

// ── Main ───────────────────────────────────────────────────────────────────────
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

export function runASTAudit(): ASTAuditReport {
  const t0 = performance.now();

  const fileReports: FileASTReport[] = SOURCES.map(([file, src]) => {
    const classes    = extractClasses(src, file);
    const imports    = extractImports(src);
    const exports    = extractExports(src);
    const interfaces = extractInterfaces(src);
    const functions  = extractFunctions(src, file);
    const fanOut     = imports.filter(i => i.from.startsWith(".") || i.from.startsWith("@/")).length;

    return Object.freeze({
      file,
      classes:    Object.freeze(classes),
      imports:    Object.freeze(imports),
      exports:    Object.freeze(exports),
      interfaces: Object.freeze(interfaces),
      functions:  Object.freeze(functions),
      fanOut,
      lineCount:  src.split("\n").length,
    });
  });

  const allComplexity = fileReports.flatMap(f => [...f.functions]);
  const topComplex    = [...allComplexity].sort((a, b) => b.cyclomaticScore - a.cyclomaticScore).slice(0, 10);
  const dependencies  = buildDependencyReport(fileReports);
  const codeSmells    = detectCodeSmells(fileReports, allComplexity);

  return Object.freeze({
    files:       Object.freeze(fileReports),
    dependencies,
    complexity:  Object.freeze(allComplexity),
    topComplex:  Object.freeze(topComplex),
    codeSmells:  Object.freeze(codeSmells),
    durationMs:  Math.round((performance.now() - t0) * 100) / 100,
  });
}