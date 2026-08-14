/**
 * WebSiteIntentResolver — Topico B (roteamento de capabilities no chat).
 *
 * Deterministico, sem LLM. Casa a mensagem do usuario contra hostname/keywords
 * das WebSessions ativas, seleciona a melhor capability de busca do
 * CapabilityMap daquele site, e extrai o termo de busca da mensagem.
 *
 * Retorno:
 *   { siteUrl, webSessionId, webSessionExpiresAt, discoveredFromUrl,
 *     capability, inputFields, searchTerm } | null
 *
 * Null em qualquer ambiguidade/miss -> o caller (guard do planner) cai pro
 * fluxo normal. Nunca trava a resposta.
 */
import { base44 } from "@/api/base44Client";

export function hostOf(url) {
  try {
    const s = String(url || "").trim();
    const u = new URL(s.includes("://") ? s : "https://" + s);
    return u.host.toLowerCase();
  } catch (e) {
    return "";
  }
}

export function originOf(url) {
  try {
    const s = String(url || "").trim();
    const u = new URL(s.includes("://") ? s : "https://" + s);
    return u.origin;
  } catch (e) {
    return String(url || "");
  }
}

// Fase 7.9 — normaliza uma URL candidata extraída da mensagem. Rejeita
// protocolos nao-http(s) (javascript:/data:/file:) e hostnames invalidos.
function _safeArbUrl(u) {
  const s = String(u || "").trim().replace(/[.,;:)]+$/, "");
  if (!s) return null;
  try {
    const url = new URL(s.includes("://") ? s : "https://" + s);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".") || /\s/.test(url.hostname)) return null;
    return url.toString();
  } catch (e) { return null; }
}

// Fase 7.9 — extrai uma URL arbitrária da mensagem quando o usuario pede para
// "mostrar/acessar/ver" um site explicito. Exige um verbo de intenção (mostre/
// ver/veja/abra/...) para nao disparar em menções casuais a dominios. Retorna a
// URL normalizada ou null. Usado pelo catch-all dinamico do resolveWebIntents.
function extractArbitraryUrl(message) {
  const s = String(message || "").trim();
  if (!s) return null;
  const VERB = /\b(?:mostre|mostrar|mostra|ver|veja|abra|abrir|acess[ea]r|visite|abre)\b/i;
  if (!VERB.test(s)) return null;
  const m1 = s.match(/\bhttps?:\/\/[^\s<>"']+/i);
  if (m1) return _safeArbUrl(m1[0]);
  const m2 = s.match(/\b(?:mostre|mostrar|mostra|ver|veja|abra|abrir|acess[ea]r|visite|abre)\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:[/?]\S*)?)/i);
  if (m2) return _safeArbUrl(m2[1]);
  return null;
}

// Normaliza para matching: lowercase + sem acento + so alfanumerico.
// "Mercado Livre" -> "mercadolivre" (bate com o token do host).
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const HOST_NOISE = new Set([
  "www", "com", "br", "net", "org", "gov", "io", "co", "app", "dev", "info", "biz", "online", "site",
]);

function hostJoinedToken(url) {
  const host = hostOf(url);
  if (!host) return "";
  const parts = host.split(".").filter((p) => p && !HOST_NOISE.has(p.toLowerCase()));
  return parts.join("");
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Detecta se a mensagem menciona o site da WebSession.
function siteMentioned(message, session) {
  const msgNorm = normalize(message);
  if (!msgNorm) return false;
  const joined = hostJoinedToken(session.site_url);
  if (joined && joined.length >= 4 && msgNorm.includes(joined)) return true;
  if (session.site_name) {
    const nameNorm = normalize(session.site_name);
    if (nameNorm.length >= 4 && msgNorm.includes(nameNorm)) return true;
  }
  return false;
}

// Seleciona a melhor capability de leitura (search > filter > list).
function pickSearchCapability(capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) return null;
  const byId = (re) => capabilities.find((c) => re.test(String(c.id || "")));
  return byId(/search/i) || byId(/filter/i) || byId(/list/i) || null;
}

