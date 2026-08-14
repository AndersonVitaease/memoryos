/**
 * ExecutionIntent.ts — EXPERIMENTAL (Sprint EXP-EXECUTION-INTENT)
 *
 * EXPERIMENTO REVERSIVEL.
 *
 * REVERSAO:
 *   1. Apagar este arquivo.
 *   2. Remover as linhas marcadas [EXP-EXECUTION-INTENT] em ConversationPipeline.ts.
 *   Nenhum outro arquivo precisa ser alterado.
 *
 * RESPONSABILIDADE UNICA:
 *   Preservar o objetivo operacional da execucao corrente para que mensagens
 *   de continuidade ("abra", "proximo", "anterior") possam ser resolvidas
 *   sem reinterpretar o dominio do zero.
 *
 * PERSISTENCIA:
 *   Utiliza exclusivamente conversationStore.setConnectorContext / getConnectorContext
 *   com connectorId="execution-intent".
 *   Sem cache global. Sem variaveis estaticas. Sem localStorage.
 *
 * DESIGN:
 *   - ExecutionIntentRecord: objeto imutavel descrevendo o estado atual.
 *   - ExecutionIntentManager: manager singleton para criar, atualizar e consumir.
 *   - isContinuationMessage(): detecta frases de continuidade.
 *   - resolveGoalTypeFromIntent(): transforma intent + mensagem em goalType concreto.
 *
 * CONTINUIDADE SUPORTADA:
 *   domain=github   → github.getFile, github.searchCode, github.listFiles
 *   domain=google-drive → drive.downloadFile, drive.searchFiles, drive.listRecent
 *   domain=gmail    → gmail.readMessage, gmail.searchMessages
 *   domain=google-calendar → calendar.listToday
 */

import type { BaseConnectorContext } from "@/lib/connector-context/ConnectorContextStore";
import {
  type ExecutionResultSet,
  resolveOrdinalIndex,
  resolveByName,
  getSelectedItem,
} from "@/lib/execution-result-set/ExecutionResultSet";
import { conversationStore } from "@/lib/conversation-platform/ConversationStore";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ExecutionDomain =
  | "github"
  | "google-drive"
  | "gmail"
  | "google-calendar"
  | "base44"
  | "web"
  | "general";

export type ExecutionPurpose =
  | "list_repositories"
  | "search_symbol"
  | "search_reference"
  | "search_text"
  | "get_file"
  | "list_files"
  | "list_commits"
  | "list_branches"
  | "list_pull_requests"
  | "list_issues"
  | "list_emails"
  | "search_emails"
  | "read_email"
  | "list_drive_files"
  | "search_drive_files"
  | "download_drive_file"
  | "list_calendar_events"
  | "general_conversation";

export type ArtifactType =
  | "source_code"
  | "repository"
  | "commit"
  | "branch"
  | "pull_request"
  | "issue"
  | "email"
  | "drive_file"
  | "calendar_event"
  | "none";

export interface CurrentArtifact {
  /** For github: owner login */
  owner?:  string;
  /** For github: repository name */
  repo?:   string;
  /** For github/drive: file path */
  path?:   string;
  /** For drive: file id */
  fileId?: string;
  /** For github search: last result items (paths only, max 20) */
  resultPaths?: string[];
  /** Current cursor index into resultPaths (for "next"/"previous" navigation) */
  cursorIndex?: number;
  // ── FASE 7.16 — Web artifact (dominio "web") ──────────────────────────────
  // Somente a REFERENCIA necessaria para reexecutar a capability web. NUNCA
  // snapshot/HTML/markdown/conteudo da pagina (reexecucao sempre, padrao B).
  /** URL da pagina acessada (equivalente de path/fileId para github/drive) */
  url?: string;
  /** ID da capability executada (ex: "maxun.dynamic", "product.search") */
  capabilityId?: string;
  /** Motor de execucao ("maxun" | "playwright") */
  provider?: string;
  /** robotId do Maxun (null para maxun.dynamic generico) */
  robotId?: string | null;
  /** WebSession autenticada usada (null para maxun server-side) */
  webSessionId?: string | null;
  webSessionSource?: string | null;
  webSessionExpiresAt?: string | null;
  /** URL de descoberta da capability (onde navegar) */
  discoveredFromUrl?: string;
  /** Campos de entrada da capability (derivados de inputSchema) */
  inputFields?: string[];
  /** Timestamp de captura — decisao de staleness (TTL ~10min) */
  capturedAt?: number;
}

