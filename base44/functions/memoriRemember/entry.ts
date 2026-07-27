/**
 * memoriRemember — Backend function
 *
 * Grava um fato/preferência durável no Memori Cloud (memorilabs.ai) via
 * protocolo MCP sobre HTTP (tool memori_advanced_augmentation). A chave de
 * API fica protegida no backend (nunca exposta ao navegador).
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

    const { userMessage, assistantResponse } = body as {
      userMessage?: string;
      assistantResponse?: string;
    };
    if (!userMessage || !assistantResponse) {
      return Response.json(
        { error: 'Missing required fields: userMessage, assistantResponse' },
        { status: 400 },
      );
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
          name: 'memori_advanced_augmentation',
          arguments: {
            user_message: userMessage,
            assistant_response: assistantResponse,
          },
        },
      }),
    });
    const durationMs = Date.now() - t0;

    const rawText = await res.text();

    if (!res.ok) {
      console.error('[memoriRemember] HTTP error', res.status, rawText);
      return Response.json(
        { error: `Memori API error (HTTP ${res.status})`, raw: rawText },
        { status: res.status },
      );
    }

    const dataLine = rawText.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) {
      console.error('[memoriRemember] Formato de resposta inesperado', rawText);
      return Response.json({ error: 'Unexpected response format from Memori', raw: rawText }, { status: 502 });
    }

    const parsed = JSON.parse(dataLine.slice('data: '.length));

    if (parsed.error) {
      console.error('[memoriRemember] MCP error', JSON.stringify(parsed.error));
      return Response.json({ error: parsed.error.message ?? 'Memori MCP error' }, { status: 502 });
    }

    return Response.json({
      success: true,
      durationMs,
      totalMs: Date.now() - START_MS,
    });
  } catch (e) {
    console.error('[memoriRemember] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});