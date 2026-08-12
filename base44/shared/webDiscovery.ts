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
import { withTimeout } from './mcpHelpers.ts';
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

function extractVerb(suggestedId) {
  const parts = String(suggestedId || '').split(/[._\s-]/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts[parts.length - 1].toLowerCase();
}

function buildEvidence(cand, snapshotText, currentUrl, pageIdx, hasWriteActions, session) {
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
  const { base44, session, llmResult, currentUrl, pageIdx, sdkTimeoutMs, snapshotText } = opts;
  const { candidates, hasWriteActions } = parseDiscoveryLLMResult(llmResult);
  const pageCandidates = candidates.slice(0, MAX_CANDIDATES_PER_PAGE);
  const saved = [];
  const siteOrigin = originOf(session.site_url);

  for (const cand of pageCandidates) {
    if (!cand.suggested_id) continue;

    // 1. Build structured evidence from snapshot ref (deterministic -- no LLM invention)
    const evidence = buildEvidence(cand, snapshotText || '', currentUrl, pageIdx, hasWriteActions, session);

    // 2. Compute identity (conservative, deterministic)
    const canonicalId = canonicalizeId(cand.suggested_id);
    const inputFields = Array.isArray(cand.input_fields) ? cand.input_fields : [];
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