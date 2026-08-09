/**
 * WebConnectorPage — UI de bootstrap do Web Connector (RFC-012, Sprint 1).
 *
 * Fluxo: cola URL → "start" (navega, detecta campos) → preenche email/senha
 * na UI (relay, nunca persistido — ver ADR-019 Adendo) → "login" → revisa
 * snapshot pós-login → "confirm" (captura cookies, WebSession vira active).
 *
 * Página nova e isolada — não reaproveita nem modifica BugHunterConsole.jsx.
 */
import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Link as LinkIcon, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';

async function callWebConnector(operation, payload) {
  try {
    const res = await base44.functions.invoke('webConnectorConnect', { operation, ...payload });
    const data = res?.data ?? res;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    // O client Base44 lança em respostas não-2xx sem expor o corpo JSON no
    // .message (vira "Request failed with status code 502" genérico). O erro
    // real que a função devolveu fica em err.response.data.error — extrai
    // de lá antes de cair no fallback genérico.
    const real =
      err?.response?.data?.error ||
      (typeof err?.response?.data === 'string' ? err.response.data : null) ||
      err?.data?.error ||
      err?.message ||
      'Falha desconhecida ao chamar webConnectorConnect';
    throw new Error(real);
  }
}

export default function WebConnectorPage() {
  const [siteUrl, setSiteUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [webSessionId, setWebSessionId] = useState(null);
  const [status, setStatus] = useState(null); // 'pending_login' | 'active'
  const [snapshotText, setSnapshotText] = useState('');
  const [detectedFields, setDetectedFields] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginVerified, setLoginVerified] = useState(false);

  const handleStart = useCallback(async () => {
    if (!siteUrl) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callWebConnector('start', { siteUrl, siteName });
      setWebSessionId(data.webSessionId);
      setStatus(data.status);
      setSnapshotText(data.snapshotText || '');
      setDetectedFields(data.detectedFields || null);
      setLoginVerified(false);
    } catch (e) {
      setError(e.message || 'Falha ao iniciar conexão');
    } finally {
      setBusy(false);
    }
  }, [siteUrl, siteName]);

  const handleLogin = useCallback(async () => {
    if (!webSessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callWebConnector('login', { webSessionId, email, password });
      setStatus(data.status);
      setSnapshotText(data.snapshotText || '');
      setLoginVerified(data.loginVerified === true);
      // Credenciais só existem no state desta página até aqui — não são
      // reenviadas em nenhuma chamada seguinte (confirm/revoke não as usam).
      setPassword('');
    } catch (e) {
      setError(e.message || 'Falha no login');
    } finally {
      setBusy(false);
    }
  }, [webSessionId, email, password]);

  const handleConfirm = useCallback(async () => {
    if (!webSessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callWebConnector('confirm', { webSessionId });
      setStatus(data.status);
    } catch (e) {
      setError(e.message || 'Falha ao confirmar sessão');
    } finally {
      setBusy(false);
    }
  }, [webSessionId]);

  const handleRevoke = useCallback(async () => {
    if (!webSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await callWebConnector('revoke', { webSessionId });
      setWebSessionId(null);
      setStatus(null);
      setSnapshotText('');
      setDetectedFields(null);
      setSiteUrl('');
      setSiteName('');
      setEmail('');
      setLoginVerified(false);
    } catch (e) {
      setError(e.message || 'Falha ao desconectar');
    } finally {
      setBusy(false);
    }
  }, [webSessionId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
            <LinkIcon className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Conectar novo sistema</h1>
            <p className="text-xs text-zinc-500">Web Connector — RFC-012 · Sprint 1</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!webSessionId && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">URL do sistema</label>
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://portal.empresa.com"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Nome (opcional)</label>
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="ex: Wooba, CRM interno"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
            <button
              onClick={handleStart}
              disabled={busy || !siteUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 transition"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              {busy ? 'Conectando...' : 'Iniciar conexão'}
            </button>
          </div>
        )}

        {webSessionId && status === 'pending_login' && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
            <p className="text-sm text-zinc-300">
              Página carregada. {detectedFields?.email && detectedFields?.password
                ? 'Campos de login detectados — preencha abaixo e clique em Entrar.'
                : 'Campos de login não detectados nesta tela. Se o site exige login, encerre esta sessão e use a URL da página de login (ex: .../login) no passo "Iniciar conexão".'}
            </p>

            {detectedFields?.email && detectedFields?.password && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">Email / usuário</label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <p className="md:col-span-2 text-[10px] text-zinc-600 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Usada só para este login — nunca é salva (ver ADR-019).
                </p>
              </div>
            )}

            {snapshotText && (
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Ver estado da página (snapshot)</summary>
                <pre className="mt-2 p-2 rounded bg-zinc-950/50 border border-zinc-800 text-[10px] text-zinc-500 whitespace-pre-wrap max-h-60 overflow-y-auto">{snapshotText}</pre>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              {detectedFields?.email && detectedFields?.password && (
                <button
                  onClick={handleLogin}
                  disabled={busy || !email || !password}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-40 transition"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Entrar
                </button>
              )}
              {loginVerified && (
                <button
                  onClick={handleConfirm}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 transition"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar login e capturar sessão
                </button>
              )}
            </div>
          </div>
        )}

        {webSessionId && status === 'active' && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              Sessão ativa — conectado com sucesso.
            </div>
            <button
              onClick={handleRevoke}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50 transition"
            >
              Desconectar
            </button>
          </div>
        )}

        <p className="text-xs text-zinc-600 leading-relaxed">
          O MemoryOS nunca armazena sua senha. Ela é usada só para preencher o formulário
          de login desta única vez; a partir daí, apenas os cookies da sessão (já autenticada)
          ficam salvos para reuso. Ver <span className="font-mono">ADR-019</span> para detalhes.
        </p>
      </div>
    </div>
  );
}