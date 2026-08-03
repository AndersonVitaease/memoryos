/**
 * OutlookMailCapability.ts — servico Outlook (Email) do Microsoft Graph.
 *
 * Extraido do switch monolitico de MicrosoftGraphConnector.ts (Fase 0).
 * Capacidades: mail.list, mail.search, mail.read, mail.send.
 * Comportamento identico ao anterior — apenas isolado em arquivo proprio.
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const OutlookMailCapability: MicrosoftCapability = {
  id: "outlook-mail",
  operations: ["mail.list", "mail.search", "mail.read", "mail.send"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "mail.list": {
        const top = typeof payload.top === "number" ? payload.top : 10;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/messages?$top=${top}&$select=subject,from,receivedDateTime,bodyPreview`,
          accessToken,
        );
        return ok({ messages: data.value ?? [] }, start, eid, logs, operation);
      }

      case "mail.search": {
        const query = typeof payload.query === "string" ? payload.query : "";
        if (!query) return fail("query é obrigatório", start, eid, logs, operation);
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/messages?$search="${encodeURIComponent(query)}"&$select=subject,from,receivedDateTime,bodyPreview`,
          accessToken,
        );
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

      default:
        return fail(`Unknown mail operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};