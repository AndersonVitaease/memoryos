/**
 * webSessionSweep — Marca WebSessions expiradas (RFC-012 lifecycle).
 *
 * Invocado por workflow agendado (Web Session Sweep). Roda como service role
 * (sem user session — é um tick do sistema) e varre TODAS as WebSessions
 * ativas cujo expires_at < agora, marcando-as como 'expired'. Sem isto,
 * sessões vencidas permanecem 'active' no banco e a operação 'use' do
 * webConnectorConnect as aceita, tentando reusar cookies mortos.
 *
 * Segurança: usa asServiceRole para bypass do RLS (WebSession é isolada por
 * created_by_id). O sweep é read+update de status — nunca toca em cookies ou
 * credenciais.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SDK_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SDK timeout (' + ms + 'ms): ' + label)), ms)),
  ]);
}

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const nowIso = new Date().toISOString();

  // Busca todas as WebSessions ativas cujo TTL venceu. Sem asServiceRole o
  // RLS bloquearia a leitura das sessões de outros usuários.
  let expiredSessions = [];
  try {
    expiredSessions = await withTimeout(
      base44.asServiceRole.entities.WebSession.filter({
        status: 'active',
        expires_at: { $lt: nowIso },
      }),
      SDK_TIMEOUT_MS,
      'filter_expired'
    );
  } catch (e) {
    return Response.json({ error: 'Failed to query expired sessions: ' + e.message }, { status: 500 });
  }

  if (!expiredSessions.length) {
    return Response.json({ ok: true, swept: 0, message: 'No expired sessions found.' });
  }

  // bulkUpdate aplica status='expired' a cada ID retornado. Usamos os IDs
  // reais (e não updateMany com o filtro) para garantir que apenas estas
  // sessões — e não novas que venceram entre a query e o update — sejam
  // marcadas, evitando marcar uma sessão recém-revalidada.
  const updates = expiredSessions.map((s) => ({ id: s.id, status: 'expired' }));
  let updated = 0;
  try {
    const result = await withTimeout(
      base44.asServiceRole.entities.WebSession.bulkUpdate(updates),
      SDK_TIMEOUT_MS,
      'bulk_update'
    );
    updated = Array.isArray(result) ? result.length : (typeof result === 'number' ? result : updates.length);
  } catch (e) {
    return Response.json({ error: 'Failed to mark sessions as expired: ' + e.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    swept: updated,
    swept_ids: expiredSessions.map((s) => s.id),
    checked_at: nowIso,
  });
}