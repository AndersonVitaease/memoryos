/**
 * maxunRun — unico ponto backend que conversa com a Run API oficial do Maxun.
 *
 * CONTRATO REAL (confirmado no fonte server/src/api/record.ts do Maxun):
 *   POST /api/robots/{robotId}/runs
 *     - header: x-api-key: <MAXUN_API_KEY>
 *     - body: { formats?, promptInstructions? }   (requestBody required: false)
 *     - A API PUBLICA ATUAL NAO ACEITA `inputs`/`originUrl` em runtime — o
 *       robot roda com o `originUrl` gravado. `inputParameters` na listagem
 *       de robots e apenas metadata (originUrl com defaultValue fixo).
 *     - O POST e SINCRONO: o servidor chama waitForRunCompletion(runId)
 *       (poll interno 2s, max 3h) e so responde quando a run termina.
 *   GET /api/robots/{robotId}/runs/{runId}
 *     - retorna a run individual (mesmo shape).
 *
 * Statuses terminais (Run.status): 'success' | 'failed' | 'aborted' | 'aborting'.
 * Nao-terminal: 'running' | 'pending' | 'queued'.
 *
 * DESVIO DO PLANO (reportado ao usuario): a funcao aceita `inputs` no contrato
 * para forward-compat, mas NAO os envia ao Maxun (a API atual os ignora).
 * Parametrizar a URL requer duplicar o robot (endpoint /duplicate) — fora do
 * escopo da Fase 7.1.
 *
 * SEGURANCA: MAXUN_API_KEY existe SOMENTE neste processo backend. Nunca e
 * logada, nunca aparece no ConnectorResult/resposta HTTP. Logs usam safeLog
 * que registra apenas stage/robotId/httpStatus/peek do CORPO da resposta
 * (sem headers/secrets).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MAXUN_BASE_URL = 'https://app.maxun.dev';
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 600000;
const MIN_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 3000;

const TERMINAL_SUCCESS = new Set(['success']);
const TERMINAL_FAILURE = new Set(['failed', 'aborted', 'aborting', 'error']);

function safeLog(label: string, obj: Record<string, unknown>) {
  try {
    console.log(label, JSON.stringify(obj).slice(0, 800));
  } catch {
    /* best-effort: nunca lanca */
  }
}

