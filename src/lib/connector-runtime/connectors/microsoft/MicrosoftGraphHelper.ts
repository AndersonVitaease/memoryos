/**
 * MicrosoftGraphHelper.ts — helpers compartilhados por todos os Capability
 * Executors do conector Microsoft Graph.
 *
 * Extraido de MicrosoftGraphConnector.ts (Fase 0 — refator, zero comportamento novo).
 * Centraliza graphFetch + ok/fail + constantes para que cada executor de servico
 * fique isolado e testavel sem duplicar logica de transporte/resultado.
 */
import type { ConnectorLog, ConnectorResult } from "../../ConnectorTypes";
import { makeLog } from "../../ConnectorTypes";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const MS_CONNECTOR_ID = "microsoft-graph";

/**
 * Chamada base ao Microsoft Graph. Lanca Error com a mensagem do Graph em caso
 * de HTTP nao-OK — o executor quem converte para ConnectorResult via fail().
 */
export async function graphFetch<T = unknown>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
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
    const msg = (data as { error?: { message?: string } })?.error?.message
      ?? `Microsoft Graph retornou HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function ok<T>(
  data: T,
  start: number,
  eid: string,
  logs: ConnectorLog[],
  op: string,
): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return {
    status: "SUCCESS",
    success: true,
    data,
    duration,
    connectorId: MS_CONNECTOR_ID,
    executionId: eid,
    logs,
  };
}

export function fail(
  error: string,
  start: number,
  eid: string,
  logs: ConnectorLog[],
  op: string,
): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED — ${error} — ${duration}ms`));
  return {
    status: "FAILED",
    success: false,
    error,
    duration,
    connectorId: MS_CONNECTOR_ID,
    executionId: eid,
    logs,
  };
}