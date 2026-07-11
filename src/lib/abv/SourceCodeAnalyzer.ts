// ABV — Source Code Analyzer
// Foundation v1.0 · Engineering First
//
// Analisa automaticamente o codigo-fonte via import.meta.glob (Vite).
// Nenhuma lista manual. Toda informacao extraida do codigo real.

export interface ModuleAnalysis {
  path: string;
  layer: string | null;
  imports: ParsedImport[];
  exports: string[];
  rawSource: string;
}

export interface ParsedImport {
  raw: string;
  specifier: string;
  type: "relative" | "absolute" | "external" | "dynamic";
  resolvedLayer: string | null;
}

export interface SourceAnalysisResult {
  modules: ModuleAnalysis[];
  filesAnalyzed: number;
  importsFound: number;
  exportsFound: number;
  layerMap: Record<string, ModuleAnalysis[]>;
  /** module path -> list of module paths it imports */
  dependencyGraph: Record<string, string[]>;
  /** cycles: each entry is an array of module paths forming a cycle */
  circularDependencies: string[][];
  durationMs: number;
}

// ── Layer path mapping — derived from actual directory structure ──────────────

const LAYER_PATH_PATTERNS: Array<{ layer: string; pattern: string }> = [
  { layer: "connector-runtime",  pattern: "connector-runtime" },
  { layer: "capability-runtime", pattern: "capability-runtime" },
  { layer: "goal-engine",        pattern: "goal-engine" },
  { layer: "planner-engine",     pattern: "planner-engine" },
  { layer: "pie",                pattern: "/pie/" },
  { layer: "wme",                pattern: "/wme/" },
  { layer: "memory-engine",      pattern: "memory-engine" },
  { layer: "journey",            pattern: "/journey/" },
  { layer: "specialist-router",  pattern: "specialist-router" },
  { layer: "strategy-fusion",    pattern: "strategy-fusion" },
  { layer: "policies",           pattern: "policies" },
  { layer: "sprint1",            pattern: "/sprint1/" },
];

function resolveLayer(path: string): string | null {
  for (const { layer, pattern } of LAYER_PATH_PATTERNS) {
    if (path.includes(pattern)) return layer;
  }
  return null;
}

// ── Import Parser ─────────────────────────────────────────────────────────────
// Parses TypeScript/JavaScript source to extract import statements.
// Works on raw string content — no AST, pure regex-based for browser compat.

const STATIC_IMPORT_RE = /(?:^|\n)\s*import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const EXPORT_RE = /(?:^|\n)\s*export\s+(?:default\s+)?(?:class|function|const|let|var|type|interface|async\s+function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
const EXPORT_NAMED_RE = /(?:^|\n)\s*export\s*\{([^}]+)\}/g;

function classifyImport(specifier: string): ParsedImport["type"] {
  if (specifier.startsWith(".")) return "relative";
  if (specifier.startsWith("@/") || specifier.startsWith("~/")) return "absolute";
  // internal lib paths without leading dot
  if (specifier.startsWith("../") || specifier.includes("/lib/") || specifier.includes("/src/")) return "relative";
  return "external";
}

function parseImports(source: string, modulePath: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const seen = new Set<string>();

  const addImport = (raw: string, specifier: string, type: ParsedImport["type"]) => {
    if (seen.has(specifier)) return;
    seen.add(specifier);
    results.push({
      raw,
      specifier,
      type,
      resolvedLayer: resolveLayerFromSpecifier(specifier, modulePath),
    });
  };

  // Static imports
  let m: RegExpExecArray | null;
  STATIC_IMPORT_RE.lastIndex = 0;
  while ((m = STATIC_IMPORT_RE.exec(source)) !== null) {
    addImport(m[0].trim(), m[1], classifyImport(m[1]));
  }

  // Dynamic imports
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(source)) !== null) {
    addImport(m[0].trim(), m[1], "dynamic");
  }

  return results;
}