function normalizeRun(run: any) {
  const status = String((run && run.status) || '').toLowerCase();
  const runId = String((run && (run.runId || run.id)) || '');
  const data = run && run.data;
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  const extracted = !Array.isArray(data) && data && typeof data === 'object' ? data : null;
  return { status, runId, rows, extracted };
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

    const { robotId, inputs, timeoutMs } = body;

    // 1) Validar robotId
    if (typeof robotId !== 'string' || !robotId.trim()) {
      return Response.json({ ok: false, error: 'Missing required field: robotId' }, { status: 400 });
    }
    const cleanRobotId = robotId.trim();

    // 2) Validar inputs (opcional; se presente deve ser objeto de strings).
    //    NAO enviado ao Maxun (desvio do plano — ver cabecalho).
    if (inputs != null && (typeof inputs !== 'object' || Array.isArray(inputs))) {
      return Response.json({ ok: false, error: 'inputs must be an object of string values' }, { status: 400 });
    }

    // 3) Timeout configuravel com clamp
    const tMs = Math.min(
      Math.max(typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS),
      MAX_TIMEOUT_MS,
    );

    // 4) Ler a chave SOMENTE do ambiente seguro
    const apiKey = Deno.env.get('MAXUN_API_KEY');
    if (!apiKey) {
      safeLog('[maxunRun]', { stage: 'no_api_key' });
      return Response.json({ ok: false, error: 'MAXUN_API_KEY not configured', maxunStatus: 'not_configured' }, { status: 503 });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': apiKey, // nunca logado
    };

    // 5) POST /api/robots/{robotId}/runs  (body vazio — API real nao aceita inputs)
    const postUrl = `${MAXUN_BASE_URL}/api/robots/${encodeURIComponent(cleanRobotId)}/runs`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), tMs);
    let postRes: Response | null = null;
    let postStatus = 0;
    let postRaw = '';
    try {
      postRes = await fetch(postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      postStatus = postRes.status;
      postRaw = await postRes.text();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e && e.name === 'AbortError') {
        safeLog('[maxunRun]', { stage: 'post_timeout', robotId: cleanRobotId, timeoutMs: tMs });
        return Response.json(
          { ok: false, error: 'Execucao excedeu o limite configurado (timeout).', maxunStatus: 'timeout' },
          { status: 504 },
        );
      }
      safeLog('[maxunRun]', { stage: 'post_network_error', msg: String((e && e.message) || e).slice(0, 200) });
      return Response.json(
        { ok: false, error: 'Maxun unavailable (erro de rede).', maxunStatus: 'network_error' },
        { status: 502 },
      );
    }
    clearTimeout(timeoutId);

    // Log so do status + peek do CORPO (sem headers/sem key)
    safeLog('[maxunRun]', { stage: 'post_done', httpStatus: postStatus, bodyHead: postRaw.slice(0, 300) });

    // 6) Mapear erros HTTP
    if (postStatus === 401) {
      return Response.json(
        { ok: false, error: 'Maxun unauthorized — verifique a configuracao da credencial MAXUN_API_KEY.', maxunStatus: 'unauthorized' },
        { status: 401 },
      );
    }
    if (postStatus === 404) {
      return Response.json(
        { ok: false, error: 'Robot not found: ' + cleanRobotId, maxunStatus: 'not_found' },
        { status: 404 },
      );
    }
    if (postStatus >= 500) {
      let msg = 'Maxun server error.';
      try {
        const j = JSON.parse(postRaw);
        if (j && j.message) msg = j.message;
      } catch {
        /* mantem msg generica */
      }
      return Response.json({ ok: false, error: msg, maxunStatus: 'server_error' }, { status: 502 });
    }
    if (postStatus !== 200) {
      return Response.json(
        { ok: false, error: 'Unexpected Maxun response status: ' + postStatus, maxunStatus: 'unexpected_' + postStatus },
        { status: 502 },
      );
    }

    // 7) Parsear 200: { statusCode, messageCode, run: {...} }
    let parsed: any = null;
    try {
      parsed = JSON.parse(postRaw);
    } catch {
      return Response.json(
        { ok: false, error: 'Resposta do Maxun nao era JSON valido.', maxunStatus: 'parse_error' },
        { status: 502 },
      );
    }
    const run = (parsed && parsed.run) || null;
    if (!run) {
      return Response.json(
        { ok: false, error: 'Resposta do Maxun sem objeto run.', maxunStatus: 'no_run' },
        { status: 502 },
      );
    }
    let norm = normalizeRun(run);

    // 8) A API real e SINCRONA (run ja vem terminal). Defensivamente, se
    //    vier nao-terminal e tivermos runId, long-poll via GET /runs/{runId}.
    const deadline = Date.now() + tMs;
    if (norm.runId && !TERMINAL_SUCCESS.has(norm.status) && !TERMINAL_FAILURE.has(norm.status)) {
      safeLog('[maxunRun]', { stage: 'polling', runId: norm.runId, status: norm.status });
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const gController = new AbortController();
        const gTimeout = setTimeout(() => gController.abort(), 15000);
        let gRes: Response | null = null;
        let gRaw = '';
        try {
          gRes = await fetch(
            `${MAXUN_BASE_URL}/api/robots/${encodeURIComponent(cleanRobotId)}/runs/${encodeURIComponent(norm.runId)}`,
            { headers, signal: gController.signal },
          );
          gRaw = await gRes.text();
        } catch {
          clearTimeout(gTimeout);
          continue; // erro de rede/timeout individual: tenta no proximo ciclo
        }
        clearTimeout(gTimeout);
        if (gRes && gRes.status === 200) {
          let gParsed: any = null;
          try {
            gParsed = JSON.parse(gRaw);
          } catch {
            /* mantem norm anterior */
          }
          const gRun = (gParsed && gParsed.run) || null;
          if (gRun) norm = normalizeRun(gRun);
        }
        if (TERMINAL_SUCCESS.has(norm.status) || TERMINAL_FAILURE.has(norm.status)) break;
      }
      if (!TERMINAL_SUCCESS.has(norm.status) && !TERMINAL_FAILURE.has(norm.status)) {
        return Response.json(
          {
            ok: false,
            error: 'Execucao excedeu o limite configurado (timeout no polling).',
            runId: norm.runId,
            maxunStatus: 'timeout',
          },
          { status: 504 },
        );
      }
    }

    // 9) Normalizar resultado terminal
    if (TERMINAL_SUCCESS.has(norm.status)) {
      return Response.json({
        ok: true,
        runId: norm.runId,
        rows: norm.rows,
        extracted: norm.extracted,
        maxunStatus: norm.status,
      });
    }
    return Response.json(
      {
        ok: false,
        runId: norm.runId,
        error: 'A execucao do robot falhou no Maxun (status: ' + norm.status + ').',
        maxunStatus: norm.status,
      },
      { status: 502 },
    );
  } catch (e: any) {
    // NUNCA logar/expor a API key (ela nao entra neste escopo)
    safeLog('[maxunRun]', { stage: 'uncaught', msg: String((e && e.message) || e).slice(0, 300) });
    return Response.json({ ok: false, error: (e && e.message) || String(e) }, { status: 500 });
  }
}