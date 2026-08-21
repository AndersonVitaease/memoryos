/**
 * KnownMissionDecomposer.ts — Known Mission Decomposition V1
 *
 * SRP: reconhecer padroes conhecidos de engenharia no texto do usuario e
 *      produzir DAG deterministico (ExecutionStep[]) SEM LLM.
 *
 * O decomposer NAO e uma engine, planner ou scheduler. E uma camada de
 *      pattern matching deterministico que roda ANTES do fallback generico
 *      de single-tool no ConversationPlanningEngine.
 *
 * Padroes V1:
 *   1. FIND -> READ: "localize X.ts e leia" -> code.search -> file.read ($ref)
 *   2. MULTI/SINGLE READ: "leia A.ts, B.ts e C.ts" -> N x file.read (mesma wave)
 *   3. STATUS + READS: "verifique o status e leia A.ts e B.ts" -> git.status + reads
 *   4. FIND -> READ -> REFERENCES: NAO APLICAVEL — engineering.code.references
 *      requer `symbol` (nao `path`). Nao inventar simbolo.
 *
 * Regras de exclusao:
 *   - Goal types protegidos (supervisedEngineering, openhands, GitHub, writes)
 *   - Nomes de tool explicitos no texto ("engineering.code.search")
 *   - Verbos de escrita (escrever, criar, editar, deletar, commit, push)
 *   - Mencao a GitHub (PR, issues, commit, branch)
 *
 * Determinismo: mesmo rawText + goalType -> mesmo DAG. Zero LLM. Zero rede.
 */

import type { ExecutionStep } from "./ExecutionPlanTypes";

// ── Protected goal types (decomposer never runs) ─────────────────────────────

const PROTECTED_GOAL_TYPES: ReadonlySet<string> = new Set([
  "supervisedEngineering",
  "openhands.runTask",
  "deepResearch",
  "github.listRepos",
  "github.listBranches",
  "github.listCommits",
  "github.listFiles",
  "github.getFile",
  "github.searchCode",
  "github.listPullRequests",
  "github.listIssues",
  "github.commitTimeline",
  "github.repoStatistics",
  "gmail.readInbox",
  "gmail.searchMessages",
  "gmail.readMessage",
  "gmail.readEmail",
  "calendar.listToday",
  "calendar.listTomorrow",
  "calendar.listWeek",
  "calendar.createEvent",
  "drive.createFolder",
  "drive.downloadFile",
  "drive.summarizeDocument",
  "drive.extractSections",
  "drive.openDocument",
  "drive.searchFiles",
  "drive.moveFile",
  "drive.uploadFile",
  "drive.deleteFile",
  "drive.renameFile",
  "drive.copyFile",
  "drive.listRecent",
  "base44.email.send",
  "base44.users.invite",
  "base44.users.list",
  "base44.auth.updateMe",
  "base44.auth.logout",
  "base44.ai.generateVideo",
  "base44.ai.transcribeAudio",
  "base44.analytics.track",
  "engineering.repoHealthCheck",
]);

// ── Exclusion regexes ─────────────────────────────────────────────────────────

// Write verbs (PT + EN) — V1 excludes writes entirely.
const WRITE_VERB_RE =
  /\b(?:escrever|escreva|criar|crie|editar|edite|modificar|modifique|alterar|altere|deletar|delete|remover|remova|salvar|salve|commitar|commite|pushar|pushe|aplicar|aplique|patch|create|edit|modify|delete|remove|save|commit|push)\b/i;

// Explicit MCP tool name in user message — user made an explicit single-tool
// call; decomposer must not override.
const EXPLICIT_TOOL_RE = /engineering\.\w+\.\w+/i;

// GitHub mentions — skip (GitHub connector preserved).
const GITHUB_RE =
  /\b(?:github|pull\s+request|\bPR\b|issues?|commits?|branch(?:es)?|reposit[oó]rio)\b/i;

// ── Verb regexes ──────────────────────────────────────────────────────────────

const FIND_VERB_RE =
  /(?:localiz[ae]|encontr[ae]|procur[ae]|ach[aeo]|busque|buscar|find|locate|search\s+for)/i;

const READ_VERB_RE =
  /(?:leia|ler|mostre?\s+(?:o\s+)?(?:conte[uú]do|arquivo)|veja\s+(?:o\s+)?(?:conte[uú]do|arquivo)|abra(?:se)?|abrir|read|show|view|open|display)/i;

const STATUS_VERB_RE =
  /(?:verifique?\s+(?:o\s+)?status|status\s+(?:do|da)\s+(?:repo|reposit[oó]rio)|check\s+status|repo\s+status|git\s+status)/i;

// ── File extraction ──────────────────────────────────────────────────────────

const FILE_EXT =
  "(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|py|toml|yml|yaml|sh|css|html|txt|env|lock)";

const FILE_PATH_RE = new RegExp(
  `(?:[A-Za-z0-9_@.\\-]+\\/)*[A-Za-z0-9_@\\-]+\\.${FILE_EXT}`,
  "g",
);

