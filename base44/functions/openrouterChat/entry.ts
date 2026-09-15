/**
 * openrouterChat — Backend function
 *
 * Chama a API do OpenRouter (chat completions) usando a chave de API
 * guardada com segurança nas variáveis de ambiente do backend (nunca
 * exposta ao navegador).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  const START_MS = Date.now();

  try {
    let base44: any;
    try {
      // Diagnostico temporario: isola a criacao do client no openrouterChat.
      base44 = createClientFromRequest(req);
    } catch (e) {
      return Response.json({ error: 'OPENROUTER_PRE_GATE_CLIENT_FAILED' }, { status: 500 });
    }

    // Gate server-to-server (UCME): o conversationContext chama esta funcao
    // internamente com o header x-agent-memory-token = AGENT_MEMORY_MCP_SECRET,
    // sem JWT de usuario. auth.me() lanca sem usuario, entao o token interno e
    // validado ANTES; sem token valido, o fluxo de usuario (auth.me()) segue
    // exatamente como antes. O valor do secret nunca e retornado ou logado.
    const internalToken = req.headers.get('x-agent-memory-token');
    const expectedInternalToken = secrets.get('AGENT_MEMORY_MCP_SECRET');
    const internalAuthOk = Boolean(expectedInternalToken) && internalToken === expectedInternalToken;
    if (!internalAuthOk) {
      const user = await base44.auth.me();
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { model, messages, maxTokens } = body as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      maxTokens?: number;
    };

    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: 'Missing required fields: model, messages (non-empty array)' },
        { status: 400 },
      );
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
    }

    const t0 = Date.now();
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens ?? 1024,
      }),
    });
    const durationMs = Date.now() - t0;
    const data = await res.json();

    if (!res.ok) {
      console.error('[openrouterChat] HTTP error', res.status, JSON.stringify(data));
      return Response.json(
        { error: data?.error?.message ?? `OpenRouter API error (HTTP ${res.status})`, status: res.status },
        { status: res.status },
      );
    }

    const reply = data?.choices?.[0]?.message?.content ?? null;
    const usage = data?.usage ?? null;

    return Response.json({
      reply,
      model: data?.model ?? model,
      usage,
      durationMs,
      totalMs: Date.now() - START_MS,
    });
  } catch (e) {
    console.error('[openrouterChat] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
