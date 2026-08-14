/**
 * webDiscovery -- Logica de descoberta de capabilities compartilhada entre
 * webConnectorDiscover (headless/Playwright) e webConnectorExtension
 * (extensao Chrome). Extrai o prompt do LLM, o schema JSON e o salvamento
 * de CapabilityCandidate com Evidence estruturada + Deduplication conservadora.
 *
 * Passo 2 (2026-08-11): adicionada Evidence estruturada (resolve element_ref
 * do snapshot deterministicamente -- o LLM retorna apenas o ref, o sistema
 * recupera os dados reais do elemento do snapshot) + Identity/Normalization
 * (canonical_id + identity_hash) + Deduplication conservadora (consolida
 * apenas quando identity_hash bate exatamente, preservando todas as evidencias).
 *
 * Strings do prompt sem acento (mesma convencao do webConnectorDiscover).
 */
import { withTimeout, extractRunCodeText } from './mcpHelpers.ts';
import { canonicalizeId, computeIdentityHash, originOf } from './capabilityIdentity.ts';

export const MAX_CANDIDATES_PER_PAGE = 5;

export function buildDiscoveryPrompt(snapshotText, siteUrl, visitedUrls) {
  return [
    'Voce e um motor de descoberta de capabilities para um sistema web autenticado em ' + siteUrl + '.',
    'Seu objetivo: catalogar TODAS as capabilities observaveis na pagina — READ (consultas, listagens, filtros, visualizacoes) e WRITE (criar, editar, cancelar, enviar, excluir, publicar, alterar, acoes em geral).',
    '',
    'REGRAS INEGOCIAVEIS:',
    '1. Catalogue toda capability que tenha um elemento real do snapshot que a fundamente (formulario, botao, link de acao).',
    '2. Classifique cada capability com capability_type ("READ" ou "WRITE") e risk_level ("safe", "reversible" ou "irreversible").',
    '   - READ: consultas, buscas, filtros, listagens, visualizacoes. risk_level=safe.',
    '   - WRITE: criar, editar, cancelar, enviar, excluir, publicar, alterar. risk_level=irreversible (default) ou reversible (se houver desfazer trivial explicito).',
    '3. NUNCA invente element_ref — use apenas refs que aparecem no snapshot abaixo. Se nao houver ref claro, use string vazia.',
    '4. Botoes puramente decorativos ou de navegacao generica (Home, Voltar, Ajuda, Fechar) NAO sao capabilities — ignore.',
    '5. O motor de descoberta NUNCA executa acoes — voce so observa e classifica, nunca clica/submete/preenche.',
    '',
    'Analise o snapshot de acessibilidade abaixo e retorne JSON com:',
    '- candidates: lista de capabilities encontradas nesta pagina (ate ' + MAX_CANDIDATES_PER_PAGE + ').',
    '  Cada candidate: { suggested_id, description, input_fields, element_ref, capability_type, risk_level }',
    '  element_ref: o ref EXATO do elemento do snapshot que fundamentou esta descoberta (ex: e3, r1).',
    '  capability_type: "READ" ou "WRITE".',
    '  risk_level: "safe", "reversible" ou "irreversible".',
    '- navigation_links: links de navegacao para OUTRAS areas funcionais do sistema (nao links externos/logout).',
    '  Cada link: { label, ref } -- use o ref exato do snapshot.',
    '- has_write_actions: boolean indicando se a pagina tem acoes de escrita (metadado de pagina, NAO para executar).',
    '',
    'Se a pagina atual nao tem capability observavel, retorne candidates=[] e so os navigation_links.',
    '',
    'URLs ja visitadas (NAO sugira navegar para elas): ' + (visitedUrls.length ? visitedUrls.join(', ') : '(nenhuma)') + '.',
    '',
    'SNAPSHOT:',
    snapshotText.slice(0, 12000),
  ].join('\n');
}

export const DISCOVERY_LLM_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          suggested_id: { type: 'string' },
          description: { type: 'string' },
          input_fields: { type: 'array', items: { type: 'string' } },
          element_ref: { type: 'string' },
          capability_type: { type: 'string', enum: ['READ', 'WRITE'] },
          risk_level: { type: 'string', enum: ['safe', 'reversible', 'irreversible'] },
        },
      },
    },
    navigation_links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          ref: { type: 'string' },
        },
      },
    },
    has_write_actions: { type: 'boolean' },
  },
};

