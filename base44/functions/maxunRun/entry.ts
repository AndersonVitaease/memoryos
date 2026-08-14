/**
 * maxunRun — unico ponto backend que conversa com a Run API oficial do Maxun CLOUD.
 *
 * CONTRATO CLOUD (Fase 7.2 — confirmado via CLI oficial getmaxun/maxun-cli,
 *   src/lib/api.ts + src/commands/run.ts + skills/maxun/scripts/maxun.sh):
 *
 *   POST /api/sdk/robots/{robotId}/execute
 *     - header: x-api-key: <MAXUN_API_KEY>
 *     - header: Content-Type: application/json
 *     - body: {} ou { formats: ["markdown","html",...] }   (opcional — override
 *       de output formats do robot para esta run)
 *     - A API CLOUD NAO ACEITA `inputs`/`originUrl` em runtime — o robot roda
 *       com o `originUrl` gravado. O campo `inputs` e aceito pela funcao apenas
 *       para compatibilidade de assinatura (validado, mas NAO enviado ao Maxun).
 *     - O POST e SINCRONO: o servidor espera a run terminar (timeout ate 30min
 *       no CLI oficial) e so responde com o resultado final. Sem polling.
 *
 * Resposta (cloud):
 *   { data: { runId, status, data: { textData, listData, crawlData, searchData } } }
 *   (parser defensivo: tambem aceita shape flat { runId, status, data:{...} })
 *
 * Statuses terminais: 'success' | 'completed' | 'failed' | 'aborted' | ...
 *
 * SEGURANCA: MAXUN_API_KEY existe SOMENTE neste processo backend. Nunca e
 * logada, nunca aparece na resposta HTTP. Logs usam safeLog que registra
 * apenas stage/robotId/httpStatus/peek do CORPO da resposta (sem headers/secrets).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MAXUN_BASE_URL = 'https://app.maxun.dev';
const EXECUTE_PATH = (robotId: string) => `/api/sdk/robots/${encodeURIComponent(robotId)}/execute`;
const DEFAULT_TIMEOUT_MS = 300000; // 5 min — execute e sincrono e pode demorar
const MAX_TIMEOUT_MS = 600000;       // 10 min — teto
const MIN_TIMEOUT_MS = 5000;

const VALID_FORMATS = new Set([
  'markdown', 'html', 'text', 'links', 'summary',
  'screenshot-visible', 'screenshot-fullpage',
]);

const TERMINAL_SUCCESS = new Set(['success', 'completed']);

function safeLog(label: string, obj: Record<string, unknown>) {
  try {
    console.log(label, JSON.stringify(obj).slice(0, 800));
  } catch {
    /* best-effort: nunca lanca */
  }
}

/**
 * Normaliza a resposta do execute cloud. Defensivo contra:
 * data ausente, runId ausente, status ausente, textData/listData/crawlData/
 * searchData ausentes, e shape flat (sem envelope `data`).
 */
function normalizeExecuteResult(body: any) {
  const envelope = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const inner =
    envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
      ? envelope.data
      : envelope;
  const runId = String(inner.runId || envelope.runId || envelope.id || '');
  const status = String(inner.status || envelope.status || '').toLowerCase();
  const extracted =
    inner.data && typeof inner.data === 'object' && !Array.isArray(inner.data)
      ? inner.data
      : null;
  const pick = (k: string) => (extracted && extracted[k] !== undefined ? extracted[k] : null);
  return {
    runId,
    status,
    textData: pick('textData'),
    listData: pick('listData'),
    crawlData: pick('crawlData'),
    searchData: pick('searchData'),
  };
}

