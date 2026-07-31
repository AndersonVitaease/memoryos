/**
 * MicrosoftGraphConnector.ts — conector nativo para Microsoft 365
 * (Outlook Mail, Calendar, OneDrive) via Microsoft Graph API.
 *
 * Segue o mesmo padrao do GmailConnector/GoogleCalendarConnector:
 * implementa IConnector, usa MicrosoftAuthSession pra token OAuth,
 * chama a API do Graph direto do navegador com o access token
 * (mesma abordagem ja usada pros conectores Google — o token e do
 * proprio usuario, pros proprios recursos dele).
 *
 * Sem MCP, sem servidor externo — capacidades escolhidas manualmente
 * (nao "descobertas"), espelhando o Gmail: ler, enviar, buscar e-mail;
 * listar/criar eventos; listar/baixar arquivos do OneDrive.
 */
import type { IConnector } from "../IConnector";
import type {
  ConnectorContext,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorResult,
  ConnectorLog,
} from "../ConnectorTypes";
import { makeLog, makeExecutionId } from "../ConnectorTypes";
import { isConnected, getConnection, ensureValidToken, getAccessToken } from "@/lib/microsoft-auth/MicrosoftAuthSession";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const CAPABILITIES = Object.freeze([
  "mail.list",
  "mail.search",
  "mail.read",
  "mail.send",
  "calendar.list",
  "calendar.create",
  "files.list",
  "files.download",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "microsoft-graph", executionId: eid, logs };
}

function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED — ${error} — ${duration}ms`));
  return { status: "FAILED", success: false, error, duration, connectorId: "microsoft-graph", executionId: eid, logs };
}

async function graphFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? `Microsoft Graph retornou HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export class MicrosoftGraphConnector implements IConnector {
  readonly id = "microsoft-graph";

  metadata(): ConnectorMetadata {
    return {
      id: "microsoft-graph",
      name: "Microsoft 365",
      version: "1.0.0",
      description: "Outlook Mail, Calendar e OneDrive via Microsoft Graph API.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
    };
  }

  validate(): boolean {
    return true;
  }

  async initialize(_ctx: ConnectorContext): Promise<void> {
    // Token checado sob demanda em cada execute(), mesmo padrao do Gmail.
  }

  async shutdown(): Promise<void> {}

  async health(): Promise<ConnectorHealthReport> {
    const connected = isConnected("default");
    const conn = getConnection("default");
    return {
      status: connected ? "healthy" : "unhealthy",
      connectorId: this.id,
      checkedAt: Date.now(),
      details: connected
        ? `Conectado como ${conn?.email ?? "usuario"}`
        : "Microsoft 365 nao conectado",
    };
  }

  async execute(
    operation: string,
    payload: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId ?? makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];

    try {
      try {
        await ensureValidToken("default");
      } catch {
        return fail("Microsoft 365 não conectado. Conecte em /connections.", start, eid, logs, operation);
      }
      const accessToken = getAccessToken("default");
      if (!accessToken) {
        return fail("Microsoft 365 não conectado. Conecte em /connections.", start, eid, logs, operation);
      }

      switch (operation) {
        case "mail.list": {
          const top = typeof payload.top === "number" ? payload.top : 10;
          const data = await graphFetch(`/me/messages?$top=${top}&$select=subject,from,receivedDateTime,bodyPreview`, accessToken);
          return ok({ messages: data.value ?? [] }, start, eid, logs, operation);
        }

        case "mail.search": {
          const query = typeof payload.query === "string" ? payload.query : "";
          if (!query) return fail("query é obrigatório", start, eid, logs, operation);
          const data = await graphFetch(`/me/messages?$search="${encodeURIComponent(query)}"&$select=subject,from,receivedDateTime,bodyPreview`, accessToken);
          return ok({ messages: data.value ?? [] }, start, eid, logs, operation);
        }

        case "mail.read": {
          const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
          if (!messageId) return fail("messageId é obrigatório", start, eid, logs, operation);
          const data = await graphFetch(`/me/messages/${messageId}`, accessToken);
          return ok({ message: data }, start, eid, logs, operation);
        }

        case "mail.send": {
          const { to, subject, body } = payload as { to?: string; subject?: string; body?: string };
          if (!to || !subject || !body) return fail("to, subject e body são obrigatórios", start, eid, logs, operation);
          await graphFetch(`/me/sendMail`, accessToken, {
            method: "POST",
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "Text", content: body },
                toRecipients: [{ emailAddress: { address: to } }],
              },
            }),
          });
          return ok({ sent: true }, start, eid, logs, operation);
        }

        case "calendar.list": {
          const top = typeof payload.top === "number" ? payload.top : 10;
          const data = await graphFetch(`/me/events?$top=${top}&$orderby=start/dateTime&$select=subject,start,end,location`, accessToken);
          return ok({ events: data.value ?? [] }, start, eid, logs, operation);
        }

        case "calendar.create": {
          const { subject, start: startTime, end, location } = payload as {
            subject?: string; start?: string; end?: string; location?: string;
          };
          if (!subject || !startTime || !end) return fail("subject, start e end são obrigatórios", start, eid, logs, operation);
          const data = await graphFetch(`/me/events`, accessToken, {
            method: "POST",
            body: JSON.stringify({
              subject,
              start: { dateTime: startTime, timeZone: "America/Sao_Paulo" },
              end: { dateTime: end, timeZone: "America/Sao_Paulo" },
              location: location ? { displayName: location } : undefined,
            }),
          });
          return ok({ event: data }, start, eid, logs, operation);
        }

        case "files.list": {
          const data = await graphFetch(`/me/drive/root/children?$select=name,size,file,folder,webUrl`, accessToken);
          return ok({ files: data.value ?? [] }, start, eid, logs, operation);
        }

        case "files.download": {
          const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
          if (!itemId) return fail("itemId é obrigatório", start, eid, logs, operation);
          const meta = await graphFetch(`/me/drive/items/${itemId}`, accessToken);
          return ok({ downloadUrl: meta["@microsoft.graph.downloadUrl"] ?? null, name: meta.name }, start, eid, logs, operation);
        }

        default:
          return fail(`Unknown operation: "${operation}"`, start, eid, logs, operation);
      }
    } catch (e) {
      return fail((e as Error).message, start, eid, logs, operation);
    }
  }
}
