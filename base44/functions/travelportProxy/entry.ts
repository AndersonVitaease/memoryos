/**
 * travelportProxy — Backend function para Travelport TripServices JSON API
 * (RFC-011 / ADR-018, Sprint GDS-01).
 *
 * Gerencia o ciclo de vida do token OAuth2 (grant "password", two-legged)
 * e repassa chamadas para Air/Hotel/Pay, injetando Authorization + o
 * header de identificacao do ponto de venda (Access Group).
 *
 * Secrets necessarios (Settings > Environment Variables):
 *   TRAVELPORT_USERNAME
 *   TRAVELPORT_PASSWORD
 *   TRAVELPORT_CLIENT_ID
 *   TRAVELPORT_CLIENT_SECRET
 *   TRAVELPORT_PCC             (nao usado diretamente hoje — TVP-PCC-CORE
 *                                e alternativa ao Access Group, nao usada
 *                                por padrao; ver "Common Flights API Headers")
 *   TRAVELPORT_ACCESS_GROUP
 *   TRAVELPORT_ENV              "pp" (default) | "prod"
 *
 * Diferenca de padrao vs microsoftOAuthRefresh/googleOAuthRefresh:
 * aqueles retornam { accessToken, expiresAt } para o FRONTEND cachear
 * (sessao por usuario, multi-conta). O Travelport aqui e uma credencial
 * UNICA de agencia (nao por usuario) — por isso o token e cacheado no
 * proprio modulo Deno (escopo de arquivo), sobrevivendo entre invocacoes
 * "quentes" da function. Se a instancia for reciclada (cold start), um
 * novo token e gerado automaticamente — comportamento correto, so nao
 * e garantido reaproveitar entre requests fisicamente distantes no tempo.
 * Nunca gera token por request quando ha um cache valido.
 *
 * Operacoes suportadas (body.action):
 *   "authTest" — forca fetch/validacao do token, retorna metadata SEM
 *                expor o token (diagnostico de GDS-01, sem tocar em
 *                nenhum endpoint de Air/Hotel/Pay ainda).
 *   "proxy"    — passthrough generico: { service, path, method, body }
 *                service: "air" | "hotel" | "payment"
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const AUTH_BASE = {
  pp: 'https://auth.pp.travelport.net',
  prod: 'https://auth.travelport.net',
};

const API_BASE = {
  pp: 'https://api.pp.travelport.net',
  prod: 'https://api.travelport.net',
};

// Base paths por servico, dentro do API_BASE do ambiente ativo.
const SERVICE_PATH: Record<string, string> = {
  air: '/11/air',
  hotel: '/12/hotel',
  payment: '/11/payment',
};

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// Cache em escopo de modulo — sobrevive entre invocacoes "quentes" da
// mesma instancia Deno. Reiniciado em cold start (aceitavel: o proximo
// request so busca um novo token, nao quebra nada).
let _cachedToken: CachedToken | null = null;

function getEnv(): 'pp' | 'prod' {
  const v = (Deno.env.get('TRAVELPORT_ENV') || 'pp').toLowerCase();
  return v === 'prod' ? 'prod' : 'pp';
}

function missingSecrets(): string[] {
  const required = [
    'TRAVELPORT_USERNAME',
    'TRAVELPORT_PASSWORD',
    'TRAVELPORT_CLIENT_ID',
    'TRAVELPORT_CLIENT_SECRET',
    'TRAVELPORT_ACCESS_GROUP',
  ];
  return required.filter((k) => !Deno.env.get(k));
}

/**
 * Retorna um access_token valido, reusando o cache se ainda nao expirou
 * (margem de seguranca de 5 minutos). So gera um novo token via HTTP se
 * necessario — nunca por request quando o cache e valido.
 */
