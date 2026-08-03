/**
 * PowerPointCapability.ts — servico PowerPoint Online do Microsoft Graph.
 *
 * Fase 4 (MS-EXP-04) — RFC-006 / ADR-013.
 * Capacidades: pptx.listDocuments, pptx.getDocumentDownload.
 * Escopo OAuth necessario: Files.Read (ja coberto por Files.Read.All).
 *
 * CAVEAT (limite da API Microsoft, nao da arquitetura): o Graph REST NAO
 * expoe um endpoint de slides/intervalos para PowerPoint como faz para Excel
 * (Workbook API). A unica via REST e o binario .pptx via /content. O
 * `documentParser` (mammoth + SheetJS) nao suporta .pptx hoje, entao
 * extracao de texto de slides nao esta disponivel. `getDocumentDownload`
 * retorna a URL pre-autenticada + nome para download manual.
 *
 * Endpoints:
 *   GET /me/drive/root/search(q='.pptx')    — buscar arquivos .pptx
 *   GET /me/drive/items/{itemId}            — metadata + @microsoft.graph.downloadUrl
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const PowerPointCapability: MicrosoftCapability = {
  id: "microsoft-powerpoint",
  operations: ["pptx.listDocuments", "pptx.getDocumentDownload"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "pptx.listDocuments": {
        const top = typeof payload.top === "number" ? payload.top : 20;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/drive/root/search(q='.pptx')?$top=${top}&$select=id,name,webUrl,lastModifiedDateTime,size`,
          accessToken,
        );
        return ok({ documents: data.value ?? [] }, start, eid, logs, operation);
      }

      case "pptx.getDocumentDownload": {
        const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
        if (!itemId) return fail("itemId é obrigatório", start, eid, logs, operation);
        const meta = await graphFetch<{ "@microsoft.graph.downloadUrl"?: string; name?: string; webUrl?: string; size?: number }>(
          `/me/drive/items/${itemId}?$select=name,webUrl,size,@microsoft.graph.downloadUrl`,
          accessToken,
        );
        return ok(
          {
            downloadUrl: meta["@microsoft.graph.downloadUrl"] ?? null,
            name: meta.name,
            webUrl: meta.webUrl,
            size: meta.size,
            note: "Graph REST nao expoe texto de slides; baixe o .pptx via downloadUrl.",
          },
          start,
          eid,
          logs,
          operation,
        );
      }

      default:
        return fail(`Unknown powerpoint operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};