export interface ExecutionIntentRecord extends BaseConnectorContext {
  connectorId:      "execution-intent";
  /** Operative domain of the last execution */
  domain:           ExecutionDomain;
  /** What the user was trying to do */
  purpose:          ExecutionPurpose;
  /** Type of the primary artifact involved */
  artifactType:     ArtifactType;
  /** Continuation mode — "navigation" means next/previous is meaningful */
  continuationMode: "navigation" | "standalone";
  /** Most recent artifact context */
  currentArtifact:  CurrentArtifact;
  /** executionId of the execution that set this intent */
  executionId:      string;
  /** Timestamp of last update */
  updatedAt:        number;
}

// ── Frases de continuidade ────────────────────────────────────────────────────

const CONTINUATION_SIGNALS: string[] = [
  // IA-041: "abra"/"abre"/"abrir" soltas REMOVIDAS — capturavam qualquer
  // mensagem contendo essas palavras (ex: "abrir pasta video creatina"),
  // interceptando a mensagem ANTES do GoalRegistry ou do roteador semântico
  // de Drive (IA-040) — a mensagem nunca chegava nesses sistemas, por mais
  // que fossem corrigidos. Combinações específicas ("abra esse", "abra o
  // arquivo") continuam cobertas abaixo, que são seguras.
  "continue de onde paramos", "continua de onde parou", "continuar de onde parei",
  "o primeiro", "a primeira", "o segundo", "a segunda",
  "o terceiro", "a terceira", "o ultimo", "a ultima",
  "o ultimo resultado", "o primeiro resultado",
  "o proximo", "o próximo", "a proxima", "a próxima",
  "o anterior", "a anterior",
  "agora abra", "agora mostre", "agora leia",
  "leia esse", "leia este", "leia o arquivo",
  "baixe esse", "baixe este",
  "abra o arquivo", "abra o proximo", "abra o próximo", "abra o anterior",
  "volte para o anterior", "volte ao anterior", "va para o proximo", "vá para o próximo",
  // FASE 7.16 — Web deictic continuation ("esta pagina" -> artifact web do
  // turno anterior). Unicode escapes (\uXXXX) evitam acentos literais em
  // string literals (dead-end conhecido do build environment).
  "esta p\u00e1gina", "essa p\u00e1gina", "desta p\u00e1gina",
  "deste site", "desse site", "o site", "esse site",
  "essa fonte", "desta fonte",
  "o conte\u00fado desta p\u00e1gina", "o conte\u00fado desse site",
  "essa informa\u00e7\u00e3o",
  // IA-017: "esse"/"essa"/"este"/"esta" e "mostre o"/"mostre a"/"mostrar o"/
  // "mostrar a" soltos removidos — eram genéricos demais, disparando
  // continuidade em qualquer mensagem contendo essas palavras comuns
  // (ex: "me mostre os arquivos em pdf" era tratado como continuação de
  // "ler meus emails", forçando o goalType errado gmail.readMessage).
  // As combinações específicas ("leia esse", "baixe esse", "agora mostre")
  // continuam cobertas acima.
  //
  // FIX (auditoria cognição): "next", "prev", "previous", "anterior",
  // "volta", "volte", "voltar", "proximo"/"próximo"/"proxima" SOLTOS
  // removidos — o matcher antigo usava `.includes()` (substring), então
  // essas palavras casavam dentro de QUALQUER texto que as contivesse:
  //   "Next.js" contém "next" → qualquer mensagem sobre o framework
  //     era tratada como "vá para o próximo resultado".
  //   "revolta", "voltagem", "devolta" contêm "volta".
  //   "a versão anterior do código" contém "anterior".
  // Isso sequestrava o goalType da mensagem atual para o da última
  // execução de conector guardada (ex: reabria o último e-mail/arquivo
  // sem o usuário ter pedido isso). Combinações específicas ("o próximo",
  // "o anterior", "volte para o anterior") continuam cobertas acima —
  // essas exigem a frase completa e usam matching por palavra inteira
  // (ver _matchesSignal abaixo), então não casam como substring solta.
];

