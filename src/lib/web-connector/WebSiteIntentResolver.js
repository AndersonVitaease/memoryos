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
export async function resolveWebIntents(message) {
  if (!message || !String(message).trim()) return { intents: [], debugReason: 'empty_message' };
  try {
    const sessions = await base44.entities.WebSession.filter({ status: "active" }, "-created_date", 20);
    if (!sessions || sessions.length === 0) return { intents: [], debugReason: 'no_active_sessions' };

    const matchedSessions = sessions.filter((s) => siteMentioned(message, s));
    if (matchedSessions.length === 0) return { intents: [], debugReason: 'no_session_site_mentioned', debugSessionSites: sessions.map((s) => s.site_url) };

    const maps = await base44.entities.CapabilityMap.filter({});
    const intents = [];
    for (const matched of matchedSessions) {
      const siteOrigin = originOf(matched.site_url);
      const map = (maps || []).find((m) => originOf(m.site_url) === siteOrigin);
      if (!map) continue;
      let capabilities = [];
      try { capabilities = JSON.parse(map.capabilities || "[]"); } catch (e) { capabilities = []; }
      const cap = pickSearchCapability(capabilities);
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
        inputFields,
        searchTerm,
      });
    }
    if (intents.length === 0) return { intents: [], debugReason: 'sites_matched_but_no_capability' };
    return { intents, debugReason: null };
  } catch (e) {
    console.warn("[WebSiteIntentResolver] resolveWebIntents falhou:", e?.message);
    return { intents: [], debugReason: 'exception: ' + (e?.message || String(e)) };
  }
}