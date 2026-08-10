/**
 * webConnectorDiscover — Motor de Descoberta de Capabilities (RFC-013, spike).
 *
 * A partir de uma WebSession ativa, navega o sistema autenticado e usa LLM
 * para identificar candidatos a capability (formularios de busca, areas
 * funcionais) a partir de snapshots de acessibilidade. Reaproveita o padrao
 * "LLM decide a partir de snapshot" validado em bugHunterRun, mas com objetivo
 * de catalogar operacoes (read-only) — nunca executar escrita.
 *
 * REGRA DE SEGURANCA INEGOCIAVEL (enforced no codigo, nao no prompt):
 *   A funcao NAO tem acesso a browser_click, browser_type, browser_fill.
 *   So usa: browser_navigate, browser_snapshot, browser_run_code_unsafe
 *   (apenas para injecao de cookies e querySelector read-only — nunca
 *   fill/submit). O motor fisicamente nao pode submeter nada.
 *
 * Operations:
 *   discover { webSessionId, maxPages? } -> navega, cataloga candidatos,
 *     salva CapabilityCandidate records, retorna lista. NUNCA executa escrita.
 *
 * Limite do spike: maxPages default 3, ate ~5 candidatos por pagina.
 * Validacao (promover candidate -> CapabilityMap) fica para um humano no MVP.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { connect as mcpConnect, resolveHeaders as mcpResolveHeaders, tryRecoverResultFromError } from '../../shared/mcpClient.ts';
import { withTimeout, extractSnapshotText, extractRunCodeText, makeCallMcp } from '../../shared/mcpHelpers.ts';

const PLAYWRIGHT_SERVER_NAME = 'playwright-web-connector';
const MCP_CALL_TIMEOUT_MS = 25000;
const SDK_TIMEOUT_MS = 10000;
const DEFAULT_MAX_PAGES = 3;
const MAX_CANDIDATES_PER_PAGE = 5;

// Prompt do LLM: pede candidatos a capability (read-only) + links de
// navegacao. Explicitamente proibe sugerir acoes de escrita/submissao.
function buildDiscoveryPrompt(snapshotText, siteUrl, visitedUrls) {
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

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const { operation } = body;
    if (!operation) return Response.json({ error: 'Missing required field: operation' }, { status: 400 });

    const servers = await base44.asServiceRole.entities.MCPServerConfig.filter({ name: PLAYWRIGHT_SERVER_NAME });
    if (servers.length === 0) return Response.json({ error: "MCPServerConfig '" + PLAYWRIGHT_SERVER_NAME + "' not found" }, { status: 404 });
    const server = servers[0];
    const { headers, error: headerError } = mcpResolveHeaders(server);
    if (headerError) return Response.json({ error: headerError }, { status: 500 });

    let mcpSession = null;
    try {
      mcpSession = await withTimeout(mcpConnect(server.server_url, headers), MCP_CALL_TIMEOUT_MS, 'mcpConnect');
    } catch (e) {
      return Response.json({ error: 'MCP connect failed: ' + e.message }, { status: 502 });
    }

    const callMcp = makeCallMcp(mcpSession, MCP_CALL_TIMEOUT_MS, tryRecoverResultFromError);

    // ── operation: discover ────────────────────────────────────────────
    if (operation === 'discover') {
      const { webSessionId, maxPages } = body;
      if (!webSessionId) return Response.json({ error: 'Missing required field: webSessionId' }, { status: 400 });

      const session = await withTimeout(base44.entities.WebSession.get(webSessionId), SDK_TIMEOUT_MS, 'session_get');
      if (!session) return Response.json({ error: 'WebSession not found' }, { status: 404 });
      if (session.status !== 'active') {
        return Response.json({ error: 'WebSession is not active (status: ' + session.status + '). Reautentique via start+login+confirm antes de descobrir.' }, { status: 409 });
      }

      let cookies = [];
      try {
        cookies = JSON.parse(session.cookies || '[]');
      } catch (e) {
        return Response.json({ error: 'Stored cookies are corrupted: ' + e.message }, { status: 500 });
      }
      if (!Array.isArray(cookies) || cookies.length === 0) {
        return Response.json({ error: 'No cookies stored in this WebSession.' }, { status: 409 });
      }

      const pageLimit = Math.min(Math.max(parseInt(maxPages, 10) || DEFAULT_MAX_PAGES, 1), 5);
      const visitedUrls = [session.site_url];
      const allCandidates = [];
      let currentUrl = session.site_url;

      // Limpa browser pendurado de runs anteriores.
      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

      for (let pageIdx = 0; pageIdx < pageLimit; pageIdx++) {
        // Injeta cookies + navega para currentUrl numa UNICA chamada
        // (mesmo padrao da operacao 'use' do webConnectorConnect — garante
        // que addCookies e goto operam no mesmo context).
        const escapedCookies = JSON.stringify(cookies);
        const escapedUrl = JSON.stringify(currentUrl);
        let navOk = true;
        try {
          const code = 'async (page) => {' +
            '  await page.context().addCookies(' + escapedCookies + ');' +
            '  await page.goto(' + escapedUrl + ', { waitUntil: "load", timeout: 15000 }).catch(() => {});' +
            '  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
            '  return JSON.stringify({ url: page.url() });' +
            '}';
          const res = await callMcp('browser_run_code_unsafe', { code });
          const navText = extractRunCodeText(res);
          const m = navText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, navText];
          let navOutcome = JSON.parse((m[1] || navText).trim());
          if (typeof navOutcome === 'string') navOutcome = JSON.parse(navOutcome);
          // Se redirecionou pra login, a sessao expirou — aborta.
          if (navOutcome && /\/login/.test(navOutcome.url)) {
            return Response.json({
              error: 'Sessao expirou durante a descoberta (redirecionou para login). Reautentique via start+login+confirm.',
              candidates_discovered: allCandidates.length,
            }, { status: 409 });
          }
        } catch (e) {
          navOk = false;
        }

        let snapshotText = '';
        try {
          const snap = await callMcp('browser_snapshot', {});
          snapshotText = extractSnapshotText(snap);
        } catch (e) {
          // Sem snapshot, nao da pra descobrir nesta pagina — pula.
          break;
        }

        // LLM: identifica candidatos read-only + links de navegacao.
        let llmResult = null;
        try {
          const prompt = buildDiscoveryPrompt(snapshotText, session.site_url, visitedUrls);
          const llmRes = await withTimeout(
            base44.integrations.Core.InvokeLLM({
              prompt,
              response_json_schema: {
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
              },
            }),
            60000,
            'InvokeLLM_discover'
          );
          llmResult = llmRes;
        } catch (e) {
          // LLM falhou nesta pagina — segue com o que tem (nav links podem
          // estar vazios, encerra o loop por falta de proxima pagina).
          break;
        }

        const pageCandidates = (llmResult && Array.isArray(llmResult.candidates)) ? llmResult.candidates.slice(0, MAX_CANDIDATES_PER_PAGE) : [];

        // Salva candidatos como CapabilityCandidate records.
        for (const cand of pageCandidates) {
          if (!cand.suggested_id) continue;
          try {
            const record = await withTimeout(base44.entities.CapabilityCandidate.create({
              web_session_id: session.id,
              site_url: session.site_url,
              suggested_id: cand.suggested_id,
              description: cand.description || '',
              evidence: JSON.stringify({ page_index: pageIdx, url: currentUrl, has_write_actions: llmResult.has_write_actions || false }),
              input_fields: JSON.stringify(cand.input_fields || []),
              discovered_from_url: currentUrl,
              status: 'candidate',
            }), SDK_TIMEOUT_MS, 'candidate_create');
            allCandidates.push({
              id: record.id,
              suggested_id: cand.suggested_id,
              description: cand.description,
              input_fields: cand.input_fields || [],
              discovered_from_url: currentUrl,
            });
          } catch (e) { /* best-effort: segue para proximo candidato */ }
        }

        // Decide proxima pagina: pega um nav link cuja URL ainda nao foi
        // visitada. Sem o Playwright expor browser_click aqui, usamos
        // browser_run_code_unsafe read-only para extrair o href do link e
        // navegar no proximo iteration via goto (read-only).
        // NOTA (fix 2026-08-10): os "ref" do snapshot de acessibilidade do
        // Playwright (ex: s1e5) sao IDs internos do snapshot, NAO atributos
        // reais do DOM — um seletor CSS "[ref=s1e5]" nunca casa com nada. A
        // versao anterior caia sempre no fallback ", a" e pegava o PRIMEIRO
        // <a> da pagina inteira, ignorando qual link a IA realmente sugeriu.
        // Fix: extrai todos os links da pagina (texto + href) numa unica
        // chamada e casa pelo texto do label sugerido pela IA (case-insensitive,
        // substring nos dois sentidos) — nao depende de refs inexistentes.
        //
        // Fix 2 (2026-08-10): areas uteis de conta (compras, vendas, pedidos)
        // costumam ficar dentro de menus que so renderizam os links no DOM
        // apos hover (padrao comum em SPAs React) — o snapshot de
        // acessibilidade so ve o que esta visivel, entao a IA nunca sugere
        // esses links. Disparamos um evento de hover (mouseenter/mouseover)
        // via JS nos elementos candidatos a gatilho de menu — isso e
        // estritamente leitura (nao navega, nao envia dados, so revela o que
        // ja existe na pagina) e NAO e um clique. Depois de revelar, aplica
        // um fallback por palavras-chave comuns de area de conta, caso a IA
        // nao tenha sugerido nada usavel.
        const ACCOUNT_AREA_KEYWORDS = /compra|pedido|venda|purchase|order|sale|conta|account|central.?do.?vendedor|seller|historico|extrato|fatura|nota/i;

        async function extractAllLinks() {
          const res = await callMcp('browser_run_code_unsafe', {
            code: 'async (page) => { ' +
              'const links = await page.$$eval("a[href]", (els) => els.map((e) => ({ text: (e.innerText || e.textContent || "").trim(), href: e.href })).filter((l) => l.href && l.text)); ' +
              'return JSON.stringify({ links: links.slice(0, 300) }); ' +
              '}',
          });
          const text = extractRunCodeText(res);
          const m = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, text];
          let outcome = JSON.parse((m[1] || text).trim());
          if (typeof outcome === 'string') outcome = JSON.parse(outcome);
          return (outcome && Array.isArray(outcome.links)) ? outcome.links : [];
        }

        async function revealHoverMenus() {
          // Dispara hover (mouseenter/mouseover) nos elementos mais provaveis
          // de serem gatilho de menu de conta/usuario (avatar, nome, icone de
          // perfil) — read-only, so revela DOM ja existente via CSS/JS state.
          try {
            await callMcp('browser_run_code_unsafe', {
              code: 'async (page) => { ' +
                'const candidates = Array.from(document.querySelectorAll("header *, nav *, [class*=user], [class*=account], [class*=avatar], [class*=perfil], [class*=conta]")); ' +
                'const fireHover = (el) => { ' +
                '  for (const type of ["mouseover","mouseenter"]) { ' +
                '    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); ' +
                '  } ' +
                '}; ' +
                'candidates.slice(0, 40).forEach(fireHover); ' +
                'await new Promise((r) => setTimeout(r, 400)); ' +
                'return JSON.stringify({ hovered: candidates.length }); ' +
                '}',
            });
          } catch (e) { /* best-effort: hover falhou, segue sem menu revelado */ }
        }

        const navLinks = (llmResult && Array.isArray(llmResult.navigation_links)) ? llmResult.navigation_links : [];
        let nextUrl = null;
        try {
          // Fix 3 (2026-08-10): restringe candidatos ao MESMO dominio da sessao.
          // Sites regionais (ex: Mercado Livre) tem seletor de pais/idioma que
          // leva a um dominio TOTALMENTE diferente (mercadolibre.com vs
          // mercadolivre.com.br) — o texto desses links (nomes de pais,
          // bandeiras) as vezes casa por acidente com o label sugerido pela IA,
          // consumindo todo o orcamento de paginas num loop entre dominios sem
          // nunca chegar em area util. So navega dentro do mesmo hostname de
          // onde a sessao comecou.
          const baseHost = (() => { try { return new URL(session.site_url).hostname; } catch (e) { return null; } })();
          const sameDomain = (href) => {
            if (!baseHost) return true;
            try { return new URL(href).hostname === baseHost; } catch (e) { return false; }
          };

          let pageLinks = (await extractAllLinks()).filter((pl) => sameDomain(pl.href));

          // Tentativa 1: casar com os nav_links sugeridos pela IA (texto do label).
          for (const link of navLinks) {
            const wantedLabel = (link.label || '').trim().toLowerCase();
            if (!wantedLabel) continue;
            const match = pageLinks.find((pl) => {
              const plText = (pl.text || '').toLowerCase();
              return plText && (plText.includes(wantedLabel) || wantedLabel.includes(plText));
            });
            if (match && match.href && !visitedUrls.includes(match.href) && !/\/login|\/logout/.test(match.href)) {
              nextUrl = match.href;
              break;
            }
          }

          // Tentativa 2: fallback por palavras-chave de area de conta, direto
          // nos links ja visiveis (sem hover ainda).
          if (!nextUrl) {
            const kwMatch = pageLinks.find((pl) =>
              ACCOUNT_AREA_KEYWORDS.test(pl.text || '') || ACCOUNT_AREA_KEYWORDS.test(pl.href || '')
            );
            if (kwMatch && kwMatch.href && !visitedUrls.includes(kwMatch.href) && !/\/login|\/logout/.test(kwMatch.href)) {
              nextUrl = kwMatch.href;
            }
          }

          // Tentativa 3: revela menus escondidos via hover e tenta de novo.
          if (!nextUrl) {
            await revealHoverMenus();
            pageLinks = (await extractAllLinks()).filter((pl) => sameDomain(pl.href));
            const kwMatch = pageLinks.find((pl) =>
              ACCOUNT_AREA_KEYWORDS.test(pl.text || '') || ACCOUNT_AREA_KEYWORDS.test(pl.href || '')
            );
            if (kwMatch && kwMatch.href && !visitedUrls.includes(kwMatch.href) && !/\/login|\/logout/.test(kwMatch.href)) {
              nextUrl = kwMatch.href;
            }
          }
        } catch (e) { /* best-effort: sem links extraidos, encerra descoberta */ }

        if (!nextUrl) break; // sem mais paginas para explorar
        visitedUrls.push(nextUrl);
        currentUrl = nextUrl;
      }

      // Libera RAM na VPS.
      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

      return Response.json({
        ok: true,
        webSessionId: session.id,
        pages_explored: visitedUrls.length,
        candidates_discovered: allCandidates.length,
        candidates: allCandidates,
        visited_urls: visitedUrls,
        message: 'Descoberta concluida. ' + allCandidates.length + ' candidato(s) salvo(s) como CapabilityCandidate (status=candidate). Validacao humana necessaria antes de promover para CapabilityMap.',
      });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}