/**
 * Verifica se `sig` aparece em `lower` como PALAVRA/FRASE INTEIRA,
 * nunca como substring de outra palavra. Usa fronteiras Unicode
 * (letras/números) em vez de \b (que trata acentos e pontuação de
 * forma inconsistente) — resolve o caso "Next.js" contendo "next".
 */
function _matchesSignal(lower: string, sig: string): boolean {
  const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
  return pattern.test(lower);
}

export function isContinuationMessage(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CONTINUATION_SIGNALS.some((sig) => _matchesSignal(lower, sig));
}

// ── Mapeamento Intent → GoalType ──────────────────────────────────────────────

/**
 * Resolve o goalType correto para uma mensagem de continuidade.
 *
 * EF-43A: Usa o entityType do ExecutionResultSet (quando disponivel)
 * para escolher a capability correta — nunca pela frase do usuario.
 *
 * Mapeamento de tipo → goalType:
 *   repository  → github.listFiles   (abrir repo = listar arquivos)
 *   file        → github.getFile
 *   branch      → github.listBranches
 *   commit      → github.listCommits
 *   pull_request→ github.listPullRequests
 *   issue       → github.listIssues
 *   email       → gmail.readMessage
 *   event       → calendar.listToday
 *   drive_file  → drive.downloadFile
 */
export function resolveGoalTypeFromIntent(
  intent: ExecutionIntentRecord,
  message: string,
): string | null {
  const lower = message.toLowerCase();

  // ── EF-43A: Resolve by ResultSet entityType (highest priority) ───────────────
  // Access RuntimeContextLayer via globalThis to avoid circular import.
  try {
    const _rcl = (globalThis as any)["__RUNTIME_CONTEXT_LAYER__"];
    const resultSet = _rcl ? _rcl.getResultSet() : null;

    if (resultSet && resultSet.items.length > 0) {
      const entityType: string = resultSet.entityType ?? "item";

      console.log("[EF-43A] resolveGoalTypeFromIntent — using ResultSet entityType", {
        entityType,
        connector:  resultSet.connector,
        capability: resultSet.capability,
        itemCount:  resultSet.items.length,
        message:    message.slice(0, 80),
      });

      // Map entityType → goalType (independent of user phrasing)
      if (entityType === "repository") return "github.listFiles";
      if (entityType === "file")       return "github.getFile";
      if (entityType === "branch")     return "github.listBranches";
      if (entityType === "commit")     return "github.listCommits";
      if (entityType === "pull_request") return "github.listPullRequests";
      if (entityType === "issue")      return "github.listIssues";
      if (entityType === "email")      return "gmail.readMessage";
      if (entityType === "event")      return "calendar.listToday";
      if (entityType === "drive_file") return "drive.downloadFile";
      // "item" or unknown — fall through to domain-based resolution below
    }
  } catch { /* non-blocking — fall through */ }
  // ── end EF-43A ────────────────────────────────────────────────────────────────

  // FASE 7.16 — Web deictic guard: referencias a "pagina"/"site"/"fonte" so
  // fazem sentido para o dominio web. Para outros dominios (github/drive/
  // gmail/calendar), NAO forçar resolucao — retorna null e deixa o guard Web
  // do Planner tratar via currentArtifact (RuntimeContextLayer). Evita que
  // "qual o conteudo desta pagina?" seja roteado para github.searchCode
  // (fallback) quando existe um exec-intent nao-web stale.
  const _WEB_DEICTIC_RE = /esta p\u00e1gina|essa p\u00e1gina|desta p\u00e1gina|deste site|desse site|o site|esse site|essa fonte|desta fonte|o conte\u00fado desta p\u00e1gina|o conte\u00fado desse site|essa informa\u00e7\u00e3o/i;
  if (intent.domain !== "web" && _WEB_DEICTIC_RE.test(message)) return null;

  if (intent.domain === "github") {
    // Explicit "arquivo" keyword → always files.get regardless of context
    if (lower.includes("arquivo")) return "github.getFile";

    // "proximo", "anterior" — navegar pelos resultados de search
    if (
      lower.includes("proximo") || lower.includes("próximo") ||
      lower.includes("anterior") || lower.includes("volte")
    ) {
      return intent.purpose === "get_file" ? "github.getFile" : "github.listFiles";
    }
    // "abra/abre/abrir/leia/baixe" sem ResultSet → listar arquivos do repositorio atual
    if (
      lower.includes("abra") || lower.includes("abre") || lower.includes("abrir") ||
      lower.includes("leia") || lower.includes("baixe")
    ) {
      return intent.purpose === "list_repositories" ? "github.listFiles" : "github.getFile";
    }
    // "mostre o primeiro/segundo resultado" — depende do purpose atual
    if (lower.match(/\d+|primeiro|segundo|terceiro|ultimo/)) {
      return intent.purpose === "list_repositories" ? "github.listFiles" : "github.getFile";
    }
    // fallback dentro do dominio github
    return "github.searchCode";
  }

  if (intent.domain === "google-drive") {
    if (
      lower.includes("abra") || lower.includes("baixe") || lower.includes("abre") ||
      lower.includes("ultimo") || lower.includes("último") || lower.includes("pdf")
    ) {
      return "drive.downloadFile";
    }
    return "drive.listRecent";
  }

  if (intent.domain === "gmail") {
    if (lower.includes("abra") || lower.includes("leia") || lower.includes("esse") || lower.includes("este")) {
      return "gmail.readMessage";
    }
    return "gmail.readInbox";
  }

  if (intent.domain === "google-calendar") {
    return "calendar.listToday";
  }

  return null;
}

