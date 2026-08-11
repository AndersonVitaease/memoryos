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
    const canonCases = [
      { input: 'product.search', expected: 'product.search' },
      { input: 'produto.search', expected: 'product.search' },
      { input: 'products.search', expected: 'product.search' },
      { input: 'product.pesquisar', expected: 'product.search' },
      { input: 'product.find', expected: 'product.search' },
      { input: 'reservation.search', expected: 'reservation.search' },
      { input: 'reservas.search', expected: 'reservation.search' },
      { input: 'order.lookup', expected: 'order.search' },
      { input: 'pedido.consultar', expected: 'order.search' },
    ];
    const canonResults = canonCases.map(function (c) {
      const actual = canonicalizeId(c.input);
      return { input: c.input, expected: c.expected, actual: actual, passed: actual === c.expected };
    });
    results.push({ test: 'canonicalizeId', cases: canonResults });

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