const BARE_FILE_RE = new RegExp(`\\b[A-Za-z0-9_@\\-]+\\.${FILE_EXT}\\b`, "g");

function extractFileMentions(text: string): string[] {
  const candidates: { path: string; index: number }[] = [];
  let m: RegExpExecArray | null;

  FILE_PATH_RE.lastIndex = 0;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    candidates.push({ path: m[0], index: m.index });
  }

  // Skip bare filenames that are terminals of already-captured dir paths.
  const terminals = new Set(
    candidates.map((c) => c.path.slice(c.path.lastIndexOf("/") + 1)),
  );
  BARE_FILE_RE.lastIndex = 0;
  while ((m = BARE_FILE_RE.exec(text)) !== null) {
    if (!terminals.has(m[0])) {
      candidates.push({ path: m[0], index: m.index });
    }
  }

  candidates.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c.path)) {
      seen.add(c.path);
      out.push(c.path);
    }
  }
  return out;
}

// ── Step factory ──────────────────────────────────────────────────────────────

const ENG_SERVER = "eng-mcp";

function mcpStep(
  n: number,
  toolName: string,
  args: Record<string, unknown>,
  deps: readonly string[],
): ExecutionStep {
  return Object.freeze({
    id: `step-${String(n).padStart(2, "0")}`,
    connector: "mcp",
    capability: "mcp.callTool",
    parameters: Object.freeze({
      serverName: ENG_SERVER,
      toolName,
      arguments: Object.freeze(args),
    }),
    dependsOn: Object.freeze([...deps]),
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface DecompositionContext {
  /** The user's original message text. */
  readonly rawText: string;
  /** The resolved goal type (used for protected-type exclusion). */
  readonly goalType: string;
}

export interface DecompositionResult {
  readonly steps: readonly ExecutionStep[];
  readonly pattern: string;
}

/**
 * Deterministic pattern matcher. Examines rawText for known engineering
 * mission patterns and produces a multi-step DAG when a pattern is
 * unambiguously present. Returns null when no pattern matches (caller
 * falls through to the generic registry path).
 *
 * Zero LLM. Zero network. Zero side effects. Same input → same output.
 */
export function tryDecomposeKnownMission(
  ctx: DecompositionContext,
): DecompositionResult | null {
  const rawText = ctx.rawText ?? "";
  if (!rawText.trim()) return null;

  // Protected goal type — never decompose.
  if (PROTECTED_GOAL_TYPES.has(ctx.goalType)) return null;

  // Explicit tool name in user message — explicit call, skip.
  if (EXPLICIT_TOOL_RE.test(rawText)) return null;

  // Write intent — V1 excludes writes.
  if (WRITE_VERB_RE.test(rawText)) return null;

  // GitHub intent — skip (GitHub connector preserved).
  if (GITHUB_RE.test(rawText)) return null;

  const files = extractFileMentions(rawText);
  const hasFind = FIND_VERB_RE.test(rawText);
  const hasRead = READ_VERB_RE.test(rawText);
  const hasStatus = STATUS_VERB_RE.test(rawText);

  // ── Pattern 1: FIND -> READ ──────────────────────────────────────────────
  // "localize X.ts e leia" -> code.search (filename) -> file.read ($ref)
  if (hasFind && hasRead && files.length > 0) {
    const findMatch = FIND_VERB_RE.exec(rawText);
    const readMatch = READ_VERB_RE.exec(rawText);
    if (findMatch && readMatch && findMatch.index < readMatch.index) {
      const query = files[0];
      return {
        pattern: "find_read",
        steps: [
          mcpStep(
            1,
            "engineering.code.search",
            { query, mode: "filename" },
            [],
          ),
          mcpStep(
            2,
            "engineering.file.read",
            { path: { $ref: "step-01.output.matches[0]" } },
            ["step-01"],
          ),
        ],
      };
    }
  }

  // ── Pattern 3: STATUS + READS ────────────────────────────────────────────
  // "verifique o status e leia A.ts e B.ts" -> git.status + N x file.read
  // All dependsOn=[] (same wave, no data dependency).
  if (hasStatus && files.length > 0) {
    const steps: ExecutionStep[] = [
      mcpStep(1, "engineering.git.status", {}, []),
    ];
    files.forEach((f, i) => {
      steps.push(mcpStep(i + 2, "engineering.file.read", { path: f }, []));
    });
    return { pattern: "status_reads", steps };
  }

  // ── Pattern 2: MULTI/SINGLE FILE READ (no find verb) ────────────────────
  // "leia A.ts, B.ts e C.ts" -> N x file.read (all dependsOn=[], same wave)
  // "leia X.ts" -> 1 x file.read
  // Only fires when there's a read verb but NO find verb. Find-only (Case D)
  // falls through to the existing flow.
  if (hasRead && !hasFind && files.length > 0) {
    const steps = files.map((f, i) =>
      mcpStep(i + 1, "engineering.file.read", { path: f }, []),
    );
    return { pattern: "multi_read", steps };
  }

  return null;
}