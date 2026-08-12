/**
 * capabilityIdentity -- Normalizacao deterministica e deduplicacao conservadora
 * de CapabilityCandidates. SEM LLM. SEM similaridade textual fuzzy.
 *
 * Estrategia CONSERVADORA (fail-open: na duvida, NAO consolida):
 *   1. canonical_id: normaliza suggested_id (lowercase, snake_case, sinonimos PT/EN)
 *   2. identity_hash: hash de (site_origin + canonical_id + inputs_canonizados_ordenados)
 *   3. Dedup: consolida SOMENTE quando identity_hash bate EXATAMENTE
 *      (mesmo site + mesma operacao canonica + mesmos inputs)
 *
 * Preserva: suggested_id original, description original, todas as evidencias.
 * Isolamento: site/origin incluido no hash -> sites diferentes NAO consolidam.
 */

export function originOf(url) {
  try {
    const s = String(url || '').trim();
    const u = new URL(s.includes('://') ? s : 'https://' + s);
    return u.origin;
  } catch {
    return String(url || '');
  }
}

export function normalizeToken(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Map de sinonimos de verbos (PT/EN -> canonico EN) + targets (PT->EN + singular/plural).
// Finito e deterministico. Tokens fora do mapa passam pelo singularize.
const TOKEN_MAP = {
  // Verbs
  pesquisar: 'search', buscar: 'search', procurar: 'search', encontrar: 'search',
  search: 'search', find: 'search', lookup: 'search', query: 'search',
  listar: 'list', list: 'list',
  consultar: 'search', consult: 'search',
  ver: 'view', view: 'view', visualizar: 'view',
  filtrar: 'filter', filter: 'filter',
  obter: 'get', get: 'get',
  // Targets (PT->EN + plural->singular)
  produto: 'product', produtos: 'product', product: 'product', products: 'product',
  pedido: 'order', pedidos: 'order', order: 'order', orders: 'order',
  reserva: 'reservation', reservas: 'reservation', reservation: 'reservation', reservations: 'reservation',
  passageiro: 'passenger', passageiros: 'passenger', passenger: 'passenger', passengers: 'passenger',
  cliente: 'customer', clientes: 'customer', customer: 'customer', customers: 'customer',
  venda: 'sale', vendas: 'sale', sale: 'sale', sales: 'sale',
  anuncio: 'listing', anuncios: 'listing', listing: 'listing', listings: 'listing',
  fatura: 'invoice', faturas: 'invoice', invoice: 'invoice', invoices: 'invoice',
  documento: 'document', documentos: 'document', document: 'document', documents: 'document',
  usuario: 'user', usuarios: 'user', user: 'user', users: 'user',
  conta: 'account', contas: 'account', account: 'account', accounts: 'account',
  mensagem: 'message', mensagens: 'message', message: 'message', messages: 'message',
  // Sprint 2 (2026-08-12): purchases/purchase -> purchase (evita 'purchas' do singularize)
  purchases: 'purchase', purchase: 'purchase',
};

function singularize(word) {
  if (word.length < 4) return word;
  if (word.endsWith('oes')) return word.slice(0, -3) + 'ao';
  if (word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// ── Sprint 2 (2026-08-12): canonical VERB-FIRST + remocao de ruído UI/conectores ──
// Lista FIXA e conservadora de verbos conhecidos. Apenas um destes pode ser
// movido para a frente do canonical (verb-first). Baseada nos verbos observados
// no sistema. Tokens fora desta lista NAO sao reordenados (fail-open/conservador).
const KNOWN_VERBS = {
  search: true, filter: true, download: true, add: true, remove: true,
  edit: true, toggle: true, send: true, list: true, view: true,
};

// Tokens puramente de UI que nao carregam semantica da capability. Removidos do
// canonical (deterministico). Nao afetam computeIdentityHash alem do canonical.
const UI_NOISE_TOKENS = {
  input: true, button: true, submit: true, action: true,
};

// Conectores puramente sintaticos. Removidos do canonical.
const CONNECTOR_TOKENS = {
  by: true, and: true, or: true, with: true,
};

/**
 * Normaliza um suggested_id para canonical_id (forma VERB-FIRST).
 *
 * Passos deterministicos:
 *   1. split + normalizeToken (lowercase, sem acento, so [a-z0-9])
 *   2. map via TOKEN_MAP (sinonimos PT/EN, plural->singular) || singularize
 *   3. drop tokens de UI (input/button/submit/action) e conectores (by/and/or/with)
 *   4. verb-first: move o PRIMEIRO verbo conhecido para a frente (se houver e nao estiver)
 *   5. join com '.'
 *
 * Exemplos:
 *   "product.search"     -> "search.product"    (verb-first)
 *   "produto.search"     -> "search.product"    (PT->EN target + verb-first)
 *   "products.search"    -> "search.product"    (singular + verb-first)
 *   "product.pesquisar"  -> "search.product"    (verb sinonimo + verb-first)
 *   "reservas.search"    -> "search.reservation" (PT->EN + singular + verb-first)
 *   "order.lookup"       -> "search.order"      (verb sinonimo + verb-first)
 *   "search.input"       -> "search"            (UI noise removido)
 *   "logout.action"      -> "logout"            (UI noise removido)
 *   "filter.by.date"     -> "filter.date"       (conector removido)
 *   "purchases.search"   -> "search.purchase"   (purchases->purchase + verb-first)
 */
export function canonicalizeId(suggestedId) {
  const raw = String(suggestedId || '').trim().toLowerCase();
  if (!raw) return '';
  const parts = raw.split(/[._\s-]/).filter(Boolean).map(normalizeToken);
  if (parts.length === 0) return '';
  const mapped = parts.map(function (p) { return TOKEN_MAP[p] || singularize(p); });
  // 3. drop UI noise + conectores (deterministico, conservador)
  const kept = mapped.filter(function (t) { return !UI_NOISE_TOKENS[t] && !CONNECTOR_TOKENS[t]; });
  if (kept.length === 0) return '';
  // 4. verb-first: move o primeiro verbo conhecido para a frente
  let verbIdx = -1;
  for (let i = 0; i < kept.length; i++) { if (KNOWN_VERBS[kept[i]]) { verbIdx = i; break; } }
  if (verbIdx > 0) {
    const verb = kept[verbIdx];
    const rest = kept.filter(function (_, i) { return i !== verbIdx; });
    return [verb].concat(rest).join('.');
  }
  return kept.join('.');
}

// FNV-1a 32-bit hash (deterministico, sem dependencias).
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * Computa o identity_hash: fingerprint de (site_origin + canonical_id + inputs).
 * inputs sao normalizados (lowercase, sem acento), ordenados e joined por virgula.
 * Mesmo site + mesma operacao + mesmos inputs -> mesmo hash.
 * Site diferente OU operacao diferente OU inputs diferentes -> hash diferente.
 */
export function computeIdentityHash(siteOrigin, canonicalId, inputFields) {
  const inputs = (Array.isArray(inputFields) ? inputFields : [])
    .map(function (f) { return normalizeToken(String(f || '')); })
    .filter(Boolean)
    .sort()
    .join(',');
  return hashStr(String(siteOrigin || '') + '|' + String(canonicalId || '') + '|' + inputs);
}