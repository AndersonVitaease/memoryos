/**
 * watchSchedulerTick — Sprint WE-02/WE-03 (RFC-005)
 *
 * Executa 5 iteracoes internas de 60s cada (cobrindo janela de 5min do cron).
 *
 * Providers suportados:
 *   - clock        : comparacao de horario em BRT (nao precisa de OAuth)
 *   - gmail        : count_unread via Gmail API (usa GoogleOAuthToken)
 *   - calendar     : get_event_count via Calendar API (usa GoogleOAuthToken)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── OAuth helper ─────────────────────────────────────────────────────────────

async function getGoogleAccessToken(base44: any, userId: string, preferEmail?: string): Promise<{ token: string; email: string } | null> {
  // Se preferEmail especificado, tenta pegar token daquele email específico
  let records = preferEmail
    ? await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: userId, email: preferEmail })
    : [];

  // Fallback: qualquer token do user com gmail.send scope
  if (!records.length) {
    const all = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: userId });
    records = all.filter((r: any) => r.scopes?.includes('gmail.send') && r.refresh_token);
  }

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
  if (!res.ok || data.error) {
    console.warn(`[oauth] Token refresh failed: ${data.error} — ${data.error_description}`);
    return null;
  }
  return { token: data.access_token, email: records[0].email };
}

// ── Gmail send via OAuth ──────────────────────────────────────────────────────

async function sendGmailOAuth(accessToken: string, fromEmail: string, to: string, subject: string, body: string): Promise<void> {
  // Encode subject em base64 para suportar UTF-8 / acentos
  const encodeHeader = (str: string) => {
    const b64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    ));
    return `=?UTF-8?B?${b64}?=`;
  };

  // Monta email RFC 2822 com encoding correto
  const emailLines = [
    `From: MemoryOS <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join('\r\n');

  // Converte para Uint8Array para preservar UTF-8 antes do base64url
  const encoder = new TextEncoder();
  const bytes = encoder.encode(emailLines);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const encoded = btoa(binary)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail send failed ${res.status}: ${JSON.stringify(err)}`);
  }
  console.log(`[gmail-send] Email enviado para ${to} via OAuth Gmail`);
}

// ── Hora atual em BRT (minutos desde meia-noite) ──────────────────────────────

function nowBRTMinutes(): { h: number; m: number; totalMin: number } {
  const nowUTC = new Date();
  const hStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(nowUTC);
  const mStr = new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: 'America/Sao_Paulo' }).format(nowUTC);
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return { h, m, totalMin: h * 60 + m };
}

// ── Provider: clock ───────────────────────────────────────────────────────────

function evaluateClock(conditionTree: any): boolean {
  const target = conditionTree.params?.target_time;
  if (!target) return false;

  const { h: nowH, m: nowM, totalMin: nowTotal } = nowBRTMinutes();
  const [tH, tM] = target.split(':').map(Number);
  const targetTotal = tH * 60 + tM;
  const diffMin = nowTotal - targetTotal;

  // Janela de disparo: de 0 até +6 minutos após o horário alvo (cobre ciclo completo do cron de 5min)
  const inWindow = diffMin >= 0 && diffMin <= 6;
  console.log(`[clock] target=${target} now=${nowH}:${String(nowM).padStart(2,'0')} diff=${diffMin}min inWindow=${inWindow}`);
  return inWindow;
}

// ── Provider: gmail ───────────────────────────────────────────────────────────

async function evaluateGmail(conditionTree: any, accessToken: string): Promise<boolean> {
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) { console.warn(`[gmail] API ${res.status}`); return false; }
  const data = await res.json();
  const unread = data.messagesUnread ?? 0;
  const threshold = conditionTree.value ?? 0;
  return unread > threshold;
}

// ── Provider: calendar ────────────────────────────────────────────────────────

async function evaluateCalendar(conditionTree: any, accessToken: string): Promise<boolean> {
  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    maxResults: '10',
    singleEvents: 'true',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) { console.warn(`[calendar] API ${res.status}`); return false; }
  const data = await res.json();
  return (data.items ?? []).length > (conditionTree.value ?? 0);
}

// ── Tick principal ────────────────────────────────────────────────────────────

async function runOneTick(base44: any, googleTokenCache: Map<string, string>): Promise<{
  processed: number; triggered: number; failed: number; skipped: number;
}> {
  const now = new Date().toISOString();
  const allActive = await base44.asServiceRole.entities.Watch.filter({ status: 'active' });

  // Filtrar watches que estão no horário de execução
  const dueWatches = allActive.filter((w: any) => {
    if (!w.next_execution_at) return true;
    return new Date(w.next_execution_at) <= new Date(now);
  });

  const result = { processed: 0, triggered: 0, failed: 0, skipped: allActive.length - dueWatches.length };

  for (const watch of dueWatches) {
    try {
      result.processed++;

      let conditionTree: any = {};
      try { conditionTree = JSON.parse(watch.condition_tree || '{}'); } catch {}

      const provider = conditionTree.provider ?? 'unknown';
      let evaluationResult = false;
      const t0 = Date.now();

      if (provider === 'clock') {
        evaluationResult = evaluateClock(conditionTree);

      } else if (provider === 'gmail' || provider === 'calendar') {
        const userId = watch.created_by_id;
        if (userId) {
          let token = googleTokenCache.get(userId);
          if (!token) {
            const result = await getGoogleAccessToken(base44, userId);
            if (result) {
              token = result.token;
              googleTokenCache.set(userId, token);
            }
          }
          if (token) {
            evaluationResult = provider === 'gmail'
              ? await evaluateGmail(conditionTree, token)
              : await evaluateCalendar(conditionTree, token);
          }
        }
      }

      const durationMs = Date.now() - t0;
      const prevResult = watch.last_evaluation_result;

      // Dispara apenas na transição false→true (ou null→true para primeira avaliação)
      const wasTriggered = evaluationResult === true && prevResult !== true;

      // Para clock: se disparou → completed (one-shot). Senão → continua ativo, tenta em 1min.
      // Para outros providers → agenda próxima execução conforme frequência.
      const newStatus = (provider === 'clock' && wasTriggered) ? 'completed' : 'active';
      const freqMin = provider === 'clock' ? 1 : (watch.frequency_minutes || 60);
      const nextExec = newStatus === 'completed' ? null : new Date(Date.now() + freqMin * 60 * 1000).toISOString();

      await base44.asServiceRole.entities.Watch.update(watch.id, {
        last_execution_at:      now,
        next_execution_at:      nextExec,
        last_evaluation_result: evaluationResult,
        trigger_count:          (watch.trigger_count || 0) + (wasTriggered ? 1 : 0),
        consecutive_failures:   0,
        status:                 newStatus,
      });

      await base44.asServiceRole.entities.WatchExecution.create({
        watch_id:          watch.id,
        status:            'success',
        evaluation_result: evaluationResult,
        triggered:         wasTriggered,
        duration_ms:       durationMs,
        providers_called:  [provider],
        session_id:        watch.session_id || null,
      });

      if (wasTriggered) {
        result.triggered++;

        // Enviar email se configurado no on_trigger_payload
        if (watch.on_trigger_payload) {
          try {
            const tp = JSON.parse(watch.on_trigger_payload);
            if (tp?.type === 'send_email' && tp?.email?.to && tp?.email?.subject) {
              // Tenta o created_by_id primeiro; se for conta de serviço, busca por email "from"
              const fromEmail = tp.email.from || null;
              let userId = watch.created_by_id;

              // Se created_by_id é conta de serviço ou inválido, busca o user_id pelo email "from"
              if (!userId || userId.startsWith('service_')) {
                if (fromEmail) {
                  const tokenRecords = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ email: fromEmail });
                  if (tokenRecords.length > 0) userId = tokenRecords[0].user_id;
                }
                // Fallback: qualquer user com token Gmail
                if (!userId || userId.startsWith('service_')) {
                  const allTokens = await base44.asServiceRole.entities.GoogleOAuthToken.filter({});
                  const gmailToken = allTokens.find((t: any) => t.scopes?.includes('gmail'));
                  if (gmailToken) userId = gmailToken.user_id;
                }
              }

              const oauthResult = userId
                ? await getGoogleAccessToken(base44, userId, fromEmail)
                : null;

              if (oauthResult) {
                // Envia via Gmail OAuth — aparece com o remetente real
                await sendGmailOAuth(
                  oauthResult.token,
                  oauthResult.email,
                  tp.email.to,
                  tp.email.subject,
                  tp.email.body || tp.email.subject,
                );
              } else {
                // Fallback: Base44 SendEmail
                await base44.asServiceRole.integrations.Core.SendEmail({
                  to:      tp.email.to,
                  subject: tp.email.subject,
                  body:    tp.email.body || tp.email.subject,
                });
                console.log(`[watchScheduler] Email enviado via Base44 (fallback) para ${tp.email.to}`);
              }
            }
          } catch (e: any) {
            console.warn(`[watchScheduler] Erro ao enviar email: ${e?.message}`);
          }
        }

        // Montar mensagem amigável
        let friendlyMsg = `O alerta "${watch.name.replace(/ — Auto WE-04$/, '')}" disparou.`;
        if (conditionTree.provider === 'clock' && conditionTree.params?.target_time) {
          friendlyMsg = `Chegou a hora! ${conditionTree.params.target_time} — você pediu para ser avisado neste horário.`;
        }

        await base44.asServiceRole.entities.PendingWatchAction.create({
          watch_id:    watch.id,
          action_type: 'notify_user',
          payload:     JSON.stringify({
            watchId:   watch.id,
            watchName: watch.name.replace(/ — Auto WE-04$/, ''),
            message:   friendlyMsg,
            timestamp: now,
          }),
          status:      'pending',
          retry_count: 0,
          max_retries: 3,
          expires_at:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          session_id:  watch.session_id || null,
        });
      }

    } catch (err: any) {
      result.failed++;
      try {
        const fails = (watch.consecutive_failures || 0) + 1;
        await base44.asServiceRole.entities.Watch.update(watch.id, {
          consecutive_failures: fails,
          status:               fails >= 3 ? 'error' : 'active',
          error_message:        err.message,
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
    const googleTokenCache = new Map<string, string>();

    for (let i = 0; i < 5; i++) {
      const r = await runOneTick(base44, googleTokenCache);
      totals.processed += r.processed;
      totals.triggered += r.triggered;
      totals.failed    += r.failed;
      totals.iterations++;
      if (i < 4) await delay(60_000);
    }

    return Response.json({ ok: true, ...totals, timestamp: new Date().toISOString() });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}