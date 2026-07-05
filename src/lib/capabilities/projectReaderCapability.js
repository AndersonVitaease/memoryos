/**
 * ProjectReaderCapability
 *
 * Única responsável por acessar o código-fonte do projeto.
 *
 * Conforme MAS §4.4 (Capability Layer) e MES §19:
 * - Acesso a filesystem/glob/path é responsabilidade exclusiva das Capabilities.
 * - Specialists NUNCA acessam arquivos diretamente.
 *
 * Níveis de auditoria suportados (Correção 7):
 *   - file     → um arquivo específico
 *   - module   → uma pasta/módulo
 *   - project  → projeto completo
 *   - pr       → pull request (simulado como conjunto de arquivos alterados)
 *
 * Nesta implementação, o "filesystem" é o bundle de módulos Vite (?raw),
 * pois o app roda no browser. A interface permanece idêntica — apenas a
 * origem dos dados muda em ambientes server-side.
 */

import { createCapability } from "./baseCapability";

// === FONTE DE DADOS (Vite ?raw, carregada em build) ===
const SOURCE_GLOBS = import.meta.glob(
  [
    "/src/lib/**/*.js",
    "/src/lib/**/*.jsx",
    "/src/pages/**/*.jsx",
    "/src/components/**/*.jsx",
    "/src/hooks/**/*.js",
    "/src/App.jsx",
  ],
  { query: "?raw", import: "default", eager: true }
);

const MAX_TOTAL_CHARS = 120000;

/**
 * Normaliza o caminho removendo o prefixo /src/.
 */
function normalizePath(p) {
  return p.replace(/^\/src\//, "");
}

/**
 * Filtra fontes por escopo.
 * @param {Object} scope - { level, target? }
 */
function filterByScope(scope) {
  const entries = Object.entries(SOURCE_GLOBS)
    .map(([path, content]) => ({ path: normalizePath(path), content }))
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
      // Pull Request: escopo reduzido aos arquivos listados em scope.target (array)
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

/**
 * Aplica limite de caracteres para evitar estouro de contexto.
 */
function applyBudget(entries) {
  let total = 0;
  const result = [];
  for (const entry of entries) {
    if (total + entry.content.length > MAX_TOTAL_CHARS) {
      const remaining = MAX_TOTAL_CHARS - total;
      if (remaining > 500) {
        result.push({
          ...entry,
          content: entry.content.substring(0, remaining) + "\n// ... [truncado pela Capability]",
        });
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
  validate: async (input) => {
    if (!input || !input.scope) return false;
    return ["file", "module", "project", "pr"].includes(input.scope.level);
  },
  execute: async (input) => {
    const scope = input.scope;
    const all = filterByScope(scope);
    const files = applyBudget(all);
    return {
      files,
      scope,
      fileCount: files.length,
      totalChars: files.reduce((sum, f) => sum + f.content.length, 0),
    };
  },
});

export default ProjectReaderCapability;