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
import { pickModelForMessage } from "@/lib/openrouter/categoryRouter";
import { findAccountByMessageMention } from "@/lib/google-auth/GoogleMultiAccount";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

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
   *
   * FIX (auditoria cognição): usava .includes() puro (substring). Como
   * essa função é DETERMINÍSTICA (primeira correspondência já vence,
   * sem threshold de confiança) e roda ANTES de qualquer outro sistema
   * de roteamento, colisões aqui são as mais graves da auditoria:
   *   "baixo" (drive.downloadFile) bate em "o preço está baixo" —
   *     "baixo" é um adjetivo comum (baixo/baixa), não só o comando
   *     de download.
   *   "move" (drive.moveFile) bate em "remove esse item" — sentido
   *     oposto: mover vs. remover.
   * Fronteira Unicode resolve sem remover nenhum sinal válido.
   */
  matchBySignals(userMessage: string): GoalDefinition | null {
    const lower = userMessage.toLowerCase();
    for (const def of this._definitions) {
      const hit = def.signals.some((s) => {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u");
        return pattern.test(lower);
      });
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

  /** Returns true if a GoalType is registered. */
  has(type: GoalType): boolean {
    return this._definitions.some((d) => d.type === type);
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
  // PRIORITY ORDER (first-match-wins):
  //   1. gmail.searchMessages  — explicit search verbs
  //   2. gmail.readEmail       — multi-word specific read-body signals (MUST be before readInbox)
  //   3. gmail.readInbox       — generic inbox signals ("emails", "inbox", etc.)
  //   4. gmail.readMessage     — open/read a specific message by reference
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
      // Showing — note: "ver emails" / "checar emails" are kept only in readInbox
      // to avoid collision. "listar emails" kept here as it implies listing by query.
      "ver e-mails", "listar emails",
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
        // Sprint 3a (correção do antipadrão): sem entidade real extraída, não
        // recriar a query a partir da frase de comando inteira — devolver
        // null (ausência explícita), nunca msg.trim().
        return { query: stripped || null };
      } catch {
        return { query: null };
      }
    },
  },
  {
    type: "gmail.readEmail",
    namespace: "gmail",
    description: "Read the full content (body) of a specific email message",
    signals: [
      // PT — leitura de corpo completo
      "leia este email", "leia esse email", "leia o email",
      "leia o primeiro email", "leia o segundo email", "leia o terceiro email",
      "leia o ultimo email", "leia o último email",
      "leia a mensagem", "leia esta mensagem", "leia essa mensagem",
      "abra este email", "abra esse email", "abra o email",
      "leia o email completo", "mostrar conteudo", "mostrar o conteudo",
      "mostre o conteudo", "mostre o corpo", "corpo do email",
      "conteudo do email", "conteudo da mensagem", "texto do email",
      "email completo", "mensagem completa",
      "ultimo e-mail", "último e-mail", "ultimo email", "último email",
      // EN
      "read this email", "read the email", "read the full email", "read the last email",
      "show email content", "show the full email", "open this email",
      "email body", "full email", "last email",
    ],
    extractParams: (msg) => {
      // 1. Explicit messageId in the message text (e.g. "leia o email 18fa3b2c1d4e5f6a")
      const idMatch = msg.match(/\b([0-9a-f]{8,})\b/i)?.[1];
      if (idMatch) return { messageId: idMatch, emailIndex: null };

      // 2. Ordinal reference ("o primeiro", "o segundo", "o terceiro" …)
      const ordinals: Record<string, number> = {
        "primeiro": 0, "first": 0,
        "segundo": 1, "second": 1,
        "terceiro": 2, "third": 2,
        "quarto": 3, "fourth": 3,
        "quinto": 4, "fifth": 4,
      };
      const ordinalKey = Object.keys(ordinals).find((k) => msg.toLowerCase().includes(k));
      const emailIndex = ordinalKey != null ? ordinals[ordinalKey] : null;

      // 3. Resolve from GmailConnectorContext stored in ConversationStore
      //    ("leia este email", "abra essa mensagem", etc.)
      try {
        const { conversationStore } = require("@/lib/conversation-platform/ConversationStore");
        const { readGmailContext, resolveMessageId } = require("@/lib/connector-context/providers/GmailContextBuilder");
        const raw = conversationStore.getConnectorContext("gmail");
        const gmailCtx = readGmailContext(raw);
        const resolvedId = resolveMessageId(gmailCtx, emailIndex);
        if (resolvedId) {
          return { messageId: resolvedId, emailIndex };
        }
      } catch {
        // Store not yet available (SSR / test env) — fall through
      }

      return { messageId: null, emailIndex };
    },
  },
  {
    type: "gmail.readInbox",
    namespace: "gmail",
    description: "Read the user's Gmail inbox",
    signals: [
      // NOTE: "email" (bare word) intentionally removed — it is a substring of
      // every gmail.readEmail signal and caused first-match collision.
      // Signals here are all multi-word or unambiguously inbox-specific.
      "emails", "e-mail", "e-mails", "inbox", "caixa de entrada",
      "meus emails", "meus e-mails", "ultimos emails", "ultimos e-mails",
      "mensagens recentes", "leia meus", "ver emails", "checar emails",
    ],
    extractParams: (msg) => {
      const n = msg.match(/\b(\d+)\b/)?.[1];
      const mentionedAccount = findAccountByMessageMention(getActiveWorkspaceId(), msg);
      return {
        maxResults: n ? Math.min(parseInt(n, 10), 50) : 10,
        ...(mentionedAccount ? { accountEmail: mentionedAccount.email } : {}),
      };
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
  {
    type: "gmail.getThread" as GoalType,
    namespace: "gmail",
    description: "Read a full Gmail thread (all messages)",
    signals: [
      "thread completa", "thread inteira", "conversa completa", "conversa inteira",
      "toda a conversa", "todos os emails da thread", "leia a thread",
      "read thread", "full thread", "toda a thread",
    ],
    extractParams: (msg) => {
      const idMatch = msg.match(/\b([0-9a-f]{8,})\b/i)?.[1];
      return { threadId: idMatch ?? null };
    },
  },
  {
    type: "gmail.getAttachment" as GoalType,
    namespace: "gmail",
    description: "Download a Gmail attachment",
    signals: [
      "baixar anexo", "leia o anexo", "leia esse anexo", "abrir anexo",
      "ver anexo", "download attachment", "read attachment", "open attachment",
      "anexo do email",
    ],
    extractParams: (msg) => {
      const messageIdMatch = msg.match(/messageId[=:]\s*([0-9a-f]+)/i)?.[1];
      const attachmentIdMatch = msg.match(/attachmentId[=:]\s*([^,\s]+)/i)?.[1];
      return { messageId: messageIdMatch ?? null, attachmentId: attachmentIdMatch ?? null };
    },
  },
  {
    type: "gmail.listLabels" as GoalType,
    namespace: "gmail",
    description: "List all Gmail labels/folders",
    signals: [
      "listar labels", "listar etiquetas", "minhas labels", "minhas etiquetas",
      "quais labels", "quais etiquetas", "mostrar labels", "mostrar etiquetas",
      "list labels", "my labels", "show labels",
    ],
    extractParams: () => ({}),
  },
  {
    type: "gmail.createDraft" as GoalType,
    namespace: "gmail",
    description: "Create a draft email in Gmail",
    signals: [
      "criar rascunho",
      "criar um rascunho",
      "novo rascunho",
      "rascunho de email",
      "rascunho de e-mail",
      "create draft",
      "new draft",
      "draft email",
    ],
    extractParams: (msg: string) => {
      const toMatch = msg.match(/(?:para|to)\s+([^\s,]+@[^\s,]+\.[^\s,]+)/i)?.[1];
      const subjectMatch = msg.match(/(?:assunto|subject)[:\s]+["']?([^"'\n]+?)["']?(?:\s+(?:corpo|body|mensagem)|\s*$)/i)?.[1];
      const bodyMatch = msg.match(/(?:corpo|body|mensagem)[:\s]+["']?([^"'\n]+?)["']?$/i)?.[1];
      return {
        to: toMatch ? [toMatch.trim()] : [],
        subject: subjectMatch ? subjectMatch.trim() : "",
        body: bodyMatch ? bodyMatch.trim() : "",
        rawText: msg.trim(),
      };
    },
  },
  {
    type: "gmail.sendEmail" as GoalType,
    namespace: "gmail",
    description: "Send an email via Gmail",
    signals: [
      "enviar email", "enviar e-mail", "envie email", "envie e-mail",
      "enviar um email", "enviar um e-mail", "envie um email", "envie um e-mail",
      "mandar email", "mandar e-mail", "mande email", "mande e-mail",
      "mandar um email", "mandar um e-mail", "mande um email", "mande um e-mail",
      "send email", "send an email",
    ],
    extractParams: (msg: string) => {
      const baseWorkspaceId = getActiveWorkspaceId();

      const toMatch = msg.match(/(?:para|to)[:\s]+([^\s,]+@[^\s,]+\.[^\s,]+)/i)?.[1];
      let resolvedTo = toMatch ? toMatch.trim() : null;
      if (!resolvedTo) {
        const toNick = msg.match(/(?:para|to)[:\s]+([a-z0-9._-]{4,})/i)?.[1];
        if (toNick) {
          const toAccount = findAccountByMessageMention(baseWorkspaceId, toNick);
          if (toAccount) resolvedTo = toAccount.email;
        }
      }

      const fromNick = msg.match(/(?:de|from)[:\s]+([a-z0-9._-]{4,})/i)?.[1];
      let fromAccount = fromNick ? findAccountByMessageMention(baseWorkspaceId, fromNick) : null;
      if (!fromAccount) {
        const beforePara = msg.split(/\b(?:para|to)\b/i)[0];
        fromAccount = findAccountByMessageMention(baseWorkspaceId, beforePara);
      }

      // Subject para no proximo campo (corpo/body/mensagem) ou fim — evita que
      // "assunto: Ola corpo: ..." vaze o corpo dentro do assunto.
      const subjectRe = /(?:assunto|subject)[:\s]+["']?(.+?)(?=\s+(?:corpo|body|mensagem)[:\s]|$)/im;
      const subjectFullMatch = msg.match(subjectRe);
      const subjectMatch = subjectFullMatch?.[1];
      const subjectEndIndex = subjectFullMatch ? subjectFullMatch.index! + subjectFullMatch[0].length : null;

      const explicitBodyMatch = msg.match(/(?:corpo|body|mensagem)[:\s]+["']?([^"'\n]+?)["']?$/i)?.[1];
      let bodyMatch = explicitBodyMatch;
      if (!bodyMatch && subjectEndIndex !== null) {
        bodyMatch = msg.slice(subjectEndIndex).trim() || undefined;
      }
      // Sem marcadores explicitos (assunto:/corpo:): o texto apos o
      // destinatario e o corpo. "envie email para X: Olá, vamos marcar" ->
      // body = "Olá, vamos marcar", subject derivado do slice.
      if (!bodyMatch && resolvedTo) {
        const _afterTo = msg.split(/(?:para|to)[:\s]+[^\s,]+@[^\s,]+\.[^\s,]+/i)[1];
        if (_afterTo) {
          bodyMatch = _afterTo.replace(/^[\s:,\-–—]+/, "").trim() || undefined;
        }
      }
      // FIX: trunca uma clausula " e <verbo de comando> ..." (2ª intenção) no fim
      // do corpo — "corpo: ... e liste meus arquivos" nao envia o pedido de arquivos
      // dentro do email. O decompositor normalmente separa; isto e guarda pro path
      // single-intent e mensagens nao-split.
      const _CMD = "envia|envie|manda|mande|lista|liste|verifica|verifique|confere|confira|agenda|agende|le|lê|leia|resume|resuma|pesquisa|pesquise|cria|crie|abre|abra|busca|busque|procura|procure|deleta|delete|exclui|exclua|renomeia|renomeie|copia|copie|move|mova|baixa|baixe|conecta|conecte|desconecta|desconecte|adiciona|adicione";
      const _cleanBody = (bodyMatch ?? "")
        .replace(new RegExp(`\\s+e\\s+(?:${_CMD})\\b.*$`, "i"), "")
        .replace(new RegExp(`\\n\\s*\\n(?:${_CMD})\\b.*$`, "i"), "")
        .trim();

      // Sem fallback hardcoded "Mensagem via MemoryOS": se faltar assunto, deriva
      // do corpo; se faltar corpo, deixa vazio e deixa a validacao do GmailActions
      // devolver o erro real ("Assunto/Corpo obrigatorio") em vez de enviar lixo.
      const resolvedSubject = subjectMatch
        ? subjectMatch.trim()
        : (_cleanBody ? _cleanBody.slice(0, 60) : "");
      return {
        to: resolvedTo ? [resolvedTo] : [],
        subject: resolvedSubject,
        body: _cleanBody,
        rawText: msg.trim(),
        ...(fromAccount ? { accountEmail: fromAccount.email } : {}),
      };
    },
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
    type: "calendar.listCalendars" as GoalType,
    namespace: "calendar",
    description: "List all Google Calendars available to the user",
    signals: [
      "listar calendarios", "listar calendários", "meus calendarios", "meus calendários",
      "quais calendarios", "quais calendários", "mostrar calendarios", "mostrar calendários",
      "list calendars", "my calendars", "show calendars",
    ],
    extractParams: () => ({}),
  },

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  {
    type: "openrouter.listModels" as GoalType,
    namespace: "openrouter",
    description: "List available AI models via OpenRouter",
    signals: [
      "listar modelos de ia", "listar modelos", "quais modelos de ia",
      "modelos disponiveis", "modelos disponíveis", "modelos de ia disponiveis",
      "list ai models", "list models", "available models",
    ],
    extractParams: () => ({}),
  },
  {
    type: "openrouter.chatCompletion" as GoalType,
    namespace: "openrouter",
    description: "Routes prompts to a category-appropriate AI model via OpenRouter (85 categories)",
    signals: [
      "perguntar ao modelo", "pergunte ao modelo", "perguntar para o modelo",
      "usar o modelo", "usando o modelo", "consultar o modelo",
      "ask the model", "ask model", "query model",
      "perguntar à ia", "pergunte à ia", "perguntar pra ia", "pergunte pra ia",
      "pergunta para a ia", "pergunta pra ia", "consultar a ia", "consulte a ia",
      "traduzir", "traduza", "tradução",
      "resuma isso", "resumir isso", "resuma", "resumo",
      "escrever codigo", "escreva codigo", "corrigir codigo", "corrija codigo", "codigo",
      "analisar documento", "analise este documento", "analisar este texto",
      "transcrever", "transcreva", "transcrição",
      "revisar texto", "revise este texto", "corrigir gramatica", "corrija a gramatica",
      "escreva uma historia", "escreva um roteiro", "escrita criativa",
      "redija um email", "escreva um email formal",
      "parafrasear", "parafraseie", "reescreva isso",
      "sugira um titulo", "gere um titulo", "manchete",
      "corrigir bug", "corrija esse bug", "revisar codigo",
      "explique este codigo", "o que este codigo faz",
      "gerar teste", "escreva um teste", "teste automatizado",
      "converter codigo", "converta este codigo",
      "documentar codigo", "documentação tecnica",
      "escreva um sql", "consulta sql", "query sql",
      "raciocinio logico", "calculo matematico", "resolva esta equação",
      "analisar planilha", "analisar dados",
      "comparar opções", "qual a melhor opção",
      "verificar fato", "isso é verdade", "fact check",
      "pesquisa aprofundada", "pesquise sobre",
      "descreva esta imagem", "o que tem nesta imagem",
      "leia este texto na imagem", "ocr",
      "escreva uma proposta comercial",
      "analisar contrato", "leia este contrato",
      "planejar projeto", "planejamento de tarefas",
      "gerar relatorio", "escreva um relatorio",
      "brainstorm", "gere ideias",
      "analise swot", "analise estrategica",
      "descrição de produto",
      "roteiro de vendas", "script de vendas",
      "copywriting", "texto publicitario",
      "post para instagram", "post para redes sociais",
      "otimização seo", "seo",
      "gerar hashtags", "sugestão de legenda",
      "roteiro de video curto",
      "sugestão de nome", "slogan",
      "explique de forma didatica", "explique como se eu tivesse",
      "ata de reuniao", "preencher formulario",
      "criar apresentação", "estrutura de slides",
      "organizar tarefas",
      "responder objeção", "cold call", "prospecção",
      "follow-up", "resumir historico de conversa",
      "criar prova", "questoes de prova", "quiz",
      "corrigir redação", "plano de aula",
      "sugerir cortes", "timestamps do video", "sugestao de thumbnail",
      "descrição de video", "extrair citações",
      "perguntas frequentes", "faq",
      "anuncio", "texto de anuncio", "teste ab",
      "politica de troca", "politica de devolução",
      "mensagem de aniversario", "mensagem de condolencia",
      "ajude a decidir", "o que cozinhar",
      "explicar contrato", "explicar documento burocratico",
      "lista de compras",
      "reclamação formal", "procon",
      "explicar exame medico", "perguntas para o medico",
      "cardapio", "restrição alimentar",
      "explicar financiamento", "explicar emprestimo",
      "organizar gastos", "produto financeiro",
      "ask ai", "ask the ai", "query ai",
    ],
    extractParams: (msg: string) => {
      const explicitModelMatch = msg.match(/(?:modelo|model)\s+([a-zA-Z0-9_\-\/.:]+)/i)?.[1];
      const promptMatch = msg.match(/(?:pergunta|prompt|pergunte|pergunta:|:)\s*["']?(.+?)["']?$/i)?.[1];

      const { model: categoryModel, matched } = pickModelForMessage(msg);

      return {
        model: explicitModelMatch ?? categoryModel,
        prompt: promptMatch ?? msg.trim(),
        rawText: msg.trim(),
        _category: matched ? categoryModel : "default",
      };
    },
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
  // PRIORITY ORDER: createFolder > downloadFile > listPDFs > listRecent > openDocument > searchFiles
  // matchBySignals() returns the FIRST hit in registration order.
  {
    type: "drive.createFolder" as GoalType,
    namespace: "drive",
    description: "Create a folder in Google Drive",
    signals: [
      "crie uma pasta", "criar pasta", "nova pasta", "novo diretorio",
      "create folder", "new folder",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1]?.trim();
      const afterFolder = msg.match(/(?:pasta|folder)\s+([a-z0-9\s\-_.]+)$/i)?.[1]?.trim();
      const stripped = msg
        .replace(/\b(crie|criar|cria|nova|novo|new|create|folder|pasta|diretorio|diret[oó]rio|por favor)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { folderName: quoted ?? afterFolder ?? (stripped || null) };
    },
  },
  {
    type: "drive.downloadFile",
    namespace: "drive",
    description: "Download or export a file from Google Drive",
    signals: [
      // FIX (auditoria cognição): "baixa"/"baixo" removidos — são também
      // os adjetivos mais comuns do português ("preço baixo", "voz
      // baixa"), ambiguidade que fronteira de palavra não resolve (a
      // palavra é a mesma, o significado que muda). "baixar"/"baixe"/
      // "baixando" já cobrem o comando de download sem essa ambiguidade.
      "baixar", "baixe", "baixando",
      "download", "exportar", "exporte", "exporta",
      "baixar o arquivo", "baixar o documento",
      "baixar arquivo", "baixar documento",
      // "Abra esse PDF" / "abra esse documento" — open a specific file
      "abra esse pdf", "abra esse documento", "abra esse arquivo",
      "abrir esse pdf", "abrir esse documento", "abrir esse arquivo",
      "abra o pdf", "abra o arquivo",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterNoun = msg.match(/(?:o arquivo|o documento|arquivo|documento)\s+([a-z0-9\s\-_.]+?)(?:\s*$|\s+(?:no|em|do|da|de))/i)?.[1]?.trim();
      // IA-008: fallback para respostas soltas a uma desambiguação (ex: "rg Aparecida - download"),
      // que não batem no padrão "arquivo X" acima. Remove palavras de comando/filler conhecidas
      // em vez de usar a frase inteira (rawText) como busca — evita que "download"/"baixar" etc.
      // entrem no termo de busca do Drive.
      //
      // Correção adicional (mesmo padrão do Sprint 3c, aplicado a drive.openDocument):
      // esta função é irmã de drive.openDocument (mapeiam para a mesma
      // capability), mas nunca recebeu a mesma correção. "video"/"vídeo"
      // (e "file"/"document" em inglês) não estavam na lista de remoção —
      // "download video creatina.mp4" deixava fileName="video creatina.mp4"
      // em vez de "creatina.mp4".
      const stripped = msg
        .replace(/\b(baixar|baixe|baixa|baixo|baixando|download|downloads|exportar|exporte|exporta|abrir|abra|abre|ler|leia|video|vídeo|o arquivo|os arquivos|o documento|os documentos|arquivo|arquivos|documento|documentos|file|files|document|documents|por favor)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { fileName: quoted ?? afterNoun ?? (stripped || null), rawText: msg.trim() };
    },
  },
  {
    // read-04: Document section extraction
    // PRIORITY: placed before summarizeDocument (more specific: "extract sections" vs general "summarize")
    // This ensures explicit extraction requests match before summarization requests
    type: "drive.extractSections" as GoalType,
    namespace: "drive",
    description: "Extract specific sections or pages from a document in Google Drive",
    signals: [
      // Portuguese
      "extrair", "extraia", "extrai", "extracao",
      "extrair secao", "extrair secoes", "extrair capitulo", "extrair capitulos",
      "extrair paginas", "extrair pagina",
      "extrair seção", "extrair seções", "extrair capítulo", "extrair capítulos",
      "extrair trecho", "extrair trechos",
      "obter secao", "obter secoes", "obter capitulo", "obter capitulos",
      "pegar secao", "pegar secoes", "pegar pagina", "pegar paginas",
      "extrair do arquivo", "extrair do documento",
      "extrair da", "extrair de",
      // English
      "extract", "extract section", "extract sections", "extract chapter", "extract chapters",
      "extract pages", "extract page", "get section", "get sections",
      "pull section", "pull sections", "pull pages",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterNoun = msg.match(/(?:o arquivo|o documento|arquivo|documento|file|document)\s+([a-z0-9\s\-_.]+?)(?:\s*$|\s+(?:no|em|do|da|de|in|of))/i)?.[1]?.trim();
      // Sprint 3d (correção do antipadrão): a lista de remoção não cobria
      // todos os próprios sinais deste goal ("obter"/"pegar"/"get"/"pull" +
      // "secao(ões)"/"capitulo(s)"/"pagina(s)") — deixavam o sinal inteiro
      // vazar como se fosse o nome do arquivo.
      const stripped = msg
        .replace(/\b(extrair|extraia|extrai|extracao|extrair secao|extrair secoes|extrair capitulo|extrair paginas|obter|pegar|get|pull|secao|secoes|seção|seções|capitulo|capitulos|capítulo|capítulos|pagina|paginas|página|páginas|trecho|trechos|chapter|chapters|page|pages|section|sections|extract|archive|arquivo|document|do drive|no drive|drive|por favor)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { fileName: quoted ?? afterNoun ?? (stripped || null), rawText: msg.trim(), sectionNames: (msg.match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, '')), _method: "sections" };
    },
  },
  {
    // read-03: Document summarization via LLM
    // PRIORITY: placed after extractSections (more specific) but before listPDFs, listRecent, openDocument (more generic)
    type: "drive.summarizeDocument" as GoalType,
    namespace: "drive",
    description: "Summarize a document from Google Drive using LLM",
    signals: [
      // Portuguese
      "resumir", "resuma", "resume", "resumo",
      "resumir o arquivo", "resumir o documento",
      "resumir arquivo", "resumir documento",
      "fazer resumo", "faça resumo",
      "resumo do arquivo", "resumo do documento",
      "faz um resumo", "criar um resumo",
      // English
      "summarize", "make a summary",
      "summarize file", "summarize document",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterNoun = msg.match(/(?:o arquivo|o documento|arquivo|documento|file|document)\s+([a-z0-9\s\-_.]+?)(?:\s*$|\s+(?:no|em|do|da|de|in|of))/i)?.[1]?.trim();
      const stripped = msg
        .replace(/\b(resumir|resuma|resume|resumo|fazer|faça|criar|summarize|make|document|arquivo|file|o arquivo|o documento|do drive|no drive|drive|por favor)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { fileName: quoted ?? afterNoun ?? (stripped || null), rawText: msg.trim() };
    },
  },
  {
    // IA-012: movido pra antes de drive.openDocument — "arquivos pdf" precisa
    // vencer "ler arquivo" (que é substring de "ler arquivos") em mensagens
    // como "ler arquivos pdf", que são pedido de LISTAGEM, não de abrir um
    // arquivo único chamado "arquivos pdf".
    type: "drive.listPDFs" as GoalType,
    namespace: "drive",
    description: "List PDF files in Google Drive",
    signals: [
      "apenas pdfs", "apenas pdf", "somente pdfs", "somente pdf",
      "pdfs no drive", "listar pdfs", "liste pdfs", "meus pdfs",
      "arquivos pdf", "only pdfs", "list pdfs",
    ],
    extractParams: () => ({ mimeType: "application/pdf", pageSize: 20 }),
  },
  {
    // IA-021: listRecent movido pra antes de openDocument, com sinais genéricos
    // adicionados ("drive" solto, "mostrar arquivos", etc.) — frases vagas sobre
    // o Drive (sem verbo de baixar, sem nome de arquivo) devem listar tudo,
    // em vez de tentar abrir um arquivo específico sem nome e falhar.
    type: "drive.listRecent",
    namespace: "drive",
    description: "List recently accessed Drive files",
    signals: [
      "arquivos recentes", "documentos recentes", "recent files",
      "ultimos arquivos", "ver drive", "meus arquivos",
      "listar drive", "liste o drive", "liste meu drive",
      "mostrar arquivos", "mostre arquivos", "mostre os arquivos",
      "me mostre os arquivos", "arquivos do drive", "arquivo do drive",
      "todos os arquivos", "todos os arquivos do drive",
      "o que tem no drive", "o que tem no meu drive",
      "drive",
    ],
    extractParams: () => ({ maxResults: 50 }),
  },
  {
    type: "drive.openDocument",
    namespace: "drive",
    description: "Open or download a specific document in Drive",
    signals: [
      "ler arquivo", "ler documento", "ler esse documento", "leia esse documento",
      "leia o documento", "leia esse arquivo", "leia o arquivo",
      "read file", "read document",
      "open document", "open file",
      "abrir arquivo", "abrir o arquivo", "abrir o documento",
      "assistir", "assistir video", "assistir arquivo",
      "watch", "watch video", "watch file",
      "reproduzir", "reproduzir video", "tocar video",
      "play", "play video", "play file",
      "player", "video player",
      "ver video", "ver arquivo de video",
      "abrir video", "abrir arquivo de video",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      // IA-014: mesma limpeza do IA-008 (drive.downloadFile) — este goal mapeia
      // pra mesma capability "drive.downloadFile" internamente, mas nunca tinha
      // recebido a mesma correção. Sem isso, "ler arquivos do drive" virava a
      // frase inteira como termo de busca.
      // Sprint 3c (correção do antipadrão): a lista de remoção não cobria os
      // próprios sinais deste goal (assistir/watch/reproduzir/tocar/play/
      // player/video/read/open/ver) — mensagens como "assistir", "watch",
      // "abrir video" ou "ver arquivo de video" deixavam esses termos vazarem
      // como se fossem o nome do arquivo.
      const stripped = msg
        .replace(/\b(baixar|baixe|baixa|baixo|baixando|download|downloads|exportar|exporte|exporta|abrir|abra|abre|ler|leia|assistir|assista|watch|reproduzir|reproduza|tocar|toque|play|player|video|vídeo|read|open|ver|o arquivo|os arquivos|o documento|os documentos|arquivo|arquivos|documento|documentos|file|files|document|documents|do drive|no drive|drive|por favor)\b/gi, "")
        .replace(/[-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { fileName: quoted ?? (stripped || null), rawText: msg.trim() };
    },
  },
  {
    type: "drive.searchFiles",
    namespace: "drive",
    description: "Search files in Google Drive",
    signals: [
      "buscar arquivo", "buscar documento", "pesquisar drive",
      "encontrar arquivo", "search drive", "find file",
      // PDF name search signals — "Tem minha CNH em PDF?" / "Procure CNH"
      "tem minha cnh", "procure cnh", "encontre cnh", "procurar cnh",
      "procure contrato", "encontre contrato", "tem contrato",
    ],
    extractParams: (msg) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      // Extract named entity after common search verbs
      const nameMatch = msg.match(/(?:cnh|contrato|procure?|encontre?|tem)\s+(.+?)(?:\s+em\s+pdf|\?|$)/i)?.[1]?.trim();
      // Sprint 3d (correção do antipadrão): sem captura real (nem citação,
      // nem nameMatch), não recriar a query a partir da frase de comando
      // inteira — devolver null (ausência explícita), nunca msg.trim().
      return { query: quoted ?? nameMatch ?? null };
    },
  },

  // ── Drive Organization — Sprint delete-01 ────────────────────────────────────
  // delete-01: Deletar arquivo
  {
    type: "drive.deleteFile",
    namespace: "drive",
    description: "Delete a file from Google Drive",
    signals: [
      "deletar arquivo",
      "delete arquivo",
      "deleta arquivo",
      "deletar file",
      "delete file",
      "remover arquivo",
      "apagar arquivo",
      "remove arquivo",
      "eliminar arquivo",
      "delete this",
      "deletar isso",
      // Correção: frases naturais como "deletar X" sem a palavra "arquivo".
      "deletar", "delete", "deleta", "remover", "remove", "apagar", "eliminar",
    ],
    extractParams: (msg: string) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterVerb = msg.match(/(?:deletar|delete|deleta|remover|remove|apagar|eliminar)\s+(?:o\s+)?(?:arquivo\s+)?(.+?)$/i)?.[1]?.trim();
      return {
        fileName: quoted ?? (afterVerb || null),
        rawText: msg.trim(),
      };
    },
  },

  // ── Drive Organization — Sprint create-folder-01 ───────────────────────────
  // create-folder-01: Criar pasta
  {
    type: "drive.createFolder",
    namespace: "drive",
    description: "Create a new folder in Google Drive",
    signals: [
      "criar pasta",
      "create folder",
      "cria pasta",
      "criar diretório",
      "create directory",
      "nova pasta",
      "new folder",
      "fazer pasta",
      "make folder",
      "adicionar pasta",
      "add folder",
    ],
    extractParams: (msg: string) => ({
      folderName: null,
      rawText: msg.trim(),
    }),
  },

  // ── Drive Organization — Sprint rename-01 ────────────────────────────────
  // rename-01: Renomear arquivo
  {
    type: "drive.renameFile",
    namespace: "drive",
    description: "Rename a file or folder in Google Drive",
    signals: [
      "renomear arquivo",
      "rename file",
      "renomeia arquivo",
      "renomear pasta",
      "rename folder",
      "renomeia pasta",
      "alterar nome",
      "change name",
      "mudar nome",
      "change file name",
      "alter name",
      // Correção: frases naturais como "renomear X para Y".
      "renomear", "rename", "renomeia",
    ],
    extractParams: (msg: string) => {
      const m = msg.match(/(?:renomear|rename|renomeia|mudar nome|change name|alterar nome|change file name|alter name)\s+(?:o\s+arquivo\s+|a\s+pasta\s+|de\s+)?(.+?)\s+(?:para|to)\s+(.+?)$/i);
      return {
        fileName: m?.[1]?.trim() ?? null,
        newName: m?.[2]?.trim() ?? null,
        rawText: msg.trim(),
      };
    },
  },

  // ── Drive Organization — Sprint copy-01 ──────────────────────────────────
  // copy-01: Duplicar arquivo
  {
    type: "drive.copyFile",
    namespace: "drive",
    description: "Copy/duplicate a file or folder in Google Drive",
    signals: [
      "copiar arquivo",
      "copy file",
      "copia arquivo",
      "copiar pasta",
      "copy folder",
      "copia pasta",
      "duplicar arquivo",
      "duplicate file",
      "duplica arquivo",
      "duplicar pasta",
      "duplicate folder",
      "fazer cópia",
      "make a copy",
      "criar cópia",
      // Correção: frases naturais como "copiar X" sem a palavra "arquivo".
      "copiar", "copy", "copia", "duplicar", "duplicate", "duplica",
    ],
    extractParams: (msg: string) => {
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterVerb = msg.match(/(?:copiar|copy|copia|duplicar|duplicate|duplica)\s+(?:o\s+arquivo\s+|a\s+pasta\s+)?(.+?)(?:\s+como|\s+as|\s+para|\s+to|$)/i)?.[1]?.trim();
      const newName = msg.match(/(?:\scomo|\sas)\s+(.+?)$/i)?.[1]?.trim();
      return {
        fileName: quoted ?? (afterVerb || null),
        newName: newName || null,
        rawText: msg.trim(),
      };
    },
  },

  // ── Drive Organization — Sprint org-02 ───────────────────────────────────
  // org-02: Mover arquivo para pasta
  {
    type: "drive.moveFile",
    namespace: "drive",
    description: "Move a file to a different folder in Google Drive",
    signals: [
      "mover arquivo", "mover para", "mova arquivo", "mova para",
      "move file", "move to folder", "move to",
      "organizar arquivo", "organize file",
      "mover arquivo para pasta", "move file to folder",
      "organize", "organizing",
      // Correção: frases naturais como "mova X para Y" / "mover X para Y"
      // não continham "mova arquivo"/"mova para" como substring contígua
      // (o nome do arquivo fica no meio) — sinais soltos cobrem isso.
      "mover", "mova", "move",
    ],
    extractParams: (msg) => {
      // Extract file name and destination folder if mentioned
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterMover = msg.match(/(?:mover|move|mova)\s+(?:o\s+)?(?:arquivo\s+)?(.+?)(?:\s+para|\s+to|\s+em|$)/i)?.[1]?.trim();
      // Correção: extrai também o destino ("para X" / "to X") — antes essa
      // informação era descartada, e o executor não tinha como resolver
      // a pasta de destino a partir do nome.
      const afterPara = msg.match(/(?:\spara|\sto)\s+(?:a\s+pasta\s+|the\s+folder\s+|pasta\s+|folder\s+)?(.+?)$/i)?.[1]?.trim();
      return {
        fileName: quoted ?? (afterMover || null),
        newFolderName: afterPara || null,
        rawText: msg.trim(),
      };
    },
  },

  // ── Drive Upload — Sprint upload-01 ────────────────────────────────────────
  // upload-01: Upload arquivo para Google Drive
  {
    type: "drive.uploadFile",
    namespace: "drive",
    description: "Upload a file to Google Drive",
    signals: [
      "enviar arquivo", "envie arquivo", "envia arquivo",
      "upload arquivo", "upload file", "fazer upload",
      "faça upload", "subir arquivo", "suba arquivo",
      "upload para", "upload to", "enviar para drive",
      "envie para drive", "mandar arquivo", "mande arquivo",
      "carregar arquivo", "carregue arquivo",
    ],
    extractParams: (msg) => {
      // Extract file name if mentioned
      const quoted = msg.match(/"([^"]+)"/)?.[1];
      const afterUpload = msg.match(/(?:upload|enviar|envie|subir|carregar|suba|carregue|mandar|mande)\s+(?:um\s+)?(?:arquivo\s+)?(.+?)(?:\s+para|\s+to|\s+em|$)/i)?.[1]?.trim();
      return {
        fileName: quoted ?? (afterUpload || null),
        rawText: msg.trim(),
      };
    },
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
      // Sprint 3b (correção do antipadrão): a lista de remoção não cobria
      // todos os próprios sinais deste goal ("implemented in", "search
      // class/code/in code", "who imports/calls", "called by", "cross
      // reference", "references", e as variantes "onde ... implementado/
      // usado/usa/importa/definido") — deixavam o sinal inteiro (ou parte
      // dele) vazar como se fosse o símbolo buscado.
      //
      // Também corrigido: o `\b` de fechamento do JavaScript NUNCA casa
      // logo após um caractere acentuado (ex.: "á" em "está") seguido de
      // espaço/fim de string — \w no JS é ASCII-only. Isso fazia o sinal
      // "onde está" nunca ser removido, mesmo já estando na lista.
      // Trocado o `\b` de fechamento por um lookahead de espaço/pontuação/
      // fim de string, que não depende de classificação de caractere.
      const sym = msg.match(/([A-Z][a-zA-Z0-9]+(?:Engine|Manager|Service|Router|Gateway|Connector|Handler|Provider|Factory|Builder|Queue|Registry|Orchestrator|Pipeline|Composer|Executor|Dispatcher|Monitor))/)?.[1]
        ?? msg.replace(/\b(?:where is|find|locate|search for|search class|search code|search in code|grep|implemented in|who imports|who calls|called by|cross reference|references|procurar|encontrar|onde está implementado|onde está definido|onde está|onde fica|onde é usado|quem usa|quem importa)(?=\s|$|[.,;:!?])/gi, "").trim();
      // Sem símbolo real extraído, não recriar a query a partir da frase de
      // comando inteira — devolver null (ausência explícita), nunca msg.trim().
      return { query: sym || null };
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
  {
    type: "memori.remember" as GoalType,
    namespace: "memori",
    description: "Grava um fato ou preferência durável na memória de longo prazo (Memori Cloud)",
    signals: [
      "lembre que",
      "lembra que",
      "guarde essa informação",
      "guarde isso",
      "não esqueça que",
      "nao esqueca que",
      "anote que",
      "salve na memoria",
      "salve isso",
      "grave isso",
      "grave na memoria",
      "remember that",
      "save this",
      "don't forget",
      "dont forget",
    ],
    extractParams: (msg: string) => {
      const cleaned = msg
        .replace(/\b(lembre que|lembra que|guarde essa informa[cç][aã]o|guarde isso|n[aã]o esque[cç]a que|anote que|salve na mem[oó]ria|salve isso|grave isso|grave na mem[oó]ria|remember that|save this|don'?t forget)\b/gi, "")
        .trim();
      const finalMessage = cleaned || msg.trim();
      return {
        userMessage: finalMessage,
        assistantResponse: `Anotado: ${finalMessage}`,
        rawText: msg.trim(),
      };
    },
  },
  {
    type: "memori.recall" as GoalType,
    namespace: "memori",
    description: "Busca um fato ou preferência gravada anteriormente na memória de longo prazo (Memori Cloud)",
    signals: [
      "o que voce lembra sobre",
      "o que você lembra sobre",
      "voce lembra",
      "você lembra",
      "recupere informacao sobre",
      "recupere informação sobre",
      "o que sabe sobre",
      "o que voce sabe sobre",
      "o que você sabe sobre",
      "consulte a memoria sobre",
      "consulte a memória sobre",
      "what do you remember about",
      "do you remember",
      "recall information about",
    ],
    extractParams: (msg: string) => {
      return {
        query: msg.trim(),
        rawText: msg.trim(),
      };
    },
  },
];

// Register all builtins idempotently
_builtins.forEach((d) => GoalRegistry.register(d));