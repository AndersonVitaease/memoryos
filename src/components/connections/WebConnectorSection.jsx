/**
 * WebConnectorSection — versão embutível do Web Connector (RFC-012/013/015).
 *
 * Extraído de WebConnectorPage.jsx para viver como uma seção dentro da
 * página unificada de Conectores, em vez de rota separada — reduz o número
 * de lugares que o usuário precisa lembrar para gerenciar conexões.
 * WebConnectorPage.jsx (rota /web-connector) agora só envolve este
 * componente com o frame de página inteira, preservando links diretos.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Link as LinkIcon, CheckCircle2, XCircle, ShieldCheck, Search, Sparkles, Plus } from 'lucide-react';
import WebCapabilityExecutor from '@/components/web-connector/WebCapabilityExecutor';
import LiveLoginPanel from '@/components/web-connector/LiveLoginPanel';
import WebSessionPicker from '@/components/web-connector/WebSessionPicker';

async function callWebConnector(operation, payload) {
  try {
    const res = await base44.functions.invoke('webConnectorConnect', { operation, ...payload });
    const data = res?.data ?? res;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    const real =
      err?.response?.data?.error ||
      (typeof err?.response?.data === 'string' ? err.response.data : null) ||
      err?.data?.error ||
      err?.message ||
      'Falha desconhecida ao chamar webConnectorConnect';
    throw new Error(real);
  }
}

async function callDiscover(operation, payload) {
  try {
    const res = await base44.functions.invoke('webConnectorDiscover', { operation, ...payload });
    const data = res?.data ?? res;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    const real =
      err?.response?.data?.error ||
      (typeof err?.response?.data === 'string' ? err.response.data : null) ||
      err?.data?.error ||
      err?.message ||
      'Falha desconhecida ao chamar webConnectorDiscover';
    throw new Error(real);
  }
}

export default function WebConnectorSection() {
  const [siteUrl, setSiteUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [mode, setMode] = useState('automated');
  const [showNewConnection, setShowNewConnection] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [webSessionId, setWebSessionId] = useState(null);
  const [status, setStatus] = useState(null);
  const [snapshotText, setSnapshotText] = useState('');
  const [detectedFields, setDetectedFields] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [loginVerified, setLoginVerified] = useState(false);
  const [sessionValid, setSessionValid] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverSummary, setDiscoverSummary] = useState(null);
  const [candidateBusyId, setCandidateBusyId] = useState(null);

  useEffect(() => {
    if (webSessionId) return;
    (async () => {
      try {
        const recs = await base44.entities.WebSession.filter({ status: 'active' }, '-created_date', 20);
        if (recs && recs.length === 1) {
          const s = recs[0];
          setWebSessionId(s.id);
          setStatus('active');
          setSiteUrl(s.site_url || '');
          setLoginUrl(s.site_url || '');
          setSiteName(s.site_name || '');
        } else if (!recs || recs.length === 0) {
          setShowNewConnection(true);
        }
      } catch (e) { /* best-effort: sem sessao pra retomar, segue tela inicial */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetomarSessao = useCallback((s) => {
    setWebSessionId(s.id);
    setStatus('active');
    setSiteUrl(s.site_url || '');
    setLoginUrl(s.site_url || '');
    setSiteName(s.site_name || '');
    setSnapshotText('');
    setDetectedFields(null);
    setLoginVerified(false);
    setSessionValid(null);
    setShowNewConnection(false);
  }, []);

  const handleConectarNovo = useCallback(() => {
    setWebSessionId(null);
    setStatus(null);
    setSiteUrl('');
    setSiteName('');
    setLoginUrl('');
    setEmail('');
    setPassword('');
    setSnapshotText('');
    setDetectedFields(null);
    setLoginVerified(false);
    setSessionValid(null);
    setShowNewConnection(true);
  }, []);

  useEffect(() => {
    if (webSessionId && status === 'active') {
      (async () => {
        try {
          const recs = await base44.entities.CapabilityCandidate.filter({ web_session_id: webSessionId });
          setCandidates(recs || []);
        } catch (e) { /* best-effort */ }
      })();
    } else {
      setCandidates([]);
      setDiscoverSummary(null);
    }
  }, [webSessionId, status]);

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
      setLoginUrl(data.siteUrl || '');
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
      const data = await callWebConnector('login', { webSessionId, email, password, ...(loginUrl ? { loginUrl } : {}) });
      setStatus(data.status);
      setSnapshotText(data.snapshotText || '');
      setLoginVerified(data.loginVerified === true);
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
      setLoginUrl('');
      setLoginVerified(false);
      setSessionValid(null);
      setShowNewConnection(false);
    } catch (e) {
      setError(e.message || 'Falha ao desconectar');
    } finally {
      setBusy(false);
    }
  }, [webSessionId]);

  const handleTestSession = useCallback(async () => {
    if (!webSessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await callWebConnector('use', { webSessionId });
      setSessionValid(data.sessionValid === true);
      setSnapshotText(data.snapshotText || '');
    } catch (e) {
      setError(e.message || 'Falha ao testar sessão');
      setSessionValid(false);
    } finally {
      setBusy(false);
    }
  }, [webSessionId]);

  const handleDiscover = useCallback(async () => {
    if (!webSessionId) return;
    setDiscovering(true);
    setError(null);
    try {
      const data = await callDiscover('discover', { webSessionId, maxPages: 15 });
      setDiscoverSummary({
        pages_explored: data.pages_explored,
        candidates_discovered: data.candidates_discovered,
        visited_urls: data.visited_urls,
        debug: data.debug || null,
      });
      try {
        const recs = await base44.entities.CapabilityCandidate.filter({ web_session_id: webSessionId });
        setCandidates(recs || []);
      } catch (e) { /* best-effort */ }
    } catch (e) {
      setError(e.message || 'Falha na descoberta de capabilities');
    } finally {
      setDiscovering(false);
    }
  }, [webSessionId]);

  const refreshCandidates = useCallback(async () => {
    if (!webSessionId) return;
    try {
      const recs = await base44.entities.CapabilityCandidate.filter({ web_session_id: webSessionId });
      setCandidates(recs || []);
    } catch (e) { /* best-effort */ }
  }, [webSessionId]);

  const handleValidateCandidate = useCallback(async (cand) => {
    setCandidateBusyId(cand.id);
    setError(null);
    try {
      let fields = [];
      try { fields = JSON.parse(cand.input_fields || '[]'); } catch (e) { fields = []; }
      const props = {};
      (Array.isArray(fields) ? fields : []).forEach((f) => { props[f] = { type: 'string' }; });
      const capObj = {
        id: cand.suggested_id,
        description: cand.description || '',
        inputSchema: { type: 'object', properties: props },
        discoveredFrom: cand.discovered_from_url || '',
      };
      const existing = await base44.entities.CapabilityMap.filter({ site_url: cand.site_url });
      if (existing.length > 0) {
        const map = existing[0];
        let caps = [];
        try { caps = JSON.parse(map.capabilities || '[]'); } catch (e) { caps = []; }
        if (!Array.isArray(caps)) caps = [];
        if (!caps.find((x) => x.id === capObj.id)) caps.push(capObj);
        await base44.entities.CapabilityMap.update(map.id, {
          capabilities: JSON.stringify(caps),
          last_validated_at: new Date().toISOString(),
        });
      } else {
        await base44.entities.CapabilityMap.create({
          site_url: cand.site_url,
          capabilities: JSON.stringify([capObj]),
          last_validated_at: new Date().toISOString(),
        });
      }
      await base44.entities.CapabilityCandidate.update(cand.id, {
        status: 'validated',
        validation_notes: 'Promovido para CapabilityMap pelo usuario.',
      });
      await refreshCandidates();
    } catch (e) {
      setError(e.message || 'Falha ao validar candidato');
    } finally {
      setCandidateBusyId(null);
    }
  }, [refreshCandidates]);

  const handleRejectCandidate = useCallback(async (cand) => {
    const reason = window.prompt('Motivo da rejeicao (opcional):', '');
    if (reason === null) return;
    setCandidateBusyId(cand.id);
    setError(null);
    try {
      await base44.entities.CapabilityCandidate.update(cand.id, {
        status: 'rejected',
        rejected_reason: reason,
      });
      await refreshCandidates();
    } catch (e) {
      setError(e.message || 'Falha ao rejeitar candidato');
    } finally {
      setCandidateBusyId(null);
    }
  }, [refreshCandidates]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!webSessionId && (
        <WebSessionPicker onRetomar={handleRetomarSessao} onNew={handleConectarNovo} currentSessionId={webSessionId} showNewButton={!showNewConnection} />
      )}

      {!webSessionId && showNewConnection && (
        <div className="flex gap-1 p-1 rounded-lg bg-zinc-900/60 border border-zinc-800 w-fit">
          <button onClick={() => setMode('automated')} className={"px-3 py-1.5 rounded-md text-xs font-medium transition " + (mode === 'automated' ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:text-zinc-200')}>Automático (DOM)</button>
          <button onClick={() => setMode('live')} className={"px-3 py-1.5 rounded-md text-xs font-medium transition " + (mode === 'live' ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:text-zinc-200')}>Live (manual)</button>
        </div>
      )}

      {!webSessionId && showNewConnection && mode === 'automated' && (
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

      {!webSessionId && showNewConnection && mode === 'live' && (
        <LiveLoginPanel onSessionActive={(id, url) => { setWebSessionId(id); setStatus('active'); setSiteUrl(url); setLoginUrl(url); setShowNewConnection(false); }} />
      )}

      {webSessionId && status === 'pending_login' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm text-zinc-300">
            Página carregada. Preencha email e senha abaixo e clique em Entrar — o login é feito direto no formulário da página (DOM), não depende de detecção automática de campos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-zinc-500 mb-1">URL da página de login</label>
              <input
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://site.com/login"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <p className="text-[10px] text-zinc-600 mt-1">Ajuste se a página atual não tem formulário de login — o "Entrar" navega para esta URL antes de preencher.</p>
            </div>
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

          {snapshotText && (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Ver estado da página (snapshot)</summary>
              <pre className="mt-2 p-2 rounded bg-zinc-950/50 border border-zinc-800 text-[10px] text-zinc-500 whitespace-pre-wrap max-h-60 overflow-y-auto">{snapshotText}</pre>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
              <button
                onClick={handleLogin}
                disabled={busy || !email || !password}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-40 transition"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Entrar
              </button>
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
          {sessionValid === true && (
            <p className="text-xs text-emerald-400">Sessão revalidada — cookies reutilizáveis, página carregou autenticada.</p>
          )}
          {sessionValid === false && (
            <p className="text-xs text-amber-400">Sessão expirou — reautentique (Iniciar conexão → Entrar → Confirmar).</p>
          )}
          {snapshotText && sessionValid !== null && (
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Ver estado da página (snapshot)</summary>
              <pre className="mt-2 p-2 rounded bg-zinc-950/50 border border-zinc-800 text-[10px] text-zinc-500 whitespace-pre-wrap max-h-60 overflow-y-auto">{snapshotText}</pre>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleTestSession}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 transition"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Testar sessão
            </button>
            <button
              onClick={handleConectarNovo}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 transition"
            >
              <Plus className="w-4 h-4" />
              Conectar novo site
            </button>
            <button
              onClick={handleRevoke}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50 transition"
            >
              Desconectar
            </button>
          </div>

          <div className="pt-3 border-t border-zinc-800/60 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-40 transition"
              >
                {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Descobrir capabilities
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 leading-relaxed">
              Navega o sistema autenticado e cataloga operações de leitura (buscas, consultas, listagens).
              Nunca executa escrita — apenas observa. Candidatos ficam como <span className="font-mono">CapabilityCandidate</span> para validação humana.
            </p>

            {discoverSummary && (
              <div className="text-xs text-zinc-400 space-y-1">
                <p className="text-emerald-400">
                  {discoverSummary.candidates_discovered} candidato(s) encontrado(s) em {discoverSummary.pages_explored} página(s).
                </p>
                {discoverSummary.visited_urls?.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Páginas visitadas</summary>
                    <ul className="mt-1 ml-4 list-disc text-zinc-600 font-mono text-[10px]">
                      {discoverSummary.visited_urls.map((u) => <li key={u}>{u}</li>)}
                    </ul>
                  </details>
                )}
                {discoverSummary.debug && (
                  <details>
                    <summary className="cursor-pointer text-amber-500 hover:text-amber-300">Debug: por que 0 candidatos?</summary>
                    <div className="mt-1 ml-4 space-y-1">
                      {discoverSummary.debug.error && (
                        <p className="text-red-400 text-[10px]">Erro: {discoverSummary.debug.error}</p>
                      )}
                      <p className="text-zinc-600 text-[10px]">
                        Links brutos antes do filtro de domínio: {discoverSummary.debug.raw_links_found_before_domain_filter ?? '—'}
                      </p>
                      <p className="text-zinc-600 text-[10px]">
                        Hover disparado em {discoverSummary.debug.hover_triggered_on_elements ?? '—'} elemento(s).
                      </p>
                      {discoverSummary.debug.snapshot_preview && (
                        <div>
                          <p className="text-zinc-600 text-[10px]">Preview do snapshot da página (o que o motor realmente viu):</p>
                          <pre className="mt-1 p-2 rounded bg-zinc-950/60 border border-zinc-800 text-[9px] text-zinc-500 whitespace-pre-wrap max-h-40 overflow-y-auto">{discoverSummary.debug.snapshot_preview}</pre>
                        </div>
                      )}
                      <p className="text-zinc-600 text-[10px]">Links vistos na última página (amostra):</p>
                      <ul className="list-disc text-zinc-600 font-mono text-[10px] max-h-40 overflow-y-auto">
                        {(discoverSummary.debug.last_page_links_sample || []).map((l, i) => (
                          <li key={i} className="truncate">{l.text || '(sem texto)'} → {l.href}</li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}
              </div>
            )}

            {candidates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" /> Candidatos descobertos ({candidates.length})
                </p>
                <div className="space-y-2">
                  {candidates.map((c) => {
                    let fields = [];
                    try { fields = JSON.parse(c.input_fields || '[]'); } catch (e) { fields = []; }
                    return (
                      <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-violet-300">{c.suggested_id}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wide">{c.status}</span>
                        </div>
                        {c.description && <p className="text-[11px] text-zinc-500 mt-1">{c.description}</p>}
                        {Array.isArray(fields) && fields.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {fields.map((f) => (
                              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-500 font-mono">{f}</span>
                            ))}
                          </div>
                        )}
                        {c.discovered_from_url && (
                          <p className="text-[9px] text-zinc-600 mt-1 font-mono truncate">{c.discovered_from_url}</p>
                        )}
                        {c.status === 'candidate' && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleValidateCandidate(c)}
                              disabled={candidateBusyId === c.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/90 text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 transition"
                            >
                              {candidateBusyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                              Validar
                            </button>
                            <button
                              onClick={() => handleRejectCandidate(c)}
                              disabled={candidateBusyId === c.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                        {c.status === 'rejected' && c.rejected_reason && (
                          <p className="text-[10px] text-red-400/80 mt-1.5">Rejeitado: {c.rejected_reason}</p>
                        )}
                        {c.status === 'validated' && (
                          <p className="text-[10px] text-emerald-400/80 mt-1.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Promovido para CapabilityMap
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <WebCapabilityExecutor webSessionId={webSessionId} siteUrl={siteUrl} />
        </div>
      )}

      <p className="text-xs text-zinc-600 leading-relaxed">
        O MemoryOS nunca armazena sua senha. Ela é usada só para preencher o formulário
        de login desta única vez; a partir daí, apenas os cookies da sessão (já autenticada)
        ficam salvos para reuso. Ver <span className="font-mono">ADR-019</span> para detalhes.
      </p>
    </div>
  );
}