function tryParseMessage(raw: string): string | null {
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === 'object') return j.message || j.error || null;
  } catch { /* nao-JSON */ }
  return null;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { robotId, inputs, formats, timeoutMs } = body;

    // 1) Validar robotId
    if (typeof robotId !== 'string' || !robotId.trim()) {
      return Response.json({ ok: false, error: 'Missing required field: robotId' }, { status: 400 });
    }
    const cleanRobotId = robotId.trim();

    // 2) Validar inputs (aceito p/ compat de assinatura; NAO enviado ao Maxun cloud).
    if (inputs != null && (typeof inputs !== 'object' || Array.isArray(inputs))) {
      return Response.json({ ok: false, error: 'inputs must be an object of string values' }, { status: 400 });
    }

    // 3) formats opcional (override de output formats do robot para esta run).
    //    So repassa formatos reconhecidos pelo CLI oficial.
    const payload: Record<string, unknown> = {};
    if (Array.isArray(formats)) {
      const clean = formats
        .map((f: unknown) => (typeof f === 'string' ? f.trim() : ''))
        .filter((f: string) => f.length > 0 && VALID_FORMATS.has(f));
      if (clean.length > 0) payload.formats = clean;
    }

    // 4) Timeout configuravel com clamp
    const tMs = Math.min(
      Math.max(typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS),
      MAX_TIMEOUT_MS,
    );

    // 5) Ler a chave SOMENTE do ambiente seguro
    const apiKey = Deno.env.get('MAXUN_API_KEY');
    if (!apiKey) {
      safeLog('[maxunRun]', { stage: 'no_api_key' });
      return Response.json(
        { ok: false, error: 'MAXUN_API_KEY not configured', maxunStatus: 'not_configured' },
        { status: 503 },
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': apiKey, // nunca logado
    };

    // 6) POST /api/sdk/robots/{robotId}/execute (sincrono)
    const postUrl = MAXUN_BASE_URL + EXECUTE_PATH(cleanRobotId);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), tMs);
    let postRes: Response | null = null;
    let postStatus = 0;
    let postRaw = '';
    try {
      postRes = await fetch(postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      postStatus = postRes.status;
      postRaw = await postRes.text();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e && e.name === 'AbortError') {
        safeLog('[maxunRun]', { stage: 'execute_timeout', robotId: cleanRobotId, timeoutMs: tMs });
        return Response.json(
          { ok: false, error: 'Execucao excedeu o limite configurado (timeout).', maxunStatus: 'timeout' },
          { status: 504 },
        );
      }
      safeLog('[maxunRun]', { stage: 'execute_network_error', msg: String((e && e.message) || e).slice(0, 200) });
      return Response.json(
        { ok: false, error: 'Maxun unavailable (erro de rede).', maxunStatus: 'network_error' },
        { status: 502 },
      );
    }
    clearTimeout(timeoutId);

    // Log so do status + peek do CORPO (sem headers/sem key)
    safeLog('[maxunRun]', { stage: 'execute_done', httpStatus: postStatus, bodyHead: postRaw.slice(0, 300) });

    // 7) Mapear erros HTTP do cloud
    if (postStatus === 400) {
      const msg = tryParseMessage(postRaw) || 'Bad request.';
      return Response.json({ ok: false, error: String(msg), maxunStatus: 'bad_request' }, { status: 400 });
    }
    if (postStatus === 401) {
      return Response.json(
        { ok: false, error: 'Maxun unauthorized — verifique a configuracao da credencial MAXUN_API_KEY.', maxunStatus: 'unauthorized' },
        { status: 401 },
      );
    }
    if (postStatus === 402) {
      return Response.json(
        { ok: false, error: 'Creditos insuficientes no Maxun Cloud. Acesse https://app.maxun.dev para recargar.', maxunStatus: 'insufficient_credits' },
        { status: 402 },
      );
    }
    if (postStatus === 404) {
      const msg = tryParseMessage(postRaw) || 'Robot not found: ' + cleanRobotId;
      return Response.json({ ok: false, error: String(msg), maxunStatus: 'not_found' }, { status: 404 });
    }
    if (postStatus === 429) {
      return Response.json(
        { ok: false, error: 'Rate limit exceeded no Maxun Cloud. Tente novamente em instantes.', maxunStatus: 'rate_limited' },
        { status: 429 },
      );
    }
    if (postStatus >= 500) {
      const msg = tryParseMessage(postRaw) || 'Maxun server error.';
      // 500 com "Recording not found" = robot inexistente (autenticacao OK).
      const isNotFound = /not found/i.test(String(msg));
      return Response.json(
        { ok: false, error: String(msg), maxunStatus: isNotFound ? 'not_found' : 'server_error' },
        { status: 502 },
      );
    }
    if (postStatus !== 200) {
      return Response.json(
        { ok: false, error: 'Unexpected Maxun response status: ' + postStatus, maxunStatus: 'unexpected_' + postStatus },
        { status: 502 },
      );
    }

    // 8) Parsear 200
    let parsed: any = null;
    try {
      parsed = JSON.parse(postRaw);
    } catch {
      return Response.json(
        { ok: false, error: 'Resposta do Maxun nao era JSON valido.', maxunStatus: 'parse_error' },
        { status: 502 },
      );
    }
    const norm = normalizeExecuteResult(parsed);
    if (!norm.runId && !norm.status) {
      return Response.json(
        { ok: false, error: 'Resposta do Maxun sem runId/status.', maxunStatus: 'no_run' },
        { status: 502 },
      );
    }

    // 9) Resultado terminal (execute e sincrono — sem polling)
    return Response.json({
      ok: TERMINAL_SUCCESS.has(norm.status),
      runId: norm.runId,
      status: norm.status,
      textData: norm.textData,
      listData: norm.listData,
      crawlData: norm.crawlData,
      searchData: norm.searchData,
      maxunStatus: norm.status,
    });
  } catch (e: any) {
    // NUNCA logar/expor a API key (ela nao entra neste escopo)
    safeLog('[maxunRun]', { stage: 'uncaught', msg: String((e && e.message) || e).slice(0, 300) });
    return Response.json({ ok: false, error: (e && e.message) || String(e) }, { status: 500 });
  }
}