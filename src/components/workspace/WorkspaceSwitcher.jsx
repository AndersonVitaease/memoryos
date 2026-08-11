/**
 * WorkspaceSwitcher.jsx — Seletor de Workspace ativo (Fase 2).
 *
 * Dropdown no topo da sidebar: mostra o workspace ativo, lista os workspaces
 * do usuario (via workspaceMembership listMine) e permite trocar (via
 * workspaceSetActive) ou criar novo. Toda troca passa pelo backend
 * (useWorkspace.switchWorkspace), nunca por estado local isolado.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Check, Plus, ChevronDown, Building2, User as UserIcon } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace/WorkspaceContext';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';

export default function WorkspaceSwitcher() {
  const { activeWorkspaceId, workspaces, activeWorkspace, switchWorkspace, loading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleSelect = async (id) => {
    if (id === activeWorkspaceId) { setOpen(false); return; }
    setSwitching(id);
    try { await switchWorkspace(id); }
    catch (e) { /* erro ja tratado no contexto */ }
    finally { setSwitching(null); setOpen(false); }
  };

  const label = loading ? 'Carregando…' : (activeWorkspace?.name || 'Selecione um workspace');

  return (
    <div ref={ref} className="px-3 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors disabled:opacity-60"
      >
        <span className="w-7 h-7 rounded-md bg-violet-600/20 flex items-center justify-center shrink-0">
          {activeWorkspace?.type === 'pessoal' ? (
            <UserIcon className="w-4 h-4 text-violet-300" />
          ) : (
            <Building2 className="w-4 h-4 text-violet-300" />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Workspace</span>
          <span className="block text-sm font-medium text-white truncate">{label}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Meus Workspaces
          </div>
          <div className="max-h-72 overflow-y-auto">
            {workspaces.length === 0 && !loading && (
              <div className="px-3 py-3 text-xs text-zinc-500">Nenhum workspace.</div>
            )}
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => handleSelect(w.id)}
                disabled={switching !== null}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-800/60 transition-colors disabled:opacity-60"
              >
                <span className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                  {w.type === 'pessoal' ? (
                    <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                  ) : (
                    <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">{w.name}</span>
                  {w.role && (
                    <span className="block text-[10px] text-zinc-500 capitalize">{w.role}</span>
                  )}
                </span>
                {w.id === activeWorkspaceId && (
                  <Check className="w-4 h-4 text-violet-400 shrink-0" />
                )}
                {switching === w.id && (
                  <span className="w-4 h-4 border-2 border-zinc-600 border-t-violet-400 rounded-full animate-spin shrink-0" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setOpen(false); setCreating(true); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-violet-300 hover:bg-violet-600/10 border-t border-zinc-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Workspace
          </button>
        </div>
      )}

      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}