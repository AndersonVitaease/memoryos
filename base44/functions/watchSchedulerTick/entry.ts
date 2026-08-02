/**
 * watchSchedulerTick — Sprint WE-02/WE-03 (RFC-005)
 *
 * Executa 5 iteracoes internas de 60s cada (cobrindo janela de 5min do cron).
 *
 * Providers suportados:
 *   - clock        : comparacao de horario em BRT (nao precisa de OAuth)
 *   - gmail        : count_unread via Gmail API (usa GoogleOAuthToken)
 *   - calendar     : get_event_count via Calendar API (usa GoogleOAuthToken)
 *
 * Seguranca:
 *   - Token OAuth nunca exposto ao frontend
 *   - Refresh automatico via /token do Google quando necessario
 *   - Circuit breaker: 3 falhas consecutivas → status='error'
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── OAuth helper — obtem access token a partir do GoogleOAuthToken entity ──

async function getGoogleAccessToken(base44: any, userId: string): Promise<string | null> {
  const records = await base44.asServiceRole.entities.GoogleOAuthToken.filter({
    user_id: userId,
    workspace_id: 'default',
  });
  if (!records.length || !records[0].refresh_token) return null;

  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: records[0].refresh_token,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) return null;
  return data.access_token ?? null;
}

// ── Provider: clock ───────────────────────────────────────────────────────────

function evaluateClock(watch: any, conditionTree: any): boolean {
  const target = conditionTree.params?.target_time;
  if (!target) return false;

  const nowUTC = new Date();
  const hPart = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(nowUTC);
  const mPart = new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: 'America/Sao_Paulo' }).format(nowUTC);
  const nowH = parseInt(hPart, 10);
  const nowM = parseInt(mPart, 10);
  const [tH, tM] = target.split(':').map(Number);
  const nowTotalMin  = nowH * 60 + nowM;
  const targetTotalMin = tH * 60 + tM;
  const diffMin = nowTotalMin - targetTotalMin;

  const neverEvaluated   = !watch.last_execution_at;
  const isInNormalWindow = Math.abs(diffMin) <= 2;
  const isMissedRecovery = neverEvaluated && diffMin > 0 && diffMin <= 10;

  const result = isInNormalWindow || isMissedRecovery;
  console.log(`[clock] target=${target} nowBRT=${nowH}:${String(nowM).padStart(2,'0')} diff=${diffMin} normalWindow=${isInNormalWindow} missedRecovery=${isMissedRecovery} match=${result}`);
  return result;
}

// ── Provider: gmail count_unread ─────────────────────────────────────────────

async function evaluateGmail(conditionTree: any, accessToken: string): Promise<boolean> {
  const action = conditionTree.action ?? 'count_unread';
  if (action !== 'count_unread') return false;

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.warn(`[gmail] Labels API returned ${res.status}`);
    return false;
  }
  const data = await res.json();
  const unread = data.messagesUnread ?? 0;
  const threshold = conditionTree.value ?? 0;
  const result = unread > threshold;
  console.log(`[gmail] count_unread=${unread} threshold=${threshold} match=${result}`);
  return result;
}

// ── Provider: calendar get_event_count ───────────────────────────────────────

async function evaluateCalendar(conditionTree: any, accessToken: string): Promise<boolean> {
  const action = conditionTree.action ?? 'get_event_count';
  if (action !== 'get_event_count') return false;

  const now     = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin, timeMax, maxResults: '10', singleEvents: 'true',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.warn(`[calendar] Events API returned ${res.status}`);
    return false;
  }
  const data = await res.json();
  const count = (data.items ?? []).length;
  const threshold = conditionTree.value ?? 0;
  const result = count > threshold;
  console.log(`[calendar] event_count=${count} threshold=${threshold} match=${result}`);
  return result;
}

// ── Tick principal ────────────────────────────────────────────────────────────

async function runOneTick(base44: any, googleTokenCache: Map<string, string>): Promise<{
  processed: number; triggered: number; failed: number; skipped: number;
}> {
  const now = new Date().toISOString();
  const allWatches = await base44.asServiceRole.entities.Watch.filter({ status: 'active' });
  const dueWatches = allWatches.filter((w: any) => {
    if (!w.next_execution_at) return true;
    return new Date(w.next_execution_at) <= new Date(now);
  });

  const result = { processed: 0, triggered: 0, failed: 0, skipped: allWatches.length - dueWatches.length };

  for (const watch of dueWatches) {
    try {
      result.processed++;

      let conditionTree: any = {};
      try { conditionTree = JSON.parse(watch.condition_tree || '{}'); } catch {}

      const provider = conditionTree.provider ?? 'unknown';
      let evaluationResult = false;
      const executionStart = Date.now();

      if (provider === 'clock') {
        evaluationResult = evaluateClock(watch, conditionTree);

      } else if (provider === 'gmail' || provider === 'calendar') {
        // Obtem token OAuth — usa cache da iteracao para evitar multiplos refreshes
        const userId = watch.created_by_id;
        if (userId) {
          let token = googleTokenCache.get(userId);
          if (!token) {
            token = await getGoogleAccessToken(base44, userId) ?? undefined;
            if (token) googleTokenCache.set(userId, token);
          }
          if (token) {
            if (provider === 'gmail') {
              evaluationResult = await evaluateGmail(conditionTree, token);
            } else if (provider === 'calendar') {
              evaluationResult = await evaluateCalendar(conditionTree, token);
            }
          } else {
            console.warn(`[${provider}] Sem token OAuth para user ${userId} — avaliacao pulada`);
          }
        } else {
          console.warn(`[${provider}] Watch ${watch.id} sem created_by_id — avaliacao pulada`);
        }
      }
      // Providers desconhecidos: evaluationResult permanece false

      const durationMs = Date.now() - executionStart;
      const prevResult = watch.last_evaluation_result === true;
      const wasTriggered = evaluationResult && !prevResult;

      // Clock: proxima execucao em 1 minuto; outros: usa frequencia do watch
      const freqMin = provider === 'clock' ? 1 : (watch.frequency_minutes || 60);
      const nextExec = new Date(Date.now() + freqMin * 60 * 1000).toISOString();

      await base44.asServiceRole.entities.Watch.update(watch.id, {
        last_execution_at:      now,
        next_execution_at:      nextExec,
        last_evaluation_result: evaluationResult,
        trigger_count:          wasTriggered ? (watch.trigger_count || 0) + 1 : (watch.trigger_count || 0),
        consecutive_failures:   0,
      });

      await base44.asServiceRole.entities.WatchExecution.create({
        watch_id:         watch.id,
        status:           'success',
        evaluation_result: evaluationResult,
        triggered:        wasTriggered,
        duration_ms:      durationMs,
        providers_called: [provider],
        session_id:       watch.session_id || null,
      });

      if (wasTriggered) {
        result.triggered++;
        await base44.asServiceRole.entities.PendingWatchAction.create({
          watch_id:    watch.id,
          action_type: watch.on_trigger_type || 'notify_user',
          payload:     JSON.stringify({
            watchId:   watch.id,
            watchName: watch.name,
            message:   `Watch disparou: ${watch.name}`,
            timestamp: now,
          }),
          status:      'pending',
          retry_count: 0,
          max_retries: 3,
          expires_at:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          session_id:  watch.session_id || null,
        });
      }

    } catch (watchErr: any) {
      result.failed++;
      try {
        const newFailures = (watch.consecutive_failures || 0) + 1;
        await base44.asServiceRole.entities.Watch.update(watch.id, {
          consecutive_failures: newFailures,
          status:               newFailures >= 3 ? 'error' : 'active',
          error_message:        watchErr.message,
        });
      } catch { /* silent */ }
    }
  }

  return result;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const totals = { processed: 0, triggered: 0, failed: 0, iterations: 0 };

    // Cache de tokens OAuth por userId — evita multiplos refreshes na mesma invocacao
    const googleTokenCache = new Map<string, string>();

    // 5 iteracoes de 1 minuto cada = cobre toda a janela de 5 minutos do cron
    for (let i = 0; i < 5; i++) {
      const r = await runOneTick(base44, googleTokenCache);
      totals.processed  += r.processed;
      totals.triggered  += r.triggered;
      totals.failed     += r.failed;
      totals.iterations++;

      if (i < 4) await delay(60_000);
    }

    return Response.json({ ok: true, ...totals, timestamp: new Date().toISOString() });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}