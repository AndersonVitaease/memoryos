/**
 * MicrosoftAppUserConfig — configuracao do provider Base44Outlook (App-User).
 *
 * ADR-014 / RFC-007 — Fase 4. O Base44OutlookProvider usa o conector
 * App-User "outlook" da Base44: cada app user conecta a propria conta
 * Microsoft via OAuth gerenciado pela plataforma (redirect URI propria
 * da Base44, token guardado server-side).
 *
 * MICROSOFT_APP_USER_CONNECTOR_ID e o id retornado por
 * register_workspace_connector(integration_type="outlook"). Deve ser
 * preenchido apos o registro (Settings > OAuth Connectors). Vazio =
 * provider fica indisponivel (router cai no OfficialGraphProvider).
 */

export const MICROSOFT_APP_USER_CONNECTOR_ID = "";

const FLAG_KEY = "memoryos_ms_appuser_connected";

/** True se o app user ja conectou a conta Microsoft via App-User Connector. */
export function isAppUserConnected(): boolean {
  if (!MICROSOFT_APP_USER_CONNECTOR_ID) return false;
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAppUserConnected(connected: boolean): void {
  try {
    if (connected) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch { /* storage indisponivel — nao bloqueia */ }
  window.dispatchEvent(
    new CustomEvent("memoryos:ms-appuser-changed", { detail: { connected } }),
  );
}