// Extrai o termo de busca da mensagem, removendo mencao ao site + verbos/conectores.
function extractSearchTerm(message, session) {
  let t = String(message || "");
  const toStrip = [session.site_name, hostOf(session.site_url)].filter(Boolean);
  toStrip.forEach((s) => { t = t.replace(new RegExp(escapeRe(s), "gi"), " "); });
  const joined = hostJoinedToken(session.site_url);
  if (joined) t = t.replace(new RegExp(escapeRe(joined), "gi"), " ");
  t = t.replace(/\b(buscar|pesquisar|procurar|achar|encontrar|ver|veja|mostrar?|mostra[r]?|lista[r]?|pesquisa|busca|achados?|resultados?)\b/gi, " ");
  t = t.replace(/\b(no|na|nos|nas|do|da|de|dos|das|em|os|as|o|a|meus?|minhas?|para|pra|que|com|por|favor|porfavor)\b/gi, " ");
  t = t.replace(/["'?!.,;:]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export async function resolveWebIntent(message) {
  if (!message || !String(message).trim()) return { intent: null, debugReason: 'empty_message' };
  try {
    const sessions = await base44.entities.WebSession.filter({ status: "active" }, "-created_date", 20);
    if (!sessions || sessions.length === 0) return { intent: null, debugReason: 'no_active_sessions' };

    let matched = null;
    for (const s of sessions) {
      if (siteMentioned(message, s)) { matched = s; break; }
    }
    if (!matched) return { intent: null, debugReason: 'no_session_site_mentioned', debugSessionSites: sessions.map((s) => s.site_url) };

    const maps = await base44.entities.CapabilityMap.filter({});
    const siteOrigin = originOf(matched.site_url);
    const map = (maps || []).find((m) => originOf(m.site_url) === siteOrigin);
    if (!map) return { intent: null, debugReason: 'no_capability_map_for_origin', debugSiteOrigin: siteOrigin, debugKnownOrigins: (maps || []).map((m) => originOf(m.site_url)) };

    let capabilities = [];
    try { capabilities = JSON.parse(map.capabilities || "[]"); } catch (e) { capabilities = []; }
    const cap = pickSearchCapability(capabilities);
    if (!cap) return { intent: null, debugReason: 'no_search_capability_in_map', debugCapabilityIds: capabilities.map((c) => c.id) };

    const inputFields = (cap.inputSchema && cap.inputSchema.properties) ? Object.keys(cap.inputSchema.properties) : [];
    const searchTerm = extractSearchTerm(message, matched);

    return {
      intent: {
        siteUrl: matched.site_url,
        webSessionId: matched.id,
        webSessionExpiresAt: matched.expires_at,
        webSessionSource: matched.source || 'headless',
        discoveredFromUrl: cap.discoveredFrom || matched.site_url,
        capability: cap,
        flow: cap.flow || null,
        inputFields,
        searchTerm,
      },
      debugReason: null,
    };
  } catch (e) {
    console.warn("[WebSiteIntentResolver] Falhou:", e?.message);
    return { intent: null, debugReason: 'exception: ' + (e?.message || String(e)) };
  }
}

// resolveWebIntents (plural) — MESMA logica, mas encontra TODOS os sites
// mencionados na mensagem (nao para no primeiro match). Necessario pra
// perguntas do tipo "compare X no site A e no site B" ou "veja meus pedidos
// no Bling e minhas vendas no Mercado Livre" (2026-08-11, camada de
// inteligencia multi-site).
// FASE 7.7 — Capability Maxun e server-side (maxunRun -> Maxun Cloud) e NAO
// depende de WebSession, extensao ou Playwright. Se a capability do site
// mencionado tiver provider:"maxun" + robotId, produzimos uma intent Maxun
// MESMO SEM WebSession ativa (webSessionId=null, webSessionSource=null).
// Para capabilities NAO-Maxun, preservamos 100% do comportamento atual
// baseado em WebSession ativa.
function isMaxunCapability(cap) {
  return Boolean(cap && cap.provider === 'maxun' && typeof cap.robotId === 'string' && cap.robotId.trim().length > 0);
}

// FASE 7.7 — Acha a melhor capability de leitura de um CapabilityMap,
// preferindo Maxun quando existir (Maxun e server-side e roda sem sessao).
// Para maps sem Maxun, mantem a selecao original (search > filter > list).
function pickSearchCapabilityWithMaxun(capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) return null;
  const maxun = capabilities.find(isMaxunCapability);
  if (maxun) return maxun;
  return pickSearchCapability(capabilities);
}

// FASE 7.7 — Descobre intents Maxun para sites mencionados na mensagem que
// NAO possuem WebSession ativa. Maxun roda server-side (maxunRun) e nao
// precisa de browser session. Retorna intents com webSessionId=null,
// webSessionSource=null. NAO substitui o sistema de descoberta baseado em
// WebSession — apenas adiciona o caminho Maxun para sites sem sessao.
async function discoverMaxunIntentsWithoutSession(message, maps, knownOrigins) {
  if (!Array.isArray(maps) || maps.length === 0) return [];
  const msgNorm = normalize(message);
  if (!msgNorm) return [];
  const intents = [];
  for (const map of maps) {
    const siteOrigin = originOf(map.site_url);
    if (!siteOrigin) continue;
    // Pula origens que ja tem WebSession ativa — essas sao tratadas pelo
    // caminho normal (com sessao). Maxun sem sessao so entra quando nao ha
    // sessao ativa para o site.
    if (Array.isArray(knownOrigins) && knownOrigins.includes(siteOrigin)) continue;
    // Verifica se o site e mencionado na mensagem (mesma logica de siteMentioned,
    // mas sem depender de um objeto WebSession — usa o site_url do CapabilityMap).
    const joined = hostJoinedToken(map.site_url);
    const matchedSite = (joined && joined.length >= 4 && msgNorm.includes(joined)) ||
      (map.site_name && normalize(map.site_name).length >= 4 && msgNorm.includes(normalize(map.site_name)));
    if (!matchedSite) continue;
    let capabilities = [];
    try { capabilities = JSON.parse(map.capabilities || "[]"); } catch (e) { capabilities = []; }
    const cap = pickSearchCapabilityWithMaxun(capabilities);
    if (!cap || !isMaxunCapability(cap)) continue;
    const inputFields = (cap.inputSchema && cap.inputSchema.properties) ? Object.keys(cap.inputSchema.properties) : [];
    // Termo de busca: como nao ha WebSession, usa o site_url do CapabilityMap.
    const searchTerm = extractSearchTerm(message, { site_url: map.site_url, site_name: map.site_name });
    intents.push({
      siteUrl: map.site_url,
      webSessionId: null,
      webSessionExpiresAt: null,
      webSessionSource: null,
      discoveredFromUrl: cap.discoveredFrom || map.site_url,
      capability: cap,
      flow: cap.flow || null,
      inputFields,
      searchTerm,
    });
  }
  return intents;
}

export async function resolveWebIntents(message) {
  if (!message || !String(message).trim()) return { intents: [], debugReason: 'empty_message' };
  try {
    const maps = await base44.entities.CapabilityMap.filter({});
    // Caminho existente (preservado): WebSession ativa -> intent com sessao.
    const sessions = await base44.entities.WebSession.filter({ status: "active" }, "-created_date", 20);
    const matchedSessions = (sessions || []).filter((s) => siteMentioned(message, s));
    const knownOrigins = matchedSessions.map((s) => originOf(s.site_url));
    const intents = [];
    for (const matched of matchedSessions) {
      const siteOrigin = originOf(matched.site_url);
      const map = (maps || []).find((m) => originOf(m.site_url) === siteOrigin);
      if (!map) continue;
      let capabilities = [];
      try { capabilities = JSON.parse(map.capabilities || "[]"); } catch (e) { capabilities = []; }
      // FASE 7.7: se a melhor capability do site for Maxun, produz intent Maxun
      // vinculada a sessao (webSessionId setado). O Planner roteara Maxun para
      // webConnectorConnect independentemente do webSessionSource, entao mesmo
      // uma sessao "extension" com capability Maxun nao vai para a fila da extensao.
      const cap = pickSearchCapabilityWithMaxun(capabilities);
      if (!cap) continue;
      const inputFields = (cap.inputSchema && cap.inputSchema.properties) ? Object.keys(cap.inputSchema.properties) : [];
      const searchTerm = extractSearchTerm(message, matched);
      intents.push({
        siteUrl: matched.site_url,
        webSessionId: matched.id,
        webSessionExpiresAt: matched.expires_at,
        webSessionSource: matched.source || 'headless',
        discoveredFromUrl: cap.discoveredFrom || matched.site_url,
        capability: cap,
        flow: cap.flow || null,
        inputFields,
        searchTerm,
      });
    }

    // FASE 7.7 — Caminho NOVO: sites mencionados SEM WebSession ativa cuja
    // capability e Maxun (server-side, nao precisa de sessao). Aditivo —
    // nao afeta capabilities nao-Maxun (preservam comportamento atual).
    const maxunIntents = await discoverMaxunIntentsWithoutSession(message, maps || [], knownOrigins);
    for (const mi of maxunIntents) {
      // Evita duplicar se porventura o mesmo site ja foi coberto por sessao.
      if (!intents.some((i) => originOf(i.siteUrl) === originOf(mi.siteUrl))) {
        intents.push(mi);
      }
    }

    // Fase 7.9 — catch-all dinamico: se nenhuma intent foi produzida (nenhum
    // site em CapabilityMap/WebSession mencionado) mas a mensagem pede para
    // "mostrar/acessar" uma URL explicita, produz uma intent Maxun generica
    // (provider=maxun, sem robotId). O Planner roteia para webConnectorConnect
    // -> maxunRun (modo duplicate com targetUrl). Reusa discoveredFromUrl como
    // transportador da URL do usuario (mesmo campo que o Playwright usa para
    // navegar). Nao cria nova camada — apenas mais um tipo de intent no
    // resolver existente.
    if (intents.length === 0) {
      const _url = extractArbitraryUrl(message);
      if (_url) {
        // Fase 7.19 — nao cria catch-all maxun.dynamic anonimo quando a origem
        // da URL ja possui CapabilityMap com ao menos uma capability
        // Playwright-backed (provider !== 'maxun'). Essas capabilities exigem
        // WebSession ativa + cookies (branch Playwright do webConnectorConnect,
        // linhas 787/797/801); rodar Maxun anonimo nesse dominio ignora a
        // necessidade de sessao e pega CAPTCHA/login wall (caso ML, Fase 7.17).
        // Discriminador semantico = provider (campo existente, usado pelo
        // executor para despachar): 'maxun' = anonimo/sem sessao; ausente =
        // Playwright/exige WebSession. Nao bloqueia dominios cujo map so tem
        // caps provider==='maxun' (anonimas) nem dominios sem map. Nao cria
        // WebSession nem login — apenas impede o fallback incorreto.
        const _urlOrigin = originOf(_url);
        const _knownMap = (maps || []).find((m) => originOf(m.site_url) === _urlOrigin);
        if (_knownMap) {
          let _kcaps = [];
          try { _kcaps = JSON.parse(_knownMap.capabilities || '[]'); } catch (e) { _kcaps = []; }
          const _hasPlaywrightBackedCap = _kcaps.some((c) => !(c && c.provider === 'maxun'));
          if (_hasPlaywrightBackedCap) {
            return { intents: [], debugReason: 'known_session_required_no_active_session', debugSiteOrigin: _urlOrigin };
          }
        }
        intents.push({
          siteUrl: _url,
          webSessionId: null,
          webSessionExpiresAt: null,
          webSessionSource: null,
          discoveredFromUrl: _url,
          capability: { provider: 'maxun', id: 'maxun.dynamic', robotId: null, inputSchema: { type: 'object', properties: {} }, flow: null },
          flow: null,
          inputFields: [],
          searchTerm: '',
        });
      }
    }

    if (intents.length === 0) {
      // Preserva os debugReasons originais para diagnostico quando nao ha
      // sessao ativa. Se havia sessions mas nenhuma mencionada, mantem o
      // reason original; se nao havia sessions nenhuma e tambem nao havia
      // Maxun, fica 'no_active_sessions' (compativel com o guard do MRP
      // que silencia esse reason).
      if (!sessions || sessions.length === 0) return { intents: [], debugReason: 'no_active_sessions' };
      return { intents: [], debugReason: 'no_session_site_mentioned', debugSessionSites: sessions.map((s) => s.site_url) };
    }
    return { intents, debugReason: null };
  } catch (e) {
    console.warn("[WebSiteIntentResolver] resolveWebIntents falhou:", e?.message);
    return { intents: [], debugReason: 'exception: ' + (e?.message || String(e)) };
  }
}