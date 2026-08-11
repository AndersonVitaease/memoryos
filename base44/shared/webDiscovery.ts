/**
 * webDiscovery — Logica de descoberta de capabilities compartilhada entre
 * webConnectorDiscover (headless/Playwright) e webConnectorExtension
 * (extensao Chrome). Extrai o prompt do LLM, o schema JSON e o salvamento
 * de CapabilityCandidate para evitar duplicacao entre as duas origens.
 *
 * Sprint 2 (2026-08-11): criado ao adicionar submitSnapshot na extensao,
 * garantindo que ambas as origens usem EXATAMENTE o mesmo prompt (requisito
 * do plano da extensao Chrome — "mesmo prompt de descoberta").
 *
 * Strings do prompt sem acento (mesma convencao do webConnectorDiscover —
 * evita problemas de encoding no runtime Deno).
 */
import { withTimeout } from './mcpHelpers.ts';

export const MAX_CANDIDATES_PER_PAGE = 5;

export function buildDiscoveryPrompt(snapshotText, siteUrl, visitedUrls) {
  return [
    'Voce e um motor de descoberta de capabilities para um sistema web autenticado em ' + siteUrl + '.',
    'Seu objetivo: catalogar operacoes READ-ONLY que o sistema expoe (buscas, consultas, listagens, relatorios).',
    '',
    'REGRAS INEGOCIAVEIS:',
    '1. NUNCA sugira acoes de escrita (criar, editar, cancelar, enviar, deletar, submeter).',
    '2. So catalogue operacoes que podem ser executadas sem alterar dados (buscas, filtros, listagens, visualizacoes).',
    '3. Um botao so e candidato se pertence a um formulario de BUSCA/CONSULTA (tem inputs + botao de busca/filtrar).',
    '4. Botoes decorativos ou de acao (Salvar, Excluir, Cancelar, Enviar) NAO sao candidatos — ignore-os.',
    '',
    'Analise o snapshot de acessibilidade abaixo e retorne JSON com:',
    '- candidates: lista de capabilities read-only encontradas nesta pagina (ate ' + MAX_CANDIDATES_PER_PAGE + ').',
    '  Cada candidate: { suggested_id (ex: reservation.search), description, input_fields (lista de nomes/labels dos campos do formulario) }',
    '- navigation_links: links de navegacao para OUTRAS areas funcionais do sistema (nao links externos/logout).',
    '  Cada link: { label, ref } — use o ref exato do snapshot.',
    '- has_write_actions: boolean indicando se a pagina tem acoes de escrita (para fins de registro, NAO para executar).',
    '',
    'Se a pagina atual nao tem formulario de busca/consulta, retorne candidates=[] e so os navigation_links.',
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
 * Salva ate MAX_CANDIDATES_PER_PAGE candidatos como registros CapabilityCandidate.
 * Mesma logica antes inline no webConnectorDiscover, agora reusada pela extensao.
 * Retorna lista de { id, suggested_id, description, input_fields, discovered_from_url }.
 */
export async function saveDiscoveryCandidates(opts) {
  const { base44, session, llmResult, currentUrl, pageIdx, sdkTimeoutMs } = opts;
  const { candidates, hasWriteActions } = parseDiscoveryLLMResult(llmResult);
  const pageCandidates = candidates.slice(0, MAX_CANDIDATES_PER_PAGE);
  const saved = [];
  for (const cand of pageCandidates) {
    if (!cand.suggested_id) continue;
    try {
      const record = await withTimeout(base44.entities.CapabilityCandidate.create({
        web_session_id: session.id,
        site_url: session.site_url,
        suggested_id: cand.suggested_id,
        description: cand.description || '',
        evidence: JSON.stringify({ page_index: pageIdx || 0, url: currentUrl, has_write_actions: hasWriteActions, source: session.source || 'headless' }),
        input_fields: JSON.stringify(cand.input_fields || []),
        discovered_from_url: currentUrl,
        status: 'candidate',
      }), sdkTimeoutMs || 10000, 'candidate_create');
      saved.push({
        id: record.id,
        suggested_id: cand.suggested_id,
        description: cand.description || '',
        input_fields: cand.input_fields || [],
        discovered_from_url: currentUrl,
      });
    } catch (e) { /* best-effort: segue para proximo candidato */ }
  }
  return saved;
}