export function parseDiscoveryLLMResult(llmResult) {
  const candidates = (llmResult && Array.isArray(llmResult.candidates)) ? llmResult.candidates : [];
  const navigationLinks = (llmResult && Array.isArray(llmResult.navigation_links)) ? llmResult.navigation_links : [];
  const hasWriteActions = !!(llmResult && llmResult.has_write_actions);
  return { candidates, navigationLinks, hasWriteActions };
}

/**
 * classifyAuthenticationRequirement -- Classificacao deterministica (sem LLM)
 * do resultado de um probe de autenticacao. Conservadora:
 *   session_required: finalUrl em rota de login/auth (segmento final) OU
 *                     snapshot com campo de senha + marcador de login.
 *   public:           probe carregou sem sinais de auth-wall.
 *   unknown:          erro, timeout, finalUrl vazia/about:blank.
 *
 * NAO transforma a mera presenca da palavra "login" em session_required --
 * exige campo de senha junto a marcador, OU finalUrl claramente em rota de
 * auth. NAO casa /login-history, /author, /authenticate.
 */
export function classifyAuthenticationRequirement(r: {
  finalUrl?: string;
  hasPassword?: boolean;
  bodyText?: string;
  error?: string;
}): 'public' | 'session_required' | 'unknown' {
  if (r && r.error) return 'unknown';
  const finalUrl = String((r && r.finalUrl) || '').trim();
  if (!finalUrl || finalUrl === 'about:blank') return 'unknown';
  if (/\/(login|signin|sign-in|account\/login)(?=\/|\?|#|$)/i.test(finalUrl)) return 'session_required';
  if (/\/auth(?=\/|\?|#|$)/i.test(finalUrl)) return 'session_required';
  const hasPassword = !!(r && r.hasPassword);
  const bodyText = String((r && r.bodyText) || '');
  const hasLoginMarker = /login page|log in|sign in|sign-in|enter your password|esqueceu a senha|para acessar a area/i.test(bodyText);
  if (hasPassword && hasLoginMarker) return 'session_required';
  return 'public';
}

/**
 * probeAuthenticationRequirement -- Probe deterministico (sem LLM, sem cookies,
 * sem WebSession) sobre a necessidade de autenticacao de discoveredFromUrl.
 *
 * viaNewContext=true  (in-crawl): cria contexto isolado via browser.newContext()
 *   -- nao disturba o contexto autenticado do crawl. Se browser() indisponivel
 *   (persistent context) -> unknown (conservador).
 * viaNewContext=false (standalone): assume que o caller ja fez browser_close
 *   (contexto limpo, sem cookies); navega e classifica. Mais confiavel entre
 *   configuracoes de MCP.
 *
 * NAO bypassa CAPTCHA/Cloudflare/anti-bot -- bloqueio -> unknown (nao public).
 */
export async function probeAuthenticationRequirement(opts: {
  callMcp: (op: string, args?: Record<string, unknown>) => Promise<unknown>;
  url: string;
  viaNewContext?: boolean;
}): Promise<'public' | 'session_required' | 'unknown'> {
  const url = String(opts.url || '').trim();
  if (!url) return 'unknown';
  const escapedUrl = JSON.stringify(url);
  let probeRaw: { finalUrl?: string; hasPassword?: boolean; bodyText?: string; error?: string } | null = null;
  try {
    let code: string;
    if (opts.viaNewContext) {
      code = 'async (page) => {' +
        '  try {' +
        '    const browser = page.context().browser();' +
        '    if (!browser) return JSON.stringify({ error: "no_browser" });' +
        '    const ctx = await browser.newContext();' +
        '    const p = await ctx.newPage();' +
        '    try {' +
        '      await p.goto(' + escapedUrl + ', { waitUntil: "load", timeout: 15000 }).catch(() => {});' +
        '      await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
        '      const finalUrl = p.url();' +
        '      const hasPass = await p.$("input[type=password]");' +
        '      const bodyText = await p.evaluate(() => document.body ? (document.body.innerText || "").slice(0, 4000) : "").catch(() => "");' +
        '      return JSON.stringify({ finalUrl: finalUrl, hasPassword: !!hasPass, bodyText: String(bodyText).slice(0, 2000) });' +
        '    } finally { await ctx.close().catch(() => {}); }' +
        '  } catch (e) { return JSON.stringify({ error: String((e && e.message) || e).slice(0, 200) }); }' +
        '}';
    } else {
      code = 'async (page) => {' +
        '  try {' +
        '    await page.goto(' + escapedUrl + ', { waitUntil: "load", timeout: 15000 }).catch(() => {});' +
        '    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
        '    const finalUrl = page.url();' +
        '    const hasPass = await page.$("input[type=password]");' +
        '    const bodyText = await page.evaluate(() => document.body ? (document.body.innerText || "").slice(0, 4000) : "").catch(() => "");' +
        '    return JSON.stringify({ finalUrl: finalUrl, hasPassword: !!hasPass, bodyText: String(bodyText).slice(0, 2000) });' +
        '  } catch (e) { return JSON.stringify({ error: String((e && e.message) || e).slice(0, 200) }); }' +
        '}';
    }
    const res = await opts.callMcp('browser_run_code_unsafe', { code });
    const text = extractRunCodeText(res);
    const m = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, text];
    probeRaw = JSON.parse((m[1] || text).trim());
    if (typeof probeRaw === 'string') probeRaw = JSON.parse(probeRaw);
  } catch (e) {
    probeRaw = { error: String((e && (e as any).message) || e).slice(0, 200) };
  }
  return classifyAuthenticationRequirement(probeRaw || { error: 'no_probe_result' });
}

/**
 * deriveAuthenticationRequirement -- Reduz o array de evidencias (JSON) de um
 * CapabilityCandidate a um unico authentication_requirement. Conservador:
 *   - qualquer session_required -> session_required
 *   - senao, qualquer unknown -> unknown (nao assume publico)
 *   - senao, se alguma com campo for public -> public
 *   - sem campo em nenhuma evidence -> unknown (legado pre-B4)
 */
export function deriveAuthenticationRequirement(evidences: unknown[]): 'public' | 'session_required' | 'unknown' {
  if (!Array.isArray(evidences) || evidences.length === 0) return 'unknown';
  let hasSession = false, hasUnknown = false, hasPublic = false, anyField = false;
  for (const e of evidences) {
    if (!e || typeof e !== 'object') continue;
    const ar = (e as Record<string, unknown>).authentication_requirement;
    if (ar === 'session_required') { hasSession = true; anyField = true; }
    else if (ar === 'unknown') { hasUnknown = true; anyField = true; }
    else if (ar === 'public') { hasPublic = true; anyField = true; }
  }
  if (!anyField) return 'unknown';
  if (hasSession) return 'session_required';
  if (hasUnknown) return 'unknown';
  if (hasPublic) return 'public';
  return 'unknown';
}

/**
 * Resolve um elemento do snapshot pelo seu ref, extraindo dados reais
 * deterministicamente (sem inventar). Suporta os dois formatos de snapshot:
 *   - Playwright accessibility: "- searchbox "Name" [ref=e3]"
 *   - Extensao Chrome: "input type=search name=q id=search placeholder="X" [ref=r1]"
 * Retorna null se o ref nao for encontrado no snapshot.
 */
export function resolveElementFromSnapshot(snapshotText, ref) {
  if (!snapshotText || !ref) return null;
  const lines = String(snapshotText).split('\n');
  const refTag = '[ref=' + ref + ']';
  const line = lines.find(function (l) { return l.includes(refTag); });
  if (!line) return null;

  const element = { ref: ref };
  const trimmed = line.trim();

  // Playwright format: "- role "accessible name" [ref=eXX] [attr=val ...]"
  const pwMatch = trimmed.match(/^-\s+(\S+)\s+"([^"]*)"/);
  if (pwMatch) {
    element.role = pwMatch[1];
    element.accessible_name = pwMatch[2];
  } else {
    // Extension format: "tag type=X name=X id=X placeholder="X" [ref=rN]"
    const tagMatch = trimmed.match(/^(\w+)/);
    if (tagMatch) element.tag = tagMatch[1];
  }

  // Extract key=value and key="value" patterns (both formats)
  const kvPatterns = [
    ['type', /type=(\S+)/],
    ['name', /name=(\S+)/],
    ['id', /id=(\S+)/],
    ['placeholder', /placeholder="([^"]*)"/],
    ['aria_label', /aria-label="([^"]*)"/],
    ['label', /label="([^"]*)"/],
    ['text', /text="([^"]*)"/],
    ['href', /href=(\S+)/],
    ['level', /level=(\d+)/],
  ];
  for (let i = 0; i < kvPatterns.length; i++) {
    const key = kvPatterns[i][0];
    const regex = kvPatterns[i][1];
    const m = line.match(regex);
    if (m) element[key] = m[1];
  }

  return element;
}

