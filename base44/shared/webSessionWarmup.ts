/**
 * webSessionWarmup — Aquecimento de sessao para sites com tokens OAuth de
 * vida curta (ex: Bling). O problema: alguns SPAs guardam o access token em
 * cookie com TTL de poucos minutos; o refresh so acontece quando o proprio
 * SPA faz uma chamada de API ativa. Se injetarmos cookies e navegarmos
 * passivamente, o SPA valida o access token (ja expirado) e redireciona
 * pra /login — falsa "sessao expirada".
 *
 * Solucao: apos injetar cookies e navegar, esperar o SPA "aquecer":
 *   1. waitUntil load + networkidle (ja existente)
 *   2. esperar mais 3s para o SPA disparar chamadas de API de bootstrap
 *      (essas chamadas usam o refresh token automaticamente e gravam o
 *      novo access token no cookie store do context)
 *   3. re-capturar os cookies do context (agora com o access token fresco)
 *   4. persistir os cookies atualizados na WebSession (proximo uso ja pega
 *      o token renovado, estendendo a vida util da sessao)
 *
 * Se o SPA mesmo assim redirecionar pra /login, a sessao realmente expirou
 * (refresh token tambem invalido) e quem chamou deve pedir reautenticacao.
 *
 * Exportado como funcao pura que recebe os ingredientes (callMcp, cookies,
 * siteUrl, sessionId, base44) e retorna { ok, finalUrl, stillOnLogin,
 * refreshedCookies }. Quem chama decide o que fazer com o resultado.
 */
export interface WarmupResult {
  ok: boolean;
  finalUrl: string;
  stillOnLogin: boolean;
  refreshedCookies: any[] | null;
  error?: string;
}

export async function warmupSession(opts: {
  callMcp: (op: string, args: any) => Promise<any>;
  cookies: any[];
  siteUrl: string;
  base44: any;
  sessionId: string;
  stealthScript?: string;
}): Promise<WarmupResult> {
  const { callMcp, cookies, siteUrl, base44, sessionId, stealthScript } = opts;
  const escapedCookies = JSON.stringify(cookies);
  const escapedUrl = JSON.stringify(siteUrl);
  const stealthLine = stealthScript
    ? 'await page.context().addInitScript(() => {' + stealthScript + '});'
    : '';

  let result: any = null;
  try {
    const code = 'async (page) => {' +
      '  ' + stealthLine +
      '  await page.context().addCookies(' + escapedCookies + ');' +
      '  await page.goto(' + escapedUrl + ', { waitUntil: "load", timeout: 15000 }).catch(() => {});' +
      '  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});' +
      '  await new Promise((r) => setTimeout(r, 3000));' +
      '  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});' +
      '  const finalUrl = page.url();' +
      '  const stillHasPass = await page.$("input[type=password]");' +
      '  const freshCookies = await page.context().cookies();' +
      '  return JSON.stringify({ url: finalUrl, stillHasPassword: !!stillHasPass, cookies: freshCookies });' +
      '}';
    const res = await callMcp('browser_run_code_unsafe', { code });
    const text = (res?.content?.[0]?.text ?? res?.text ?? JSON.stringify(res ?? '')).toString();
    const m = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, text];
    let parsed = JSON.parse((m[1] || text).trim());
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    result = parsed;
  } catch (e: any) {
    return { ok: false, finalUrl: '', stillOnLogin: false, refreshedCookies: null, error: 'warmup_failed: ' + (e?.message || String(e)) };
  }

  if (!result || !result.url) {
    return { ok: false, finalUrl: '', stillOnLogin: false, refreshedCookies: null, error: 'warmup_empty_result' };
  }

  const stillOnLogin = /\/login/i.test(result.url) || result.stillHasPassword === true;
  const refreshedCookies = Array.isArray(result.cookies) ? result.cookies : null;

  // Persiste os cookies renovados (best-effort) — estende a vida util da
  // sessao para o proximo uso. So persiste se o warmup nao caiu em /login.
  if (!stillOnLogin && refreshedCookies && refreshedCookies.length > 0) {
    try {
      await base44.entities.WebSession.update(sessionId, {
        cookies: JSON.stringify(refreshedCookies),
        last_used_at: new Date().toISOString(),
      });
    } catch (e) { /* best-effort: nao bloqueia a operacao principal */ }
  }

  return { ok: true, finalUrl: result.url, stillOnLogin, refreshedCookies };
}