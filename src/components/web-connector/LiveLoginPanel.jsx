/**
 * LiveLoginPanel — UI para login ao vivo via Selenium/noVNC (RFC-015).
 *
 * Fluxo: cola URL -> "Iniciar navegador live" (abre noVNC em nova aba) ->
 * usuario faz login manualmente (resolve CAPTCHA/2FA na janela live) ->
 * "Capturar sessao" (backend le cookies HttpOnly do WebDriver) ->
 * onSessionActive(webSessionId, currentUrl) -> pai assume com status=active.
 *
 * Componente isolado — nao modifica WebConnectorPage diretamente.
 */
import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Monitor, CheckCircle2, XCircle, ExternalLink, ShieldCheck, Clock } from 'lucide-react';

async function callLive(operation, payload) {
  try {
    const res = await base44.functions.invoke('webConnectorLive', { operation, ...payload });
    const data = res?.data ?? res;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    const real =
      err?.response?.data?.error ||
      (typeof err?.response?.data === 'string' ? err.response.data : null) ||
      err?.data?.error ||
      err?.message ||
      'Falha desconhecida ao chamar webConnectorLive';
    throw new Error(real);
  }
}

export default function LiveLoginPanel({ onSessionActive }) {
  const [siteUrl, setSiteUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [webSessionId, setWebSessionId] = useState(null);
  const [novncUrl, setNovncUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  // Fix definitivo (2026-08-10): se algum usuario abandonar o fluxo (fechar
  // aba, cair conexao, esquecer de capturar), o launcher trava com "ja existe
  // sessao ativa" ate o TTL de 15min expirar sozinho. Antes disso, so quem
  // tinha acesso SSH a VPS conseguia destravar. Agora, quando /launch falha
  // com esse erro especifico, mostramos um botao self-service que qualquer
  // usuario pode clicar.
  const [showForceRelease, setShowForceRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const handleLaunch = useCallback(async () => {
    if (!siteUrl) return;
    setBusy(true);
    setError(null);
    setShowForceRelease(false);
    try {
      const data = await callLive('launch', { siteUrl, siteName });
      setWebSessionId(data.webSessionId);
      setNovncUrl(data.novncUrl);
      setExpiresAt(data.expiresAt);
      // Abre o noVNC em nova aba automaticamente
      if (data.novncUrl) window.open(data.novncUrl, '_blank', 'noopener');
    } catch (e) {
      const msg = e.message || 'Falha ao iniciar navegador live';
      setError(msg);
      if (/j[aá] existe uma sess[aã]o live ativa/i.test(msg)) {
        setShowForceRelease(true);
      }
    } finally {
      setBusy(false);
    }
  }, [siteUrl, siteName]);

  const handleForceRelease = useCallback(async () => {
    setReleasing(true);
    setError(null);
    try {
      await callLive('forceRelease', {});
      setShowForceRelease(false);
      // Tenta iniciar de novo automaticamente apos liberar a trava.
      await handleLaunch();
    } catch (e) {
      setError(e.message || 'Falha ao liberar sessao travada');
    } finally {
      setReleasing(false);
    }
  }, [handleLaunch]);

  const handleCapture = useCallback(async () => {
    if (!webSessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callLive('capture', { webSessionId });
      if (onSessionActive) onSessionActive(data.webSessionId, data.currentUrl || siteUrl);
    } catch (e) {
      setError(e.message || 'Falha ao capturar cookies');
    } finally {
      setBusy(false);
    }
  }, [webSessionId, siteUrl, onSessionActive]);

  const handleCancel = useCallback(async () => {
    if (!webSessionId) return;
    setBusy(true);
    setError(null);
    try {
      await callLive('close', { webSessionId });
    } catch (e) { /* best-effort */ }
    setWebSessionId(null);
    setNovncUrl('');
    setExpiresAt(null);
  }, [webSessionId]);

  const fmtExpiry = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  };

  return (
    <div className="space-y-4">
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
          <div className="flex items-start gap-2 text-[11px] text-zinc-500 bg-zinc-950/40 border border-zinc-800/60 rounded-lg p-2.5">
            <Monitor className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-400" />
            <span>
              Modo live: abre um navegador visivel (noVNC) onde voce faz o login manualmente,
              incluindo CAPTCHA e 2FA. O MemoryOS captura os cookies apos o login — sua senha
              nunca passa pelo sistema.
            </span>
          </div>
          <button
            onClick={handleLaunch}
            disabled={busy || !siteUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
            {busy ? 'Iniciando...' : 'Iniciar navegador live'}
          </button>
        </div>
      )}

      {webSessionId && novncUrl && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <Monitor className="w-4 h-4" />
            <span className="font-medium">Navegador live ativo</span>
            {expiresAt && (
              <span className="flex items-center gap-1 text-[11px] text-amber-400/70 ml-auto">
                <Clock className="w-3 h-3" /> expira {fmtExpiry(expiresAt)}
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">
            Uma janela com o navegador abriu em nova aba. Faca o login no site la
            (resolve CAPTCHA/2FA normalmente). Quando terminar, volte aqui e clique
            em <span className="text-amber-300 font-medium">Capturar sessao</span>.
          </p>

          <div className="flex flex-wrap gap-2">
            <a
              href={novncUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Reabrir noVNC
            </a>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <ShieldCheck className="w-3 h-3" />
            A senha que voce digitar no navegador live nao e armazenada — apenas os cookies de sessao.
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={handleCapture}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 transition"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Capturar sessao
            </button>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}