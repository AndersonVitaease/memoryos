/**
 * documentParser — Backend function
 *
 * Extrai texto de documentos DOCX e XLSX (base64), usando bibliotecas
 * reais de parsing. Segue o mesmo padrao arquitetural de todo o resto do
 * dia: function de backend + capacidade registrada, reutilizavel por
 * qualquer conector futuro (Drive, Gmail attachments, upload direto,
 * servidor MCP proprio, etc — mesma "receita" ja usada pra conectores,
 * providers de IA e cliente MCP).
 *
 * Preenche o gap explicito ja documentado no proprio codigo
 * (UnsupportedDocumentParser.ts: "DOCX/XLSX — suporte planejado pra
 * Sprint M2.x") — nao duplica nada, so implementa o que ja estava
 * desenhado e faltando.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import mammoth from 'npm:mammoth@1.8.0';
import * as XLSX from 'npm:xlsx@0.18.5';

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function parseDocx(base64Content: string): Promise<{ text: string; meta: Record<string, unknown> }> {
  const bytes = base64ToUint8Array(base64Content);
  const result = await mammoth.extractRawText({ buffer: bytes });
  return {
    text: result.value ?? '',
    meta: { warnings: (result.messages ?? []).length },
  };
}

function parseXlsx(base64Content: string): { text: string; meta: Record<string, unknown> } {
  const workbook = XLSX.read(base64Content, { type: 'base64' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`## Planilha: ${sheetName}\n${csv}`);
  }
  return {
    text: parts.join('\n\n'),
    meta: { sheetCount: workbook.SheetNames.length, sheetNames: workbook.SheetNames },
  };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { documentType, base64Content, fileName } = body as {
      documentType?: 'docx' | 'xlsx';
      base64Content?: string;
      fileName?: string;
    };

    if (!documentType || !['docx', 'xlsx'].includes(documentType)) {
      return Response.json({ error: "Campo 'documentType' invalido — use 'docx' ou 'xlsx'" }, { status: 400 });
    }
    if (!base64Content) {
      return Response.json({ error: "Campo 'base64Content' obrigatorio" }, { status: 400 });
    }

    let result: { text: string; meta: Record<string, unknown> };
    if (documentType === 'docx') {
      result = await parseDocx(base64Content);
    } else {
      result = parseXlsx(base64Content);
    }

    return Response.json({
      text: result.text,
      charCount: result.text.length,
      meta: result.meta,
      fileName: fileName ?? null,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    console.error('[documentParser] EXCEPTION', (e as Error).message);
    return Response.json({ error: (e as Error).message, durationMs: Date.now() - t0 }, { status: 500 });
  }
});
