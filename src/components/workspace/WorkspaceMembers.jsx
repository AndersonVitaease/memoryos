/**
 * WorkspaceMembers.jsx — Lista e gestao de membros do Workspace (Fase 2).
 *
 * Tudo via backend workspaceMembership (listMembers / addMember / removeMember
 * / listUsers). O frontend nunca manipula WorkspaceMember diretamente.
 *
 * Permissoes de UI (nao sao seguranca — o backend rejeita se faltar autoridade):
 *  - owner/admin do workspace: adicionar e remover membros.
 *  - member/viewer: somente leitura.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, X, Loader2, Shield, Crown, User as UserIcon, Eye } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useWorkspace } from '@/lib/workspace/WorkspaceContext';
import { useAuth } from '@/lib/AuthContext';

const ROLE_LABELS = {
  owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer',
};
const ROLE_ICON = {
  owner: Crown, admin: Shield, member: UserIcon, viewer: Eye,
};

export default function WorkspaceMembers({ workspaceId }) {
  const { user } = useAuth();
  const { workspaces } = useWorkspace();
  const myWsRole = workspaces.find((w) => w.id === workspaceId)?.role;
  const canManage = myWsRole === 'owner' || myWsRole === 'admin';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true); setErr(null);
    try {
      const res = await base44.functions.invoke('workspaceMembership', { operation: 'listMembers', workspaceId });
      const data = res?.data ?? res;
      setMembers(data?.members || []);
    } catch (e) { setErr(e?.message || 'Falha ao carregar membros'); }
    finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = async () => {
    setAddOpen(true);
    if (users.length === 0) {
      setUsersLoading(true);
      try {
        const res = await base44.functions.invoke('workspaceMembership', { operation: 'listUsers' });
        const data = res?.data ?? res;
        setUsers(data?.users || []);
      } catch (e) { /* admin-only; ignora silencioso */ }
      finally { setUsersLoading(false); }
    }
  };

  const addMember = async (targetUserId, role) => {
    try {
      await base44.functions.invoke('workspaceMembership', {
        operation: 'addMember', workspaceId, targetUserId, role,
      });
      await load();
    } catch (e) {
      setErr(e?.message || 'Falha ao adicionar membro');
    }
  };

  const removeMember = async (targetUserId) => {
    try {
      await base44.functions.invoke('workspaceMembership', {
        operation: 'removeMember', workspaceId, targetUserId,
      });
      await load();
    } catch (e) {
      setErr(e?.message || 'Falha ao remover membro');
    }
  };

  const memberIds = new Set(members.map((m) => m.user_id));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Membros</h3>
          <p className="text-xs text-zinc-500">{members.length} {members.length === 1 ? 'pessoa' : 'pessoas'}</p>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-violet-600 hover:bg-violet-700"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : (
        <div className="rounded-lg border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Nome</th>
                <th className="text-left px-4 py-2.5 font-semibold">Papel</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                {canManage && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {members.map((m) => {
                const RoleIcon = ROLE_ICON[m.role] || UserIcon;
                const isMe = m.user_id === user?.id;
                return (
                  <tr key={m.member_id} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold text-zinc-600 shrink-0">
                          {(m.full_name || m.email || '?').charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-900 truncate">
                            {m.full_name || m.email || 'Usuário'} {isMe && <span className="text-zinc-400 text-xs">(você)</span>}
                          </p>
                          {m.email && m.full_name && <p className="text-xs text-zinc-500 truncate">{m.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700">
                        <RoleIcon className="w-3.5 h-3.5" />
                        {ROLE_LABELS[m.role] || m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        m.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        m.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-zinc-100 text-zinc-500'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {m.role !== 'owner' && !isMe && (
                          <button
                            onClick={() => removeMember(m.user_id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remover membro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddMemberDialog
          users={users}
          loading={usersLoading}
          memberIds={memberIds}
          onAdd={addMember}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

function AddMemberDialog({ users, loading, memberIds, onAdd, onClose }) {
  const [targetUserId, setTargetUserId] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!targetUserId) { setErr('Selecione um usuário.'); return; }
    setBusy(true); setErr(null);
    try { await onAdd(targetUserId, role); onClose(); }
    catch (e2) { setErr(e2?.message || 'Falha'); }
    finally { setBusy(false); }
  };

  const available = users.filter((u) => !memberIds.has(u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Adicionar membro</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-500"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Usuário</label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários…</div>
            ) : available.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhum usuário disponível para adicionar.</p>
            ) : (
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Selecione…</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Papel</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: 'admin', l: 'Admin' }, { v: 'member', l: 'Member' }, { v: 'viewer', l: 'Viewer' }].map((o) => (
                <button key={o.v} type="button" onClick={() => setRole(o.v)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    role === o.v ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                  }`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100">Cancelar</button>
            <button type="submit" disabled={busy || !targetUserId}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 flex items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}