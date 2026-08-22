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
  // Per-file diff response format: {"modified":"<diff>","original":"<original>"}
  if (data && typeof data.modified === 'string') return data.modified;
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
  if (s === 'modified' || s === 'm' || s === 'changed' || s === 'updated') return 'modified';
  if (s === 'added' || s === 'a' || s === 'created' || s === 'new' || s === 'untracked') return 'created';
  if (s === 'deleted' || s === 'd' || s === 'removed') return 'deleted';
  if (s === 'renamed' || s === 'r') return 'renamed';
  return 'unknown';
}

/**
 * Derives the sandbox repository root path from the selected_repository.
 *
 * Contract confirmed by sandbox diagnostics (2026-08-22): the git repo is
 * cloned to /workspace/project/{repo_name} where repo_name is the last
 * segment of selected_repository (e.g. "AndersonVitaease/memoryos" ->
 * "/workspace/project/memoryos"). Confirmed by the agent's own
 * `git rev-parse --show-toplevel` output.
 *
 * No LLM inference. No hardcoding of specific repos. If the repository
 * string is malformed, falls back to a safe generic path (endpoints will
 * simply return empty/error — change_set stays unavailable, Approval 2
 * stays blocked).
 */
function deriveRepoRoot(repository: string): string {
  const repoName = repository.split('/').pop()?.trim();
  if (!repoName) return '/workspace/project';
  return `/workspace/project/${repoName}`;
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

  // BUG 1 FIX: /git/changes requires path = repository root (NOT a file path,
  // NOT optional). Without it, the endpoint returns 422 "Field required:
  // query.path" and the change_set is always empty — even when the agent
  // genuinely modified files.
  const repoRoot = deriveRepoRoot(repository);

  // 1) git/changes?path=<repoRoot> — lista de arquivos alterados no sandbox
  let changedFiles: any[] = [];
  try {
    const changesRes = await fetchJson(
      `${base}/git/changes?path=${encodeURIComponent(repoRoot)}`,
      { method: 'GET', headers },
      Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (changesRes.ok) {
      changedFiles = normalizeGitChanges(changesRes.data);
    } else {
      safeLog('git_changes_failed', { httpStatus: changesRes.status, conversationId, repoRoot });
    }
  } catch {
    safeLog('git_changes_error', { conversationId, repoRoot });
  }

  // 2) For each changed file: git/diff?path=<filePath> + file?path=<filePath>
  //    /git/diff is PER-FILE (path = file path, NOT repo root). Calling it
  //    with repo root returns {"modified":"","original":""} (empty). Must
  //    first get changed paths via git/changes, then diff each individually.
  //    Aggregate diffs deterministically into a single git_diff string.
  const fileResults = await Promise.all(
    changedFiles.slice(0, MAX_FILES_TO_FETCH).map(async (cf: any) => {
      const path = String(cf.path ?? cf.file ?? cf.filePath ?? cf.filename ?? '').trim();
      if (!path) return null;
      const changeType = normalizeChangeType(cf.status ?? cf.changeType ?? cf.kind ?? cf.change_type);
      let newContent: string | null = null;
      let fileDiff = '';

      // git/diff?path=<absFilePath> — per-file diff.
      // /git/diff requires an ABSOLUTE file path (e.g.
      // /workspace/project/memoryos/src/...). Relative paths return 502.
      // Response format: {"modified":"<full new content>","original":"<original>"}
      // The "modified" field contains the full new file content — use as
      // newContent since /file endpoint is broken/empty for all files.
      const absPath = path.startsWith('/') ? path : `${repoRoot}/${path}`;
      try {
        const diffRes = await fetchJson(
          `${base}/git/diff?path=${encodeURIComponent(absPath)}`,
          { method: 'GET', headers },
          Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
        );
        if (diffRes.ok) {
          fileDiff = normalizeGitDiff(diffRes.data);
          if (fileDiff && !newContent) {
            newContent = fileDiff;
          }
        }
      } catch {
        // best-effort — fileDiff stays empty
      }

      // file?path=<filePath> — new content (best-effort, endpoint may return empty)
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

      return { path, changeType, newContent, fileDiff };
    }),
  );

  const files = fileResults.filter(
    (f): f is { path: string; changeType: string; newContent: string | null; fileDiff: string } => f !== null,
  );

  // Aggregate per-file diffs into a single git_diff string
  const gitDiff = files
    .filter((f) => f.fileDiff.length > 0)
    .map((f) => `--- a/${f.path}\n+++ b/${f.path}\n${f.fileDiff}`)
    .join('\n');

  return {
    conversation_id: conversationId,
    sandbox_id: sandboxId,
    repository,
    repo_root: repoRoot,
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
  let baselineReply = extractAgentReply({ items: baseline.events });

  // BUG 2 FIX: Bootstrap agent reply MUST be consolidated before sending the
  // write continuation. If baselineReply.eventId is null, the bootstrap
  // MessageEvent hasn't appeared yet. Sending the continuation now would cause
  // the bootstrap reply (when it consolidates) to be mistaken for the write
  // continuation reply — because `non-null !== null` is always true.
  //
  // Poll until baselineReply.eventId is non-null (bootstrap reply consolidated),
  // then proceed. Only AFTER consolidation is the baseline safe to compare against.
  const BOOTSTRAP_CONSOLIDATION_POLL_MS = 3_000;
  while (!baselineReply.eventId && Date.now() < deadlineAt) {
    await sleep(Math.min(BOOTSTRAP_CONSOLIDATION_POLL_MS, Math.max(0, deadlineAt - Date.now())));
    const pollEvents = await fetchAllEvents(CLOUD_BASE_URL, conversationId, apiKey, deadlineAt);
    if (!pollEvents.error) {
      baselineReply = extractAgentReply({ items: pollEvents.events });
      if (baselineReply.eventId) {
        safeLog('phase_bootstrap_reply_consolidated', { conversationId, eventId: baselineReply.eventId });
        break;
      }
    }
  }
  if (!baselineReply.eventId) {
    return Response.json({
      ok: false,
      app_conversation_id: conversationId,
      error: 'Bootstrap reply not consolidated before continuation — cannot establish baseline eventId',
      openhandsStatus: 'bootstrap_not_consolidated',
      write_phase: 'bootstrap',
    }, { status: 502 });
  }

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
      // BUG 2 FIX: New reply requires a DIFFERENT eventId that is also non-null.
      // StreamingDelta alone is NOT sufficient — only a consolidated agent
      // MessageEvent with a different eventId counts as a real continuation reply.
      // This prevents the bootstrap reply from being mistaken for the write reply.
      const hasNewReply = Boolean(latestReply.text)
        && latestReply.eventId !== null
        && latestReply.eventId !== baselineReply.eventId;
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
        safeLog('phase_write_reply_consolidated', { conversationId, writeEventId: latestReply.eventId, baselineEventId: baselineReply.eventId });
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

// ── Start-task error extraction (diagnostic V1) ──────────────────────────────
// Extracts the real error detail from the start-task record returned by
// GET /api/v1/app-conversations/start-tasks?ids=<id> when status is
// 'error' or 'failed'. Preserves the actual error reason instead of
// returning a generic "failed while creating" message.
//
// Priority:
//   1. rec.error as string (explicit error string)
//   2. rec.message / rec.detail / rec.failure_reason / rec.failureReason / rec.reason
//   3. rec.error.message / rec.error.detail (nested error object)
//   4. fallback: empty (caller uses generic message)
//
// Sanitization: redacts common secret patterns from the extracted string.
// Never logs or returns the entire record (which may contain session_api_key
// or other credentials).

const _SECRET_PATTERNS: readonly RegExp[] = [
  /X-Access-Token[^\s]*/gi,
  /X-Session-API-Key[^\s]*/gi,
  /Bearer\s+[A-Za-z0-9_\-.]+/gi,
  /session_api_key[^\s]*/gi,
  /access_token[^\s]*/gi,
  /refresh_token[^\s]*/gi,
  /api[_-]?key[=:][^\s]*/gi,
];

function sanitizeErrorDetail(text: string): string {
  let s = text;
  for (const pattern of _SECRET_PATTERNS) {
    s = s.replace(pattern, '[REDACTED]');
  }
  return s.trim().slice(0, 1000);
}

function extractStartTaskError(rec: any): { errorDetail: string; hasDetail: boolean } {
  if (!rec || typeof rec !== 'object') return { errorDetail: '', hasDetail: false };

  // 1. Explicit string error
  if (typeof rec.error === 'string' && rec.error.trim()) {
    return { errorDetail: sanitizeErrorDetail(rec.error), hasDetail: true };
  }

  // 2. message / detail / failure_reason / failureReason / reason
  const candidates: unknown[] = [
    rec.message, rec.detail, rec.failure_reason, rec.failureReason, rec.reason,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return { errorDetail: sanitizeErrorDetail(c), hasDetail: true };
    }
  }

  // 3. Nested error.message / error.detail (when rec.error is an object)
  if (rec.error && typeof rec.error === 'object' && !Array.isArray(rec.error)) {
    const nested = rec.error as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return { errorDetail: sanitizeErrorDetail(nested.message), hasDetail: true };
    }
    if (typeof nested.detail === 'string' && nested.detail.trim()) {
      return { errorDetail: sanitizeErrorDetail(nested.detail), hasDetail: true };
    }
  }

  // 4. Fallback (no detail available)
  return { errorDetail: '', hasDetail: false };
}

// ── Two-phase bootstrap V1 (write mode) ──────────────────────────────────────
// Write-mode conversations created WITH the write mission as initial_message
// intermittently fail with "Git provider authentication issue when getting
// remote URL". Proven fix (controlled test 2026-08-22): create the conversation
// with a NEUTRAL bootstrap message (no write intent), wait for sandbox ready,
// then send the real write task as a continuation on the SAME conversation.
// The sandbox/git clone happens during the neutral bootstrap, avoiding the
// write-intent validation path that triggers the Git auth error.
const BOOTSTRAP_MESSAGE = 'Initialize the repository workspace and confirm the repository and branch.\nDo not modify, create, or delete any files yet.\nDo not commit.\nDo not push.';

// ── ChangeSet consistency polling V1 ─────────────────────────────────────────
// After write completion, /git/changes and /git/diff may return 200 with empty
// content due to consistency lag. Poll a limited number of times before
// declaring change_set unavailable. Never fabricate a change_set from agent text.
const CHANGESET_POLL_MAX_ATTEMPTS = 4;
const CHANGESET_POLL_DELAY_MS = 5_000;

// ── Transient Git provider auth retry (V1) ───────────────────────────────────
// Retry ONCE for the specific intermittent OpenHands Cloud error:
//   "Git provider authentication issue when getting remote URL"
// Evidence: same repo/credentials succeed sometimes, fail other times.
// A single retry with 15s delay resolves transient Git provider auth failures.
// Only this exact error signature triggers retry — all other errors return immediately.
const TRANSIENT_GIT_AUTH_ERROR = 'Git provider authentication issue when getting remote URL';
const TRANSIENT_RETRY_DELAY_MS = 15_000;
const TRANSIENT_MAX_RETRIES = 1;

interface StartTaskResult {
  conversationId: string;
  startTaskId: string;
  error: string | null;
  errorResponse: Record<string, unknown> | null;
}

/**
 * Creates a NEW OpenHands conversation and polls the start-task until
 * conversationId is available. Returns the conversationId on success,
 * or a structured error on failure.
 *
 * Each call to this function creates a fresh conversation — retries do NOT
 * reuse the failed start-task.
 */
async function createAndPollStartTask(opts: {
  task: string;
  repository: string;
  mode: 'read' | 'write';
  apiKey: string;
  deadlineAt: number;
  useBootstrap?: boolean;
}): Promise<StartTaskResult> {
  const { task, repository, mode, apiKey, deadlineAt } = opts;
  const useBootstrap = opts.useBootstrap === true;
  const headers = cloudHeaders(apiKey);

  // Write mode with bootstrap: send a NEUTRAL initial message (no write intent).
  // The real write task is sent later as a continuation on the same conversation.
  // This avoids the Git provider auth validation that triggers on write-intent
  // initial messages.
  const initialText = useBootstrap
    ? BOOTSTRAP_MESSAGE
    : mode === 'read'
      ? `${task}\n\n---\nIMPORTANT: Read-only mode. Do NOT modify, create, or delete any files. Do NOT create commits or push. Do NOT run destructive commands. Only inspect and report what is asked.`
      : task;

  // 1) Create conversation
  const createRes = await fetchJson(
    CLOUD_BASE_URL + START_PATH,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        initial_message: {
          content: [{
            type: 'text',
            text: initialText,
          }],
        },
        selected_repository: repository,
        selected_branch: 'main',
        git_provider: 'github',
      }),
    },
    Math.min(60_000, Math.max(1, deadlineAt - Date.now())),
  );

  if (!createRes.ok) {
    safeLog('create_failed', { httpStatus: createRes.status });
    const error = createRes.data?.detail || createRes.data?.message || `OpenHands create failed (HTTP ${createRes.status})`;
    return {
      conversationId: '',
      startTaskId: '',
      error,
      errorResponse: { ok: false, error, openhandsStatus: 'create_failed' },
    };
  }

  const startTask = firstRecord(createRes.data) ?? {};
  const startTaskId = String(startTask.id ?? '').trim();
  let conversationId = String(startTask.app_conversation_id ?? startTask.conversation_id ?? '').trim();

  safeLog('create_ok', {
    startTaskId: startTaskId || null,
    conversationId: conversationId || null,
    startStatus: startTask.status ?? null,
    bootstrap: useBootstrap,
  });

  // 2) Poll start-task until conversationId is available
  while (!conversationId) {
    if (!startTaskId) {
      const error = 'OpenHands create response missing start task id/conversation id';
      return {
        conversationId: '',
        startTaskId: '',
        error,
        errorResponse: { ok: false, error, openhandsStatus: 'invalid_create_response' },
      };
    }
    if (Date.now() >= deadlineAt) {
      const error = 'Timeout waiting for OpenHands conversation creation';
      return {
        conversationId: '',
        startTaskId,
        error,
        errorResponse: { ok: false, error, openhandsStatus: 'timeout' },
      };
    }

    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
    const startPoll = await fetchJson(
      `${CLOUD_BASE_URL}${START_TASK_PATH}?ids=${encodeURIComponent(startTaskId)}`,
      { method: 'GET', headers },
      Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (!startPoll.ok) {
      safeLog('start_task_poll_failed', { httpStatus: startPoll.status, startTaskId });
      const error = `OpenHands start-task polling failed (HTTP ${startPoll.status})`;
      return {
        conversationId: '',
        startTaskId,
        error,
        errorResponse: { ok: false, error, openhandsStatus: 'start_poll_failed' },
      };
    }
    const rec = firstRecord(startPoll.data);
    const status = normalizeStatus(rec?.status);
    conversationId = String(rec?.app_conversation_id ?? rec?.conversation_id ?? '').trim();
    if (status === 'error' || status === 'failed') {
      const { errorDetail, hasDetail } = extractStartTaskError(rec);
      const errorMsg = hasDetail && errorDetail
        ? errorDetail
        : 'OpenHands failed while creating the conversation';
      safeLog('start_task_failed', {
        startTaskId: startTaskId || null,
        status,
        errorDetail: hasDetail ? errorDetail.slice(0, 500) : '(no detail available)',
      });
      return {
        conversationId: '',
        startTaskId,
        error: errorMsg,
        errorResponse: {
          ok: false,
          error: errorMsg,
          openhandsStatus: status,
          openhands_status: status,
          start_task_id: startTaskId || null,
          ...(conversationId ? { conversation_id: conversationId } : {}),
          stage: 'start_task_failed',
        },
      };
    }
  }

  return { conversationId, startTaskId, error: null, errorResponse: null };
}

