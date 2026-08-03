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
  // Filtra tokens que tem algum scope do Gmail (read ou send) e refresh_token
  const hasGmailScope = (r: any) => r.refresh_token && (
    r.scopes?.includes('gmail.readonly') ||
    r.scopes?.includes('gmail.send') ||
    r.scopes?.includes('gmail.compose') ||
    r.scopes?.includes('mail.google.com')
  );

  // Se preferEmail especificado, pega tokens daquele email e filtra por scope do Gmail
  let records = preferEmail
    ? (await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: userId, email: preferEmail })).filter(hasGmailScope)
    : [];

  // Fallback: qualquer token do user com gmail scope
  if (!records.length) {
    const all = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ user_id: userId });
    records = all.filter(hasGmailScope);
  }

  if (!records.length) return null;

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

async function sendGmailOAuth(accessToken: string, fromEmail: string, to: string, subject: string, body: string): Promise<string | null> {
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
  const _sendData = await res.json().catch(() => ({}));
  const _msgId = _sendData?.id ?? null;
  console.log(`[gmail-send] Email enviado para ${to} via OAuth Gmail — ID: ${_msgId ?? 'N/A'}`);
  return _msgId;
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

interface GmailNewMessage { id: string; subject: string; from: string; snippet: string; date: string }

async function evaluateGmail(
  conditionTree: any,
  accessToken: string,
  lastExecAt?: string | null,
  watchCreatedAt?: string | null,
): Promise<{ triggered: boolean; messages: GmailNewMessage[] }> {
  // Busca mensagens NOVAS desde a ultima verificacao (ou desde a criacao do watch).
  // Usa a query `after:<timestamp>` do Gmail - retorna so mensagens recebidas apos
  // o timestamp informado. Assim, nao dispara por emails ja existentes.
  const baseline = lastExecAt || watchCreatedAt || new Date().toISOString();
  // Buffer de 3min: evita condicao de corrida onde o scheduler roda logo apos
  // o email chegar, atualiza last_execution_at para depois do email, e a busca
  // after: nao o encontra. O buffer olha 3min atras para garantir deteccao.
  const afterSeconds = Math.floor(new Date(baseline).getTime() / 1000) - 180;
  const query = `after:${afterSeconds} is:unread`;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.warn(`[gmail] API ${res.status} - query="${query}"`);
    // Fallback: labels/INBOX (comportamento antigo) — so para nao ficar cego
    const fb = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX',
      { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fb.ok) return { triggered: false, messages: [] };
    const fd = await fb.json();
    const hasUnread = (fd.messagesUnread ?? 0) > (conditionTree.value ?? 0);
    return { triggered: hasUnread, messages: [] };
  }
  const data = await res.json();
  const messageIds: Array<{ id: string }> = data.messages ?? [];
  if (messageIds.length === 0) return { triggered: false, messages: [] };

  // Busca detalhes (Subject, From, snippet) de cada mensagem nova
  const messages: GmailNewMessage[] = [];
  for (const m of messageIds.slice(0, 3)) {
    try {
      const dr = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!dr.ok) continue;
      const d = await dr.json();
      const headers = d.payload?.headers ?? [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value ?? '(sem assunto)';
      const from = headers.find((h: any) => h.name === 'From')?.value ?? '';
      const snippet = d.snippet ?? '';
      const date = d.internalDate
        ? new Date(parseInt(d.internalDate)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      messages.push({ id: m.id, subject, from, snippet, date });
    } catch { /* skip individual failures */ }
  }
  return { triggered: true, messages };
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
  const nowMs = Date.now();
  const allActive = await base44.asServiceRole.entities.Watch.filter({ status: 'active' });

  // Auto-recuperação: incluir watches em 'error' que estão há mais de 5min sem execução.
  // Isso evita que um erro transiente (ex: validação booleana do backend) trav o watch para sempre.
  const errorWatches = await base44.asServiceRole.entities.Watch.filter({ status: 'error' });
  const recoverableErrors = errorWatches.filter((w: any) => {
    if (!w.last_execution_at) return true;
    const elapsed = nowMs - new Date(w.last_execution_at).getTime();
    return elapsed > 5 * 60 * 1000; // 5min de cooldown
  });
  // Resetar watches recuperáveis para 'active' antes de processá-los
  for (const w of recoverableErrors) {
    try {
      await base44.asServiceRole.entities.Watch.update(w.id, {
        status: 'active',
        consecutive_failures: 0,
        error_message: '',
        next_execution_at: now,
      });
      console.log(`[scheduler] Auto-recuperando watch ${w.id.slice(-6)} do erro`);
    } catch { /* silent */ }
  }

  const allProcessable = [...allActive, ...recoverableErrors];

  // Filtrar watches que estão no horário de execução
  const dueWatches = allProcessable.filter((w: any) => {
    if (!w.next_execution_at) return true;
    return new Date(w.next_execution_at) <= new Date(now);
  });

  const result = { processed: 0, triggered: 0, failed: 0, skipped: allProcessable.length - dueWatches.length };

  for (const watch of dueWatches) {
    try {
      result.processed++;

      let conditionTree: any = {};
      try { conditionTree = JSON.parse(watch.condition_tree || '{}'); } catch {}

      const provider = conditionTree.provider ?? 'unknown';
      let evaluationResult = false;
      let gmailNewMessages: GmailNewMessage[] = [];
      const t0 = Date.now();

      if (provider === 'clock') {
        evaluationResult = evaluateClock(conditionTree);

      } else if (provider === 'gmail' || provider === 'calendar') {
        const userId = watch.created_by_id;
        const _acctEmail = conditionTree.params?.accountEmail ?? undefined;
        if (userId) {
          const _cacheKey = `${userId}:${_acctEmail ?? 'default'}`;
          let token = googleTokenCache.get(_cacheKey);
          if (!token) {
            const result = await getGoogleAccessToken(base44, userId, _acctEmail);
            if (result) {
              token = result.token;
              googleTokenCache.set(_cacheKey, token);
            }
          }
          if (token) {
            if (provider === 'gmail') {
              const gResult = await evaluateGmail(conditionTree, token, watch.last_execution_at, watch.compiled_at || watch.created_date);
              evaluationResult = gResult.triggered;
              gmailNewMessages = gResult.messages;
            } else {
              evaluationResult = await evaluateCalendar(conditionTree, token);
            }
          }
        }
      }

      const durationMs = Date.now() - t0;
      const prevResult = watch.last_evaluation_result;

      // Clock: dispara na primeira avaliacao (null->true) - alarme one-shot.
      // Gmail: dispara na transicao false->true (buffer de 3min no after: evita
      // race condition, mas pode ver o mesmo email em execucoes consecutivas -
      // transition-based evita duplicatas).
      // Calendar: dispara na transicao false->true.
      const wasTriggered = provider === 'clock'
        ? (evaluationResult === true && prevResult !== true)
        : provider === 'gmail'
          ? (evaluationResult === true && prevResult !== true)
          : (evaluationResult === true && prevResult === false);

      // Para clock: se disparou → completed (one-shot). Senão → continua ativo, tenta em 1min.
      // Para outros providers → agenda próxima execução conforme frequência.
      const newStatus = (provider === 'clock' && wasTriggered) ? 'completed' : 'active';
      const freqMin = provider === 'clock' ? 1 : (watch.frequency_minutes || 60);
      const nextExec = newStatus === 'completed' ? null : new Date(Date.now() + freqMin * 60 * 1000).toISOString();

      await base44.asServiceRole.entities.Watch.update(watch.id, {
        last_execution_at:      now,
        next_execution_at:      nextExec,
        last_evaluation_result: Boolean(evaluationResult),
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

        let _sentMessageId: string | null = null;
        let _sentTo: string | null = null;
        let _sentVia = '';

        // Enviar email se configurado no on_trigger_payload
        if (watch.on_trigger_payload) {
          try {
            const tp = JSON.parse(watch.on_trigger_payload);
            if (tp?.type === 'send_email' && tp?.email?.to && tp?.email?.subject) {
              _sentTo = tp.email.to;
              // Tenta o created_by_id primeiro; se for conta de serviço, busca por email "from"
              const fromEmail = tp.email.from || null;
              let userId = watch.created_by_id;

              // Sempre busca pelo email "from" primeiro — é o remetente correto
              // Se não encontrar por from, usa created_by_id como fallback
              let oauthResult = null;
              if (fromEmail) {
                const fromTokens = await base44.asServiceRole.entities.GoogleOAuthToken.filter({ email: fromEmail });
                const fromToken = fromTokens.find((t: any) => t.scopes?.includes('gmail.send') && t.refresh_token);
                if (fromToken) {
                  const refreshed = await getGoogleAccessToken(base44, fromToken.user_id, fromEmail);
                  if (refreshed) oauthResult = refreshed;
                }
              }
              // Fallback: token do created_by_id
              if (!oauthResult && userId && !userId.startsWith('service_')) {
                oauthResult = await getGoogleAccessToken(base44, userId, fromEmail ?? undefined);
              }
              // Último fallback: qualquer token com gmail.send
              if (!oauthResult) {
                const allTokens = await base44.asServiceRole.entities.GoogleOAuthToken.filter({});
                const best = allTokens.find((t: any) => t.scopes?.includes('gmail.send') && t.refresh_token);
                if (best) oauthResult = await getGoogleAccessToken(base44, best.user_id, best.email);
              }
              console.log(`[watchScheduler] oauthResult found: ${!!oauthResult} for from=${fromEmail}`);

              if (oauthResult) {
                // Envia via Gmail OAuth — aparece com o remetente real
                _sentVia = 'gmail_oauth';
                _sentMessageId = await sendGmailOAuth(
                  oauthResult.token,
                  oauthResult.email,
                  tp.email.to,
                  tp.email.subject,
                  tp.email.body || tp.email.subject,
                );
              } else {
                // Fallback: Base44 SendEmail
                _sentVia = 'base44_relay';
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

        // Montar mensagem amigável — inclui confirmação de email + hash se enviado
        let friendlyMsg = `O alerta "${watch.name.replace(/ — Auto WE-04$/, '')}" disparou.`;
        if (conditionTree.provider === 'clock' && conditionTree.params?.target_time) {
          friendlyMsg = `Chegou a hora! ${conditionTree.params.target_time} — você pediu para ser avisado neste horário.`;
        }
        // Gmail: inclui assunto, remetente, data e snippet de cada email novo
        if (provider === 'gmail' && gmailNewMessages.length > 0) {
          const acct = conditionTree.params?.accountEmail ?? '';
          const acctLabel = acct ? ` em ${acct}` : '';
          const emailLines = gmailNewMessages.map((m: GmailNewMessage) =>
            `**${m.subject}**\n   De: ${m.from} | ${m.date}\n   _${m.snippet}_`,
          ).join('\n\n');
          friendlyMsg = `📧 Novo email recebido${acctLabel}:\n\n${emailLines}`;
        }
        if (_sentTo) {
          if (_sentMessageId) {
            friendlyMsg += `\n\n📧 Email enviado para \`${_sentTo}\`\nID Gmail: \`${_sentMessageId}\``;
          } else if (_sentVia === 'base44_relay') {
            friendlyMsg += `\n\n📧 Email enviado para \`${_sentTo}\` (via relay)`;
          } else {
            friendlyMsg += `\n\n📧 Email enviado para \`${_sentTo}\``;
          }
        }

        await base44.asServiceRole.entities.PendingWatchAction.create({
          watch_id:    watch.id,
          action_type: 'notify_user',
          payload:     JSON.stringify({
            watchId:    watch.id,
            watchName:  watch.name.replace(/ — Auto WE-04$/, ''),
            message:    friendlyMsg,
            timestamp:  now,
            emailSent:  _sentMessageId ? { to: _sentTo, messageId: _sentMessageId } : null,
          }),
          status:      'pending',
          retry_count: 0,
          max_retries: 3,
          expires_at:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          session_id:  watch.session_id || null,
        });

        // Fase 3 — Event-Driven Timeline (aditivo/shadow): publica SystemEvent
        // ao disparar, alongside PendingWatchAction. Nao substitui nada —
        // o chat continua exibindo via polling de PendingWatchAction.
        try {
          await base44.asServiceRole.entities.SystemEvent.create({
            conversationId: watch.session_id || '',
            correlationId:  watch.id,
            type:           'watch_triggered',
            source:         'WatchEngine',
            actor:          'system',
            status:         'success',
            payload: {
              watchId:   watch.id,
              watchName: watch.name.replace(/ — Auto WE-04$/, ''),
              message:   friendlyMsg,
              provider,
              emailSent: _sentMessageId ? { to: _sentTo, messageId: _sentMessageId } : null,
            },
            metadata: {
              triggeredAt:  now,
              triggerCount: (watch.trigger_count || 0) + 1,
            },
          });
        } catch { /* fire-and-forget — nunca quebra o tick */ }
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