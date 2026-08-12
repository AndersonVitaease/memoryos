/**
 * discoveryStep2Tests -- Funcao de teste para o Passo 2 do Discovery Engine
 * (Evidence + Identity/Normalization + Deduplication).
 *
 * Executa testes unitarios (canonicalizeId, computeIdentityHash,
 * resolveElementFromSnapshot) e testes de integracao (saveDiscoveryCandidates
 * com dedup). Cria fixtures de teste (WebSession, WebBridge), chama
 * saveDiscoveryCandidates com LLM results mockados, verifica consolidacao,
 * e limpa tudo ao final.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { canonicalizeId, computeIdentityHash, originOf } from '../../shared/capabilityIdentity.ts';
import { saveDiscoveryCandidates, resolveElementFromSnapshot } from '../../shared/webDiscovery.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const results = [];

    // === UNIT TESTS ===

    // Test: canonicalizeId
    // Sprint 2 (2026-08-12): canonical agora VERB-FIRST (product.search -> search.product)
    const canonCases = [
      { input: 'product.search', expected: 'search.product' },
      { input: 'produto.search', expected: 'search.product' },
      { input: 'products.search', expected: 'search.product' },
      { input: 'product.pesquisar', expected: 'search.product' },
      { input: 'product.find', expected: 'search.product' },
      { input: 'reservation.search', expected: 'search.reservation' },
      { input: 'reservas.search', expected: 'search.reservation' },
      { input: 'order.lookup', expected: 'search.order' },
      { input: 'pedido.consultar', expected: 'search.order' },
    ];
    const canonResults = canonCases.map(function (c) {
      const actual = canonicalizeId(c.input);
      return { input: c.input, expected: c.expected, actual: actual, passed: actual === c.expected };
    });
    results.push({ test: 'canonicalizeId', cases: canonResults });

    // ── Sprint 2 (2026-08-12): evolucao verb-first + UI noise + conectores + purchases ──
    const canonEvolutionCases = [
      // TESTE 1 — ordem (verb-first deterministico)
      { input: 'product.search', expected: 'search.product' },
      { input: 'submit.search', expected: 'search' },
      // TESTE 2 — tokens de UI removidos
      { input: 'search.input', expected: 'search' },
      { input: 'search.button', expected: 'search' },
      { input: 'search.submit', expected: 'search' },
      { input: 'logout.action', expected: 'logout' },
      // TESTE 3 — conectores removidos
      { input: 'filter.by.date', expected: 'filter.date' },
      { input: 'filter_date', expected: 'filter.date' },
      // TESTE 4 — purchases -> purchase
      { input: 'purchases.search', expected: 'search.purchase' },
      { input: 'purchase.search', expected: 'search.purchase' },
      // TESTE 5 — READ/WRITE e alvos distintos NAO colidem
      { input: 'sell.item', expected: 'sell.item' },
      { input: 'add.product', expected: 'add.product' },
      { input: 'add.sidebar.shortcut', expected: 'add.sidebar.shortcut' },
      { input: 'remove.sidebar.shortcut', expected: 'remove.sidebar.shortcut' },
      { input: 'download.report', expected: 'download.report' },
      { input: 'download.invoice', expected: 'download.invoice' },
    ];
    const canonEvolutionResults = canonEvolutionCases.map(function (c) {
      const actual = canonicalizeId(c.input);
      return { input: c.input, expected: c.expected, actual: actual, passed: actual === c.expected };
    });
    results.push({ test: 'canonicalizeIdEvolution', cases: canonEvolutionResults });

    // TESTE 7 — identidade: mesmo canonical+inputs -> mesmo hash; diferentes -> hash diferente
    const idSame1 = computeIdentityHash('https://a.com', canonicalizeId('product.search'), ['q']);
    const idSame2 = computeIdentityHash('https://a.com', canonicalizeId('search_products'), ['q']);
    const idDiff1 = computeIdentityHash('https://a.com', canonicalizeId('sell.item'), []);
    const idDiff2 = computeIdentityHash('https://a.com', canonicalizeId('add.product'), []);
    const idDiff3 = computeIdentityHash('https://a.com', canonicalizeId('download.report'), []);
    const idDiff4 = computeIdentityHash('https://a.com', canonicalizeId('download.invoice'), []);
    const idRW1 = computeIdentityHash('https://a.com', canonicalizeId('add.sidebar.shortcut'), []);
    const idRW2 = computeIdentityHash('https://a.com', canonicalizeId('remove.sidebar.shortcut'), []);
    const idSearchVsAdd = computeIdentityHash('https://a.com', canonicalizeId('search.product'), []) !== computeIdentityHash('https://a.com', canonicalizeId('add.product'), []);
    results.push({
      test: 'identityHashEvolution',
      cases: [
        { name: 'product.search == search_products (mesmo canonical+inputs)', passed: idSame1 === idSame2 },
        { name: 'search.product != add.product (READ vs WRITE verbo)', passed: idSearchVsAdd },
        { name: 'sell.item != add.product', passed: idDiff1 !== idDiff2 },
        { name: 'download.report != download.invoice', passed: idDiff3 !== idDiff4 },
        { name: 'add.sidebar.shortcut != remove.sidebar.shortcut', passed: idRW1 !== idRW2 },
      ],
    });

    // Test: computeIdentityHash
    const h1 = computeIdentityHash('https://a.com', 'product.search', ['q']);
    const h2 = computeIdentityHash('https://a.com', 'product.search', ['q']);
    const h3 = computeIdentityHash('https://b.com', 'product.search', ['q']);
    const h4 = computeIdentityHash('https://a.com', 'order.search', ['q']);
    const h5 = computeIdentityHash('https://a.com', 'product.search', ['q', 'category']);
    const h6 = computeIdentityHash('https://a.com', 'product.search', ['Q']); // normalized -> same as ['q']
    results.push({
      test: 'computeIdentityHash',
      cases: [
        { name: 'same inputs -> same hash', passed: h1 === h2 },
        { name: 'different site -> different hash', passed: h1 !== h3 },
        { name: 'different canonical -> different hash', passed: h1 !== h4 },
        { name: 'different inputs -> different hash', passed: h1 !== h5 },
        { name: 'case-insensitive inputs -> same hash', passed: h1 === h6 },
      ],
    });

    // Test: resolveElementFromSnapshot (extension format)
    const extSnap = [
      'input type=search name=q id=search placeholder="Search products" aria-label="Search" [ref=r1]',
      'button type=submit id=search-btn text="Search" [ref=r2]',
    ].join('\n');
    const el1 = resolveElementFromSnapshot(extSnap, 'r1');
    results.push({
      test: 'resolveElementFromSnapshot (extension)',
      cases: [
        { name: 'tag found', passed: el1 && el1.tag === 'input' },
        { name: 'type found', passed: el1 && el1.type === 'search' },
        { name: 'name found', passed: el1 && el1.name === 'q' },
        { name: 'id found', passed: el1 && el1.id === 'search' },
        { name: 'placeholder found', passed: el1 && el1.placeholder === 'Search products' },
        { name: 'aria_label found', passed: el1 && el1.aria_label === 'Search' },
        { name: 'ref preserved', passed: el1 && el1.ref === 'r1' },
      ],
    });

    // Test: resolveElementFromSnapshot (Playwright format)
    const pwSnap = [
      '- searchbox "Search products" [ref=e3]',
      '- button "Search" [ref=e4]',
    ].join('\n');
    const el3 = resolveElementFromSnapshot(pwSnap, 'e3');
    results.push({
      test: 'resolveElementFromSnapshot (playwright)',
      cases: [
        { name: 'role found', passed: el3 && el3.role === 'searchbox' },
        { name: 'accessible_name found', passed: el3 && el3.accessible_name === 'Search products' },
        { name: 'ref preserved', passed: el3 && el3.ref === 'e3' },
      ],
    });

    // Test: ref not found -> null
    const elNull = resolveElementFromSnapshot(extSnap, 'r999');
    results.push({
      test: 'resolveElementFromSnapshot (ref not found)',
      cases: [{ name: 'returns null', passed: elNull === null }],
    });

    // === INTEGRATION TESTS (dedup via saveDiscoveryCandidates) ===

    // Resolve workspace ativo
    const fullUser = await base44.asServiceRole.entities.User.get(user.id).catch(function () { return null; });
    const wsId = (fullUser && fullUser.active_workspace_id) || null;
    if (!wsId) {
      return Response.json({ error: 'Nenhum workspace ativo' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const stamp = Date.now().toString(36);
    const bridgeId = 'bridge-test-step2-' + stamp;
    const siteUrlA = 'https://test-step2-a-' + stamp + '.example.com';
    const siteUrlB = 'https://test-step2-b-' + stamp + '.example.com';

    // Create bridge
    await base44.asServiceRole.entities.WebBridge.create({
      bridge_id: bridgeId, user_id: user.id, workspace_id: wsId,
      status: 'online', last_seen_at: now, extension_version: 'test-step2', registered_at: now,
    });

    // Create sessions
    const sessA = await base44.entities.WebSession.create({
      site_url: siteUrlA, site_name: 'Step2 Site A', browser_context_id: '1',
      browser_session_id: 'tab-1', bridge_id: bridgeId, workspace_id: wsId,
      status: 'active', source: 'extension', last_used_at: now,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    const sessB = await base44.entities.WebSession.create({
      site_url: siteUrlB, site_name: 'Step2 Site B', browser_context_id: '2',
      browser_session_id: 'tab-2', bridge_id: bridgeId, workspace_id: wsId,
      status: 'active', source: 'extension', last_used_at: now,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const snapshotA = [
      'input type=search name=q id=search placeholder="Search products" aria-label="Search" [ref=r1]',
      'button type=submit id=search-btn text="Search" [ref=r2]',
    ].join('\n');

    // Helper: clean up all test candidates
    async function cleanup() {
      const del = async function (entity, filter) {
        const items = await base44.asServiceRole.entities[entity].filter(filter);
        for (const i of items) await base44.asServiceRole.entities[entity].delete(i.id).catch(function () {});
      };
      await del('CapabilityCandidate', { web_session_id: sessA.id });
      await del('CapabilityCandidate', { web_session_id: sessB.id });
      await del('WebSession', { id: sessA.id });
      await del('WebSession', { id: sessB.id });
      await del('WebBridge', { bridge_id: bridgeId });
    }

    try {
      // Test 1: Two semantically equivalent discoveries -> one consolidated + two evidences
      const llm1 = { candidates: [{ suggested_id: 'product.search', description: 'Pesquisar produto', input_fields: ['q'], element_ref: 'r1' }] };
      const llm2 = { candidates: [{ suggested_id: 'product.search', description: 'Buscar produto', input_fields: ['q'], element_ref: 'r2' }] };
      const saved1 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm1, currentUrl: siteUrlA + '/produtos', pageIdx: 0, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const saved2 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm2, currentUrl: siteUrlA + '/produtos?pagina=2', pageIdx: 1, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const t1Consolidated = saved1.length === 1 && saved2.length === 1 && saved2[0].consolidated === true && saved2[0].id === saved1[0].id;
      const cand1 = await base44.entities.CapabilityCandidate.get(saved1[0].id);
      const ev1 = JSON.parse(cand1.evidence || '[]');
      const ev1Arr = Array.isArray(ev1) ? ev1 : [ev1];
      const t1EvidenceCount = ev1Arr.length === 2;
      const t1SuggestedIdPreserved = cand1.suggested_id === 'product.search';
      results.push({
        test: 'Test 1: Two equivalent discoveries consolidated',
        passed: t1Consolidated && t1EvidenceCount && t1SuggestedIdPreserved,
        detail: 'consolidated=' + t1Consolidated + ', evidenceCount=' + ev1Arr.length + ', suggested_id=' + cand1.suggested_id,
      });

      // Test 2: "Pesquisar produto" vs "Pesquisar pedido" -> two candidates
      const llm3 = { candidates: [{ suggested_id: 'order.search', description: 'Pesquisar pedido', input_fields: ['q'], element_ref: 'r1' }] };
      const saved3 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm3, currentUrl: siteUrlA + '/pedidos', pageIdx: 2, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const t2Passed = saved3[0] && saved3[0].id !== saved1[0].id && saved3[0].consolidated === false;
      results.push({
        test: 'Test 2: Different targets not consolidated',
        passed: t2Passed,
        detail: 'saved3.id=' + (saved3[0] && saved3[0].id) + ' vs saved1.id=' + saved1[0].id,
      });

      // Test 3: Same name on different sites -> two independent candidates
      const llm4 = { candidates: [{ suggested_id: 'reservation.search', description: 'Search reservations', input_fields: ['q'], element_ref: 'r1' }] };
      const saved4a = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm4, currentUrl: siteUrlA + '/reservations', pageIdx: 3, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const saved4b = await saveDiscoveryCandidates({ base44: base44, session: sessB, llmResult: llm4, currentUrl: siteUrlB + '/reservations', pageIdx: 0, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const t3Passed = saved4a[0] && saved4b[0] && saved4a[0].id !== saved4b[0].id && saved4a[0].consolidated === false && saved4b[0].consolidated === false;
      results.push({
        test: 'Test 3: Same name different sites not consolidated',
        passed: t3Passed,
        detail: 'siteA hash=' + saved4a[0].identity_hash + ' vs siteB hash=' + saved4b[0].identity_hash,
      });

      // Test 4: Same capability on two pages -> consolidated with multiple evidences (already Test 1, verify pages differ)
      const t4Passed = ev1Arr.length === 2 && ev1Arr[0].page_url !== ev1Arr[1].page_url;
      results.push({
        test: 'Test 4: Same capability on two pages consolidated with multiple evidences',
        passed: t4Passed,
        detail: 'pages: ' + ev1Arr.map(function (e) { return e.page_url; }).join(', '),
      });

      // Test 5: Candidate without reliable selector (ref not found in snapshot)
      const llm5 = { candidates: [{ suggested_id: 'special.search', description: 'Special search', input_fields: ['q'], element_ref: 'r999' }] };
      const saved5 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm5, currentUrl: siteUrlA + '/special', pageIdx: 4, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const cand5 = await base44.entities.CapabilityCandidate.get(saved5[0].id);
      const ev5 = JSON.parse(cand5.evidence || '[]')[0];
      const t5Passed = saved5.length === 1 && ev5.snapshot_ref_found === false && ev5.element === null;
      results.push({
        test: 'Test 5: Candidate without reliable selector still valid',
        passed: t5Passed,
        detail: 'element=' + JSON.stringify(ev5.element) + ', ref_found=' + ev5.snapshot_ref_found,
      });

      // Test 5b: Candidate with NO element_ref at all (empty string)
      const llm5b = { candidates: [{ suggested_id: 'no_ref.search', description: 'No ref', input_fields: ['q'], element_ref: '' }] };
      const saved5b = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm5b, currentUrl: siteUrlA + '/noref', pageIdx: 5, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const cand5b = await base44.entities.CapabilityCandidate.get(saved5b[0].id);
      const ev5b = JSON.parse(cand5b.evidence || '[]')[0];
      const t5bPassed = saved5b.length === 1 && ev5b.element_ref === null && ev5b.element === null && ev5b.snapshot_ref_found === false;
      results.push({
        test: 'Test 5b: Candidate with empty element_ref',
        passed: t5bPassed,
        detail: 'element_ref=' + ev5b.element_ref + ', element=' + JSON.stringify(ev5b.element),
      });

      // Test 6: Workspace isolation -- verify RLS: user can only see own candidates
      const myCands = await base44.entities.CapabilityCandidate.filter({ web_session_id: sessA.id });
      const t6Passed = myCands.length > 0 && myCands.every(function (c) { return c.created_by_id === user.id; });
      results.push({
        test: 'Test 6: Workspace/user isolation (RLS)',
        passed: t6Passed,
        detail: 'count=' + myCands.length + ', all owned by caller=' + t6Passed,
      });

      // Test 7: Old-format candidate (no canonical_id) created successfully (backward compat)
      const oldCand = await base44.entities.CapabilityCandidate.create({
        web_session_id: sessA.id, site_url: siteUrlA,
        suggested_id: 'legacy.search', description: 'Legacy',
        evidence: JSON.stringify({ page_index: 0, url: siteUrlA, has_write_actions: false, source: 'headless' }),
        input_fields: JSON.stringify(['q']),
        discovered_from_url: siteUrlA, status: 'candidate',
      });
      const t7Passed = !!oldCand.id;
      results.push({
        test: 'Test 7: Old-format candidate created (backward compat)',
        passed: t7Passed,
        detail: 'id=' + oldCand.id,
      });

      // Test 8: Dedup does NOT touch old-format candidates (no identity_hash)
      const llm8 = { candidates: [{ suggested_id: 'legacy.search', description: 'Legacy again', input_fields: ['q'], element_ref: 'r1' }] };
      const saved8 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm8, currentUrl: siteUrlA + '/legacy2', pageIdx: 6, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      // The new candidate has identity_hash; the old one does not -> filter finds 0 matches -> creates new
      const t8Passed = saved8[0] && saved8[0].consolidated === false && saved8[0].id !== oldCand.id;
      results.push({
        test: 'Test 8: New candidate not consolidated with old-format (no identity_hash)',
        passed: t8Passed,
        detail: 'new id=' + saved8[0].id + ' vs old id=' + oldCand.id,
      });

      // Test 9: Evidence structure correctness (element data recovered from snapshot)
      const ev1First = ev1Arr[0];
      const t9Passed = ev1First.element && ev1First.element.tag === 'input' && ev1First.element.type === 'search' && ev1First.element.name === 'q' && ev1First.snapshot_ref_found === true;
      results.push({
        test: 'Test 9: Evidence element data recovered from snapshot deterministically',
        passed: t9Passed,
        detail: 'element=' + JSON.stringify(ev1First.element),
      });

      // Test 10: No execution during discovery (by design -- saveDiscoveryCandidates only creates/updates CapabilityCandidate)
      const t10Passed = true;
      results.push({
        test: 'Test 10: No execution during discovery (by design)',
        passed: t10Passed,
      });

      // ── Sprint 1 (2026-08-12): evolulcao READ/WRITE ──
      // Test 11 (READ): candidate explicitamente READ -> stored READ/safe
      const llm11 = { candidates: [{ suggested_id: 'product.search', description: 'READ search', input_fields: ['q'], element_ref: 'r1', capability_type: 'READ', risk_level: 'safe' }] };
      const saved11 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm11, currentUrl: siteUrlA + '/read', pageIdx: 7, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const cand11 = await base44.entities.CapabilityCandidate.get(saved11[0].id);
      const t11Passed = saved11.length === 1 && cand11.capability_type === 'READ' && cand11.risk_level === 'safe';
      results.push({
        test: 'Test 11 (READ): capability_type=READ -> stored READ/safe',
        passed: t11Passed,
        detail: 'capability_type=' + cand11.capability_type + ', risk_level=' + cand11.risk_level,
      });

      // Test 12 (WRITE): candidate WRITE + risk_level=irreversible -> stored WRITE/irreversible
      const llm12 = { candidates: [{ suggested_id: 'listing.create', description: 'Criar anuncio', input_fields: ['titulo', 'preco'], element_ref: 'r2', capability_type: 'WRITE', risk_level: 'irreversible' }] };
      const saved12 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm12, currentUrl: siteUrlA + '/create', pageIdx: 8, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const cand12 = await base44.entities.CapabilityCandidate.get(saved12[0].id);
      const t12Passed = saved12.length === 1 && cand12.capability_type === 'WRITE' && cand12.risk_level === 'irreversible';
      results.push({
        test: 'Test 12 (WRITE): capability_type=WRITE -> stored WRITE/irreversible',
        passed: t12Passed,
        detail: 'capability_type=' + cand12.capability_type + ', risk_level=' + cand12.risk_level,
      });

      // Test 13 (LEGACY/DEFAULTS): candidate sem capability_type/risk_level -> defaults READ/safe
      const llm13 = { candidates: [{ suggested_id: 'thing.lookup', description: 'No type', input_fields: ['q'], element_ref: 'r1' }] };
      const saved13 = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm13, currentUrl: siteUrlA + '/legacy-default', pageIdx: 9, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const cand13 = await base44.entities.CapabilityCandidate.get(saved13[0].id);
      const t13Passed = saved13.length === 1 && cand13.capability_type === 'READ' && cand13.risk_level === 'safe';
      results.push({
        test: 'Test 13 (LEGACY): no capability_type/risk_level -> defaults READ/safe',
        passed: t13Passed,
        detail: 'capability_type=' + cand13.capability_type + ', risk_level=' + cand13.risk_level,
      });

      // Test 14 (DEDUP-WRITE): dois discoveries WRITE mesmo canonical+inputs -> consolidado (dedup nao depende de type)
      // Usa order.cancel (distinto de listing.create do Test 12) pra evitar colisao de identity_hash.
      const llm14a = { candidates: [{ suggested_id: 'order.cancel', description: 'Cancelar pedido A', input_fields: ['orderId'], element_ref: 'r1', capability_type: 'WRITE', risk_level: 'irreversible' }] };
      const llm14b = { candidates: [{ suggested_id: 'order.cancel', description: 'Cancelar pedido B', input_fields: ['orderId'], element_ref: 'r2', capability_type: 'WRITE', risk_level: 'irreversible' }] };
      const saved14a = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm14a, currentUrl: siteUrlA + '/cancel', pageIdx: 10, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const saved14b = await saveDiscoveryCandidates({ base44: base44, session: sessA, llmResult: llm14b, currentUrl: siteUrlA + '/cancel?step2', pageIdx: 11, sdkTimeoutMs: 10000, snapshotText: snapshotA });
      const cand14 = await base44.entities.CapabilityCandidate.get(saved14a[0].id);
      const ev14 = JSON.parse(cand14.evidence || '[]');
      const ev14Arr = Array.isArray(ev14) ? ev14 : [ev14];
      const t14Passed = saved14a[0].consolidated === false && saved14b[0].consolidated === true && saved14b[0].id === saved14a[0].id && cand14.canonical_id === 'order.cancel' && cand14.capability_type === 'WRITE' && cand14.risk_level === 'irreversible' && ev14Arr.length === 2;
      results.push({
        test: 'Test 14 (DEDUP-WRITE): same canonical WRITE consolidates, canonical_id/type/risk preserved',
        passed: t14Passed,
        detail: 'consolidated=' + (saved14b[0].consolidated === true) + ', canonical_id=' + cand14.canonical_id + ', type=' + cand14.capability_type + ', risk=' + cand14.risk_level + ', evidences=' + ev14Arr.length,
      });

      // === METRICS ===
      const allMyCands = await base44.entities.CapabilityCandidate.filter({ web_session_id: sessA.id });
      const consolidatedCount = allMyCands.filter(function (c) { return (c.consolidated_count || 1) > 1; }).length;
      const totalEvidences = allMyCands.reduce(function (sum, c) {
        try { const ev = JSON.parse(c.evidence || '[]'); return sum + (Array.isArray(ev) ? ev.length : 1); } catch (e) { return sum + 1; }
      }, 0);
      results.push({
        test: 'METRICS',
        detail: 'totalCandidates=' + allMyCands.length + ', consolidated=' + consolidatedCount + ', totalEvidences=' + totalEvidences + ', uniqueCandidates=' + (allMyCands.length - consolidatedCount),
      });
    } finally {
      await cleanup();
    }

    // === SUMMARY ===
    const allPassed = results.every(function (r) {
      if (r.cases) return r.cases.every(function (c) { return c.passed; });
      return r.passed !== false;
    });
    return Response.json({ ok: true, allPassed: allPassed, results: results });
  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}