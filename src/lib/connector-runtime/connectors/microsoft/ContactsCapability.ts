/**
 * ContactsCapability.ts — servico Contacts (Pessoas) do Microsoft Graph.
 *
 * Fase 2 (MS-EXP-02) — RFC-006 / ADR-013.
 * Capacidades: contacts.list, contacts.search, contacts.create.
 * Escopo OAuth necessario: Contacts.ReadWrite.
 *
 * Endpoints:
 *   GET  /me/contacts            — listar
 *   GET  /me/contacts?$search=…  — buscar
 *   POST /me/contacts            — criar
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const ContactsCapability: MicrosoftCapability = {
  id: "outlook-contacts",
  operations: ["contacts.list", "contacts.search", "contacts.create"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "contacts.list": {
        const top = typeof payload.top === "number" ? payload.top : 20;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/contacts?$top=${top}&$select=displayName,emailAddresses,mobilePhone,businessPhones`,
          accessToken,
        );
        return ok({ contacts: data.value ?? [] }, start, eid, logs, operation);
      }

      case "contacts.search": {
        const query = typeof payload.query === "string" ? payload.query : "";
        if (!query) return fail("query é obrigatório", start, eid, logs, operation);
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/contacts?$search="${encodeURIComponent(query)}"&$select=displayName,emailAddresses,mobilePhone`,
          accessToken,
        );
        return ok({ contacts: data.value ?? [] }, start, eid, logs, operation);
      }

      case "contacts.create": {
        const { givenName, surname, email, mobilePhone, companyName } = payload as {
          givenName?: string; surname?: string; email?: string; mobilePhone?: string; companyName?: string;
        };
        if (!givenName && !surname) return fail("givenName ou surname é obrigatório", start, eid, logs, operation);
        const body: Record<string, unknown> = {
          givenName: givenName ?? "",
          surname: surname ?? "",
        };
        if (email) body.emailAddresses = [{ address: email }];
        if (mobilePhone) body.mobilePhone = mobilePhone;
        if (companyName) body.companyName = companyName;
        const data = await graphFetch(`/me/contacts`, accessToken, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return ok({ contact: data }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown contacts operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};