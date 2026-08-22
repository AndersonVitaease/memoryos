/**
 * engMcpProxy — Proxy transparente server-side para MCP Streamable HTTP.
 *
 * LibreChat → Base44 engMcpProxy → ENG-MCP remoto
 *
 * O token ENG-MCP (secret ENG_MCP_BEARER_TOKEN) e injetado server-side e
 * NUNCA exposto ao cliente, aos logs, ou a respostas.
 *
 * Seguranca:
 *   - Valida X-Proxy-Secret contra secret ENG_MCP_PROXY_SECRET.
 *   - Sem o header correto → 403 Forbidden.
 *   - X-Proxy-Secret e removido antes de encaminhar ao upstream.
 *
 * Compatibilidade MCP Streamable HTTP:
 *   - Suporta GET (stream de notificacoes), POST (requests/notifications),
 *     DELETE (terminar sessao).
 *   - Preserva Content-Type, Accept, Mcp-Session-Id e demais headers MCP.
 *   - Passa upstream.body diretamente (ReadableStream) para preservar streaming
 *     SSE quando o ENG-MCP responde com text/event-stream.
 *
 * Secrets necessarios:
 *   ENG_MCP_BEARER_TOKEN  — token valido contra o ENG-MCP (ja existe).
 *   ENG_MCP_PROXY_SECRET — chave de autorizacao do proxy (nova).
 */
const ENG_MCP_URL = "https://memoryos-engmcp.2-25-96-245.nip.io/mcp";

// Headers hop-by-hop (RFC 7230) — nunca repassar em nenhuma direcao.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "x-proxy-secret",
  "authorization",
]);

/**
 * Filtra headers hop-by-hop + headers de proxy, retornando um Map limpo.
 * Remove Authorization e X-Proxy-Secret (serao reinjetados/separados).
 */
function filterForwardHeaders(src: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  src.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    out[key] = value;
  });
  return out;
}

/**
 * Filtra headers hop-by-hop da resposta upstream antes de retornar ao cliente.
 * Preserva Content-Type, Mcp-Session-Id e demais headers de protocolo.
 */
function filterResponseHeaders(src: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  src.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    // Preserva explicitamente headers criticos do MCP Streamable HTTP:
    // Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, etc.
    out[key] = value;
  });
  return out;
}

export default async function(req: Request): Promise<Response> {
  try {
    // ── 1. Validar X-Proxy-Secret ──────────────────────────────────────────
    const proxySecret = Deno.env.get("ENG_MCP_PROXY_SECRET");
    if (!proxySecret) {
      console.error("[engMcpProxy] ENG_MCP_PROXY_SECRET nao configurado");
      return Response.json(
        { error: "Proxy nao configurado (ENG_MCP_PROXY_SECRET ausente)" },
        { status: 503 },
      );
    }
    const clientSecret = req.headers.get("X-Proxy-Secret");
    if (!clientSecret || clientSecret !== proxySecret) {
      return Response.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    // ── 2. Ler o token ENG-MCP (write-only, nunca retornado/logado) ────────
    const engMcpToken = Deno.env.get("ENG_MCP_BEARER_TOKEN");
    if (!engMcpToken) {
      console.error("[engMcpProxy] ENG_MCP_BEARER_TOKEN nao configurado");
      return Response.json(
        { error: "Proxy nao configurado (ENG_MCP_BEARER_TOKEN ausente)" },
        { status: 503 },
      );
    }

    // ── 3. Montar headers do upstream ─────────────────────────────────────
    // Clona os headers do cliente, remove hop-by-hop + X-Proxy-Secret +
    // Authorization (sera reinjetado com o token correto).
    const forwardHeaders = filterForwardHeaders(req.headers);
    // Injeta o Authorization com o token ENG-MCP.
    forwardHeaders["Authorization"] = `Bearer ${engMcpToken}`;

    // ── 4. Encaminhar ao ENG-MCP ───────────────────────────────────────────
    // Preserva method, headers, e body. Para GET, body e null/undefined.
    // Para POST/DELETE, passa req.body (ReadableStream) diretamente quando
    // possivel, preservando streaming do request.
    const method = req.method;
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH";

    const upstreamRes = await fetch(ENG_MCP_URL, {
      method,
      headers: forwardHeaders,
      body: hasBody ? req.body : undefined,
      // redirect: "manual" — MCP nao usa redirects; se ocorrer, reporta.
      redirect: "manual",
    });

    // ── 5. Preservar resposta ──────────────────────────────────────────────
    // Passa upstream.body (ReadableStream) DIRETAMENTE no Response — mantem
    // streaming SSE (text/event-stream) sem bufferizar.
    // Preserva status, Content-Type, Mcp-Session-Id e demais headers.
    const responseHeaders = filterResponseHeaders(upstreamRes.headers);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(
      "[engMcpProxy] EXCEPTION — mensagem:",
      (error as Error).message,
      "(token nunca logado)",
    );
    return Response.json(
      { error: "Proxy error", detail: (error as Error).message },
      { status: 502 },
    );
  }
}