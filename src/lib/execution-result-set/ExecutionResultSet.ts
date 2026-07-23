/**
 * ExecutionResultSet.ts — EF-41 (Unified Execution Result Set)
 *
 * NOVA ENTIDADE ARQUITETURAL.
 *
 * Representa o conjunto completo e navegavel de itens retornados
 * por um Connector apos uma execucao bem-sucedida.
 *
 * RESPONSABILIDADE UNICA:
 *   Ser a fonte de verdade para resolucao de referencias ordinais:
 *     "o primeiro", "o segundo", "o ultimo", "proximo", "anterior"
 *
 * PRINCIPIOS:
 *   - Independente de Connector. Nenhum Connector conhece esta estrutura.
 *   - Independente de GoalBridge, Planner, Router, Runtime.
 *   - Persistida pelo RuntimeContextLayer via ConversationStore.
 *   - Substitui o antigo campo resultPaths: string[] no CurrentArtifact.
 *
 * COMPATIBILIDADE:
 *   - resultPaths permanece em CurrentArtifact por compatibilidade.
 *   - Todo codigo NOVO usa ExecutionResultSet.
 *   - currentResultSet: string[] em RuntimeContextState e mantido por
 *     compatibilidade mas nao e mais a fonte oficial.
 */

// ── ExecutionResultItem ────────────────────────────────────────────────────────

/**
 * Representa um unico item navegavel dentro de um ResultSet.
 *
 * label       — texto curto para exibicao ordinal ("Repo 1", "Email 2")
 * displayName — nome principal do item (repo name, file path, subject, etc.)
 * reference   — dado opaco que o Connector precisa para buscar o item
 *               (fileId, messageId, owner/repo, path, etc.)
 * metadata    — campos adicionais para contexto (sem shape obrigatorio)
 */
export interface ExecutionResultItem {
  /** Identificador estavel dentro do ResultSet (gerado pelo Builder) */
  id:          string;
  /** Texto curto para referencia ordinal: "item 1", "Repo 2", etc. */
  label:       string;
  /** Nome principal legivel pelo usuario */
  displayName: string;
  /** Referencia opaca para o Connector (fileId, path, owner/repo, messageId…) */
  reference:   unknown;
  /** Campos extras sem schema obrigatorio */
  metadata:    Record<string, unknown>;
}

// ── ExecutionResultSet ────────────────────────────────────────────────────────

/**
 * Conjunto navegavel de itens de uma execucao.
 * Produzido pelo ExecutionResultSetBuilder a partir do connectorData.
 * Consumido pelo ExecutionIntentManager.consume() para resolver ordinais.
 */
export interface ExecutionResultSet {
  /** ID unico do ResultSet (gerado no momento da criacao) */
  id:           string;
  /** Connector que produziu estes dados */
  connector:    string;
  /** Capability que foi executada */
  capability:   string;
  /** Tipo semantico dos itens (repository, email, file, event, …) */
  entityType:   string;
  /** Timestamp de criacao */
  createdAt:    number;
  /** Indice do item atualmente selecionado (null = nenhum selecionado) */
  selectedIndex: number | null;
  /** Lista completa de itens */
  items:        ExecutionResultItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;

/** Gera um ID estavel e unico para um ResultSet. */
export function makeResultSetId(): string {
  return `urs-${Date.now()}-${(++_seq).toString(36)}`;
}

/** Gera um ID estavel para um ResultItem (posicao dentro do set). */
export function makeResultItemId(setId: string, index: number): string {
  return `${setId}-item-${index}`;
}

// ── Resolucao de ordinais ─────────────────────────────────────────────────────

/**
 * Dado um ExecutionResultSet e uma mensagem de continuidade,
 * retorna o novo selectedIndex resolvido (ou null se nao aplicavel).
 *
 * Suporta:
 *   primeiro / first / 1o
 *   segundo  / second / 2o
 *   terceiro / third  / 3o
 *   quarto   / fourth / 4o
 *   quinto   / fifth  / 5o
 *   ultimo   / last
 *   proximo  / next
 *   anterior / previous / prev
 */
export function resolveOrdinalIndex(
  resultSet: ExecutionResultSet,
  message:   string,
): number | null {
  const lower  = message.toLowerCase();
  const len    = resultSet.items.length;
  const cur    = resultSet.selectedIndex ?? 0;

  if (len === 0) return null;

  // Ordinais fixos
  if (lower.match(/\b(primeiro|first|1[oaº])\b/))   return 0;
  if (lower.match(/\b(segundo|second|2[oaº])\b/))   return Math.min(1, len - 1);
  if (lower.match(/\b(terceiro|third|3[oaº])\b/))   return Math.min(2, len - 1);
  if (lower.match(/\b(quarto|fourth|4[oaº])\b/))    return Math.min(3, len - 1);
  if (lower.match(/\b(quinto|fifth|5[oaº])\b/))     return Math.min(4, len - 1);
  if (lower.match(/\b([uú]ltimo|last)\b/))           return len - 1;

  // Navegacao relativa
  if (lower.match(/\b(pr[oó]ximo|next)\b/))         return Math.min(cur + 1, len - 1);
  if (lower.match(/\b(anterior|prev(ious)?|volte?)\b/)) return Math.max(cur - 1, 0);

  return null;
}

/**
 * IA-026: fallback por nome — quando a mensagem de continuidade menciona um
 * nome/trecho (ex: "abra o documento rg") em vez de uma posição ("primeiro",
 * "último"), busca esse nome dentro do displayName dos itens da lista
 * anterior. Sem isso, mensagens com nome caíam sem seleção nenhuma, deixando
 * espaço para o sistema inventar qual arquivo foi aberto.
 */
export function resolveByName(
  resultSet: ExecutionResultSet,
  message:   string,
): number | null {
  const len = resultSet.items.length;
  if (len === 0) return null;

  // Remove palavras de comando comuns, deixando só o que parece ser o nome buscado.
  const stripped = message
    .toLowerCase()
    .replace(/\b(abra|abre|abrir|leia|leia o|ler|ler o|o|a|esse|essa|este|esta|arquivo|documento|por favor)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) return null;

  const matchIndex = resultSet.items.findIndex((item) =>
    item.displayName.toLowerCase().includes(stripped)
  );

  return matchIndex >= 0 ? matchIndex : null;
}

/**
 * Retorna o item no selectedIndex atual (ou indice 0 se nao houver selecao).
 * Retorna null se o ResultSet estiver vazio.
 */
export function getSelectedItem(resultSet: ExecutionResultSet): ExecutionResultItem | null {
  if (resultSet.items.length === 0) return null;
  const idx = resultSet.selectedIndex ?? 0;
  return resultSet.items[Math.min(idx, resultSet.items.length - 1)] ?? null;
}