/**
 * normalizeInputField — resolve um input_field posicional (ref do snapshot,
 * ex: r79, e3) para um identificador ESTAVEL do elemento que ja existe no
 * snapshot, usando resolveElementFromSnapshot. Identificadores ja estaveis
 * (id/name/aria-label/label/placeholder) sao preservados inalterados.
 *
 * Contrato do snapshot (resolveElementFromSnapshot): ref, tag, type, name,
 * id, placeholder, aria_label, label, text, href, role, accessible_name, level.
 * Identificadores estaveis (nao posicionais) em ordem de preferencia:
 *   id > name > aria_label > label > placeholder
 * (todos atributos reais do DOM, presentes no snapshot; nenhum inventado).
 *
 * Regra:
 *   1. Se for ref posicional (rN / eN): resolve do snapshot.
 *   2. Resolvido com id  -> usa element.id.
 *   3. Resolvido sem id, com name -> usa element.name.
 *   4. Resolvido sem id/name -> usa o proximo identificador estavel disponivel
 *      (aria_label > label > placeholder), conforme o contrato do snapshot.
 *   5. Ref que NAO resolve no snapshot -> fallback prefixado
 *      '__unresolved_ref__:<ref>' que nao colide artificialmente com um
 *      identificador real (id/name reais nao carregam esse prefixo).
 *   6. Qualquer outro valor (id/name/etc ja estavel) -> preservado inalterado.
 *
 * Objetivo: tornar a identidade deterministica para o mesmo elemento fisico
 * (ex: ["itemCode"] e ["r79"] quando r79 resolve para id=itemCode devem
 * produzir o mesmo identity_hash). NAO altera canonicalizeId nem
 * computeIdentityHash; atua SOMENTE antes deles.
 */
