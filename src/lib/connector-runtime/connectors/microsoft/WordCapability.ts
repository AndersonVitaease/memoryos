/**
 * WordCapability.ts — servico Word Online do Microsoft Graph.
 *
 * Fase 4 (MS-EXP-04) — RFC-006 / ADR-013.
 * Capacidades: word.listDocuments, word.getDocumentText.
 * Escopo OAuth necessario: Files.Read (ja coberto por Files.Read.All).
 *
 * CAVEAT (limite da API Microsoft): o Graph REST NAO expoe texto de Word
 * como faz para Excel (Workbook API). A unica via REST e o binario .docx.
 * `getDocumentText` baixa o binario (URL pre-autenticada do Graph) no browser,
 * converte para base64 e reutiliza o backend `documentParser` (mammoth) para
 * extrair o texto — mesmo parser ja usado pelo pipeline de ingestao.
 *
 * Endpoints:
 *   GET /me/drive/root/search(q='.docx')  — buscar arquivos .docx
 *   GET /me/drive/items/{itemId}          — metadata + @microsoft.graph.downloadUrl
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";
import { base44 } from "@/api/base44Client";

/** Converte ArrayBuffer em base64 (chuncked para nao estourar a stack em arquivos grandes). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export const WordCapability: MicrosoftCapability = {
  id: "microsoft-word",
  operations: ["word.listDocuments", "word.getDocumentText"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "word.listDocuments": {
        const top = typeof payload.top === "number" ? payload.top : 20;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/drive/root/search(q='.docx')?$top=${top}&$select=id,name,webUrl,lastModifiedDateTime,size`,
          accessToken,
        );
        return ok({ documents: data.value ?? [] }, start, eid, logs, operation);
      }

      case "word.getDocumentText": {
        const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
        if (!itemId) return fail("itemId é obrigatório", start, eid, logs, operation);

        // 1. Obtem a URL pre-autenticada de download do Graph
        const meta = await graphFetch<{ "@microsoft.graph.downloadUrl"?: string; name?: string }>(
          `/me/drive/items/${itemId}?$select=name,@microsoft.graph.downloadUrl`,
          accessToken,
        );
        const downloadUrl = meta["@microsoft.graph.downloadUrl"];
        if (!downloadUrl) {
          return fail("Não foi possível obter a URL de download do documento", start, eid, logs, operation);
        }

        // 2. Baixa o binario .docx
        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) {
          return fail(`Falha ao baixar documento (HTTP ${fileRes.status})`, start, eid, logs, operation);
        }
        const buf = await fileRes.arrayBuffer();

        // 3. Extrai texto via backend documentParser (mammoth) — reutiliza infra existente
        const base64 = arrayBufferToBase64(buf);
        const parsed = await base44.functions.invoke("documentParser", {
          documentType: "docx",
          base64Content: base64,
          fileName: meta.name ?? itemId,
        });
        const d = parsed.data ?? parsed;
        if (d?.error) {
          return fail(`documentParser: ${d.error}`, start, eid, logs, operation);
        }
        return ok({ text: d?.text ?? "", charCount: d?.charCount ?? 0, name: meta.name }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown word operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};