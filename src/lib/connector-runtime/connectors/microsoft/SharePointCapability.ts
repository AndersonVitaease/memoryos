/**
 * SharePointCapability.ts — servico SharePoint (Sites & Lists) do Microsoft Graph.
 *
 * Fase 3 (MS-EXP-03) — RFC-006 / ADR-013.
 * Capacidades: sharepoint.listSites, sharepoint.listLists, sharepoint.listItems, sharepoint.createItem.
 * Escopo OAuth necessario: Sites.ReadWrite.All.
 *
 * CAVEAT: SharePoint exige tenant corporativo. Contas pessoais @outlook.com
 * podem nao ter sites — Graph retorna vazio ou 403 nesses casos.
 *
 * Endpoints:
 *   GET  /sites?search=*                          — buscar sites
 *   GET  /sites/{siteId}/lists                     — listar listas de um site
 *   GET  /sites/{siteId}/lists/{listId}/items      — listar itens de uma lista
 *   POST /sites/{siteId}/lists/{listId}/items      — criar item em uma lista
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const SharePointCapability: MicrosoftCapability = {
  id: "microsoft-sharepoint",
  operations: ["sharepoint.listSites", "sharepoint.listLists", "sharepoint.listItems", "sharepoint.createItem"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "sharepoint.listSites": {
        const data = await graphFetch<{ value?: unknown[] }>(
          `/sites?search=*&$select=id,displayName,webUrl,createdDateTime`,
          accessToken,
        );
        return ok({ sites: data.value ?? [] }, start, eid, logs, operation);
      }

      case "sharepoint.listLists": {
        const siteId = typeof payload.siteId === "string" ? payload.siteId : null;
        if (!siteId) return fail("siteId é obrigatório (use sharepoint.listSites para descobrir)", start, eid, logs, operation);
        const data = await graphFetch<{ value?: unknown[] }>(
          `/sites/${siteId}/lists?$select=id,displayName,name`,
          accessToken,
        );
        return ok({ lists: data.value ?? [] }, start, eid, logs, operation);
      }

      case "sharepoint.listItems": {
        const siteId = typeof payload.siteId === "string" ? payload.siteId : null;
        const listId = typeof payload.listId === "string" ? payload.listId : null;
        if (!siteId) return fail("siteId é obrigatório", start, eid, logs, operation);
        if (!listId) return fail("listId é obrigatório (use sharepoint.listLists para descobrir)", start, eid, logs, operation);
        const top = typeof payload.top === "number" ? payload.top : 50;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/sites/${siteId}/lists/${listId}/items?$top=${top}&$select=id,createdDateTime,fields`,
          accessToken,
        );
        return ok({ items: data.value ?? [] }, start, eid, logs, operation);
      }

      case "sharepoint.createItem": {
        const siteId = typeof payload.siteId === "string" ? payload.siteId : null;
        const listId = typeof payload.listId === "string" ? payload.listId : null;
        const fields = payload.fields;
        if (!siteId) return fail("siteId é obrigatório", start, eid, logs, operation);
        if (!listId) return fail("listId é obrigatório", start, eid, logs, operation);
        if (!fields || typeof fields !== "object") return fail("fields (objeto) é obrigatório", start, eid, logs, operation);
        const data = await graphFetch(`/sites/${siteId}/lists/${listId}/items`, accessToken, {
          method: "POST",
          body: JSON.stringify({ fields }),
        });
        return ok({ item: data }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown sharepoint operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};