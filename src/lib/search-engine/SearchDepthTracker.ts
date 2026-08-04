/**
 * SearchDepthTracker.ts — Pesquisa Progressiva (EPIC-PWS)
 *
 * Rastreia, por sessao, quantas vezes o usuario persistiu/insistiu no
 * mesmo topico de busca. Resolve a profundidade (1=robusta, 2=muito,
 * 3=super) que o SerperSearchProvider e o backend usam para escalar o
 * volume de fontes e acionar a sintese por IA.
 *
 * Gatilho de escalada (escolha do usuario: "Ambos"):
 *   - MESMO TOPICO novamente (similaridade Jaccard >= 0.35), OU
 *   - PALAVRA explicita de aprofundamento ("mais", "a fundo", "detalhes", ...)
 *
 * Topico novo → reseta pra 1. Primeira busca da sessao → sempre 1.
 * Decay de 10 min sem atividade → reset.
 *
 * Stateless em memoria (Map por sessionId). Nao persiste nada — e
 * comportamento de conversa, nao conhecimento.
 */

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 min
const JACCARD_THRESHOLD = 0.35;

const ESCALATION_KEYWORDS = [
  "mais", "a fundo", "afundo", "profundamente", "profundo", "detalhes", "detalhe",
  "continue", "continuar", "insista", "insistir", "de novo", "novamente",
  "complemente", "complementar", "melhore", "reforce", "aprofunde", "amplie",
  "ampliar", "expandir", "expanda", "outros resultados", "mais resultados",
  "mais sobre", "melhores resultados", "super pesquisa", "pesquisa profunda",
];

const STOP = new Set([
  "pesquise", "pesquisar", "pesquisa", "busque", "buscar", "busca", "procure",
  "procurar", "sobre", "the", "uma", "para", "com", "que", "isso", "de", "do",
  "da", "dos", "das", "no", "na", "nos", "nas", "em", "e", "a", "o", "os", "as",
  "um", "uns", "umas", "mais", "muito", "muita", "me", "meu", "minha", "por",
  "favor", "agora", "ja", "se", "entao", "entao", "qual", "quais", "como",
  "quando", "onde", "porque", "por que", "foi", "ser", "tem", "ter",
]);

interface SessionState {
  lastTokens: Set<string>;
  depth: number;
  lastAt: number;
}

const _store = new Map<string, SessionState>();

function tokenize(q: string): Set<string> {
  const normalized = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ");
  return new Set(
    normalized
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function hasEscalationWord(msg: string): boolean {
  const lower = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ESCALATION_KEYWORDS.some((k) => {
    const kn = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const re = new RegExp(`(^|[^a-z0-9])${kn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    return re.test(lower);
  });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Resolve a profundidade de busca para esta query nesta sessao,
 * atualizando o estado interno. Retorna 1, 2 ou 3.
 */
export function resolveSearchDepth(sessionId: string, query: string): number {
  const now = Date.now();
  const tokens = tokenize(query);
  const prev = _store.get(sessionId);

  // Primeira busca da sessao (ou apos decay) → sempre 1.
  if (!prev || now - prev.lastAt > SESSION_TTL_MS) {
    _store.set(sessionId, { lastTokens: tokens, depth: 1, lastAt: now });
    return 1;
  }

  const similar = jaccard(prev.lastTokens, tokens) >= JACCARD_THRESHOLD;
  const escalated = hasEscalationWord(query);

  const nextDepth = similar || escalated
    ? Math.min(3, prev.depth + 1)
    : 1; // topico mudou, sem sinal de aprofundamento → reset

  _store.set(sessionId, { lastTokens: tokens, depth: nextDepth, lastAt: now });
  return nextDepth;
}

/** Acesso de diagnostico (testes / UI). */
export function getDepth(sessionId: string): number {
  return _store.get(sessionId)?.depth ?? 1;
}

/** Reset manual (testes). */
export function resetDepth(sessionId: string): void {
  _store.delete(sessionId);
}