/**
 * MicrosoftOAuthCallback — Implementation 007
 * Página de callback OAuth 2.0.
 * Rota: /oauth/microsoft/callback
 *
 * A Microsoft redireciona aqui com ?code=...&state=...
 * Esta página envia o resultado de volta para a janela pai via postMessage
 * e fecha o popup automaticamente.
 */
import { useEffect, useState } from "react";

export default function MicrosoftOAuthCallback() {
  const [status, setStatus] = useState("processing");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code         = params.get("code");
    const state        = params.get("state");
    const error        = params.get("error");
    const errorDesc    = params.get("error_description");

    if (error) {
      // Send error to opener
      if (window.opener) {
        window.opener.postMessage({
          type:  "MICROSOFT_OAUTH_CALLBACK",
          error: errorDesc ?? error,
        }, window.location.origin);
      }
      setStatus("error");
      setTimeout(() => window.close(), 1500);
      return;
    }

    if (!code || !state) {
      if (window.opener) {
        window.opener.postMessage({
          type:  "MICROSOFT_OAUTH_CALLBACK",
          error: "Missing code or state in OAuth callback",
        }, window.location.origin);
      }
      setStatus("error");
      setTimeout(() => window.close(), 1500);
      return;
    }

    // Send code + state to opener window
    if (window.opener) {
      window.opener.postMessage({
        type:          "MICROSOFT_OAUTH_CALLBACK",
        code,
        returnedState: state,
      }, window.location.origin);
      setStatus("success");
      // FIX (diagnostico 2026-08-04): aumentado de 800ms pra 2500ms —
      // possivel corrida entre o fechamento da popup e o postMessage
      // chegando na janela principal (COOP pode atrasar a entrega).
      setTimeout(() => window.close(), 2500);
    } else {
      // Not in popup — redirect back with params in hash for SPA handling
      setStatus("no-opener");
    }
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
      {status === "processing" && (
        <>
          <div className="w-8 h-8 border-4 border-zinc-200 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Autenticando com Microsoft...</p>
        </>
      )}
      {status === "success" && (
        <>
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-700">Autenticado com sucesso!</p>
          <p className="text-xs text-zinc-400 mt-1">Esta janela vai fechar automaticamente...</p>
        </>
      )}
      {status === "error" && (
        <>
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-700">Falha na autenticacao</p>
          <p className="text-xs text-zinc-400 mt-1">Fechando...</p>
        </>
      )}
      {status === "no-opener" && (
        <p className="text-sm text-zinc-500">Redirecionando...</p>
      )}
    </div>
  );
}