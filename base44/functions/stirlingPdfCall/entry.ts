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

function jsonError(_status: number, message: string, extra: Record<string, unknown> = {}): Response {
  // Sempre retorna HTTP 200 com ok:false para o invoke client nao lancar
  // erro generico — o frontend le o campo `error`/`detail` diretamente.
  return Response.json({ ok: false, error: message, ...extra }, { status: 200 });
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function pdfJson(buf: ArrayBuffer, contentType = "application/pdf"): Response {
  return Response.json({ ok: true, contentType, base64: bufToBase64(buf) });
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

  // ── health: diagnostico de conectividade + validade REAL da API key ─────
  // NOTA: /api/v1/info/status é PUBLICO no Stirling-PDF — retorna 200 mesmo sem
  // chave, logo NÃO serve para validar a API key. Precisamos bater num endpoint
  // protegido (extract/pdf-to-text) e checar: 401 => chave invalida; 400/500 =>
  // chave valida (requisição malformada, mas autenticada).
  if (operation === "health") {
    const key = getApiKey();
    const tries: Array<{ url: string; status: number; ok: boolean; body: string | null }> = [];
    // 1. status publico — confirma apenas que o servico responde
    try {
      const r0 = await withTimeout(fetch(`${baseUrl}/api/v1/info/status`));
      tries.push({ url: `/api/v1/info/status`, status: r0.status, ok: r0.ok, body: (await r0.text().catch(() => "")).slice(0, 200) });
    } catch (e) {
      tries.push({ url: `/api/v1/info/status`, status: -1, ok: false, body: String(e) });
    }
    // 2. endpoint protegido sem file — valida a API key de verdade
    let keyValid = false;
    try {
      const r1 = await withTimeout(fetch(`${baseUrl}/api/v1/convert/pdf/text`, {
        method: "POST",
        headers: { "X-API-KEY": key, "Accept": "application/json" },
      }));
      const body1 = (await r1.text().catch(() => "")).slice(0, 200);
      tries.push({ url: `/api/v1/convert/pdf/text (key probe)`, status: r1.status, ok: r1.status !== 401, body: body1 });
      keyValid = r1.status !== 401;
    } catch (e) {
      tries.push({ url: `/api/v1/extract/pdf-to-text (key probe)`, status: -1, ok: false, body: String(e) });
    }
    return Response.json({
      ok: keyValid,
      baseUrl,
      apiKeyConfigured: !!key,
      apiKeyValid: keyValid,
      tries,
      note: keyValid
        ? "API key valida — operacoes devem funcionar."
        : "API key INVALIDA — /info/status é publico e mascara o erro. Verifique SECURITY_CUSTOMGLOBALAPIKEY no VPS e redefina o secret STIRLING_PDF_API_KEY.",
    });
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
      return pdfJson(buf);
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
      return pdfJson(buf, ctype);
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
      return pdfJson(buf);
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
      return pdfJson(buf);
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
      return pdfJson(buf);
    }

    // Repair: reparar PDF corrompido/danificado
    if (operation === "repair") {
      const fileUrl = String(body.fileUrl ?? "");
      if (!fileUrl) return jsonError(400, "fileUrl required");
      const form = new FormData();
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      form.append("fileInput", await f.blob(), "input.pdf");
      const r = await withTimeout(fetch(`${baseUrl}/api/v1/misc/repair`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
      }));
      if (!r.ok) return jsonError(r.status, `Stirling repair failed`, { detail: (await r.text().catch(() => "")) });
      const buf = await r.arrayBuffer();
      return pdfJson(buf);
    }

    // pdfToText: extrair texto (v2.14: /convert/pdf/text exige outputFormat=txt)
    // Auto-repara se o PDF estiver corrompido/danificado.
    if (operation === "pdfToText") {
      const fileUrl = String(body.fileUrl ?? "");
      if (!fileUrl) return jsonError(400, "fileUrl required");
      const f = await fetch(fileUrl);
      if (!f.ok) return jsonError(502, `Failed to fetch file: ${f.status}`);
      const originalBlob = await f.blob();

      const tryExtract = async (blob: Blob): Promise<{ ok: boolean; text?: string; detail?: string; status?: number }> => {
        const form = new FormData();
        form.append("fileInput", blob, "input.pdf");
        form.append("outputFormat", "txt");
        const r = await withTimeout(fetch(`${baseUrl}/api/v1/convert/pdf/text`, {
          method: "POST",
          headers: { "X-API-KEY": apiKey },
          body: form,
        }));
        if (!r.ok) return { ok: false, status: r.status, detail: (await r.text().catch(() => "")) };
        return { ok: true, text: await r.text() };
      };

      let result = await tryExtract(originalBlob);
      if (!result.ok) {
        const det = (result.detail || "").toLowerCase();
        const corrupted = det.includes("corrupt") || det.includes("damag") || det.includes("repair");
        if (corrupted) {
          // Tenta reparar e extrair novamente
          const repForm = new FormData();
          repForm.append("fileInput", originalBlob, "input.pdf");
          const repR = await withTimeout(fetch(`${baseUrl}/api/v1/misc/repair`, {
            method: "POST",
            headers: { "X-API-KEY": apiKey },
            body: repForm,
          }));
          if (repR.ok) {
            const repairedBlob = await repR.blob();
            result = await tryExtract(repairedBlob);
            if (result.ok) {
              return Response.json({ ok: true, text: result.text, repaired: true });
            }
          }
          return jsonError(500, "PDF corrompido: a reparacao automatica falhou. Tente reparar manualmente.", { detail: result.detail });
        }
        return jsonError(result.status || 500, `Stirling pdfToText failed`, { detail: result.detail });
      }
      return Response.json({ ok: true, text: result.text });
    }

    return jsonError(400, `Unknown operation: ${operation}`);
  } catch (e) {
    return jsonError(500, `stirlingPdfCall error: ${e instanceof Error ? e.message : String(e)}`);
  }
}