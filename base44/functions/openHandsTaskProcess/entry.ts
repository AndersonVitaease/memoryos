/**
 * openHandsTaskProcess — Backend function
 *
 * Integra MemoryOS -> OpenHands Cloud usando somente REST.
 * Fluxo certificado em 2026-08-20:
 *   1) POST /api/v1/app-conversations                  (Cloud API)
 *   2) GET  /api/v1/app-conversations/start-tasks     (quando necessario)
 *   3) GET  /api/v1/app-conversations?ids=<id>        (polling ate terminal)
 *   4) GET  /api/v1/conversation/{id}/events/search   (Cloud API V1, REST)
 *   5) ultimo MessageEvent source="agent" -> llm_message.content[].text
 *
 * Seguranca:
 *   - OPENHANDS_API_KEY existe somente no backend e autentica todos os
 *     requests via header X-Access-Token.
 *   - Nao depende de conversation_url nem session_api_key.
 *   - nenhum prompt, resposta completa ou credencial e escrito em log.
 *   - nenhum prompt, resposta completa ou credencial e escrito em log.
 *   - nenhuma entidade nova e criada por esta funcao.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CLOUD_BASE_URL = 'https://app.all-hands.dev';
const START_PATH = '/api/v1/app-conversations';
const START_TASK_PATH = '/api/v1/app-conversations/start-tasks';
const CONVERSATION_PATH = '/api/v1/app-conversations';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;
const EVENT_LIMIT = 100;

const TERMINAL_EXECUTION_STATUSES = new Set([
  'finished',
  'error',
  'stuck',
  'waiting_for_confirmation',
]);

function safeLog(stage: string, data: Record<string, unknown> = {}) {
  try {
    console.log('[openHandsTaskProcess]', JSON.stringify({ stage, ...data }).slice(0, 900));
  } catch {
    // best-effort only
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampTimeout(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(n), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function cloudHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // Certificado no ambiente Cloud do usuario em 2026-08-20.
    'X-Access-Token': apiKey,
  };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const raw = await res.text();
    let data: any = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data, raw };
  } finally {
    clearTimeout(tid);
  }
}

function firstRecord(value: any): any | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (value && Array.isArray(value.items)) return value.items[0] ?? null;
  if (value && typeof value === 'object') return value;
  return null;
}

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function extractAgentReply(eventsPayload: any): { text: string; eventId: string | null; timestamp: string | null } {
  const items = Array.isArray(eventsPayload?.items)
    ? eventsPayload.items
    : Array.isArray(eventsPayload)
      ? eventsPayload
      : [];

  const candidates = items
    .filter((event: any) => event?.kind === 'MessageEvent' && event?.source === 'agent')
    .sort((a: any, b: any) => {
      const at = Date.parse(String(a?.timestamp ?? '')) || 0;
      const bt = Date.parse(String(b?.timestamp ?? '')) || 0;
      return at - bt;
    });

  const last = candidates[candidates.length - 1];
  if (!last) return { text: '', eventId: null, timestamp: null };

  const content = Array.isArray(last?.llm_message?.content) ? last.llm_message.content : [];
  const text = content
    .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim();

  return {
    text,
    eventId: typeof last?.id === 'string' ? last.id : null,
    timestamp: typeof last?.timestamp === 'string' ? last.timestamp : null,
  };
}

// Fallback: a MessageEvent source="agent" consolidada e eventualmente consistente
// (pode demorar 30s+ apos "finished"). Os StreamingDeltaEvent source="agent"
// contem o mesmo texto em fragments (campo content string) e sao imediatamente
// disponiveis. Ordenados por timestamp, concatenam a resposta completa do agente.
function extractAgentReplyFromStreaming(eventsPayload: any): { text: string; eventCount: number } {
  const items = Array.isArray(eventsPayload?.items)
    ? eventsPayload.items
    : Array.isArray(eventsPayload)
      ? eventsPayload
      : [];

  const deltas = items
    .filter((e: any) => e?.kind === 'StreamingDeltaEvent' && e?.source === 'agent')
    .sort((a: any, b: any) => {
      const at = Date.parse(String(a?.timestamp ?? '')) || 0;
      const bt = Date.parse(String(b?.timestamp ?? '')) || 0;
      return at - bt;
    });

  const text = deltas
    .map((e: any) => (typeof e?.content === 'string' ? e.content : ''))
    .join('')
    .trim();

  return { text, eventCount: deltas.length };
}

function buildAgentEventsUrl(conversationUrl: string, conversationId: string): string {
  const base = conversationUrl.replace(/\/+$/g, '');
  if (/\/api\/conversations\/[^/]+$/i.test(base) || /\/conversations\/[^/]+$/i.test(base)) {
    return `${base}/events`;
  }
  return `${base}/api/conversations/${encodeURIComponent(conversationId)}/events`;
}

async function fetchAllEvents(
  baseUrl: string,
  conversationId: string,
  apiKey: string,
  deadlineAt: number,
): Promise<{ events: any[]; pages: number; httpStatus: number | null; error: string | null }> {
  const MAX_PAGES = 20;
  const MAX_EVENTS = 2000;
  const events: any[] = [];
  let nextPageId: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES && events.length < MAX_EVENTS) {
    let url =
      `${baseUrl}/api/v1/conversation/${encodeURIComponent(conversationId)}` +
      `/events/search?limit=${EVENT_LIMIT}&sort_order=TIMESTAMP`;
    if (nextPageId) url += `&page_id=${encodeURIComponent(nextPageId)}`;

    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) return { events, pages, httpStatus: null, error: 'Timeout retrieving events' };

    const res = await fetchJson(
      url,
      { method: 'GET', headers: { Accept: 'application/json', 'X-Access-Token': apiKey } },
      Math.min(60_000, Math.max(1, remaining)),
    );
    if (!res.ok) return { events, pages, httpStatus: res.status, error: `OpenHands events retrieval failed (HTTP ${res.status})` };

    const pageItems = Array.isArray(res.data?.items) ? res.data.items : [];
    events.push(...pageItems);
    const nextId = res.data?.next_page_id;
    nextPageId = typeof nextId === 'string' && nextId.trim() ? nextId.trim() : null;
    pages++;
    if (!nextPageId) break;
  }
  return { events, pages, httpStatus: null, error: null };
}

// ── Change extraction (write mode only, read-only Cloud API) ─────────────────
//
// Após execution_status=finished em modo write, consulta tres endpoints
// read-only do OpenHands Cloud API para recuperar as alteracoes produzidas
// no sandbox:
//   GET /api/v1/app-conversations/{id}/git/changes  — arquivos alterados
//   GET /api/v1/app-conversations/{id}/git/diff      — diff completo
//   GET /api/v1/app-conversations/{id}/file?path=<p> — conteudo novo
//
// Nenhum write e despachado. O change_set sera validado e convertido em
// patch proposals pelo frontend (OpenHandsChangeSet module).

function normalizeGitChanges(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.changes)) return data.changes;
  if (data && Array.isArray(data.files)) return data.files;
  return [];
}

function normalizeGitDiff(data: any): string {
  if (typeof data === 'string') return data;
  if (data && typeof data.diff === 'string') return data.diff;
  if (data && typeof data.content === 'string') return data.content;
  if (data && typeof data.text === 'string') return data.text;
  return '';
}

function normalizeFileContent(data: any): string | null {
  if (typeof data === 'string') return data;
  if (data && typeof data.content === 'string') return data.content;
  if (data && typeof data.text === 'string') return data.text;
  if (data && typeof data.fileContent === 'string') return data.fileContent;
  return null;
}

function normalizeChangeType(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'modified' || s === 'm' || s === 'changed') return 'modified';
  if (s === 'added' || s === 'a' || s === 'created' || s === 'new' || s === 'untracked') return 'created';
  if (s === 'deleted' || s === 'd' || s === 'removed') return 'deleted';
  if (s === 'renamed' || s === 'r') return 'renamed';
  return 'unknown';
}

async function extractChangeSet(
  conversationId: string,
  sandboxId: string | null,
  repository: string,
  apiKey: string,
  deadlineAt: number,
): Promise<any> {
  const headers = cloudHeaders(apiKey);
  const base = `${CLOUD_BASE_URL}/api/v1/app-conversations/${encodeURIComponent(conversationId)}`;
  const MAX_FILES_TO_FETCH = 50;

  // 1) git/changes — lista de arquivos alterados no sandbox
  let changedFiles: any[] = [];
  try {
    const changesRes = await fetchJson(
      `${base}/git/changes`,
      { method: 'GET', headers },
      Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (changesRes.ok) {
      changedFiles = normalizeGitChanges(changesRes.data);
    } else {
      safeLog('git_changes_failed', { httpStatus: changesRes.status, conversationId });
    }
  } catch {
    safeLog('git_changes_error', { conversationId });
  }

  // 2) git/diff — diff completo do working tree do sandbox
  let gitDiff = '';
  try {
    const diffRes = await fetchJson(
      `${base}/git/diff`,
      { method: 'GET', headers },
      Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (diffRes.ok) {
      gitDiff = normalizeGitDiff(diffRes.data);
    } else {
      safeLog('git_diff_failed', { httpStatus: diffRes.status, conversationId });
    }
  } catch {
    safeLog('git_diff_error', { conversationId });
  }

  // 3) file?path= — conteudo novo de cada arquivo modified/created (paralelo)
  const fileResults = await Promise.all(
    changedFiles.slice(0, MAX_FILES_TO_FETCH).map(async (cf: any) => {
      const path = String(cf.path ?? cf.file ?? cf.filePath ?? cf.filename ?? '').trim();
      if (!path) return null;
      const changeType = normalizeChangeType(cf.status ?? cf.changeType ?? cf.kind ?? cf.change_type);
      let newContent: string | null = null;

      if (changeType === 'modified' || changeType === 'created') {
        try {
          const fileRes = await fetchJson(
            `${base}/file?path=${encodeURIComponent(path)}`,
            { method: 'GET', headers },
            Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
          );
          if (fileRes.ok) {
            newContent = normalizeFileContent(fileRes.data);
          }
        } catch {
          // best-effort — newContent fica null
        }
      }

      return { path, changeType, newContent };
    }),
  );

  const files = fileResults.filter(
    (f): f is { path: string; changeType: string; newContent: string | null } => f !== null,
  );

  return {
    conversation_id: conversationId,
    sandbox_id: sandboxId,
    repository,
    git_diff: gitDiff,
    files,
  };
}

async function continueExistingConversation(opts: {
  conversationId: string;
  task: string;
  mode: 'read' | 'write';
  apiKey: string;
  deadlineAt: number;
}): Promise<Response> {
  const { conversationId, task, mode, apiKey, deadlineAt } = opts;
  const headers = cloudHeaders(apiKey);

  const baseline = await fetchAllEvents(CLOUD_BASE_URL, conversationId, apiKey, deadlineAt);
  if (baseline.error) {
    return Response.json({ ok: false, app_conversation_id: conversationId, error: baseline.error, openhandsStatus: 'continuation_baseline_failed' }, { status: baseline.httpStatus === 401 ? 401 : 502 });
  }
  const baselineReply = extractAgentReply({ items: baseline.events });

  const convRes = await fetchJson(
    `${CLOUD_BASE_URL}${CONVERSATION_PATH}?ids=${encodeURIComponent(conversationId)}`,
    { method: 'GET', headers },
    Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
  );
  if (!convRes.ok) {
    return Response.json({ ok: false, app_conversation_id: conversationId, error: `OpenHands conversation lookup failed (HTTP ${convRes.status})`, openhandsStatus: 'continuation_lookup_failed' }, { status: convRes.status === 401 ? 401 : 502 });
  }

  let conversation = firstRecord(convRes.data);
  if (!conversation) {
    return Response.json({ ok: false, app_conversation_id: conversationId, error: 'OpenHands conversation not found', openhandsStatus: 'continuation_not_found' }, { status: 404 });
  }

  const sandboxId = String(conversation?.sandbox_id ?? '').trim();
  let sandboxStatus = normalizeStatus(conversation?.sandbox_status);
  if ((sandboxStatus === 'paused' || sandboxStatus === 'stopped') && sandboxId) {
    const resumeRes = await fetchJson(
      `${CLOUD_BASE_URL}/api/v1/sandboxes/${encodeURIComponent(sandboxId)}/resume`,
      { method: 'POST', headers, body: '{}' },
      Math.min(60_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (!resumeRes.ok) {
      return Response.json({ ok: false, app_conversation_id: conversationId, error: `OpenHands sandbox resume failed (HTTP ${resumeRes.status})`, openhandsStatus: 'continuation_resume_failed' }, { status: 502 });
    }

    while (Date.now() < deadlineAt) {
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
      const poll = await fetchJson(
        `${CLOUD_BASE_URL}${CONVERSATION_PATH}?ids=${encodeURIComponent(conversationId)}`,
        { method: 'GET', headers },
        Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
      );
      if (!poll.ok) continue;
      conversation = firstRecord(poll.data) ?? conversation;
      sandboxStatus = normalizeStatus(conversation?.sandbox_status);
      if (sandboxStatus === 'running' || sandboxStatus === 'ready') break;
      if (sandboxStatus === 'error' || sandboxStatus === 'missing') {
        return Response.json({ ok: false, app_conversation_id: conversationId, error: `OpenHands sandbox status: ${sandboxStatus}`, openhandsStatus: 'continuation_sandbox_failed' }, { status: 502 });
      }
    }
  }

  const conversationUrl = String(conversation?.conversation_url ?? '').trim();
  const sessionApiKey = String(conversation?.session_api_key ?? '').trim();
  if (!conversationUrl || !sessionApiKey) {
    return Response.json({ ok: false, app_conversation_id: conversationId, error: 'OpenHands continuation metadata missing conversation_url/session_api_key', openhandsStatus: 'continuation_metadata_missing' }, { status: 502 });
  }

  const followUpText = mode === 'read'
    ? `${task}\n\n---\nIMPORTANT: Continue in read-only mode. Do NOT modify, create, or delete any files. Do NOT create commits or push. Do NOT run destructive commands. Only inspect and report what is asked.`
    : task;

  const sendRes = await fetchJson(
    buildAgentEventsUrl(conversationUrl, conversationId),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Session-API-Key': sessionApiKey,
      },
      body: JSON.stringify({
        role: 'user',
        content: [{ type: 'text', text: followUpText }],
        run: true,
      }),
    },
    Math.min(60_000, Math.max(1, deadlineAt - Date.now())),
  );
  if (!sendRes.ok) {
    safeLog('continuation_send_failed', { conversationId, httpStatus: sendRes.status });
    return Response.json({ ok: false, app_conversation_id: conversationId, error: `OpenHands continuation message failed (HTTP ${sendRes.status})`, openhandsStatus: 'continuation_send_failed' }, { status: sendRes.status === 401 ? 401 : 502 });
  }

  safeLog('continuation_sent', { conversationId, baselineEventCount: baseline.events.length });

  let executionStatus = '';
  let latestEvents: any[] = baseline.events;
  let latestReply = baselineReply;
  while (Date.now() < deadlineAt) {
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));

    const statusRes = await fetchJson(
      `${CLOUD_BASE_URL}${CONVERSATION_PATH}?ids=${encodeURIComponent(conversationId)}`,
      { method: 'GET', headers },
      Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (statusRes.ok) {
      conversation = firstRecord(statusRes.data) ?? conversation;
      executionStatus = normalizeStatus(conversation?.execution_status);
      if (executionStatus === 'error' || executionStatus === 'stuck') {
        return Response.json({ ok: false, app_conversation_id: conversationId, execution_status: executionStatus, error: `OpenHands continuation ended with status: ${executionStatus}`, openhandsStatus: 'continuation_execution_failed' }, { status: 502 });
      }
    }

    const eventRes = await fetchAllEvents(CLOUD_BASE_URL, conversationId, apiKey, deadlineAt);
    if (!eventRes.error) {
      latestEvents = eventRes.events;
      latestReply = extractAgentReply({ items: latestEvents });
      const hasNewReply = Boolean(latestReply.text) && latestReply.eventId !== baselineReply.eventId;
      if (hasNewReply && TERMINAL_EXECUTION_STATUSES.has(executionStatus)) {
        // Change extraction for write mode continuations (same as main flow).
        let continuationChangeSet: any = null;
        if (mode === 'write' && executionStatus === 'finished') {
          continuationChangeSet = await extractChangeSet(
            conversationId,
            conversation?.sandbox_id ?? null,
            String(conversation?.selected_repository ?? ''),
            apiKey,
            deadlineAt,
          );
          safeLog('continuation_change_set', {
            conversationId,
            fileCount: continuationChangeSet?.files?.length ?? 0,
          });
        }
        safeLog('continuation_complete', { conversationId, executionStatus, eventCount: latestEvents.length });
        return Response.json({
          ok: executionStatus === 'finished',
          continued: true,
          app_conversation_id: conversationId,
          repository: conversation?.selected_repository ?? null,
          mode,
          execution_status: executionStatus,
          sandbox_id: conversation?.sandbox_id ?? null,
          agent_reply_text: latestReply.text,
          agent_message_event_id: latestReply.eventId,
          agent_message_timestamp: latestReply.timestamp,
          event_count: latestEvents.length,
          change_set: continuationChangeSet,
        });
      }
    }
  }

  return Response.json({ ok: false, app_conversation_id: conversationId, execution_status: executionStatus || 'unknown', event_count: latestEvents.length, error: 'Timeout waiting for OpenHands continuation reply', openhandsStatus: 'continuation_timeout' }, { status: 504 });
}

export default async function (req: Request) {
  const startedAt = Date.now();

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

    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const repository = typeof body.repository === 'string' ? body.repository.trim() : '';
    const existingConversationId = typeof body.app_conversation_id === 'string' ? body.app_conversation_id.trim() : '';
    const mode: 'read' | 'write' = body.mode === 'write' ? 'write' : 'read';
    const includeRawEvents = body.includeRawEvents === true;
    const timeoutMs = clampTimeout(body.timeoutMs);

    if (!task) {
      return Response.json({ ok: false, error: 'Missing required field: task' }, { status: 400 });
    }
    if (!existingConversationId && !repository) {
      return Response.json({ ok: false, error: 'Missing required field: repository' }, { status: 400 });
    }
    if (task.length > 30_000) {
      return Response.json({ ok: false, error: 'task exceeds 30000 characters' }, { status: 400 });
    }
    if (repository && (repository.length > 300 || !repository.includes('/'))) {
      return Response.json({ ok: false, error: 'repository must be in owner/repo form' }, { status: 400 });
    }

    const apiKey = Deno.env.get('OPENHANDS_API_KEY');
    if (!apiKey) {
      safeLog('not_configured');
      return Response.json({ ok: false, error: 'OPENHANDS_API_KEY not configured' }, { status: 503 });
    }

    const deadlineAt = Date.now() + timeoutMs;
    const headers = cloudHeaders(apiKey);

    // Continuacao: reutiliza a MESMA conversation/workspace OpenHands. O envio
    // ocorre pelo Agent Server oficial (POST /api/conversations/{id}/events,
    // SendMessageRequest {role, content, run:true}) autenticado com a
    // session_api_key efemera via X-Session-API-Key. O historico/resposta final
    // continua sendo lido pela Cloud API V1 com X-Access-Token.
    if (existingConversationId) {
      return continueExistingConversation({
        conversationId: existingConversationId,
        task,
        mode,
        apiKey,
        deadlineAt,
      });
    }

    // 1) Criar task/conversation no OpenHands Cloud V1.
    const createRes = await fetchJson(
      CLOUD_BASE_URL + START_PATH,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          initial_message: {
            // read mode: injeta instrucao explicita de somente leitura preservando
            // a task original do usuario (acrescenta, nao reescreve).
            content: [{
              type: 'text',
              text: mode === 'read'
                ? `${task}\n\n---\nIMPORTANT: Read-only mode. Do NOT modify, create, or delete any files. Do NOT create commits or push. Do NOT run destructive commands. Only inspect and report what is asked.`
                : task,
            }],
          },
          selected_repository: repository,
        }),
      },
      Math.min(60_000, Math.max(1, deadlineAt - Date.now())),
    );

    if (!createRes.ok) {
      safeLog('create_failed', { httpStatus: createRes.status });
      return Response.json(
        {
          ok: false,
          error: createRes.data?.detail || createRes.data?.message || `OpenHands create failed (HTTP ${createRes.status})`,
          openhandsStatus: 'create_failed',
        },
        { status: createRes.status === 401 ? 401 : 502 },
      );
    }

    const startTask = firstRecord(createRes.data) ?? {};
    const startTaskId = String(startTask.id ?? '').trim();
    let conversationId = String(startTask.app_conversation_id ?? startTask.conversation_id ?? '').trim();

    safeLog('create_ok', {
      startTaskId: startTaskId || null,
      conversationId: conversationId || null,
      startStatus: startTask.status ?? null,
    });

    // 2) A API V1 pode retornar apenas um start-task inicialmente.
    while (!conversationId) {
      if (!startTaskId) {
        return Response.json(
          { ok: false, error: 'OpenHands create response missing start task id/conversation id', openhandsStatus: 'invalid_create_response' },
          { status: 502 },
        );
      }
      if (Date.now() >= deadlineAt) {
        return Response.json({ ok: false, error: 'Timeout waiting for OpenHands conversation creation', openhandsStatus: 'timeout' }, { status: 504 });
      }

      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
      const startPoll = await fetchJson(
        `${CLOUD_BASE_URL}${START_TASK_PATH}?ids=${encodeURIComponent(startTaskId)}`,
        { method: 'GET', headers },
        Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
      );
      if (!startPoll.ok) {
        safeLog('start_task_poll_failed', { httpStatus: startPoll.status, startTaskId });
        return Response.json(
          { ok: false, error: `OpenHands start-task polling failed (HTTP ${startPoll.status})`, openhandsStatus: 'start_poll_failed' },
          { status: 502 },
        );
      }
      const rec = firstRecord(startPoll.data);
      const status = normalizeStatus(rec?.status);
      conversationId = String(rec?.app_conversation_id ?? rec?.conversation_id ?? '').trim();
      if (status === 'error' || status === 'failed') {
        return Response.json(
          { ok: false, error: 'OpenHands failed while creating the conversation', openhandsStatus: status },
          { status: 502 },
        );
      }
    }

    // 3) Polling da conversation ate status terminal. A resposta tambem fornece
    // conversation_url + session_api_key necessarios para o Agent Server.
    let conversation: any = null;
    let executionStatus = '';
    while (!TERMINAL_EXECUTION_STATUSES.has(executionStatus)) {
      if (Date.now() >= deadlineAt) {
        return Response.json(
          { ok: false, app_conversation_id: conversationId, execution_status: executionStatus || 'unknown', error: 'Timeout waiting for OpenHands execution', openhandsStatus: 'timeout' },
          { status: 504 },
        );
      }

      const convRes = await fetchJson(
        `${CLOUD_BASE_URL}${CONVERSATION_PATH}?ids=${encodeURIComponent(conversationId)}`,
        { method: 'GET', headers },
        Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
      );
      if (!convRes.ok) {
        safeLog('conversation_poll_failed', { httpStatus: convRes.status, conversationId });
        return Response.json(
          { ok: false, app_conversation_id: conversationId, error: `OpenHands conversation polling failed (HTTP ${convRes.status})`, openhandsStatus: 'conversation_poll_failed' },
          { status: 502 },
        );
      }

      conversation = firstRecord(convRes.data);
      if (!conversation) {
        await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
        continue;
      }

      const sandboxStatus = normalizeStatus(conversation.sandbox_status);
      executionStatus = normalizeStatus(conversation.execution_status);

      if (sandboxStatus === 'error' || sandboxStatus === 'missing') {
        return Response.json(
          { ok: false, app_conversation_id: conversationId, execution_status: executionStatus || 'unknown', error: `OpenHands sandbox status: ${sandboxStatus}`, openhandsStatus: 'sandbox_failed' },
          { status: 502 },
        );
      }

      if (!TERMINAL_EXECUTION_STATUSES.has(executionStatus)) {
        await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
      }
    }

    // Estado terminal de erro: retornar imediatamente antes de recuperar eventos.
    if (executionStatus === 'error' || executionStatus === 'stuck') {
      safeLog('execution_failed', { conversationId, executionStatus });
      return Response.json(
        {
          ok: false,
          app_conversation_id: conversationId,
          execution_status: executionStatus,
          error: `OpenHands execution ended with status: ${executionStatus}`,
          openhandsStatus: 'execution_failed',
        },
        { status: 502 },
      );
    }

    // 4) Recuperar eventos da Cloud API V1 via REST. Usa a mesma chave
    // persistente (OPENHANDS_API_KEY / X-Access-Token). Nao depende de
    // conversation_url nem session_api_key. A MessageEvent source="agent"
    // consolidada e eventualmente consistente — pode aparecer alguns segundos
    // apos o status "finished". Retry curto com limite defensivo.
    const EVENTS_RETRY_COUNT = 15;
    const EVENTS_RETRY_DELAY_MS = 3_000;
    let allEvents: any[] = [];
    let pageCount = 0;
    let agentReply = { text: '', eventId: null as string | null, timestamp: null as string | null };

    for (let attempt = 0; attempt < EVENTS_RETRY_COUNT; attempt++) {
      const result = await fetchAllEvents(CLOUD_BASE_URL, conversationId, apiKey, deadlineAt);
      if (result.error) {
        safeLog('events_failed', { httpStatus: result.httpStatus, conversationId, page: result.pages });
        return Response.json(
          {
            ok: false,
            app_conversation_id: conversationId,
            execution_status: executionStatus,
            error: result.error,
            openhandsStatus: 'events_failed',
          },
          { status: result.httpStatus === 401 ? 401 : 502 },
        );
      }
      allEvents = result.events;
      pageCount = result.pages;

      agentReply = extractAgentReply({ items: allEvents });
      if (agentReply.text) break;

      safeLog('agent_reply_retry', { conversationId, attempt, eventCount: allEvents.length });
      if (attempt < EVENTS_RETRY_COUNT - 1) {
        const remaining = deadlineAt - Date.now();
        if (remaining <= EVENTS_RETRY_DELAY_MS) break;
        await sleep(EVENTS_RETRY_DELAY_MS);
      }
    }

    // Fallback: se a MessageEvent consolidada nao apareceu apos os retries,
    // ensamblar a resposta dos StreamingDeltaEvent source="agent" (imediata-
    // mente disponiveis, mesmo texto em fragments via campo content).
    if (!agentReply.text) {
      const streamingReply = extractAgentReplyFromStreaming({ items: allEvents });
      if (streamingReply.text) {
        safeLog('agent_reply_from_streaming', { conversationId, eventCount: allEvents.length, streamingEventCount: streamingReply.eventCount });
        agentReply = { text: streamingReply.text, eventId: null, timestamp: null };
      }
    }

    if (!agentReply.text) {
      safeLog('agent_reply_missing', { conversationId, executionStatus, eventCount: allEvents.length, retries: EVENTS_RETRY_COUNT });
      return Response.json(
        {
          ok: false,
          app_conversation_id: conversationId,
          execution_status: executionStatus,
          event_count: allEvents.length,
          error: 'No agent reply (MessageEvent or StreamingDelta) with text was found after retries',
          openhandsStatus: 'agent_reply_missing',
          raw_events: includeRawEvents ? allEvents : undefined,
        },
        { status: 502 },
      );
    }

    // 5) Change extraction — write mode only, after execution finished.
    //    Read-only endpoints on the OpenHands Cloud API:
    //      GET /api/v1/app-conversations/{id}/git/changes
    //      GET /api/v1/app-conversations/{id}/git/diff
    //      GET /api/v1/app-conversations/{id}/file?path=<path>
    //    Nenhum write e despachado. O change_set sera validado e convertido
    //    em patch proposals pelo frontend (OpenHandsChangeSet module).
    let changeSet: any = null;
    if (mode === 'write' && executionStatus === 'finished') {
      changeSet = await extractChangeSet(
        conversationId,
        conversation?.sandbox_id ?? null,
        repository,
        apiKey,
        deadlineAt,
      );
      safeLog('change_set_extracted', {
        conversationId,
        fileCount: changeSet?.files?.length ?? 0,
        hasGitDiff: Boolean(changeSet?.git_diff),
      });
    }

    safeLog('complete', {
      conversationId,
      executionStatus,
      replyChars: agentReply.text.length,
      eventCount: allEvents.length,
      pages: pageCount,
      durationMs: Date.now() - startedAt,
      hasChangeSet: changeSet !== null,
    });

    return Response.json({
      ok: executionStatus === 'finished',
      app_conversation_id: conversationId,
      repository,
      mode,
      execution_status: executionStatus,
      sandbox_id: conversation?.sandbox_id ?? null,
      agent_reply_text: agentReply.text,
      agent_message_event_id: agentReply.eventId,
      agent_message_timestamp: agentReply.timestamp,
      event_count: allEvents.length,
      durationMs: Date.now() - startedAt,
      raw_events: includeRawEvents ? allEvents : undefined,
      change_set: changeSet,
    });
  } catch (e: any) {
    const isAbort = e?.name === 'AbortError';
    safeLog('uncaught', { type: isAbort ? 'timeout' : 'error', message: String(e?.message ?? e).slice(0, 250) });
    return Response.json(
      { ok: false, error: isAbort ? 'OpenHands request timed out' : String(e?.message ?? e), openhandsStatus: isAbort ? 'timeout' : 'exception' },
      { status: isAbort ? 504 : 500 },
    );
  }
}