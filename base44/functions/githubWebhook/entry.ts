/**
 * githubWebhook — receptor publico de webhooks do GitHub (Upgrade 3).
 *
 * Endpoint chamado PELO GitHub (sem auth de usuario). Valida a assinatura
 * HMAC-SHA256 (header x-hub-signature-256) contra GITHUB_WEBHOOK_SECRET.
 * Aceita eventos push, pull_request, issues, release, workflow_run e
 * persiste um SystemEvent resumido para o WatchEngine / CognitiveEventBus
 * consumir. Responde 200 em <10s (requisito do GitHub).
 *
 * IMPORTANTE: configure o secret GITHUB_WEBHOOK_SECRET em
 * Dashboard > Settings > Environment Variables. Use o MESMO valor ao
 * registrar o webhook no repo (via conector: repos.createWebhook).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { secrets } from 'base44:runtime';

async function verifySignature(body: string, sigHeader: string | null, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  // sigHeader = "sha256=<hex>"
  const expected = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default async function(req) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get('x-hub-signature-256');
    const event = req.headers.get('x-github-event') || 'unknown';
    const deliveryId = req.headers.get('x-github-delivery') || '';
    const secret = secrets.get('GITHUB_WEBHOOK_SECRET');

    // Sem secret configurado: rejeita (nao podemos validar).
    if (!secret) {
      return Response.json({ error: 'GITHUB_WEBHOOK_SECRET not configured' }, { status: 503 });
    }
    const valid = await verifySignature(rawBody, sig, secret);
    if (!valid) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload = {};
    try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch { payload = {}; }

    // Resumo do evento (campos comuns a push/PR/issue).
    const repoFullName = payload.repository?.full_name ?? '';
    const sender = payload.sender?.login ?? '';
    let summary: Record<string, unknown> = { repo: repoFullName, sender, event, deliveryId };

    if (event === 'push') {
      summary.ref = payload.ref;
      summary.commits = (payload.commits ?? []).map((c) => ({ id: c.id?.slice(0, 7), message: c.message?.split('\n')[0], author: c.author?.username }));
      summary.forced = payload.forced ?? false;
    } else if (event === 'pull_request') {
      const pr = payload.pull_request ?? {};
      summary.action = payload.action;
      summary.number = pr.number;
      summary.title = pr.title;
      summary.head = pr.head?.ref;
      summary.base = pr.base?.ref;
      summary.state = pr.state;
      summary.draft = pr.draft ?? false;
      summary.merged = pr.merged ?? false;
    } else if (event === 'issues') {
      const issue = payload.issue ?? {};
      summary.action = payload.action;
      summary.number = issue.number;
      summary.title = issue.title;
      summary.state = issue.state;
      summary.labels = (issue.labels ?? []).map((l) => l.name);
    } else if (event === 'release') {
      const rel = payload.release ?? {};
      summary.action = payload.action;
      summary.tagName = rel.tag_name;
      summary.name = rel.name;
      summary.prerelease = rel.prerelease ?? false;
    } else if (event === 'workflow_run') {
      const run = payload.workflow_run ?? {};
      summary.action = payload.action;
      summary.runId = run.id;
      summary.name = run.name;
      summary.status = run.status;
      summary.conclusion = run.conclusion;
      summary.branch = run.head_branch;
    }

    // Persiste um SystemEvent para o WatchEngine/CognitiveEventBus consumir.
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.SystemEvent.create({
      conversationId: repoFullName ? `github:${repoFullName}` : 'github:webhook',
      correlationId: deliveryId,
      type: `github_webhook_${event}`,
      source: 'GitHubWebhook',
      actor: sender || 'system',
      status: 'success',
      payload: summary,
      metadata: { deliveryId, event, receivedAt: new Date().toISOString() },
    });

    return Response.json({ ok: true, event, deliveryId });
  } catch (error) {
    // Mesmo em erro, responde 200 pra o GitHub nao retransmitir indefinidamente.
    return Response.json({ ok: false, error: error.message }, { status: 200 });
  }
}