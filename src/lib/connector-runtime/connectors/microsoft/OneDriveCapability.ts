/**
 * OneDriveCapability.ts — servico OneDrive do Microsoft Graph.
 *
 * Extraido do switch monolitico de MicrosoftGraphConnector.ts (Fase 0).
 * Capacidades: files.list, files.download.
 * Comportamento identico ao anterior — apenas isolado em arquivo proprio.
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const OneDriveCapability: MicrosoftCapability = {
  id: "onedrive",
  operations: ["files.list", "files.download"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "files.list": {
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/drive/root/children?$select=name,size,file,folder,webUrl`,
          accessToken,
        );
        return ok({ files: data.value ?? [] }, start, eid, logs, operation);
      }

      case "files.download": {
        const itemId = typeof payload.itemId === "string" ? payload.itemId : null;
        if (!itemId) return fail("itemId é obrigatório", start, eid, logs, operation);
        const meta = await graphFetch<{ "@microsoft.graph.downloadUrl"?: string; name?: string }>(
          `/me/drive/items/${itemId}`,
          accessToken,
        );
        return ok(
          { downloadUrl: meta["@microsoft.graph.downloadUrl"] ?? null, name: meta.name },
          start,
          eid,
          logs,
          operation,
        );
      }

      default:
        return fail(`Unknown files operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};