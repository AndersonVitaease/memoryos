/**
 * GitHubOAuthCallback — pagina de callback OAuth 2.0 do GitHub.
 * Rota: /oauth/github/callback
 *
 * O GitHub redireciona aqui com ?code=...&state=...
 * Esta pagina envia o resultado de volta para a janela pai via postMessage
 * e fecha o popup automaticamente.
 */
import { useEffect, useState } from "react";

export default function GitHubOAuthCallback() {
  const [status, setStatus] = useState("processing");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      if (window.opener) {
        window.opener.postMessage({
          type: "GITHUB_OAUTH_CALLBACK",
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
          type: "GITHUB_OAUTH_CALLBACK",
          error: "Missing code or state in OAuth callback",
        }, window.location.origin);
      }
      setStatus("error");
      setTimeout(() => window.close(), 1500);
      return;
    }

    if (window.opener) {
      window.opener.postMessage({
        type: "GITHUB_OAUTH_CALLBACK",
        code,
        returnedState: state,
      }, window.location.origin);
      setStatus("success");
      setTimeout(() => window.close(), 800);
    } else {
      setStatus("no-opener");
    }
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white">
      {status === "processing" && (
        <>
          <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Autenticando com GitHub...</p>
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