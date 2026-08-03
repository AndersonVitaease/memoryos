/**
 * OneNoteCapability.ts — servico OneNote do Microsoft Graph.
 *
 * Fase 3 (MS-EXP-03) — RFC-006 / ADR-013.
 * Capacidades: onenote.listNotebooks, onenote.listPages, onenote.createPage.
 * Escopo OAuth necessario: Notes.ReadWrite.
 *
 * Endpoints:
 *   GET  /me/onenote/notebooks              — listar cadernos
 *   GET  /me/onenote/pages                  — listar paginas
 *   POST /me/onenote/sections/{id}/pages    — criar pagina (body em HTML)
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const OneNoteCapability: MicrosoftCapability = {
  id: "microsoft-onenote",
  operations: ["onenote.listNotebooks", "onenote.listPages", "onenote.createPage"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "onenote.listNotebooks": {
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/onenote/notebooks?$select=id,displayName,isDefault,createdDateTime`,
          accessToken,
        );
        return ok({ notebooks: data.value ?? [] }, start, eid, logs, operation);
      }

      case "onenote.listPages": {
        const top = typeof payload.top === "number" ? payload.top : 20;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/onenote/pages?$top=${top}&$select=id,title,createdDateTime,lastModifiedDateTime`,
          accessToken,
        );
        return ok({ pages: data.value ?? [] }, start, eid, logs, operation);
      }

      case "onenote.createPage": {
        const sectionId = typeof payload.sectionId === "string" ? payload.sectionId : null;
        const title = typeof payload.title === "string" ? payload.title : "";
        const body = typeof payload.body === "string" ? payload.body : "";
        if (!sectionId) return fail("sectionId é obrigatório (use onenote.listNotebooks para descobrir)", start, eid, logs, operation);
        if (!body && !title) return fail("title ou body é obrigatório", start, eid, logs, operation);
        const html = `<html><head><title>${title}</title></head><body>${body}</body></html>`;
        const data = await graphFetch(`/me/onenote/sections/${sectionId}/pages`, accessToken, {
          method: "POST",
          headers: { "Content-Type": "application/xhtml+xml" },
          body: html,
        });
        return ok({ page: data }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown onenote operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};