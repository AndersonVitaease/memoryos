/**
 * CreateWorkspaceDialog.jsx — Dialog de criacao de Workspace (Fase 2).
 *
 * Chama exclusivamente o backend workspaceCreate (que cria Workspace +
 * WorkspaceMember(owner) + sync + seta ativo). O frontend nunca toca
 * WorkspaceMember diretamente.
 */
import React, { useState, useEffect } from 'react';
import { Building2, X, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/lib/workspace/WorkspaceContext';

export default function CreateWorkspaceDialog({ open, onClose }) {
  const { createWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('equipe');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (open) { setName(''); setDescription(''); setType('equipe'); setErr(null); }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Informe um nome.'); return; }
    setBusy(true); setErr(null);
    try {
      await createWorkspace(name.trim(), description.trim() || null, type);
      onClose();
    } catch (e2) {
      setErr(e2?.message || 'Falha ao criar workspace');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-violet-600" />
            </span>
            <h2 className="text-base font-semibold text-zinc-900">Criar Workspace</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Nome</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Consolidadora XYZ"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Para que serve este workspace?"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: 'equipe', l: 'Equipe' }, { v: 'empresa', l: 'Empresa' }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setType(o.v)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    type === o.v
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}