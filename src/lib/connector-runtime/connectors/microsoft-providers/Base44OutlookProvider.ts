/**
 * Base44OutlookProvider.ts — segundo provider de Microsoft Graph (Fase 4).
 *
 * ADR-014 / RFC-007. Ao inves do fluxo OAuth proprio (OfficialGraphProvider),
 * este provider usa o App-User Connector "outlook" da Base44: o token OAuth
 * fica server-side (nunca exposto ao frontend), e as chamadas Graph sao
 * proxyiadas pela backend function microsoftGraphProxy.
 *
 * Cobre as 8 operations core (mail/calendar/files). As demais 24 operations
 * (contacts, todo, onenote, teams, sharepoint, excel, word, pptx) continuam
 * com o OfficialGraphProvider — o router faz o fallback automatico.
 *
 * Disponibilidade: isAvailable() = isAppUserConnected() (flag client-side
 * setada pela UI apos o OAuth popup fechar). Validacao real acontece no
 * proxy server-side — se o token expirar/revogar, o proxy retorna erro e o
 * provider repassa como falha.
 */
import type { MicrosoftProvider, MicrosoftProviderContext } from "./MicrosoftProviderTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { ok, fail } from "../microsoft/MicrosoftGraphHelper";
import { base44 } from "@/api/base44Client";
import {
  MICROSOFT_APP_USER_CONNECTOR_ID,
  isAppUserConnected,
} from "./MicrosoftAppUserConfig";

const OPERATIONS = [
  "mail.list", "mail.search", "mail.read", "mail.send",
  "calendar.list", "calendar.create",
  "files.list", "files.download",
] as const;

type GraphRequest = { method: string; path: string; body?: unknown };

/** Mapeia operation -> requisicao Graph (espelha os 3 executors core). */
function buildGraphRequest(operation: string, payload: Record<string, unknown>): GraphRequest | null {
  switch (operation) {
    case "mail.list": {
      const top = typeof payload.top === "number" ? payload.top : 10;
      return { method: "GET", path: `/me/messages?$top=${top}&$select=subject,from,receivedDateTime,bodyPreview` };
    }
    case "mail.search": {
      const query = typeof payload.query === "string" ? payload.query : "";
      if (!query) return null;
      return { method: "GET", path: `/me/messages?$search="${encodeURIComponent(query)}"&$select=subject,from,receivedDateTime,bodyPreview` };
    }
    case "mail.read": {
      const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
      if (!messageId) return null;
      return { method: "GET", path: `/me/messages/${messageId}` };
    }
    case "mail.send": {
      const { to, subject, body } = payload as { to?: string; subject?: string; body?: string };
      if (!to || !subject || !body) return null;
      return {
        method: "POST",
        path: `/me/sendMail`,
        body: {
          message: {
            subject,
            body: { contentType: "Text", content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        },
      };
    }
    case "calendar.list": {
      const top = typeof payload.top === "number" ? payload.top : 10;
      return { method: "GET", path: `/me/events?$top=${top}&$orderby=start/dateTime&$select=subject,start,end,location` };
    }
    case "calendar.create": {
      const { subject, start: startTime, end, location } = payload as {
        subject?: string; start?: string; end?: string; location?: string;
      };
      if (!subject || !startTime || !end) return null;
      return {
        method: "POST",
        path: `/me/events`,
        body: {
          subject,
          start: { dateTime: startTime, timeZone: "America/Sao_Paulo" },
          end: { dateTime: end, timeZone: "America/Sao_Paulo" },
          location: location ? { displayName: location } : undefined,
        },
      };
    }
    case "files.list":
      return { method: "GET", path: `/me/drive/root/children?$select=name,size,file,folder,webUrl` };
    case "files.download": {
      const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
      if (!itemId) return null;
      return { method: "GET", path: `/me/drive/items/${itemId}` };
    }
    default:
      return null;
  }
}

/** Reformata a resposta bruta do Graph no mesmo shape dos executors. */
function reshapeResult(operation: string, data: any): unknown {
  switch (operation) {
    case "mail.list":
    case "mail.search":
      return { messages: data?.value ?? [] };
    case "mail.read":
      return { message: data };
    case "mail.send":
      return { sent: true };
    case "calendar.list":
      return { events: data?.value ?? [] };
    case "calendar.create":
      return { event: data };
    case "files.list":
      return { files: data?.value ?? [] };
    case "files.download":
      return {
        downloadUrl: data?.["@microsoft.graph.downloadUrl"] ?? null,
        name: data?.name,
      };
    default:
      return data;
  }
}

export const Base44OutlookProvider: MicrosoftProvider = {
  id: "base44-outlook",
  displayName: "Microsoft 365 (Base44 App-User)",
  isOfficial: false,
  operations: OPERATIONS,

  async isAvailable(_workspaceId: string): Promise<boolean> {
    return isAppUserConnected();
  },

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    ctx: MicrosoftProviderContext,
  ): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    if (!MICROSOFT_APP_USER_CONNECTOR_ID) {
      return fail(
        "Base44 App-User Connector nao registrado. Registre o conector 'outlook' em Settings > OAuth Connectors.",
        start, eid, logs, operation,
      );
    }

    const req = buildGraphRequest(operation, payload);
    if (!req) {
      return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
    }

    try {
      const res = await base44.functions.invoke("microsoftGraphProxy", {
        connectorId: MICROSOFT_APP_USER_CONNECTOR_ID,
        method: req.method,
        path: req.path,
        body: req.body ?? null,
      });
      const d = res?.data ?? res;
      if (!d?.ok) {
        return fail(d?.error ?? "Graph proxy error", start, eid, logs, operation);
      }
      return ok(reshapeResult(operation, d.data), start, eid, logs, operation);
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  },
};