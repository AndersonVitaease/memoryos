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
// Fix 2026-08-10 (branching automatico): antes o motor seguia 1 unico link
// por pagina (trilha linear), exigindo reapontar manualmente a sessao pra
// cada area do site (compras, vendas, anuncios...). Agora enfileira TODOS os
// links promissores de cada pagina (BFS), entao uma unica chamada cobre
// varias areas sozinha. DEFAULT subiu de 3 pra 10 paginas; hard cap de
// seguranca em 20 (protege tempo de execucao e custo de chamadas LLM).
const DEFAULT_MAX_PAGES = 10;
const MAX_PAGES_HARD_CAP = 20;
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

      const pageLimit = Math.min(Math.max(parseInt(maxPages, 10) || DEFAULT_MAX_PAGES, 1), MAX_PAGES_HARD_CAP);
      const visitedUrls = [];
      const visitedSet = new Set();
      const queuedSet = new Set([session.site_url]);
      const queue = [session.site_url];
      const allCandidates = [];
      let debugLastPageLinks = [];
      let debugLastHovered = null;
      let debugLastError = null;
      let debugRawLinksCount = null;
      let debugLastSnapshotPreview = '';

      // Anti-deteccao (fix 2026-08-10): sites com anti-bot (Cloudflare,
      // hCaptcha, WAF) recusam sessoes com sinais obvios de automacao. Este
      // script roda ANTES de qualquer JS da pagina em toda navegacao dentro
      // do context, mascarando os sinais mais comuns.
      const STEALTH_INIT_SCRIPT =
        'Object.defineProperty(navigator, "webdriver", { get: () => false }); ' +
        'window.chrome = window.chrome || { runtime: {} }; ' +
        'Object.defineProperty(navigator, "plugins", { get: () => [1,2,3,4,5] }); ' +
        'Object.defineProperty(navigator, "languages", { get: () => ["pt-BR","pt","en-US","en"] });';

      // Fix 3b (2026-08-10): aceita qualquer subdominio do mesmo dominio raiz
      // (nao so hostname identico) — sites grandes usam subdominios diferentes
      // pra areas de conta (ex: myaccount.mercadolivre.com.br).
      const baseHost = (() => { try { return new URL(session.site_url).hostname.replace(/^www\./, ''); } catch (e) { return null; } })();
      const sameDomain = (href) => {
        if (!baseHost) return true;
        try {
          const h = new URL(href).hostname.replace(/^www\./, '');
          return h === baseHost || h.endsWith('.' + baseHost);
        } catch (e) { return false; }
      };

      // Palavras-chave de areas de conta relevantes (compras, vendas,
      // anuncios, financeiro, perguntas) — usado como fallback quando a IA
      // nao sugere navigation_links uteis, e para descoberta AUTOMATICA de
      // multiplas areas numa unica chamada (fix 2026-08-10, branching).
      const ACCOUNT_AREA_KEYWORDS = /compra|pedido|venda|anuncio|publica|purchase|order|sale|listing|conta|account|central.?do.?vendedor|seller|historico|extrato|fatura|nota|pergunta|question|financeiro|reputa/i;

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
        // Dispara hover (mouse+pointer events) nos elementos mais provaveis de
        // serem gatilho de menu de conta/usuario — read-only, so revela DOM ja
        // existente via CSS/JS state (React 17+ pode usar mouse ou pointer).
        try {
          const res = await callMcp('browser_run_code_unsafe', {
            code: 'async (page) => { ' +
              'const candidates = Array.from(document.querySelectorAll("header *, nav *, [class*=user], [class*=account], [class*=avatar], [class*=perfil], [class*=conta]")); ' +
              'const fireHover = (el) => { ' +
              '  for (const type of ["mouseover","mouseenter","pointerover","pointerenter"]) { ' +
              '    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch (e2) {} ' +
              '  } ' +
              '}; ' +
              'candidates.slice(0, 40).forEach(fireHover); ' +
              'await new Promise((r) => setTimeout(r, 500)); ' +
              'return JSON.stringify({ hovered: candidates.length }); ' +
              '}',
          });
          const text = extractRunCodeText(res);
          const m = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, text];
          let outcome = JSON.parse((m[1] || text).trim());
          if (typeof outcome === 'string') outcome = JSON.parse(outcome);
          return outcome && typeof outcome.hovered === 'number' ? outcome.hovered : null;
        } catch (e) { return null; }
      }

      // Limpa browser pendurado de runs anteriores.
      try { await callMcp('browser_close', {}); } catch (e) { /* best-effort */ }

      let pageIdx = 0;
      while (queue.length > 0 && pageIdx < pageLimit) {
        const currentUrl = queue.shift();
        if (visitedSet.has(currentUrl)) continue;
        visitedSet.add(currentUrl);
        visitedUrls.push(currentUrl);

        // Injeta cookies + navega para currentUrl numa UNICA chamada (mesmo
        // padrao da operacao 'use' do webConnectorConnect — garante que
        // addCookies e goto operam no mesmo context). addInitScript mascara
        // sinais de automacao antes de qualquer script da pagina rodar.
        const escapedCookies = JSON.stringify(cookies);
        const escapedUrl = JSON.stringify(currentUrl);
        try {
          const code = 'async (page) => {' +
            '  await page.context().addInitScript(() => {' + STEALTH_INIT_SCRIPT + '});' +
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
          // Se redirecionou pra login, a sessao expirou — aborta tudo (cookies
          // compartilhados, qualquer outra pagina da fila teria o mesmo problema).
          if (navOutcome && /\/login/.test(navOutcome.url)) {
            return Response.json({
              error: 'Sessao expirou durante a descoberta (redirecionou para login). Reautentique via start+login+confirm.',
              candidates_discovered: allCandidates.length,
            }, { status: 409 });
          }
        } catch (e) {
          debugLastError = 'nav_step_failed: ' + (e && e.message ? e.message : String(e));
          pageIdx++;
          continue; // pula esta pagina, tenta a proxima da fila
        }

        let snapshotText = '';
        try {
          const snap = await callMcp('browser_snapshot', {});
          snapshotText = extractSnapshotText(snap);
          debugLastSnapshotPreview = snapshotText.slice(0, 500);
        } catch (e) {
          debugLastError = 'snapshot_step_failed: ' + (e && e.message ? e.message : String(e));
          pageIdx++;
          continue;
        }

        // LLM: identifica candidatos read-only + links de navegacao.
        let llmResult = null;
        try {
          const prompt = buildDiscoveryPrompt(snapshotText, session.site_url, visitedUrls);
          llmResult = await withTimeout(
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
        } catch (e) {
          // LLM falhou nesta pagina — segue para a proxima da fila (se houver).
          pageIdx++;
          continue;
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

        // Descoberta AUTOMATICA multi-area (fix 2026-08-10, branching): em vez
        // de seguir 1 unico link por pagina (trilha linear), junta TODOS os
        // links promissores desta pagina (sugeridos pela IA + casados por
        // palavra-chave de area de conta) e poe todos na fila. Isso permite
        // uma unica chamada descobrir compras, vendas, anuncios, perguntas etc.
        // sem precisar de intervencao manual reapontando a sessao a cada area.
        try {
          let rawLinks = await extractAllLinks();
          debugRawLinksCount = rawLinks.length;
          let pageLinks = rawLinks.filter((pl) => sameDomain(pl.href));

          const navLinks = (llmResult && Array.isArray(llmResult.navigation_links)) ? llmResult.navigation_links : [];
          const newlyQueued = [];

          const tryQueue = (href) => {
            if (!href) return false;
            if (visitedSet.has(href) || queuedSet.has(href)) return false;
            if (/\/login|\/logout/.test(href)) return false;
            queue.push(href);
            queuedSet.add(href);
            newlyQueued.push(href);
            return true;
          };

          // Todos os links cujo texto casa com algum navigation_link sugerido pela IA.
          for (const link of navLinks) {
            const wantedLabel = (link.label || '').trim().toLowerCase();
            if (!wantedLabel) continue;
            const match = pageLinks.find((pl) => {
              const plText = (pl.text || '').toLowerCase();
              return plText && (plText.includes(wantedLabel) || wantedLabel.includes(plText));
            });
            if (match) tryQueue(match.href);
          }

          // Todos os links que casam por palavra-chave de area de conta.
          for (const pl of pageLinks) {
            if (ACCOUNT_AREA_KEYWORDS.test(pl.text || '') || ACCOUNT_AREA_KEYWORDS.test(pl.href || '')) {
              tryQueue(pl.href);
            }
          }

          // Se nada foi enfileirado ainda, revela menus escondidos via hover e tenta de novo.
          if (newlyQueued.length === 0) {
            debugLastHovered = await revealHoverMenus();
            pageLinks = (await extractAllLinks()).filter((pl) => sameDomain(pl.href));
            for (const pl of pageLinks) {
              if (ACCOUNT_AREA_KEYWORDS.test(pl.text || '') || ACCOUNT_AREA_KEYWORDS.test(pl.href || '')) {
                tryQueue(pl.href);
              }
            }
          }

          debugLastPageLinks = pageLinks.slice(0, 40);
        } catch (e) {
          debugLastError = e && e.message ? e.message : String(e);
        }

        pageIdx++;
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
        // Debug temporario (2026-08-10): quando 0 candidatos, mostra os links
        // reais que o motor viu na ultima pagina + quantos elementos receberam
        // hover — permite diagnosticar sem tentativa e erro as cegas.
        debug: allCandidates.length === 0 ? {
          last_page_links_sample: debugLastPageLinks.map((l) => ({ text: l.text, href: l.href })),
          hover_triggered_on_elements: debugLastHovered,
          error: debugLastError,
          raw_links_found_before_domain_filter: debugRawLinksCount,
          snapshot_preview: debugLastSnapshotPreview,
        } : undefined,
      });
    }

    return Response.json({ error: 'Unknown operation: ' + operation }, { status: 400 });

  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}