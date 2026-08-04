/**
 * microsoftGraphProxy — proxy generico para Microsoft Graph usando o token
 * do App-User Connector "outlook" da Base44 (Fase 4 — ADR-014 / RFC-007).
 *
 * O token OAuth do app user fica server-side (nunca exposto ao frontend).
 * O Base44OutlookProvider (frontend) monta a requisicao Graph {method, path,
 * body} e invoca esta funcao, que injeta o token e repassa.
 *
 * Entrada: { connectorId, method, path, body }
 * Saida:   { ok: true, data } | { ok: false, error, status }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const connectorId = payload?.connectorId;
    const method = (payload?.method || "GET").toUpperCase();
    const path = payload?.path;
    const graphBody = payload?.body;

    if (!connectorId) {
      return Response.json({ ok: false, error: 'connectorId e obrigatorio' });
    }
    if (!path || typeof path !== 'string') {
      return Response.json({ ok: false, error: 'path e obrigatorio' });
    }

    const connection = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
    const accessToken = connection?.accessToken;
    if (!accessToken) {
      return Response.json({ ok: false, error: 'Microsoft 365 (Base44) nao conectado. Conecte via /connections.' });
    }

    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: graphBody != null ? JSON.stringify(graphBody) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = `Microsoft Graph retornou HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        if (j?.error?.message) msg = j.error.message;
      } catch { /* mantem msg default */ }
      return Response.json({ ok: false, error: msg, status: res.status });
    }

    // 202/204 podem ter corpo vazio
    const data = text ? JSON.parse(text) : null;
    return Response.json({ ok: true, data });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}