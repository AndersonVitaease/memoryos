/**
 * OpenHandsChangeSet.ts — OpenHands -> ENG-MCP Change Bridge V1
 *
 * Tipos, validacao deterministica, diff de linhas e patch planner para
 * transportar alteracoes produzidas pelo OpenHands Cloud ate o fluxo
 * supervisionado do MemoryOS.
 *
 * NENHUM write e despachado neste modulo. Ele apenas:
 *   1. Define os tipos do change_set (FASE 2)
 *   2. Valida deterministicamente (FASE 3)
 *   3. Converte oldContent -> newContent em hunks (FASE 5)
 *   4. Builda patch proposals para engineering.file.patch / file.create (FASE 4)
 *
 * A aplicacao real (approval + ENG-MCP apply) fica para a proxima fase.
 */

// ═══════════════════════════════════════════════════════════════════════════
// FASE 2 — CHANGE SET TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ChangeType = "modified" | "created" | "deleted" | "renamed" | "unknown";

export interface OpenHandsFileChange {
  readonly path: string;
  readonly changeType: ChangeType;
  readonly newContent: string | null;
}

export interface OpenHandsChangeSet {
  readonly conversation_id: string;
  readonly sandbox_id: string | null;
  readonly repository: string;
  readonly git_diff: string;
  readonly files: readonly OpenHandsFileChange[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 3 — CHANGE SET VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 512 * 1024;
const MAX_TOTAL_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 100;
const MAX_GIT_DIFF_SIZE = 1024 * 1024;

const VALID_CHANGE_TYPES: ReadonlySet<string> = new Set([
  "modified", "created", "deleted", "renamed", "unknown",
]);

export interface ChangeSetValidationError {
  readonly path: string;
  readonly reason: string;
}

export interface ChangeSetValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ChangeSetValidationError[];
}

/**
 * Valida path relativo: rejeita traversal (../), caminhos absolutos
 * (Unix e Windows), drive letters, e null bytes.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("\\")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.includes("..")) return false;
  if (trimmed.includes("\0")) return false;
  return true;
}

/**
 * Valida o change_set deterministicamente.
 *
 * Checa: path vazio, path traversal/absoluto, arquivos duplicados,
 * changeType reconhecido, newContent obrigatorio para modified/created,
 * tamanho maximo por arquivo e total, e correspondencia de repository.
 */
export function validateChangeSet(
  changeSet: OpenHandsChangeSet,
  expectedRepository?: string,
): ChangeSetValidationResult {
  const errors: ChangeSetValidationError[] = [];

  if (expectedRepository && changeSet.repository !== expectedRepository) {
    errors.push({
      path: "(change_set)",
      reason: `repository_mismatch: expected "${expectedRepository}", got "${changeSet.repository}"`,
    });
  }

  if (changeSet.git_diff.length > MAX_GIT_DIFF_SIZE) {
    errors.push({ path: "(change_set)", reason: "git_diff_too_large" });
  }

  const seen = new Set<string>();
  let totalSize = 0;

  for (const file of changeSet.files) {
    if (!file.path || !file.path.trim()) {
      errors.push({ path: file.path || "(empty)", reason: "empty_path" });
      continue;
    }
    if (!isSafeRelativePath(file.path)) {
      errors.push({ path: file.path, reason: "unsafe_path" });
      continue;
    }
    if (seen.has(file.path)) {
      errors.push({ path: file.path, reason: "duplicate_path" });
      continue;
    }
    seen.add(file.path);

    if (!VALID_CHANGE_TYPES.has(file.changeType)) {
      errors.push({ path: file.path, reason: `unknown_change_type: ${file.changeType}` });
      continue;
    }

    if ((file.changeType === "modified" || file.changeType === "created") && file.newContent == null) {
      errors.push({ path: file.path, reason: "missing_new_content" });
    }

    if (file.newContent) {
      if (file.newContent.length > MAX_FILE_SIZE) {
        errors.push({ path: file.path, reason: "file_too_large" });
      }
      totalSize += file.newContent.length;
    }
  }

  if (changeSet.files.length > MAX_FILES) {
    errors.push({ path: "(change_set)", reason: "too_many_files" });
  }
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push({ path: "(change_set)", reason: "total_size_exceeded" });
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 5 — HUNKS (deterministic line diff, no LLM)
// ═══════════════════════════════════════════════════════════════════════════

export interface PatchHunk {
  readonly startLine: number;
  readonly deleteLines: readonly string[];
  readonly insertLines: readonly string[];
}

/**
 * Computa hunks determinísticos a partir do conteúdo antigo (ENG-MCP local)
 * vs conteúdo novo (sandbox OpenHands).
 *
 * Algoritmo: prefixo/sulfixo comum + hunk único do meio.
 * - O(n), sempre produz no maximo 1 hunk por arquivo.
 * - Nao usa LLM. Nao parseia agent_reply_text.
 * - Fonte da verdade: conteudo do arquivo no sandbox vs conteudo/baseHash do ENG-MCP.
 *
 * Para V1, um hunk por arquivo e suficiente — o patch sera corretamente
 * aplicado pelo ENG-MCP. Minimidade (LCS) pode ser melhorada depois.
 */
export function computeHunks(oldContent: string, newContent: string): PatchHunk[] {
  if (typeof oldContent !== "string" || typeof newContent !== "string") return [];

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const minLen = Math.min(oldLines.length, newLines.length);
  let prefixLen = 0;
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }

  const maxSuffix = Math.min(
    oldLines.length - prefixLen,
    newLines.length - prefixLen,
  );
  let suffixLen = 0;
  while (
    suffixLen < maxSuffix &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldMiddle = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const newMiddle = newLines.slice(prefixLen, newLines.length - suffixLen);

  if (oldMiddle.length === 0 && newMiddle.length === 0) return [];

  return [{
    startLine: prefixLen + 1,
    deleteLines: oldMiddle,
    insertLines: newMiddle,
  }];
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 4 — PATCH PLANNER
// ═══════════════════════════════════════════════════════════════════════════

export type PatchProposal =
  | {
      readonly kind: "file.patch";
      readonly path: string;
      readonly baseHash: string;
      readonly hunks: readonly PatchHunk[];
      readonly acknowledgeWrite: true;
    }
  | {
      readonly kind: "file.create";
      readonly path: string;
      readonly content: string;
      readonly acknowledgeWrite: true;
    }
  | {
      readonly kind: "requires_manual_or_future_delete_support";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "skipped";
      readonly path: string;
      readonly reason: string;
    };

export interface LocalFileState {
  readonly baseHash: string;
  readonly content: string;
  readonly exists: boolean;
}

export interface PatchPlan {
  readonly proposals: readonly PatchProposal[];
  readonly errors: readonly string[];
}

/**
 * Transforma um OpenHandsChangeSet + estado atual do ENG-MCP em uma PROPOSTA
 * de aplicacao. NAO despacha write nesta rodada.
 *
 * MODIFIED -> engineering.file.patch (com baseHash + hunks)
 * CREATED  -> engineering.file.create
 * DELETED  -> requires_manual_or_future_delete_support (sem primitive V1)
 * RENAMED  -> requires_manual_or_future_delete_support (sem primitive V1)
 * UNKNOWN  -> skipped
 *
 * FASE 6 — baseHash e obrigatorio e preservado. Se o arquivo local mudar
 * entre file.read e a futura aplicacao, engineering.file.patch falha pela
 * precondition existente (baseHash mismatch). Nao ha last-write-wins.
 */
export function buildPatchProposals(
  changeSet: OpenHandsChangeSet,
  localFiles: ReadonlyMap<string, LocalFileState>,
): PatchPlan {
  const proposals: PatchProposal[] = [];
  const errors: string[] = [];

  for (const file of changeSet.files) {
    const local = localFiles.get(file.path);

    switch (file.changeType) {
      case "modified": {
        if (!local || !local.exists) {
          errors.push(`modified file "${file.path}" not found in local ENG-MCP tree`);
          proposals.push({ kind: "skipped", path: file.path, reason: "local_file_not_found" });
          continue;
        }
        if (file.newContent == null) {
          errors.push(`modified file "${file.path}" missing newContent`);
          proposals.push({ kind: "skipped", path: file.path, reason: "missing_new_content" });
          continue;
        }
        const hunks = computeHunks(local.content, file.newContent);
        if (hunks.length === 0) {
          proposals.push({ kind: "skipped", path: file.path, reason: "no_changes_detected" });
          continue;
        }
        proposals.push({
          kind: "file.patch",
          path: file.path,
          baseHash: local.baseHash,
          hunks,
          acknowledgeWrite: true,
        });
        break;
      }

      case "created": {
        if (local && local.exists) {
          errors.push(`created file "${file.path}" already exists locally`);
          proposals.push({ kind: "skipped", path: file.path, reason: "file_already_exists" });
          continue;
        }
        if (file.newContent == null) {
          errors.push(`created file "${file.path}" missing newContent`);
          proposals.push({ kind: "skipped", path: file.path, reason: "missing_new_content" });
          continue;
        }
        proposals.push({
          kind: "file.create",
          path: file.path,
          content: file.newContent,
          acknowledgeWrite: true,
        });
        break;
      }

      case "deleted": {
        proposals.push({
          kind: "requires_manual_or_future_delete_support",
          path: file.path,
          reason: "ENG-MCP V1 has no delete primitive; deletion requires future support",
        });
        break;
      }

      case "renamed": {
        proposals.push({
          kind: "requires_manual_or_future_delete_support",
          path: file.path,
          reason: "ENG-MCP V1 has no rename primitive; rename requires future support",
        });
        break;
      }

      case "unknown":
      default: {
        proposals.push({
          kind: "skipped",
          path: file.path,
          reason: `unknown_change_type: ${file.changeType}`,
        });
        break;
      }
    }
  }

  return { proposals, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSE — normaliza o change_set bruto do backend response
// ═══════════════════════════════════════════════════════════════════════════

const CHANGE_TYPE_MAP: ReadonlyMap<string, ChangeType> = new Map([
  ["modified", "modified"], ["m", "modified"], ["changed", "modified"],
  ["added", "created"], ["a", "created"], ["created", "created"], ["new", "created"], ["untracked", "created"],
  ["deleted", "deleted"], ["d", "deleted"], ["removed", "deleted"],
  ["renamed", "renamed"], ["r", "renamed"],
]);

function normalizeChangeType(raw: unknown): ChangeType {
  const s = String(raw ?? "").trim().toLowerCase();
  return CHANGE_TYPE_MAP.get(s) ?? "unknown";
}

/**
 * Faz parse do campo `change_set` retornado pelo backend function
 * `openHandsTaskProcess` em modo write apos execution_status=finished.
 */
export function parseChangeSet(raw: unknown): OpenHandsChangeSet | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const filesRaw = Array.isArray(obj.files) ? obj.files : [];

  const files: OpenHandsFileChange[] = filesRaw.map((f: unknown) => {
    const fo = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    return {
      path: String(fo.path ?? ""),
      changeType: normalizeChangeType(fo.changeType),
      newContent: typeof fo.newContent === "string" ? fo.newContent : null,
    };
  });

  return {
    conversation_id: String(obj.conversation_id ?? ""),
    sandbox_id: typeof obj.sandbox_id === "string" && obj.sandbox_id ? obj.sandbox_id : null,
    repository: String(obj.repository ?? ""),
    git_diff: typeof obj.git_diff === "string" ? obj.git_diff : "",
    files,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE ROUTING — detect write intent from query (FASE 1)
// ═══════════════════════════════════════════════════════════════════════════

const READ_ONLY_OVERRIDE_PHRASES: readonly string[] = [
  "nao altere", "nao modifique", "somente leitura", "read-only",
  "nao mude", "mas nao altere", "mentalmente", "nao altere nada",
  "nao modificar", "nao mudar", "sem alterar", "sem modificar",
  "do not modify", "do not change", "do not alter", "don't modify",
  "read only", "investigate only", "inspect only",
];

const WRITE_VERBS: readonly string[] = [
  "corrija", "corrigir", "correcao", "implemente", "implementar",
  "modifique", "modificar", "altere", "alterar",
  "mude", "mudar", "crie", "criar", "adicione", "adicionar",
  "remova", "remover", "atualize", "atualizar", "refatore", "refatorar",
  "aplique", "aplicar",
  "fix", "implement", "modify", "change", "create", "update", "refactor",
];

/**
 * Detecta write mode a partir da query do usuario.
 *
 * Read-only precedence: se o usuario diz explicitamente "nao altere",
 * "somente leitura", etc. -> mode="read" mesmo que contenha verbos de escrita.
 *
 * Caso contrario, se a query contem verbos de escrita (corrija, implemente,
 * modifique, altere, etc.) -> mode="write".
 *
 * Default: "read" (preserva comportamento certificado).
 */
export function detectWriteMode(query: string): "read" | "write" {
  if (!query) return "read";
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const phrase of READ_ONLY_OVERRIDE_PHRASES) {
    if (q.includes(phrase)) return "read";
  }

  for (const verb of WRITE_VERBS) {
    if (q.includes(verb)) return "write";
  }

  return "read";
}

/**
 * Verifica se a query contem um verbo de escrita, SEM aplicar a precedencia
 * read-only. Usado para detectar que a missao e de engenharia supervisionada
 * (write verb + contexto tecnico) mesmo quando o modo final sera "read"
 * (ex: "modifique X mas nao altere" → supervisedEngineering + mode=read).
 *
 * detectWriteMode resolve o modo; hasWriteVerb resolve a natureza da missao.
 */
export function hasWriteVerb(query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return WRITE_VERBS.some((v) => q.includes(v));
}