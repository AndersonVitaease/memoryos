/**
 * stirlingPdfCall — proxy para a instancia Stirling-PDF self-hosted (VPS).
 *
 * Secrets:
 *   STIRLING_PDF_URL     -> URL publica do Stirling-PDF (ex: http://2.25.96.245:8080)
 *   STIRLING_PDF_API_KEY -> chave de API gerada no painel do Stirling-PDF
 *
 * Operations:
 *   health              -> diagnostico de conectividade + API key
 *   merge               -> juntar varios PDFs em um so
 *   split               -> dividir um PDF em varias paginas
 *   rotate             -> girar paginas de um PDF
 *   addPassword         -> proteger PDF com senha
 *   removePassword      -> remover senha de PDF
 *   pdfToImage          -> converter PDF em imagem (PNG/JPEG)
 *   pdfToText           -> extrair texto de um PDF
 */
const TIMEOUT_MS = 120000;

function getBaseUrl(): string {
  const url = Deno.env.get("STIRLING_PDF_URL") ?? "";
  return url.replace(/\/+$/, "");
}

function getApiKey(): string {
  return Deno.env.get("STIRLING_PDF_API_KEY") ?? "";
}

function authHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (apiKey) headers["X-API-KEY"] = apiKey;
  return headers;
}

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

function withTimeout(fetchPromise: Promise<Response>): Promise<Response> {
  return Promise.race([
    fetchPromise,
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout contacting Stirling-PDF")), TIMEOUT_MS)
    ),
  ]);
}

export default async function (req: Request): Promise<Response> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return jsonError(400, "STIRLING_PDF_URL not configured");

  const isAuth = await req.json?.().catch?.(() => ({}));
  let body: any = isAuth;
  if (!body || typeof body !== "object") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const operation = String(body.operation ?? "health");

  // ── health: diagnostico de conectividade + API key ─────────────────────
  if (operation === "health") {
    const tries: Array<{ url: string; status: number; ok: boolean; body: string | null }> = [];
    // 1. UI root (sem auth) — confirma que o servico responde
    try {
      const r0 = await withTimeout(fetch(`${baseUrl}/`));
      tries.push({ url: `${baseUrl}/`, status: r0.status, ok: r0.ok, body: (await r0.text().catch(() => "")).slice(0, 120) });
    } catch (e) {
      tries.push({ url: `${baseUrl}/`, status: -1, ok: false, body: String(e) });
    }
    // 2. status com API key
    try {
      const r1 = await withTimeout(fetch(`${baseUrl}/api/v1/info/status`, { headers: authHeaders() }));
      tries.push({ url: `/api/v1/info/status`, status: r1.status, ok: r1.ok, body: (await r1.text().catch(() => "")).slice(0, 200) });
    } catch (e) {
      tries.push({ url: `/api/v1/info/status`, status: -1, ok: false, body: String(e) });
    }
    const anyOk = tries.some(t => t.ok);
    return Response.json({ ok: anyOk, baseUrl, apiKeyConfigured: !!getApiKey(), tries });
  }

  // ── Operacoes que exigem API key ──────────────────────────────────────
  const apiKey = getApiKey();
  if (!apiKey) return jsonError(400, "STIRLING_PDF_API_KEY not configured");

  try {
    // Merge: varios PDFs -> um so (multipart/form-data)
    if (operation === "merge") {
      const files: string[] = Array.isArray(body.fileUrls) ? body.fileUrls : [];
      if (files.length < 2) return jsonError(400, "fileUrls (array, min 2) required");
      const form = new FormData();
      for (let i = 0; i < files.length; i++) {
        const f = await fetch(files[i]);
        if (!f.ok) return jsonError(502, `Failed to fetch file ${i}: ${f.status}`);
        const blob = await f.blob();
        form.append("fileInput", blob, `file${i}.pdf`);
      }
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/general/merge-pdfs`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling merge failed`, { detail: (await r.text().catch(() => "")) });
      const buf = await r.arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": "application/pdf" } });
    }

    // Split: um PDF em varias paginas
    if (operation === "split") {
      const fileUrl = String(body.fileUrl ?? "");
      if (!fileUrl) return jsonError(400, "fileUrl required");
      const mode = String(body.mode ?? "pages"); // pages | intervals | sizes
      const form = new FormData();
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      form.append("fileInput", await f.blob(), "input.pdf");
      form.append("mode", mode);
      if (body.pages != null) form.append("pages", String(body.pages));
      if (body.intervals != null) form.append("intervals", String(body.intervals));
      if (body.firstPage != null) form.append("firstPage", String(body.firstPage));
      if (body.lastPage != null) form.append("lastPage", String(body.lastPage));
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/general/split-pdf`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling split failed`, { detail: (await r.text().catch(() => "")) });
      // Split retorna ZIP (multiplas paginas) ou PDF (intervalo)
      const ctype = r.headers.get("content-type") ?? "application/zip";
      const buf = await r.arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": ctype } });
    }

    // Rotate: girar paginas
    if (operation === "rotate") {
      const fileUrl = String(body.fileUrl ?? "");
      if (!fileUrl) return jsonError(400, "fileUrl required");
      const angle = Number(body.angle ?? 90);
      if (![90, 180, 270].includes(angle)) return jsonError(400, "angle must be 90, 180 or 270");
      const form = new FormData();
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      form.append("fileInput", await f.blob(), "input.pdf");
      form.append("angle", String(angle));
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/general/rotate-pdf`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling rotate failed`, { detail: (await r.text().catch(() => "")) });
      const buf = await r.arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": "application/pdf" } });
    }

    // AddPassword: proteger PDF
    if (operation === "addPassword") {
      const fileUrl = String(body.fileUrl ?? "");
      const password = String(body.password ?? "");
      if (!fileUrl || !password) return jsonError(400, "fileUrl and password required");
      const form = new FormData();
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      form.append("fileInput", await f.blob(), "input.pdf");
      form.append("password", password);
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/security/add-password`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling addPassword failed`, { detail: (await r.text().catch(() => "")) });
      const buf = await r.arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": "application/pdf" } });
    }

    // RemovePassword: remover senha
    if (operation === "removePassword") {
      const fileUrl = String(body.fileUrl ?? "");
      const password = String(body.password ?? "");
      if (!fileUrl || !password) return jsonError(400, "fileUrl and password required");
      const form = new FormData();
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      form.append("fileInput", await f.blob(), "input.pdf");
      form.append("password", password);
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/security/remove-password`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling removePassword failed`, { detail: (await r.text().catch(() => "")) });
      const buf = await r.arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": "application/pdf" } });
    }

    // pdfToText: extrair texto
    if (operation === "pdfToText") {
      const fileUrl = String(body.fileUrl ?? "");
      if (!fileUrl) return jsonError(400, "fileUrl required");
      const form = new FormData();
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      form.append("fileInput", await f.blob(), "input.pdf");
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/extract/pdf-to-text`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling pdfToText failed`, { detail: (await r.text().catch(() => "")) });
      const text = await r.text();
      return Response.json({ ok: true, text });
    }

    return jsonError(400, `Unknown operation: ${operation}`);
  } catch (e) {
    return jsonError(500, `stirlingPdfCall error: ${e instanceof Error ? e.message : String(e)}`);
  }
}