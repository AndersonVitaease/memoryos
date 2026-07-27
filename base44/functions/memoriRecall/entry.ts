/**
 * memoriRecall — Backend function
 *
 * Busca memórias relevantes no Memori Cloud (memorilabs.ai) via protocolo
 * MCP sobre HTTP. A chave de API fica protegida no backend (nunca exposta
 * ao navegador).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MEMORI_ENTITY_ID = 'anderson_vitaease';

Deno.serve(async (req) => {
  const START_MS = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { query } = body as { query?: string };
    if (!query) {
      return Response.json({ error: 'Missing required field: query' }, { status: 400 });
    }

    const apiKey = Deno.env.get('MEMORI_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Memori API key not configured' }, { status: 500 });
    }

    const t0 = Date.now();
    const res = await fetch('https://api.memorilabs.ai/mcp/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'X-Memori-API-Key': apiKey,
        'X-Memori-Entity-Id': MEMORI_ENTITY_ID,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'memori_recall',
          arguments: { query },
        },
      }),
    });
    const durationMs = Date.now() - t0;

    const rawText = await res.text();

    if (!res.ok) {
      console.error('[memoriRecall] HTTP error', res.status, rawText);
      return Response.json(
        { error: `Memori API error (HTTP ${res.status})`, raw: rawText },
        { status: res.status },
      );
    }

    // Resposta vem em formato SSE: "event: message\ndata: {...}\n\n"
    // Extrai o JSON de dentro da linha que começa com "data: "
    const dataLine = rawText.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) {
      console.error('[memoriRecall] Formato de resposta inesperado', rawText);
      return Response.json({ error: 'Unexpected response format from Memori', raw: rawText }, { status: 502 });
    }

    const parsed = JSON.parse(dataLine.slice('data: '.length));

    if (parsed.error) {
      console.error('[memoriRecall] MCP error', JSON.stringify(parsed.error));
      return Response.json({ error: parsed.error.message ?? 'Memori MCP error' }, { status: 502 });
    }

    const structuredContent = parsed.result?.structuredContent;
    const memories = structuredContent?.memories ?? [];

    return Response.json({
      memories,
      count: Array.isArray(memories) ? memories.length : 0,
      durationMs,
      totalMs: Date.now() - START_MS,
    });
  } catch (e) {
    console.error('[memoriRecall] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});