export function normalizeInputField(field, snapshotText) {
  const raw = String(field || '').trim();
  if (!raw) return '';
  // 1. ref posicional do snapshot? (formatos: rN extensao, eN playwright)
  if (/^[re]\d+$/.test(raw)) {
    const el = resolveElementFromSnapshot(snapshotText, raw);
    if (el) {
      if (el.id) return el.id;          // 2. id estavel
      if (el.name) return el.name;      // 3. name estavel
      if (el.aria_label) return el.aria_label;  // 4. fallback estavel
      if (el.label) return el.label;
      if (el.placeholder) return el.placeholder;
      // ref resolveu mas o elemento nao tem nenhum identificador estavel
      return '__unresolved_ref__:' + raw;
    }
    // 5. ref nao resolveu no snapshot: fallback prefixado (nao colide com id real)
    return '__unresolved_ref__:' + raw;
  }
  // 6. ja e estavel: preserva inalterado
  return raw;
}

export function normalizeInputFields(inputFields, snapshotText) {
  if (!Array.isArray(inputFields)) return [];
  return inputFields.map(function (f) { return normalizeInputField(f, snapshotText); }).filter(Boolean);
}

function extractVerb(suggestedId) {
  const parts = String(suggestedId || '').split(/[._\s-]/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts[parts.length - 1].toLowerCase();
}

function buildEvidence(cand, snapshotText, currentUrl, pageIdx, hasWriteActions, session, authenticationRequirement) {
  const elementRef = (typeof cand.element_ref === 'string') ? cand.element_ref.trim() : '';
  const element = elementRef ? resolveElementFromSnapshot(snapshotText, elementRef) : null;
  return {
    element_ref: elementRef || null,
    element: element,
    snapshot_ref_found: !!element,
    page_url: currentUrl,
    page_index: pageIdx || 0,
    action_inferred: extractVerb(cand.suggested_id),
    source: session.source || 'headless',
    has_write_actions: hasWriteActions,
    // FASE B4: resultado do probe deterministico sobre a necessidade de
    // autenticacao desta pagina. Distinto de web_session_id (proveniencia).
    authentication_requirement: authenticationRequirement || 'unknown',
  };
}

/**
 * Salva ate MAX_CANDIDATES_PER_PAGE candidatos como registros CapabilityCandidate.
 * Passo 2: Evidence estruturada (ref resolvido do snapshot) + Deduplication
 * conservadora (consolida apenas quando identity_hash bate exatamente).
 * Preserva suggested_id original, description original, e TODAS as evidencias.
 *
 * Dedup query: base44.entities.CapabilityCandidate.filter (RLS: user own records).
 * Consolidate update: base44.asServiceRole (bypass RLS update:admin-only) --
 * seguro porque o filter ja validou que o registro pertence ao caller.
 */
export async function saveDiscoveryCandidates(opts) {
  const { base44, session, llmResult, currentUrl, pageIdx, sdkTimeoutMs, snapshotText, authenticationRequirement } = opts;
  const { candidates, hasWriteActions } = parseDiscoveryLLMResult(llmResult);
  const pageCandidates = candidates.slice(0, MAX_CANDIDATES_PER_PAGE);
  const saved = [];
  const siteOrigin = originOf(session.site_url);

  for (const cand of pageCandidates) {
    if (!cand.suggested_id) continue;

    // 1. Build structured evidence from snapshot ref (deterministic -- no LLM invention)
    const evidence = buildEvidence(cand, snapshotText || '', currentUrl, pageIdx, hasWriteActions, session, authenticationRequirement || 'unknown');

    // 2. Compute identity (conservative, deterministic)
    const canonicalId = canonicalizeId(cand.suggested_id);
    // Normaliza input_fields ANTES do hash e da persistencia: refs posicionais
    // do snapshot (r79, e3) sao resolvidos para identificadores ESTAVEIS do
    // elemento (id > name > aria_label > label > placeholder), que ja existem
    // no snapshot. Assim duas descobertas do mesmo elemento fisico (ex:
    // ["itemCode"] e ["r79"] quando r79 -> id=itemCode) produzem o MESMO
    // identity_hash e consolidam. Refs nao resolvidos usam fallback prefixado
    // que nao colide com identificadores reais. Identificadores ja estaveis
    // sao preservados. O mesmo valor normalizado e usado para o hash E para o
    // input_fields persistido.
    const inputFields = normalizeInputFields(
      Array.isArray(cand.input_fields) ? cand.input_fields : [],
      snapshotText || ''
    );
    const identityHash = computeIdentityHash(siteOrigin, canonicalId, inputFields);

    try {
      // 3. Dedup: look for existing candidate with same identity_hash (RLS: user own records)
      const existing = await withTimeout(
        base44.entities.CapabilityCandidate.filter({ identity_hash: identityHash, status: 'candidate' }),
        sdkTimeoutMs || 10000,
        'candidate_dedup_query'
      );

      if (existing && existing.length > 0) {
        // 4. Consolidate: append evidence, preserve original suggested_id/description
        const existingRec = existing[0];
        let existingEvidence = [];
        try {
          const parsed = JSON.parse(existingRec.evidence || '[]');
          existingEvidence = Array.isArray(parsed) ? parsed : [parsed]; // handle old single-object format
        } catch (e) { existingEvidence = []; }
        existingEvidence.push(evidence);

        await withTimeout(
          base44.asServiceRole.entities.CapabilityCandidate.update(existingRec.id, {
            evidence: JSON.stringify(existingEvidence),
            consolidated_count: (existingRec.consolidated_count || 1) + 1,
          }),
          sdkTimeoutMs || 10000,
          'candidate_consolidate'
        );

        saved.push({
          id: existingRec.id,
          suggested_id: existingRec.suggested_id,
          description: existingRec.description,
          input_fields: JSON.parse(existingRec.input_fields || '[]'),
          discovered_from_url: existingRec.discovered_from_url,
          canonical_id: canonicalId,
          identity_hash: identityHash,
          consolidated: true,
          consolidated_count: (existingRec.consolidated_count || 1) + 1,
          capability_type: existingRec.capability_type || 'READ',
          risk_level: existingRec.risk_level || 'safe',
        });
      } else {
        // 5. Create new candidate
        // Evolucao Discovery (2026-08-12): classifica capability_type (READ/WRITE)
        // e risk_level (reusa Reversibility). Defaults READ/safe preservam
        // compatibilidade com legados e com candidates que o LLM nao classificar.
        const candType = (cand.capability_type === 'WRITE') ? 'WRITE' : 'READ';
        const candRisk = (cand.risk_level === 'reversible' || cand.risk_level === 'irreversible') ? cand.risk_level : 'safe';
        const record = await withTimeout(base44.entities.CapabilityCandidate.create({
          web_session_id: session.id,
          site_url: session.site_url,
          suggested_id: cand.suggested_id,
          description: cand.description || '',
          evidence: JSON.stringify([evidence]),
          input_fields: JSON.stringify(inputFields),
          discovered_from_url: currentUrl,
          status: 'candidate',
          canonical_id: canonicalId,
          identity_hash: identityHash,
          consolidated_count: 1,
          capability_type: candType,
          risk_level: candRisk,
        }), sdkTimeoutMs || 10000, 'candidate_create');

        saved.push({
          id: record.id,
          suggested_id: cand.suggested_id,
          description: cand.description || '',
          input_fields: inputFields,
          discovered_from_url: currentUrl,
          canonical_id: canonicalId,
          identity_hash: identityHash,
          consolidated: false,
          consolidated_count: 1,
          capability_type: candType,
          risk_level: candRisk,
        });
      }
    } catch (e) { /* best-effort: skip this candidate */ }
  }
  return saved;
}