// ── Extrator de CurrentArtifact a partir do output do connector ───────────────

export function extractArtifact(
  goalType:      string,
  connectorData: unknown,
): CurrentArtifact {
  const data = connectorData as Record<string, unknown> | null;
  if (!data) return {};

  // Para search results: extrair lista de paths
  if (goalType.startsWith("github.search") || goalType === "github.searchCode") {
    const steps = (data as any[]);
    const items = Array.isArray(steps)
      ? steps.flatMap((s: any) => (s.output?.items ?? []))
      : [];
    const paths = (items as any[]).map((i: any) => i.path).filter(Boolean).slice(0, 20);
    return { resultPaths: paths, cursorIndex: 0 };
  }

  // Para files.get: extrair path
  if (goalType === "github.getFile" || goalType === "github.listFiles") {
    const steps = Array.isArray(data) ? data : [];
    const first = steps[0] as any;
    return {
      path: first?.output?.path ?? undefined,
    };
  }

  // Para repos.list: extrair owner/repo do primeiro item
  if (goalType === "github.listRepos") {
    const steps = Array.isArray(data) ? data : [];
    const items = (steps[0] as any)?.output?.items ?? [];
    const first = Array.isArray(items) ? items[0] : null;
    return first
      ? { owner: String(first.owner ?? ""), repo: String(first.name ?? "") }
      : {};
  }

  // Para drive: extrair fileId
  if (goalType.startsWith("drive.")) {
    const steps = Array.isArray(data) ? data : [];
    const out   = (steps[0] as any)?.output ?? {};
    return { fileId: out.fileId ?? out.id ?? undefined };
  }

  return {};
}

// ── Mapeamento goalType → purpose ─────────────────────────────────────────────

