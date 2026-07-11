/**
 * ProjectReaderCapability
 *
 * Única responsável por acessar o código-fonte do projeto (MAS §4.4).
 * Specialists NUNCA acessam arquivos diretamente.
 *
 * Níveis de auditoria (Correção 7):
 *   file | module | project | pr
 *
 * Interface oficial (MES §19): { id, name, version, execute, validate }
 * Contrato oficial (MES §5, §6): Request/Response padronizado.
 */

import { createCapability } from "./baseCapability";
import { successResponse } from "./requestResponse";

// Lazy glob — nenhum arquivo e carregado durante o boot.
// Os modulos sao carregados sob demanda quando execute() e chamado.
const SOURCE_GLOBS_LAZY = import.meta.glob(
  ["/src/lib/**/*.js", "/src/lib/**/*.jsx", "/src/pages/**/*.jsx", "/src/components/**/*.jsx", "/src/hooks/**/*.js", "/src/App.jsx"],
  { query: "?raw", import: "default", eager: false }
);

const MAX_TOTAL_CHARS = 120000;

function normalizePath(p) {
  return p.replace(/^\/src\//, "");
}

async function loadAllSources() {
  const result = {};
  await Promise.all(
    Object.entries(SOURCE_GLOBS_LAZY).map(async ([path, loader]) => {
      try {
        result[path] = await loader();
      } catch {
        // arquivo ignorado se falhar ao carregar
      }
    })
  );
  return result;
}

async function filterByScope(scope) {
  const loaded = await loadAllSources();
  const entries = Object.entries(loaded)
    .map(([path, content]) => ({ path: normalizePath(path), content: typeof content === "string" ? content : String(content ?? "") }))
    .sort((a, b) => a.path.localeCompare(b.path));

  switch (scope?.level) {
    case "file":
      if (!scope.target) return [];
      return entries.filter((e) => e.path === scope.target.replace(/^\/?src\//, ""));
    case "module":
      if (!scope.target) return entries;
      const target = scope.target.replace(/^\/?src\//, "").replace(/\/$/, "");
      return entries.filter((e) => e.path.startsWith(target + "/") || e.path.startsWith(target));
    case "pr":
      if (Array.isArray(scope.target) && scope.target.length > 0) {
        const set = new Set(scope.target.map((t) => t.replace(/^\/?src\//, "")));
        return entries.filter((e) => set.has(e.path));
      }
      return entries.slice(0, 10);
    case "project":
    default:
      return entries;
  }
}

function applyBudget(entries) {
  let total = 0;
  const result = [];
  for (const entry of entries) {
    if (total + entry.content.length > MAX_TOTAL_CHARS) {
      const remaining = MAX_TOTAL_CHARS - total;
      if (remaining > 500) {
        result.push({ ...entry, content: entry.content.substring(0, remaining) + "\n// ... [truncado]" });
      }
      break;
    }
    result.push(entry);
    total += entry.content.length;
  }
  return result;
}

export const ProjectReaderCapability = createCapability({
  id: "project-reader",
  name: "Project Reader",
  version: "1.0",
  validate: async (request) => {
    if (!request || !request.context || !request.context.scope) return false;
    return ["file", "module", "project", "pr"].includes(request.context.scope.level);
  },
  execute: async (request) => {
    const scope = request.context.scope;
    const all = await filterByScope(scope);
    const files = applyBudget(all);
    return successResponse({
      files,
      scope,
      fileCount: files.length,
      totalChars: files.reduce((sum, f) => sum + f.content.length, 0),
    });
  },
});

export default ProjectReaderCapability;