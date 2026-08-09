/**
 * WebCapabilityExecutor.jsx — RFC-014 UI: executa capabilities validadas
 * (CapabilityMap) contra uma WebSession ativa. Read-only: preenche o
 * formulario de busca/consulta, submete e captura o resultado via snapshot.
 * Guarda de escrita bloqueia formularios com botoes de Salvar/Excluir/Editar.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Play, Search, RefreshCw } from 'lucide-react';

async function callExecute(payload) {
  try {
    const res = await base44.functions.invoke('webConnectorConnect', { operation: 'executeCapability', ...payload });
    const data = res?.data ?? res;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    const real = err?.response?.data?.error || err?.data?.error || err?.message || 'Falha ao executar capability';
    throw new Error(real);
  }
}

function originOf(u) {
  let s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).origin; } catch (e) { return s; }
}

export default function WebCapabilityExecutor({ webSessionId, siteUrl }) {
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const loadMaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await base44.entities.CapabilityMap.filter({});
      const sessionOrigin = originOf(siteUrl);
      const matched = (all || []).filter((m) => originOf(m.site_url) === sessionOrigin);
      setMaps(matched);
    } catch (e) {
      setError(e.message || 'Falha ao carregar capabilities validadas');
    } finally {
      setLoading(false);
    }
  }, [siteUrl]);

  useEffect(() => { loadMaps(); }, [loadMaps]);

  const capabilitiesFor = (m) => {
    try { const p = JSON.parse(m.capabilities || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  };

  const handleExecute = useCallback(async (m, cap) => {
    const key = `${m.id}:${cap.id}`;
    setBusy(key);
    setError(null);
    setResult(null);
    try {
      const fields = (cap.inputSchema && cap.inputSchema.properties) ? Object.keys(cap.inputSchema.properties) : [];
      const inputs = {};
      fields.forEach((f) => { inputs[f] = formValues[key + ':' + f] ?? ''; });
      const data = await callExecute({
        webSessionId,
        discoveredFromUrl: cap.discoveredFrom || m.site_url,
        inputFields: fields,
        inputs,
      });
      setResult({ key, data });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }, [webSessionId, formValues]);

  const allCaps = [];
  maps.forEach((m) => capabilitiesFor(m).forEach((c) => allCaps.push({ map: m, cap: c })));

  return (
    <div className="pt-3 border-t border-zinc-800/60 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
          <Play className="w-3.5 h-3.5" /> Executar capability validada
        </p>
        <button onClick={loadMaps} disabled={loading} className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Recarregar
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400/80">{error}</p>}

      {allCaps.length === 0 && !loading && (
        <p className="text-[10px] text-zinc-600">Nenhuma capability validada para este site. Valide candidatos descobertos acima primeiro.</p>
      )}

      <div className="space-y-2">
        {allCaps.map(({ map, cap }) => {
          const key = `${map.id}:${cap.id}`;
          const fields = (cap.inputSchema && cap.inputSchema.properties) ? Object.keys(cap.inputSchema.properties) : [];
          const isOpen = expanded === key;
          const res = result && result.key === key ? result.data : null;
          return (
            <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-mono text-emerald-300">{cap.id}</span>
                <span className="text-[9px] text-zinc-600">{isOpen ? 'fechar' : 'abrir'}</span>
              </button>
              {cap.description && <p className="text-[11px] text-zinc-500 mt-1">{cap.description}</p>}
              {cap.discoveredFrom && <p className="text-[9px] text-zinc-600 mt-0.5 font-mono truncate">{cap.discoveredFrom}</p>}

              {isOpen && (
                <div className="mt-2 space-y-2">
                  {fields.length === 0 && <p className="text-[10px] text-zinc-600">Sem campos de entrada declarados.</p>}
                  {fields.map((f) => (
                    <div key={f}>
                      <label className="block text-[10px] font-medium text-zinc-500 mb-0.5">{f}</label>
                      <input
                        value={formValues[key + ':' + f] ?? ''}
                        onChange={(e) => setFormValues((v) => ({ ...v, [key + ':' + f]: e.target.value }))}
                        className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => handleExecute(map, cap)}
                    disabled={busy === key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-40 transition"
                  >
                    {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Executar
                  </button>
                  {res && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] text-emerald-400/80">Preenchidos: {Array.isArray(res.filled) ? res.filled.join(', ') : ''}</p>
                      <p className="text-[10px] text-zinc-500 font-mono truncate">URL: {res.finalUrl}</p>
                      <details>
                        <summary className="cursor-pointer text-[10px] text-zinc-500 hover:text-zinc-300">Ver resultado (snapshot)</summary>
                        <pre className="mt-1 p-2 rounded bg-zinc-950/50 border border-zinc-800 text-[10px] text-zinc-500 whitespace-pre-wrap max-h-60 overflow-y-auto">{res.snapshotText}</pre>
                      </details>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-600 leading-relaxed">
        Execução read-only: preenche o formulário de busca/consulta, submete e captura o resultado via snapshot.
        Guarda de escrita bloqueia formulários com botões de Salvar/Excluir/Editar.
      </p>
    </div>
  );
}