export function purposeFromGoalType(goalType: string): ExecutionPurpose {
  const map: Record<string, ExecutionPurpose> = {
    "github.listRepos":       "list_repositories",
    "github.searchCode":      "search_symbol",
    "github.searchFiles":     "search_text",
    "github.getFile":         "get_file",
    "github.listFiles":       "list_files",
    "github.listCommits":     "list_commits",
    "github.listBranches":    "list_branches",
    "github.listPullRequests":"list_pull_requests",
    "github.listIssues":      "list_issues",
    "gmail.readInbox":        "list_emails",
    "gmail.searchMessages":   "search_emails",
    "gmail.readMessage":      "read_email",
    "gmail.readEmail":        "read_email",
    "drive.listRecent":       "list_drive_files",
    "drive.searchFiles":      "search_drive_files",
    "drive.downloadFile":     "download_drive_file",
    "calendar.listToday":     "list_calendar_events",
    "calendar.listWeek":      "list_calendar_events",
  };
  return map[goalType] ?? "general_conversation";
}

export function artifactTypeFromGoalType(goalType: string): ArtifactType {
  if (goalType.startsWith("github.search") || goalType === "github.getFile" || goalType === "github.listFiles") return "source_code";
  if (goalType === "github.listRepos")     return "repository";
  if (goalType === "github.listCommits")   return "commit";
  if (goalType === "github.listBranches")  return "branch";
  if (goalType.startsWith("github.list"))  return "repository";
  if (goalType.startsWith("gmail"))        return "email";
  if (goalType.startsWith("drive"))        return "drive_file";
  if (goalType.startsWith("calendar"))     return "calendar_event";
  return "none";
}

export function domainFromGoalType(goalType: string): ExecutionDomain {
  if (goalType.startsWith("github"))   return "github";
  if (goalType.startsWith("drive"))    return "google-drive";
  if (goalType.startsWith("gmail") || goalType.startsWith("email")) return "gmail";
  if (goalType.startsWith("calendar")) return "google-calendar";
  return "general";
}

// ── ExecutionIntentManager ────────────────────────────────────────────────────

export class ExecutionIntentManager {
  private static readonly CONNECTOR_ID = "execution-intent";

  /**
   * Cria e persiste um novo ExecutionIntentRecord a partir do resultado de uma execucao.
   * Chamado pelo Pipeline apos sintese bem-sucedida.
   */
  static update(
    executionId:   string,
    goalType:      string,
    connectorData: unknown,
    existingOwner?: string,
    existingRepo?:  string,
  ): void {
    try {
      const domain       = domainFromGoalType(goalType);
      const purpose      = purposeFromGoalType(goalType);
      const artifactType = artifactTypeFromGoalType(goalType);

      if (domain === "general") {
        console.log("[EXP-EXECUTION-INTENT] Skipped update — domain=general for goalType:", goalType);
        return;
      }

      const artifact = extractArtifact(goalType, connectorData);

      // Preservar owner/repo do enriquecimento anterior se nao extraido do output
      if (existingOwner && !artifact.owner) artifact.owner = existingOwner;
      if (existingRepo  && !artifact.repo)  artifact.repo  = existingRepo;

      const record: ExecutionIntentRecord = Object.freeze({
        connectorId:      "execution-intent",
        domain,
        purpose,
        artifactType,
        continuationMode: (domain === "github" || domain === "google-drive") ? "navigation" : "standalone",
        currentArtifact:  Object.freeze(artifact),
        executionId,
        updatedAt:        Date.now(),
      });

      // Persistir via ConversationStore (mecanismo oficial)
      conversationStore.setConnectorContext(ExecutionIntentManager.CONNECTOR_ID, record);

      console.log("[EXP-EXECUTION-INTENT] ExecutionIntent Updated", {
        executionId,
        domain,
        purpose,
        artifactType,
        continuationMode: record.continuationMode,
        currentArtifact:  artifact,
      });
    } catch (e) {
      // Non-blocking — intent update failure never affects user response
      console.log("[EXP-EXECUTION-INTENT] Update failed (non-blocking):", String(e));
    }
  }