// ── ChangeSet polling V1 (consistency lag recovery) ───────────────────────────
// After write completion, git/changes and git/diff may return 200 with empty
// content due to consistency lag in the OpenHands Cloud API. Polls a limited
// number of times. NEVER fabricates a change_set from agent text — if the
// endpoints remain empty after all attempts, returns null (unavailable).
async function extractChangeSetWithPolling(
  conversationId: string,
  sandboxId: string | null,
  repository: string,
  apiKey: string,
  deadlineAt: number,
): Promise<{ changeSet: any; attempts: number; available: boolean }> {
  let attempts = 0;
  let changeSet: any = null;

  while (attempts < CHANGESET_POLL_MAX_ATTEMPTS) {
    attempts++;
    changeSet = await extractChangeSet(conversationId, sandboxId, repository, apiKey, deadlineAt);

    const fileCount = changeSet?.files?.length ?? 0;
    const hasGitDiff = Boolean(changeSet?.git_diff);

    safeLog('change_set_poll_attempt', {
      conversationId,
      attempt: attempts,
      fileCount,
      gitDiffLength: changeSet?.git_diff?.length ?? 0,
      available: fileCount > 0 || hasGitDiff,
    });

    if (fileCount > 0 || hasGitDiff) {
      return { changeSet, attempts, available: true };
    }

    // Still empty — wait and retry if we have time and attempts remaining.
    if (attempts < CHANGESET_POLL_MAX_ATTEMPTS) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= CHANGESET_POLL_DELAY_MS) break;
      await sleep(CHANGESET_POLL_DELAY_MS);
    }
  }

  // Endpoints remained empty after all attempts — change_set UNAVAILABLE.
  // Do NOT fabricate from agent text. Approval 2 must be blocked.
  return { changeSet: null, attempts, available: false };
}

