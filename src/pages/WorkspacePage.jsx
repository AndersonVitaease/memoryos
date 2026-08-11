/**
 * WorkspacePage.jsx — Painel do Workspace ativo (Fase 2).
 *
 * Mostra informacoes basicas do workspace, papel do usuario atual, e areas
 * (Membros implementado; Documentos/Memória/Connectors/Agentes/Automações com
 * estados vazios apropriados — sem funcionalidade falsa).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, User as UserIcon, Users, FileText, Brain, Plug, Bot, Workflow, Crown,
} from 'lucide-react';
import { useWorkspace } from '@/lib/workspace/WorkspaceContext';
import WorkspaceMembers from '@/components/workspace/WorkspaceMembers';
import WorkspaceConnectorsSection from '@/components/workspace/WorkspaceConnectorsSection';

const TABS = [
  { id: 'overview', label: 'Visão geral', icon: Building2 },
  { id: 'members', label: 'Membros', icon: Users },
  { id: 'documents', label: 'Documentos', icon: FileText },
  { id: 'memory', label: 'Memória', icon: Brain },
  { id: 'connectors', label: 'Connectors', icon: Plug },
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'automations', label: 'Automações', icon: Workflow },
];

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };

export default function WorkspacePage() {
  const { activeWorkspace, activeWorkspaceId, loading } = useWorkspace();
  const [tab, setTab] = useState('overview');

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">Carregando workspace…</div>;
  }
  if (!activeWorkspace) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-500">Nenhum workspace ativo.</p>
        <Link to="/" className="text-sm text-violet-600 hover:underline mt-2 inline-block">Voltar ao início</Link>
      </div>
    );
  }

  const myRole = activeWorkspace.role;
  const isPersonal = activeWorkspace.type === 'pessoal';
  const RoleIcon = myRole === 'owner' ? Crown : Building2;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Cabeçalho do workspace */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
          {isPersonal ? <UserIcon className="w-6 h-6 text-violet-600" /> : <Building2 className="w-6 h-6 text-violet-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 truncate">{activeWorkspace.name}</h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700">
              <RoleIcon className="w-3 h-3" /> {ROLE_LABELS[myRole] || myRole}
            </span>
          </div>
          {activeWorkspace.description && (
            <p className="text-sm text-zinc-500 mt-1">{activeWorkspace.description}</p>
          )}
          <p className="text-xs text-zinc-400 mt-1 capitalize">
            {isPersonal ? 'Workspace pessoal' : `Workspace ${activeWorkspace.type}`} · Plano {activeWorkspace.plan}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6">
        {tab === 'overview' && <OverviewTab workspace={activeWorkspace} myRole={myRole} />}
        {tab === 'members' && <WorkspaceMembers workspaceId={activeWorkspaceId} />}
        {tab === 'connectors' && <WorkspaceConnectorsSection />}
        {['documents', 'memory', 'agents', 'automations'].includes(tab) && (
          <EmptyState tab={tab} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ workspace, myRole }) {
  const items = [
    { label: 'Nome', value: workspace.name },
    { label: 'Descrição', value: workspace.description || '—' },
    { label: 'Tipo', value: workspace.type === 'pessoal' ? 'Pessoal' : workspace.type },
    { label: 'Plano', value: workspace.plan, capitalize: true },
    { label: 'Seu papel', value: ROLE_LABELS[myRole] || myRole },
    { label: 'Criado em', value: new Date(workspace.created_date).toLocaleDateString('pt-BR') },
  ];
  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-900 mb-4">Informações do Workspace</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{it.label}</dt>
            <dd className={`text-sm text-zinc-900 mt-0.5 ${it.capitalize ? 'capitalize' : ''}`}>{it.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 rounded-lg bg-zinc-50 border border-zinc-200 p-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Este workspace é a fronteira do seu contexto no MemoryOS: usuários, memória compartilhada,
          documentos, conversas, connectors, agentes e automações operam dentro dele.
          Projetos continuam sendo uma organização interna opcional dentro do workspace.
        </p>
      </div>
    </div>
  );
}

function EmptyState({ tab }) {
  const messages = {
    documents: 'Documentos do Workspace serão disponibilizados aqui.',
    memory: 'A memória compartilhada do Workspace será disponibilizada aqui.',
    connectors: 'Connectors do Workspace serão disponibilizados aqui.',
    agents: 'Agentes do Workspace serão disponibilizados aqui.',
    automations: 'Automações do Workspace serão disponibilizadas aqui.',
  };
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
        {TABS.find((t) => t.id === tab)?.icon && (() => {
          const Icon = TABS.find((t) => t.id === tab).icon;
          return <Icon className="w-6 h-6 text-zinc-400" />;
        })()}
      </div>
      <p className="text-sm text-zinc-500 max-w-xs">{messages[tab]}</p>
    </div>
  );
}