  /**
   * Carrega o ExecutionIntentRecord atual do ConversationStore.
   * Retorna null se nao existir.
   */
  static load(): ExecutionIntentRecord | null {
    try {
      const raw = conversationStore.getConnectorContext(ExecutionIntentManager.CONNECTOR_ID);
      if (!raw || raw.connectorId !== "execution-intent") return null;

      const record = raw as ExecutionIntentRecord;
      console.log("[EXP-EXECUTION-INTENT] ExecutionIntent Loaded", {
        domain:          record.domain,
        purpose:         record.purpose,
        artifactType:    record.artifactType,
        updatedAt:       record.updatedAt,
        currentArtifact: record.currentArtifact,
      });
      return record;
    } catch (e) {
      console.log("[EXP-EXECUTION-INTENT] Load failed (non-blocking):", String(e));
      return null;
    }
  }

  /**
   * Consome o intent para uma mensagem de continuidade.
   * Retorna o goalType resolvido ou null se nao aplicavel.
   *
   * EF-41: Usa ExecutionResultSet (via RuntimeContextLayer) para resolver ordinais.
   * Fallback: usa artifact.resultPaths (legado) se ResultSet nao disponivel.
   */
  static consume(message: string): { goalType: string; artifact: CurrentArtifact } | null {
    if (!isContinuationMessage(message)) return null;

    const intent = ExecutionIntentManager.load();
    if (!intent) {
      console.log("[EXP-EXECUTION-INTENT] ExecutionIntent Consumed — no intent stored");
      return null;
    }

    const goalType = resolveGoalTypeFromIntent(intent, message);
    if (!goalType) {
      console.log("[EXP-EXECUTION-INTENT] ExecutionIntent Consumed — could not resolve goalType", {
        domain:  intent.domain,
        purpose: intent.purpose,
        message: message.slice(0, 80),
      });
      return null;
    }

    const artifact = { ...intent.currentArtifact };

    // ── EF-41: Resolve ordinal via ExecutionResultSet ─────────────────────────
    let resolvedViaResultSet = false;
    try {
      const _rcl = (globalThis as any)["__RUNTIME_CONTEXT_LAYER__"];
      const resultSet: ExecutionResultSet | null = _rcl ? _rcl.getResultSet() : null;

      if (resultSet && resultSet.items.length > 0) {
        // IA-026: tenta por posição primeiro ("segundo", "último"); se não
        // achar, tenta por nome ("rg" dentro de "Rg (2).pdf") — sem isso,
        // mensagens com nome ficavam sem seleção nenhuma.
        const newIndex = resolveOrdinalIndex(resultSet, message) ?? resolveByName(resultSet, message);

        if (newIndex !== null) {
          // Update selectedIndex in the persisted ResultSet
          const updatedResultSet: ExecutionResultSet = {
            ...resultSet,
            selectedIndex: newIndex,
          };
          if (_rcl) _rcl.setResultSet(updatedResultSet);

          // Extract reference fields from the selected item into the artifact
          const selectedItem = getSelectedItem(updatedResultSet);
          if (selectedItem && selectedItem.reference && typeof selectedItem.reference === "object") {
            const ref = selectedItem.reference as Record<string, unknown>;
            if (ref["owner"])      artifact.owner  = String(ref["owner"]);
            if (ref["name"])       artifact.repo   = String(ref["name"]);
            if (ref["full_name"]) {
              const parts = String(ref["full_name"]).split("/");
              if (parts.length === 2) { artifact.owner = parts[0]; artifact.repo = parts[1]; }
            }
            if (ref["path"])      artifact.path   = String(ref["path"]);
            if (ref["fileId"])    artifact.fileId  = String(ref["fileId"]);
            // Inject cursorIndex for legacy compatibility
            artifact.cursorIndex = newIndex;
          }

          resolvedViaResultSet = true;
          console.log("[EXP-EXECUTION-INTENT] EF-41 ordinal resolved via ExecutionResultSet", {
            message:      message.slice(0, 80),
            selectedIndex: newIndex,
            displayName:  getSelectedItem(updatedResultSet)?.displayName,
            artifact,
          });

          // ── EF-43A: Update GitHub ConversationStore context when repo is selected ──
          try {
            const selectedItem2 = getSelectedItem(updatedResultSet);
            const ref2 = selectedItem2?.reference as Record<string, unknown> | undefined;
            const selOwner = ref2?.["owner"] as string | undefined;
            const selName  = ref2?.["name"]  as string | undefined;
            const selFull  = ref2?.["full_name"] as string | undefined;

            let resolvedOwner = selOwner;
            let resolvedRepo  = selName;
            if (!resolvedOwner && selFull) {
              const parts = selFull.split("/");
              if (parts.length === 2) { resolvedOwner = parts[0]; resolvedRepo = parts[1]; }
            }

            if (resolvedOwner && resolvedRepo && resultSet.entityType === "repository") {
              const ghCtx = Object.freeze({
                connectorId:    "github",
                owner:          resolvedOwner,
                repo:           resolvedRepo,
                repositoryName: `${resolvedOwner}/${resolvedRepo}`,
                defaultBranch:  (ref2?.["default_branch"] as string | undefined) ?? null,
                repositoryId:   null,
                capability:     "ordinal_selection",
                executionId:    undefined as any,
                updatedAt:      Date.now(),
              });
              conversationStore.setConnectorContext("github", ghCtx);
              console.log("[EF-43A] GitHub context updated from ordinal selection", {
                owner: resolvedOwner,
                repo:  resolvedRepo,
                index: newIndex,
              });
            }
          } catch { /* non-blocking */ }
          // ── end EF-43A ───────────────────────────────────────────────────────
        }
      }
    } catch { /* non-blocking — fallback to legacy below */ }
    // ── end EF-41 ─────────────────────────────────────────────────────────────

    // ── Legacy fallback: resultPaths (only used if EF-41 did not resolve) ─────
    if (!resolvedViaResultSet && Array.isArray(artifact.resultPaths)) {
      const lower = message.toLowerCase();
      // FIX (auditoria cognição): mesmo bug do CONTINUATION_SIGNALS —
      // .includes("next")/.includes("anterior") etc casavam substring
      // ("Next.js", "revolta", "versão anterior"). Trocado para \b.
      if (lower.match(/\b(proximo|próximo|next)\b/) &&
          typeof artifact.cursorIndex === "number") {
        artifact.cursorIndex = Math.min(artifact.cursorIndex + 1, artifact.resultPaths.length - 1);
        artifact.path = artifact.resultPaths[artifact.cursorIndex];
      } else if (lower.match(/\b(anterior|prev|previous|volte)\b/) &&
                 typeof artifact.cursorIndex === "number") {
        artifact.cursorIndex = Math.max(artifact.cursorIndex - 1, 0);
        artifact.path = artifact.resultPaths[artifact.cursorIndex];
      } else if (lower.match(/\b(primeiro|first|1[oaº])\b/)) {
        artifact.cursorIndex = 0;
        artifact.path = artifact.resultPaths[0];
      } else if (lower.match(/\b(segundo|second|2[oaº])\b/)) {
        artifact.cursorIndex = 1;
        artifact.path = artifact.resultPaths[1];
      } else if (lower.match(/\b(terceiro|third|3[oaº])\b/)) {
        artifact.cursorIndex = 2;
        artifact.path = artifact.resultPaths[2];
      } else if (lower.match(/\b([uú]ltimo|last)\b/)) {
        artifact.cursorIndex = artifact.resultPaths.length - 1;
        artifact.path = artifact.resultPaths[artifact.cursorIndex];
      }
    }
    // ── end legacy fallback ───────────────────────────────────────────────────

    console.log("[EXP-EXECUTION-INTENT] ExecutionIntent Consumed", {
      message:              message.slice(0, 80),
      domain:               intent.domain,
      purpose:              intent.purpose,
      goalType,
      resolvedViaResultSet,
      artifact,
    });

    return { goalType, artifact };
  }

  /**
   * Limpa o intent atual (ex: ao trocar de sessao).
   */
  static clear(): void {
    try {
      conversationStore.clearConnectorContext(ExecutionIntentManager.CONNECTOR_ID);
      console.log("[EXP-EXECUTION-INTENT] ExecutionIntent Cleared");
    } catch { /* non-blocking */ }
  }
}