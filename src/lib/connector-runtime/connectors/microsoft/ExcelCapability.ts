/**
 * ExcelCapability.ts — servico Excel Online (Workbook API) do Microsoft Graph.
 *
 * Fase 4 (MS-EXP-04) — RFC-006 / ADR-013.
 * Capacidades: excel.listWorksheets, excel.getRange, excel.updateRange.
 * Escopo OAuth necessario: Files.ReadWrite (para updateRange).
 *
 * O Graph tem uma Workbook API REST real (ao contrario de Word/PowerPoint,
 * que so expoe binario). Permite ler e escrever celulas/intervalos
 * programaticamente — NAO e edicao colaborativa estilo Excel Online.
 *
 * Endpoints:
 *   GET   /me/drive/items/{itemId}/workbook/worksheets
 *   GET   /me/drive/items/{itemId}/workbook/worksheets/{name}/range(address='{addr}')
 *   PATCH /me/drive/items/{itemId}/workbook/worksheets/{name}/range(address='{addr}')
 *         body: { values: [[...]], text: ... }
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const ExcelCapability: MicrosoftCapability = {
  id: "microsoft-excel",
  operations: ["excel.listWorksheets", "excel.getRange", "excel.updateRange"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
    if (!itemId) return fail("itemId é obrigatório (ID do arquivo .xlsx no OneDrive)", start, eid, logs, operation);

    switch (operation) {
      case "excel.listWorksheets": {
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/drive/items/${itemId}/workbook/worksheets?$select=id,name,position,visibility`,
          accessToken,
        );
        return ok({ worksheets: data.value ?? [] }, start, eid, logs, operation);
      }

      case "excel.getRange": {
        const worksheet = typeof payload.worksheet === "string" ? payload.worksheet : null;
        const range = typeof payload.range === "string" ? payload.range : null;
        if (!worksheet) return fail("worksheet (nome ou id) é obrigatório", start, eid, logs, operation);
        if (!range) return fail("range é obrigatório (ex: 'A1:B10')", start, eid, logs, operation);
        const data = await graphFetch(
          `/me/drive/items/${itemId}/workbook/worksheets/${encodeURIComponent(worksheet)}/range(address='${encodeURIComponent(range)}')`,
          accessToken,
        );
        return ok({ range: data }, start, eid, logs, operation);
      }

      case "excel.updateRange": {
        const worksheet = typeof payload.worksheet === "string" ? payload.worksheet : null;
        const range = typeof payload.range === "string" ? payload.range : null;
        const values = payload.values;
        if (!worksheet) return fail("worksheet (nome ou id) é obrigatório", start, eid, logs, operation);
        if (!range) return fail("range é obrigatório (ex: 'A1:B2')", start, eid, logs, operation);
        if (!Array.isArray(values)) return fail("values (matriz 2D) é obrigatório", start, eid, logs, operation);
        const data = await graphFetch(
          `/me/drive/items/${itemId}/workbook/worksheets/${encodeURIComponent(worksheet)}/range(address='${encodeURIComponent(range)}')`,
          accessToken,
          {
            method: "PATCH",
            body: JSON.stringify({ values }),
          },
        );
        return ok({ range: data }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown excel operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};