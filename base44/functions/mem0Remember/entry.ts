/**
 * mem0Remember — Backend function
 *
 * Grava um fato/preferência durável no Mem0 (mcp.mem0.ai) via protocolo MCP
 * sobre HTTP (tool add_memory). A chave de API (MEM0_API_KEY) fica protegida
 * no backend (nunca exposta ao navegador).
 *
 * Diferente do memoriRemember (Memori Labs / memorilabs.ai — servico distinto),
 * este grava no Mem0 propriamente dito, que e o mesmo servico que clientes
 * MCP externos (Claude, Cursor, etc.) consultam em mcp.mem0.ai. Assim as
 * anotacoes ficam visiveis para as outras IAs conectadas ao mesmo Mem0.
 *
 * Payload:
 *   { userMessage, assistantResponse, content?, userId?, agentId?, appId? }
 *   - content: texto livre (alternativa a userMessage+assistantResponse)
 *   - userId/agentId/appId: opcionais, default 'anderson_vitaease'/'memoryos'/'memoryos'
 *     Devem bater com os filtros usados pela IA que vai recuperar as memorias.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DEFAULT_USER_ID = 'anderson_vitaease';
const DEFAULT_AGENT_ID = 'memoryos';
const DEFAULT_APP_ID = 'memoryos';

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

    const {
      userMessage,
      assistantResponse,
      content,
      userId,
      agentId,
      appId,
    } = body as {
      userMessage?: string;
      assistantResponse?: string;
      content?: string;
      userId?: string;
      agentId?: string;
      appId?: string;
    };

    const memoryContent =
      content ||
      [userMessage, assistantResponse].filter(Boolean).map((part, i) => (i === 0 ? `User: ${part}` : `Assistant: ${part}`)).join('\n\n');

    if (!memoryContent) {
      return Response.json(
        { error: 'Missing required fields: provide userMessage+assistantResponse or content' },
        { status: 400 },
      );
    }

    const apiKey = Deno.env.get('MEM0_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'MEM0_API_KEY not configured' }, { status: 500 });
    }

    const memUserId = userId || DEFAULT_USER_ID;
    const memAgentId = agentId || DEFAULT_AGENT_ID;
    const memAppId = appId || DEFAULT_APP_ID;

    try {
      const t0 = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let res;
      try {
        res = await fetch('https://mcp.mem0.ai/mcp/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Token ${apiKey}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'add_memory',
              arguments: {
                text: memoryContent,
                userId: memUserId,
                agentId: memAgentId,
                appId: memAppId,
                infer: true,
              },
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      console.log('[mem0Remember] FETCH COMPLETED', { status: res.status, ok: res.ok });
      const durationMs = Date.now() - t0;

      const rawText = await res.text();
      console.log('[mem0Remember] RAW RESPONSE', res.status, rawText.substring(0, 800));

      if (!res.ok) {
        console.error('[mem0Remember] HTTP error', res.status, rawText);
        return Response.json(
          { error: `Mem0 API error (HTTP ${res.status})`, raw: rawText.substring(0, 1000) },
          { status: res.status },
        );
      }

      // Mem0 MCP pode responder em JSON puro ou SSE (data: ...). Tenta ambos.
      let parsed: Record<string, unknown> | null = null;
      const dataLine = rawText.split('\n').find((line) => line.startsWith('data: '));
      try {
        if (dataLine) {
          parsed = JSON.parse(dataLine.slice('data: '.length));
        } else {
          parsed = JSON.parse(rawText);
        }
      } catch (parseErr) {
        // Resposta nao-JSON pode indicar que o add_memory aceitou e respondeu
        // num formato inesperado. Loga e tenta tratar como sucesso se status ok.
        console.error('[mem0Remember] PARSE ERROR', (parseErr as Error).message, rawText.substring(0, 500));
        return Response.json(
          { error: 'Unexpected response format from Mem0', raw: rawText.substring(0, 1000) },
          { status: 502 },
        );
      }
      console.log('[mem0Remember] PARSED', JSON.stringify(parsed).substring(0, 800));

      const mcpResult = parsed?.result as Record<string, unknown> | undefined;
      const isToolError = mcpResult?.isError === true;
      const errorText = isToolError
        ? ((mcpResult?.content as Array<{ text?: string }>)?.[0]?.text ?? 'Mem0 tool error')
        : null;

      if (parsed?.error) {
        console.error('[mem0Remember] MCP protocol error', JSON.stringify(parsed.error));
        const errMsg = (parsed.error as { message?: string }).message ?? 'Mem0 MCP error';
        return Response.json({ error: errMsg }, { status: 502 });
      }

      if (isToolError) {
        console.error('[mem0Remember] Tool error', errorText);
        return Response.json({ error: errorText }, { status: 502 });
      }

      return Response.json({
        success: true,
        durationMs,
        totalMs: Date.now() - START_MS,
        storedAt: 'mcp.mem0.ai',
        userId: memUserId,
        agentId: memAgentId,
        appId: memAppId,
      });
    } catch (innerErr) {
      console.error('[mem0Remember] INNER EXCEPTION', (innerErr as Error).message, (innerErr as Error).stack);
      return Response.json({ error: `Inner exception: ${(innerErr as Error).message}` }, { status: 500 });
    }
  } catch (e) {
    console.error('[mem0Remember] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});