function parseExports(source: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => { if (name && !seen.has(name)) { seen.add(name); names.push(name); } };

  let m: RegExpExecArray | null;
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(source)) !== null) add(m[1]);

  EXPORT_NAMED_RE.lastIndex = 0;
  while ((m = EXPORT_NAMED_RE.exec(source)) !== null) {
    m[1].split(",").forEach(s => add(s.trim().split(/\s+as\s+/).pop()!.trim()));
  }

  return names;
}

function resolveLayerFromSpecifier(specifier: string, fromModule: string): string | null {
  // Try to resolve from the specifier path itself
  const fromLayer = resolveLayer(specifier);
  if (fromLayer) return fromLayer;
  // For relative imports, resolve from the source module's layer context
  if (specifier.startsWith(".")) {
    // Resolve relative to fromModule
    const parts = fromModule.split("/");
    parts.pop();
    const resolved = [...parts, ...specifier.split("/")].reduce<string[]>((acc, part) => {
      if (part === "..") acc.pop();
      else if (part !== ".") acc.push(part);
      return acc;
    }, []).join("/");
    return resolveLayer(resolved);
  }
  return null;
}

// ── Circular Dependency Detection — DFS ──────────────────────────────────────

function detectAllCycles(graph: Record<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  function dfs(node: string): void {
    if (onStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = stack.slice(cycleStart);
        // Deduplicate equivalent cycles
        const key = [...cycle].sort().join("|");
        if (!cycles.some(c => [...c].sort().join("|") === key)) {
          cycles.push([...cycle, node]);
        }
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    onStack.add(node);
    stack.push(node);
    for (const dep of graph[node] ?? []) {
      dfs(dep);
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const node of Object.keys(graph)) dfs(node);
  return cycles;
}

// ── Main Analyzer ─────────────────────────────────────────────────────────────

export class SourceCodeAnalyzer {
  /**
   * Analyze all source files available via Vite's import.meta.glob.
   * The glob result is passed in by the caller to keep this class testable.
   */
  analyze(
    sources: Record<string, string>,
  ): SourceAnalysisResult {
    const start = Date.now();
    const modules: ModuleAnalysis[] = [];
    const dependencyGraph: Record<string, string[]> = {};

    for (const [path, rawSource] of Object.entries(sources)) {
      // Skip empty or non-source files
      if (!rawSource || typeof rawSource !== "string") continue;

      const layer = resolveLayer(path);
      const imports = parseImports(rawSource, path);
      const exports = parseExports(rawSource);

      modules.push({ path, layer, imports, exports, rawSource });

      // Build dependency graph: path -> list of imported module paths
      dependencyGraph[path] = imports
        .filter(i => i.type !== "external")
        .map(i => i.specifier);
    }

    // Group by layer
    const layerMap: Record<string, ModuleAnalysis[]> = {};
    for (const mod of modules) {
      const key = mod.layer ?? "__unknown";
      if (!layerMap[key]) layerMap[key] = [];
      layerMap[key].push(mod);
    }

    // Detect circular dependencies
    const circularDependencies = detectAllCycles(dependencyGraph);

    const importsFound = modules.reduce((acc, m) => acc + m.imports.length, 0);
    const exportsFound = modules.reduce((acc, m) => acc + m.exports.length, 0);

    return {
      modules,
      filesAnalyzed: modules.length,
      importsFound,
      exportsFound,
      layerMap,
      dependencyGraph,
      circularDependencies,
      durationMs: Date.now() - start,
    };
  }
}

// ── Vite Glob Loader ──────────────────────────────────────────────────────────
// Loads all TS/JS source files from src/lib using Vite's import.meta.glob.
// The ?raw suffix returns the file content as a string.

export async function loadSourceFiles(): Promise<Record<string, string>> {
  // Vite processes import.meta.glob at build time — the glob pattern must be a literal string.
  const rawModules = import.meta.glob("/src/lib/**/*.{ts,js}", { as: "raw", eager: false });
  const result: Record<string, string> = {};

  await Promise.all(
    Object.entries(rawModules).map(async ([path, loader]) => {
      try {
        const content = await (loader as () => Promise<string>)();
        if (content && typeof content === "string") {
          result[path] = content;
        }
      } catch {
        // Hardening: file load errors are recorded as empty, never interrupt audit
        result[path] = "";
      }
    }),
  );

  return result;
}