async function getValidToken(): Promise<string> {
  const now = Date.now();
  const SAFETY_MARGIN_MS = 5 * 60 * 1000;

  if (_cachedToken && _cachedToken.expiresAt - SAFETY_MARGIN_MS > now) {
    return _cachedToken.accessToken;
  }

  const env = getEnv();
  const authUrl = `${AUTH_BASE[env]}/oauth/token`;

  const params = new URLSearchParams();
  params.set('grant_type', 'password');
  params.set('username', Deno.env.get('TRAVELPORT_USERNAME')!);
  params.set('password', Deno.env.get('TRAVELPORT_PASSWORD')!);
  params.set('client_id', Deno.env.get('TRAVELPORT_CLIENT_ID')!);
  params.set('client_secret', Deno.env.get('TRAVELPORT_CLIENT_SECRET')!);

  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = `Travelport auth retornou HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j?.error_description) msg = j.error_description;
      else if (j?.error) msg = j.error;
    } catch { /* mantem msg default */ }
    throw new Error(msg);
  }

  const data = JSON.parse(text);
  const accessToken = data?.access_token;
  if (!accessToken) {
    throw new Error('Travelport auth respondeu 200 mas sem access_token no corpo.');
  }

  const expiresInSec = Number(data?.expires_in) || 86400; // doc: 24h (86400s)
  _cachedToken = {
    accessToken,
    expiresAt: Date.now() + expiresInSec * 1000,
  };

  return accessToken;
}

function buildHeaders(accessToken: string, hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    // Access Group prevalece se os dois headers forem enviados (doc oficial:
    // "If both header fields are sent, Travelport uses the access group.")
    // — por isso so enviamos este, nao o TVP-PCC-CORE.
    XAUTH_TRAVELPORT_ACCESSGROUP: Deno.env.get('TRAVELPORT_ACCESS_GROUP')!,
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

Deno.serve(async (req) => {
  const START_MS = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const missing = missingSecrets();
    if (missing.length > 0) {
      return Response.json({
        ok: false,
        error: `Travelport nao configurado. Secrets ausentes: ${missing.join(', ')}.`,
      }, { status: 503 });
    }

    const action = (payload?.action as string) || 'proxy';

    // ── Diagnostico (GDS-01): so valida que auth funciona, sem tocar em Air/Hotel/Pay ──
    if (action === 'authTest') {
      const accessToken = await getValidToken();
      return Response.json({
        ok: true,
        action: 'authTest',
        env: getEnv(),
        tokenPreview: `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}`,
        expiresAt: _cachedToken?.expiresAt ?? null,
        cachedNow: true,
        totalMs: Date.now() - START_MS,
      });
    }

    // ── Passthrough generico ──
    const service = (payload?.service as string) || 'air';
    const method = ((payload?.method as string) || 'GET').toUpperCase();
    const path = payload?.path as string;
    const reqBody = payload?.body;

    if (!SERVICE_PATH[service]) {
      return Response.json({
        ok: false,
        error: `service invalido: "${service}". Use "air", "hotel" ou "payment".`,
      }, { status: 400 });
    }
    if (!path || typeof path !== 'string') {
      return Response.json({ ok: false, error: 'path e obrigatorio' }, { status: 400 });
    }

    const accessToken = await getValidToken();
    const env = getEnv();
    const url = `${API_BASE[env]}${SERVICE_PATH[service]}${path}`;
    const hasBody = reqBody != null && method !== 'GET';

    const res = await fetch(url, {
      method,
      headers: buildHeaders(accessToken, hasBody),
      body: hasBody ? JSON.stringify(reqBody) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = `Travelport API retornou HTTP ${res.status}`;
      let detail: unknown = null;
      try {
        detail = JSON.parse(text);
      } catch { /* corpo nao-JSON, mantem msg default */ }
      console.error('[travelportProxy] HTTP error', res.status, text.slice(0, 500));
      return Response.json({ ok: false, error: msg, status: res.status, detail }, { status: res.status });
    }

    const data = text ? JSON.parse(text) : null;
    return Response.json({ ok: true, data, totalMs: Date.now() - START_MS });
  } catch (e) {
    console.error('[travelportProxy] EXCEPTION', (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
