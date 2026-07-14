/**
 * SourceCodeParser.ts — EF-60.2
 * Phase 6.0.0 · MemoryOS · 2026-07-14
 *
 * Extracts architectural entities from raw source code using regex-based AST-free parsing.
 * Supports: TypeScript, JavaScript, TSX, JSX, JSON.
 */

import type { EntityType, ArchitecturalLayer } from "./PKBTypes";

export interface ParsedFile {
  path:        string;
  language:    string;
  classes:     string[];
  interfaces:  string[];
  enums:       string[];
  functions:   string[];
  constants:   string[];
  types:       string[];
  exports:     string[];
  imports:     ImportEntry[];
  lineCount:   number;
  description: string;
}

export interface ImportEntry {
  source:  string;   // module path
  symbols: string[]; // imported names
}

// ── Layer Detector ────────────────────────────────────────────────────────────

const LAYER_SIGNALS: Array<{ pattern: RegExp; layer: ArchitecturalLayer }> = [
  { pattern: /src\/pages\//,                              layer: "presentation" },
  { pattern: /src\/components\//,                         layer: "presentation" },
  { pattern: /cognitive-task-planner|orchestrat/i,        layer: "orchestration" },
  { pattern: /conversation-cognitive-gateway|router/i,    layer: "orchestration" },
  { pattern: /live-cognitive-pipeline/i,                  layer: "orchestration" },
  { pattern: /connector(?!-runtime)/i,                    layer: "connector" },
  { pattern: /connector-runtime/i,                        layer: "connector" },
  { pattern: /github-deep-analysis/i,                     layer: "connector" },
  { pattern: /-engine|-Engine|Engine\./,                  layer: "engine" },
  { pattern: /src\/lib\//,                                layer: "engine" },
  { pattern: /Types\.ts$|types\.ts$/,                     layer: "type_definition" },
  { pattern: /\.test\.|\.spec\.|__tests__|\/tests?\//i,   layer: "test" },
  { pattern: /\.config\.|package\.json|tsconfig/i,        layer: "config" },
  { pattern: /src\/utils\/|src\/lib\/utils/,              layer: "utility" },
];

export function detectLayer(filePath: string): ArchitecturalLayer {
  for (const { pattern, layer } of LAYER_SIGNALS) {
    if (pattern.test(filePath)) return layer;
  }
  return "unknown";
}

// ── Language Detector ─────────────────────────────────────────────────────────

export function detectLanguage(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts"))  return "typescript";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js"))  return "javascript";
  if (path.endsWith(".json")) return "json";
  return "unknown";
}

// ── Source Parser ─────────────────────────────────────────────────────────────

export function parseSourceFile(path: string, content: string): ParsedFile {
  const lang      = detectLanguage(path);
  const lines     = content.split("\n");
  const lineCount = lines.length;

  if (lang === "json") return parseJSON(path, content, lineCount);

  const classes:    string[] = [];
  const interfaces: string[] = [];
  const enums:      string[] = [];
  const functions:  string[] = [];
  const constants:  string[] = [];
  const types:      string[] = [];
  const exports:    string[] = [];
  const imports:    ImportEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Classes
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) classes.push(classMatch[1]);

    // Interfaces
    const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
    if (ifaceMatch) interfaces.push(ifaceMatch[1]);

    // Enums
    const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/);
    if (enumMatch) enums.push(enumMatch[1]);

    // Type aliases
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)\s*(?:<|=)/);
    if (typeMatch) types.push(typeMatch[1]);

    // Functions
    const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) functions.push(fnMatch[1]);

    // Arrow functions / const fn
    const arrowMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*(?::\s*\w[\w<>, |&]*\s*)?=\s*(?:async\s+)?\(/);
    if (arrowMatch) functions.push(arrowMatch[1]);

    // Constants
    const constMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*(?::\s*[\w<>[\]|&, ]+)?\s*=/);
    if (constMatch && !functions.includes(constMatch[1])) constants.push(constMatch[1]);

    // Named exports
    const exportMatch = trimmed.match(/^export\s+\{([^}]+)\}/);
    if (exportMatch) {
      exportMatch[1].split(",").map(s => s.trim().split(/\s+as\s+/).pop()?.trim()).filter(Boolean).forEach(n => exports.push(n!));
    }
    const exportDefaultMatch = trimmed.match(/^export\s+default\s+(?:class\s+|function\s+)?(\w+)/);
    if (exportDefaultMatch) exports.push(exportDefaultMatch[1]);

    // Imports
    const importMatch = trimmed.match(/^import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const symbols = importMatch[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      imports.push({ source: importMatch[2], symbols });
    }
    const importDefaultMatch = trimmed.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (importDefaultMatch) imports.push({ source: importDefaultMatch[2], symbols: [importDefaultMatch[1]] });
    const importStarMatch = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (importStarMatch) imports.push({ source: importStarMatch[2], symbols: [importStarMatch[1]] });
  }

  // Generate description from class/interface names
  const mainName = [...classes, ...interfaces, ...enums][0];
  const description = mainName
    ? `${lang} module — primary export: ${mainName}`
    : `${lang} module — ${functions.length} function(s), ${constants.length} constant(s)`;

  return {
    path, language: lang,
    classes: [...new Set(classes)],
    interfaces: [...new Set(interfaces)],
    enums: [...new Set(enums)],
    functions: [...new Set(functions)].slice(0, 20),
    constants: [...new Set(constants)].slice(0, 10),
    types: [...new Set(types)],
    exports: [...new Set([...exports, ...classes, ...interfaces, ...enums])],
    imports,
    lineCount,
    description,
  };
}

function parseJSON(path: string, content: string, lineCount: number): ParsedFile {
  const exports: string[] = [];
  try {
    const obj = JSON.parse(content);
    if (obj.name)    exports.push(`name:${obj.name}`);
    if (obj.version) exports.push(`version:${obj.version}`);
    if (obj.dependencies) exports.push(...Object.keys(obj.dependencies).slice(0, 5).map(d => `dep:${d}`));
  } catch { /* ignore */ }
  return {
    path, language: "json", classes: [], interfaces: [], enums: [],
    functions: [], constants: [], types: [], exports, imports: [],
    lineCount, description: "JSON configuration file",
  };
}