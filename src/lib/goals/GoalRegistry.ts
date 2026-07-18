/**
 * GoalRegistry.ts — Goal Pattern Registry
 * Engineering Sprint E-02.1A
 *
 * Responsabilidade unica: registrar e consultar GoalDefinitions.
 *
 * Cada Connector registra seus proprios Goals via GoalRegistry.register().
 * O Bridge consulta o Registry para mapear Intent → GoalType + parametros.
 *
 * Open/Closed: aberto para extensao (novos connectors registram seus Goals),
 *              fechado para modificacao (o Registry nao muda por novos tipos).
 *
 * Dependency Inversion: Bridge depende do Registry (abstrato), nao de
 *                       definicoes de dominio concretas.
 *
 * SRP: apenas registro e lookup. Sem logica de execucao.
 * Sem chamadas de rede. Sem connectors. Sem side effects.
 */

import type { GoalType } from "./GoalTypes";
import type { CognitiveIntent } from "@/lib/conversation-cognitive-gateway/CCGTypes";

// ── GoalDefinition ────────────────────────────────────────────────────────────

export interface GoalDefinition {
  /** Identificador unico do Goal */
  readonly type:            GoalType;
  /** Namespace do conector dono (ex: "gmail", "calendar", "drive") */
  readonly namespace:       string;
  /** Sinais de keyword que ativam este Goal (lower-case) */
  readonly signals:         readonly string[];
  /** Extrai parametros estruturados da mensagem original */
  readonly extractParams:   (userMessage: string) => Record<string, unknown>;
  /** Descricao humana do Goal */
  readonly description:     string;
}

// ── IntentGoalMap ─────────────────────────────────────────────────────────────
// Mapeamento direto de CognitiveIntent → GoalType (fallback quando
// nenhum sinal de keyword corresponde).

const INTENT_GOAL_MAP: Readonly<Record<CognitiveIntent, GoalType>> = {
  connector_diagnostics:    "unknown",
  project_status:           "memory.query",
  project_history:          "memory.query",
  knowledge_reconstruction: "memory.summarize",
  next_sprint:              "memory.query",
  repository_analysis:      "general.conversation",
  application_analysis:     "general.conversation",
  architecture_question:    "general.conversation",
  implementation_status:    "general.conversation",
  technical_debt:           "general.conversation",
  general_conversation:     "general.conversation",
};

// ── GoalRegistry ──────────────────────────────────────────────────────────────

class GoalRegistryClass {
  private readonly _definitions: GoalDefinition[] = [];

  /**
   * Registra um GoalDefinition.
   * Deve ser chamado pelos connectors durante a inicializacao.
   * A ordem de registro define a prioridade de matching (primeiro match vence).
   */
  register(def: GoalDefinition): void {
    // Previne duplicatas por type
    if (this._definitions.some((d) => d.type === def.type)) {
      // Silently ignore — idempotent registration
      return;
    }
    this._definitions.push(def);
  }

  /**
   * Lookup por sinais de keyword no texto do usuario.
   * Retorna a primeira definicao que tiver ao menos um sinal presente.
   */
  matchBySignals(userMessage: string): GoalDefinition | null {
    const lower = userMessage.toLowerCase();
    for (const def of this._definitions) {
      const hit = def.signals.some((s) => lower.includes(s));
      if (hit) return def;
    }
    return null;
  }

  /**
   * Fallback: mapeia CognitiveIntent → GoalType quando nenhum sinal corresponde.
   */
  resolveFromIntent(intent: CognitiveIntent): GoalType {
    return INTENT_GOAL_MAP[intent] ?? "unknown";
  }

  /** Lista todas as definicoes registradas (imutavel). */
  listAll(): readonly GoalDefinition[] {
    return [...this._definitions];
  }