// ── Two-phase write bootstrap V1 ──────────────────────────────────────────────
// Orchestrates: (1) neutral bootstrap conversation creation + sandbox ready,
// (2) write task sent as continuation on the SAME conversation.
// Returns the same response shape as the standard write path.
async function executeTwoPhaseWrite(opts: {
  task: string;
  repository: string;
  apiKey: string;
  deadlineAt: number;
  startedAt: number;
  includeRawEvents: boolean;
}): Promise<Response> {
  const { task, repository, apiKey, deadlineAt, startedAt, includeRawEvents } = opts;
  const headers = cloudHeaders(apiKey);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — BOOTSTRAP (neutral initial_message)
  // ═══════════════════════════════════════════════════════════════════════════
  safeLog('write_phase_bootstrap_start', { repository });
  const bootstrapResult = await createAndPollStartTask({
    task: '',
    repository,
    mode: 'write',
    apiKey,
    deadlineAt,
    useBootstrap: true,
  });

  if (!bootstrapResult.conversationId) {
    safeLog('write_phase_bootstrap_failed', { stage: 'create_start_task' });
    return Response.json(bootstrapResult.errorResponse, { status: 502 });
  }

  const conversationId = bootstrapResult.conversationId;
  safeLog('write_phase_bootstrap_conversation_created', { conversationId });

  // Poll conversation until sandbox is ready (running/ready) or terminal.
  let conversation: any = null;
  let sandboxReady = false;
  while (!sandboxReady) {
    if (Date.now() >= deadlineAt) {
      return Response.json(
        { ok: false, app_conversation_id: conversationId, error: 'Timeout waiting for OpenHands bootstrap sandbox', openhandsStatus: 'bootstrap_timeout', write_phase: 'bootstrap' },
        { status: 504 },
      );
    }

    const convRes = await fetchJson(
      `${CLOUD_BASE_URL}${CONVERSATION_PATH}?ids=${encodeURIComponent(conversationId)}`,
      { method: 'GET', headers },
      Math.min(30_000, Math.max(1, deadlineAt - Date.now())),
    );
    if (!convRes.ok) {
      safeLog('bootstrap_poll_failed', { httpStatus: convRes.status, conversationId });
      return Response.json(
        { ok: false, app_conversation_id: conversationId, error: `OpenHands bootstrap polling failed (HTTP ${convRes.status})`, openhandsStatus: 'bootstrap_poll_failed', write_phase: 'bootstrap' },
        { status: 502 },
      );
    }

    conversation = firstRecord(convRes.data);
    if (!conversation) {
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
      continue;
    }

    const sandboxStatus = normalizeStatus(conversation.sandbox_status);
    const execStatus = normalizeStatus(conversation.execution_status);

    if (sandboxStatus === 'error' || sandboxStatus === 'missing') {
      return Response.json(
        { ok: false, app_conversation_id: conversationId, error: `OpenHands bootstrap sandbox status: ${sandboxStatus}`, openhandsStatus: 'bootstrap_sandbox_failed', write_phase: 'bootstrap' },
        { status: 502 },
      );
    }
    if (execStatus === 'error' || execStatus === 'stuck') {
      return Response.json(
        { ok: false, app_conversation_id: conversationId, execution_status: execStatus, error: `OpenHands bootstrap execution failed: ${execStatus}`, openhandsStatus: 'bootstrap_execution_failed', write_phase: 'bootstrap' },
        { status: 502 },
      );
    }

    // Sandbox ready: running, ready, or already finished executing the bootstrap.
    if (sandboxStatus === 'running' || sandboxStatus === 'ready' || TERMINAL_EXECUTION_STATUSES.has(execStatus)) {
      sandboxReady = true;
      break;
    }

    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadlineAt - Date.now())));
  }

  safeLog('write_phase_bootstrap_ready', {
    conversationId,
    sandboxId: conversation?.sandbox_id ?? null,
    sandboxStatus: normalizeStatus(conversation?.sandbox_status),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — WRITE CONTINUATION (same conversation, real task)
  // ═══════════════════════════════════════════════════════════════════════════
  safeLog('write_phase_continuation_start', { conversationId });
  const continuation = await continueExistingConversation({
    conversationId,
    task,
    mode: 'write',
    apiKey,
    deadlineAt,
  });

  // continueExistingConversation returns a Response.json — parse it to extract
  // the continuation result and add write_phase telemetry + change_set polling.
  const contBody = await continuation.json();

  // If continuation itself failed, pass through the error.
  if (contBody.ok !== true) {
    safeLog('write_phase_continuation_failed', {
      conversationId,
      openhandsStatus: contBody.openhandsStatus ?? null,
    });
    return Response.json(
      { ...contBody, write_phase: 'continuation' },
      { status: 502 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — CHANGESET EXTRACTION WITH POLLING
  // ═══════════════════════════════════════════════════════════════════════════
  const continuationExecutionStatus = normalizeStatus(contBody.execution_status);
  let finalChangeSet: any = contBody.change_set ?? null;
  let changeSetAttempts = 0;
  let changeSetAvailable = finalChangeSet !== null && ((finalChangeSet?.files?.length ?? 0) > 0 || Boolean(finalChangeSet?.git_diff));

  if (continuationExecutionStatus === 'finished' && !changeSetAvailable) {
    const pollResult = await extractChangeSetWithPolling(
      conversationId,
      contBody.sandbox_id ?? conversation?.sandbox_id ?? null,
      repository,
      apiKey,
      deadlineAt,
    );
    finalChangeSet = pollResult.changeSet;
    changeSetAttempts = pollResult.attempts;
    changeSetAvailable = pollResult.available;
  }

  safeLog('write_phase_complete', {
    conversationId,
    continuationStatus: continuationExecutionStatus,
    changeSetAvailable,
    changeSetAttempts,
    fileCount: finalChangeSet?.files?.length ?? 0,
    gitDiffLength: finalChangeSet?.git_diff?.length ?? 0,
    durationMs: Date.now() - startedAt,
  });

  return Response.json({
    ...contBody,
    write_phase: 'two_phase_complete',
    bootstrap_conversation_id: conversationId,
    continued: true,
    change_set: finalChangeSet,
    change_set_available: changeSetAvailable,
    change_set_attempts: changeSetAttempts,
    change_set_unavailable: !changeSetAvailable,
    durationMs: Date.now() - startedAt,
  });
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

    // ── Two-phase bootstrap V1 (write mode only) ─────────────────────────
    // Write mode WITHOUT existing conversation: use neutral bootstrap + write
    // continuation to avoid the Git provider auth validation that triggers on
    // write-intent initial messages. Read mode preserves the standard path.
    if (mode === 'write') {
      return executeTwoPhaseWrite({
        task,
        repository,
        apiKey,
        deadlineAt,
        startedAt,
        includeRawEvents,
      });
    }

    // 1-2) Create conversation + poll start-task, with transient Git auth retry.
    // Only the specific intermittent error "Git provider authentication issue
    // when getting remote URL" triggers a single retry with 15s delay.
    // Each retry creates a NEW conversation (does NOT reuse the failed start-task).
    let conversationId = '';
    {
      let attempt = 0;
      while (true) {
        attempt++;
        const result = await createAndPollStartTask({ task, repository, mode, apiKey, deadlineAt });

        if (result.conversationId) {
          conversationId = result.conversationId;
          if (attempt > 1) {
            safeLog('retry_succeeded', { attempt, conversationId });
          }
          break;
        }

        // Retryable: ONLY the specific transient Git provider auth error.
        const isRetryable = result.error !== null
          && result.error.includes(TRANSIENT_GIT_AUTH_ERROR)
          && attempt <= TRANSIENT_MAX_RETRIES
          && (Date.now() + TRANSIENT_RETRY_DELAY_MS) < deadlineAt;

        if (!isRetryable) {
          return Response.json(result.errorResponse, { status: 502 });
        }

        safeLog('retry_scheduled', {
          attempt,
          retry_delay_ms: TRANSIENT_RETRY_DELAY_MS,
          failed_start_task_id: result.startTaskId || null,
          error: sanitizeErrorDetail(result.error).slice(0, 300),
        });

        await sleep(TRANSIENT_RETRY_DELAY_MS);

        safeLog('retry_attempt', { attempt: attempt + 1 });
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