/**
 * OutlookCalendarCapability.ts — servico Calendar do Microsoft Graph.
 *
 * Extraido do switch monolitico de MicrosoftGraphConnector.ts (Fase 0).
 * Capacidades: calendar.list, calendar.create.
 * Comportamento identico ao anterior — apenas isolado em arquivo proprio.
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const OutlookCalendarCapability: MicrosoftCapability = {
  id: "outlook-calendar",
  operations: ["calendar.list", "calendar.create"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "calendar.list": {
        const top = typeof payload.top === "number" ? payload.top : 10;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/events?$top=${top}&$orderby=start/dateTime&$select=subject,start,end,location`,
          accessToken,
        );
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

      default:
        return fail(`Unknown calendar operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};