  /** Total de definicoes registradas. */
  get size(): number {
    return this._definitions.length;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__GOAL_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GoalRegistryClass();
}

export const GoalRegistry: GoalRegistryClass = (
  globalThis as unknown as Record<string, GoalRegistryClass>
)[_KEY];

// ── Built-in Goal Definitions (registered at module load) ─────────────────────
// Each connector namespace registers here. Future connectors call
// GoalRegistry.register() from their own initialization module.

const _builtins: GoalDefinition[] = [
  // ── Gmail ──────────────────────────────────────────────────────────────────
  // IMPORTANT: gmail.searchMessages must come BEFORE gmail.readInbox
  // so that "procure emails da Shopee" matches search, not inbox.
  {
    type: "gmail.searchMessages",
    namespace: "gmail",
    description: "Search Gmail messages by query",
    signals: [
      // Explicit search commands (PT)
      "procure emails", "procure e-mails", "procurar emails", "procurar e-mails",
      "buscar email", "buscar e-mail", "pesquisar email", "pesquisar e-mail",
      "pesquise emails", "pesquise e-mails", "encontrar email", "procurar email",
      "busque emails", "busque e-mails", "mostre emails", "mostrar emails",
      // Explicit search commands (EN)
      "search email", "find email", "show emails",
      // Prepositional queries (PT) — "emails da X", "emails do X", "emails de X"
      "emails de ", "e-mails de ", "emails da ", "e-mails da ",
      "emails do ", "e-mails do ", "emails contendo", "e-mails contendo",
      // Interrogative forms — "tenho emails da X", "existe email da X"
      "tenho email", "tenho e-mail", "tenho algum email", "tenho alguma mensagem",
      "existe email", "existe e-mail", "existe algum email", "existe alguma mensagem",
      "há email", "há e-mail", "há algum email", "ha algum email",
      "tem email", "tem e-mail", "tem algum email", "tem alguma mensagem",
      "recebi email", "recebi e-mail", "recebi algum email",
      "recebi algo da", "recebi algo do", "recebi algo de",
      // Showing
      "ver emails", "ver e-mails", "listar emails", "checar emails",
    ],
    extractParams: (msg) => {
      // Use the normalizer for robust entity extraction (E-02.7)
      // Lazy import to avoid circular deps at module level
      try {
        // Inline normalize logic to stay synchronous
        const afterPrep = msg.match(/(?:da|do|de|contendo|sobre|com assunto|from|about|algum[a]?\s+(?:email[s]?\s+(?:da|do|de))?)\s+(.+?)(?:\?|$)/i)?.[1];
        if (afterPrep) {
          const cleaned = afterPrep.replace(/[?!.,;:]/g, "").trim();
          if (cleaned) return { query: cleaned };
        }
        const quoted = msg.match(/"([^"]+)"/)?.[1];
        if (quoted) return { query: quoted };
        // Strip noise and return entity
        const stripped = msg
          .replace(/\b(procur[ea]r?|pesquis[ae]r?|buscar?|busque?|encontrar?|mostre?|mostrar?|listar?|liste?|ver|veja|tenho|existe|há|ha|tem|recebi|receber)\b/gi, "")
          .replace(/\b(algum[a]?|emails?|e-?mails?|mensagens?|da[s]?|do[s]?|de[s]?)\b/gi, "")
          .replace(/[?!.,;:]/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        return { query: stripped || msg.trim() };
      } catch {
        return { query: msg.trim() };
      }
    },
  },
  {
    type: "gmail.readInbox",
    namespace: "gmail",
    description: "Read the user's Gmail inbox",
    signals: [
      "email", "emails", "e-mail", "e-mails", "inbox", "caixa de entrada",
      "meus emails", "meus e-mails", "ultimos emails", "ultimos e-mails",
      "mensagens recentes", "leia meus", "ver emails", "checar emails",
    ],
    extractParams: (msg) => {
      const n = msg.match(/\b(\d+)\b/)?.[1];
      return { maxResults: n ? Math.min(parseInt(n, 10), 50) : 10 };
    },
  },
  {
    type: "gmail.readMessage",
    namespace: "gmail",
    description: "Open and read a specific Gmail message",
    signals: [
      "abrir email", "abrir mensagem", "ler email", "ler mensagem",
      "ver email", "open email", "read email",
    ],
    extractParams: () => ({ messageId: null }),
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    type: "calendar.createEvent",
    namespace: "calendar",
    description: "Create a new calendar event",
    signals: [
      "criar evento", "agendar", "marcar reuniao", "nova reuniao",
      "create event", "schedule meeting", "add event",
    ],
    extractParams: (msg) => {
      const t = msg.match(/\b(\d{1,2}h?\d{0,2})\b/)?.[1];
      return { rawText: msg.trim(), suggestedTime: t ?? null };
    },
  },
  {
    type: "calendar.listTomorrow",
    namespace: "calendar",
    description: "List tomorrow's calendar events",
    signals: [
      "amanha", "amanha", "tomorrow", "compromissos amanha",
      "agenda amanha", "reunioes amanha", "eventos amanha",
    ],
    extractParams: () => ({ dateOffset: 1 }),
  },
  {
    type: "calendar.listWeek",
    namespace: "calendar",
    description: "List this week's calendar events",
    signals: [
      "semana", "week", "esta semana", "proxima semana",
      "agenda da semana", "compromissos da semana", "eventos da semana",
    ],
    extractParams: () => ({ days: 7 }),
  },
  {
    type: "calendar.listToday",
    namespace: "calendar",
    description: "List today's calendar events",
    signals: [
      "hoje", "today", "agenda", "compromissos", "reunioes", "eventos",
      "calendario", "minha agenda", "meu calendario",
    ],
    extractParams: () => ({ dateOffset: 0 }),
  },

  // ── Drive ──────────────────────────────────────────────────────────────────
  // PRIORITY ORDER: downloadFile > openDocument > searchFiles > listRecent
  // matchBySignals() returns the FIRST hit in registration order.
  {
    type: "drive.downloadFile",
    namespace: "drive",
    description: "Download or export a file from Google Drive",
    signals: [
      "baixar", "baixe", "baixa", "baixo", "baixando",
      "download", "exportar", "exporte", "exporta",
      "baixar o arquivo", "baixar o documento",
      "baixar arquivo", "baixar documento",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterNoun = msg.match(/(?:o arquivo|o documento|arquivo|documento)\s+([a-z0-9\s\-_.]+?)(?:\s*$|\s+(?:no|em|do|da|de))/i)?.[1]?.trim();
      return { fileName: quoted ?? afterNoun ?? null, rawText: msg.trim() };
    },
  },
  {
    type: "drive.openDocument",
    namespace: "drive",
    description: "Open or download a specific document in Drive",
    signals: [
      // Download / read verbs (PT + EN) — highest priority
      "baixar", "baixe", "baixa", "download", "baixar arquivo", "baixar documento",
      "baixar o arquivo", "baixar o documento", "ler arquivo", "ler documento",
      "read file", "read document", "abrir arquivo",
      "open document", "open file",
      // Document type words (when accompanied by a name / action intent)
      "abrir", "planilha", "documento", "spreadsheet", "doc",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      return { fileName: quoted ?? null, rawText: msg.trim() };
    },
  },
  {
    type: "drive.searchFiles",
    namespace: "drive",
    description: "Search files in Google Drive",
    signals: [
      "buscar arquivo", "buscar documento", "pesquisar drive",
      "encontrar arquivo", "search drive", "find file",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      return { query: quoted ?? msg.trim() };
    },
  },
  {
    type: "drive.listRecent",
    namespace: "drive",
    description: "List recently accessed Drive files",
    signals: [
      "arquivos recentes", "documentos recentes", "recent files",
      "ultimos arquivos", "ver drive", "meus arquivos",
    ],
    extractParams: () => ({ maxResults: 10 }),
  },

  // ── GitHub — Sprint M-02 ─────────────────────────────────────────────────
  // All signals are specific enough to avoid collision with Gmail/Calendar/Drive.
  // Signal matching priority: more-specific goals listed first.
  {
    type: "github.searchCode",
    namespace: "github",
    description: "Search for code symbols, classes, functions, or text in the repository",
    signals: [
      // EN — code search
      "where is", "find class", "find function", "find interface", "find type",
      "search for", "locate", "implemented in", "search class", "search code",
      "search in code", "grep", "find text", "where is used", "find usage",
      "who imports", "who calls", "called by", "cross reference", "references",
      // PT — code search
      "onde está", "onde fica", "procurar classe", "encontrar classe",
      "onde está implementado", "onde é usado", "quem usa", "quem importa",
      "onde está definido",
    ],
    extractParams: (msg) => {
      const sym = msg.match(/([A-Z][a-zA-Z0-9]+(?:Engine|Manager|Service|Router|Gateway|Connector|Handler|Provider|Factory|Builder|Queue|Registry|Orchestrator|Pipeline|Composer|Executor|Dispatcher|Monitor))/)?.[1]
        ?? msg.replace(/\b(where is|find|locate|search for|grep|procurar|encontrar|onde está|onde fica)\b/gi, "").trim();
      return { query: sym || msg.trim() };
    },
  },
  {
    type: "github.listPullRequests",
    namespace: "github",
    description: "List open or closed pull requests in the repository",
    signals: [
      "pull request", "pull requests", "pr list", "open prs", "prs",
      "merge request", "list prs", "show prs", "listar prs",
    ],
    extractParams: (msg) => {
      const state = msg.includes("closed") || msg.includes("fechado") ? "closed" : "open";
      return { state };
    },
  },
  {
    type: "github.listIssues",
    namespace: "github",
    description: "List issues in the repository",
    signals: [
      "issues", "open issues", "list issues", "bug list",
      "problemas abertos", "listar issues", "show issues",
    ],
    extractParams: (msg) => {
      const state = msg.includes("closed") || msg.includes("fechado") ? "closed" : "open";
      return { state };
    },
  },
  {
    type: "github.commitTimeline",
    namespace: "github",
    description: "Show commit history timeline for the repository",
    signals: [
      "commit timeline", "what changed last sprint", "recent changes",
      "last sprint changes", "what was done", "commit history timeline",
      "o que mudou", "o que foi feito", "historico de commits recentes",
    ],
    extractParams: () => ({ per_page: 30 }),
  },
  {
    type: "github.repoStatistics",
    namespace: "github",
    description: "Show repository statistics: stars, forks, languages, description",
    signals: [
      "repository statistics", "repo statistics", "repo info", "repository info",
      "estatisticas do repositorio", "project stats", "repo stats",
    ],
    extractParams: () => ({}),
  },
  {
    type: "github.listBranches",
    namespace: "github",
    description: "List branches of the repository",
    signals: [
      "list branches", "show branches", "listar branches", "galhos do repositorio",
    ],
    extractParams: () => ({}),
  },
  {
    type: "github.listCommits",
    namespace: "github",
    description: "List recent commits in the repository",
    signals: [
      "list commits", "show commits", "recent commits", "ultimos commits",
      "listar commits", "commit history",
    ],
    extractParams: () => ({ per_page: 20 }),
  },
  {
    type: "github.listFiles",
    namespace: "github",
    description: "List files in the repository tree",
    signals: [
      "list files", "show files", "source files", "listar arquivos do repositorio",
      "file tree", "repository tree", "show structure",
    ],
    extractParams: () => ({}),
  },
  {
    type: "github.getFile",
    namespace: "github",
    description: "Read the content of a specific file in the repository",
    signals: [
      "read file", "show file", "content of", "open file",
      "source code", "codigo fonte", "conteudo do arquivo",
    ],
    extractParams: (msg) => {
      const path = msg.match(/(?:in |at |file |from )?([a-zA-Z0-9_/-]+\.[a-zA-Z]{1,6})/i)?.[1];
      return { path: path ?? null };
    },
  },
  {
    type: "github.listRepos",
    namespace: "github",
    description: "List user repositories",
    signals: [
      "list repos", "show repos", "my repos", "available repos",
      "listar repositorios", "repositorios disponiveis", "meus repositorios",
    ],
    extractParams: () => ({ per_page: 10 }),
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  {
    type: "memory.summarize",
    namespace: "memory",
    description: "Summarize recent conversation or session",
    signals: [
      "resumo", "resumir", "summarize", "summary", "o que foi discutido",
      "o que falamos", "recap", "recapitular",
    ],
    extractParams: () => ({}),
  },
  {
    type: "memory.query",
    namespace: "memory",
    description: "Query the memory for a specific topic",
    signals: [
      "lembro", "recordo", "remember", "memoria",
      "o que eu disse", "quando foi", "encontrar na memoria",
    ],
    extractParams: () => ({}),
  },
];

// Register all builtins idempotently
_builtins.forEach((d) => GoalRegistry.register(d));