/**
 * WorkspaceConnectorsSection.jsx — Fase 4 UI
 * Grid de Connectors do workspace ativo: disponiveis vs conectados.
 * - Membro ve quais estao habilitados; so gerencia os proprios (conectar/desconectar).
 * - Owner/Admin pode habilitar/desabilitar (gate) e desconectar de outros.
 */
import React, { useState } from "react";
import { Plug, Unplug, Power, ShieldCheck, ChevronDown, ChevronUp, Mail, Folder, Calendar, Github, Globe, Monitor } from "lucide-react";
import { useWorkspaceConnectors } from "@/lib/workspace/useWorkspaceConnectors";
import { Button } from "@/components/ui/button";

const ICONS = {
  gmail: Mail,
  "google-drive": Folder,
  "google-calendar": Calendar,
  github: Github,
  "microsoft-graph": Monitor,
  "web-connector": Globe,
};

export default function WorkspaceConnectorsSection() {
  const { catalog, connectorsByDef, loading, error, role, isAdmin, connect, disconnect, setEnabled } = useWorkspaceConnectors();
  const [expanded, setExpanded] = useState({});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500 py-4">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-zinc-700">Connectors</h3>
        <span className="text-xs text-zinc-400">({catalog.length} disponíveis)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {catalog.map((def) => {
          const Icon = ICONS[def.connectorId] || Plug;
          const conns = connectorsByDef[def.connectorId] || [];
          const isConnected = conns.some((c) => c.status === "connected" && c.enabled !== false);
          const isExpanded = expanded[def.connectorId];

          return (
            <div key={def.connectorId} className="border border-zinc-200 rounded-xl p-3 bg-white">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isConnected ? "bg-emerald-50" : "bg-zinc-100"}`}>
                  <Icon className={`w-4 h-4 ${isConnected ? "text-emerald-600" : "text-zinc-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-800 truncate">{def.displayName}</p>
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3" /> Conectado
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-medium">Disponível</span>
                    )}
                  </div>
                  {conns.length > 0 && (
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {conns.length} conexão(ões){conns.filter((c) => c.enabled === false).length > 0 ? " · algumas desabilitadas" : ""}
                    </p>
                  )}
                </div>
              </div>

              {conns.length > 1 && (
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [def.connectorId]: !p[def.connectorId] }))}
                  className="text-xs text-zinc-400 hover:text-zinc-600 mt-2 flex items-center gap-1"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {conns.length} usuários
                </button>
              )}

              {conns.length > 0 && (conns.length === 1 || isExpanded) && (
                <div className={`mt-2 space-y-1.5 ${isExpanded || conns.length === 1 ? "" : "hidden"}`}>
                  {conns.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.enabled === false ? "bg-zinc-300" : "bg-emerald-400"}`} />
                      <span className="text-zinc-500 truncate flex-1">{c.display_label || c.credential_owner_id?.slice(-6)}</span>
                      {isAdmin && (
                        <button
                          onClick={() => setEnabled(def.connectorId, c.enabled === false, c.credential_owner_id)}
                          className="text-zinc-400 hover:text-violet-600"
                          title={c.enabled === false ? "Habilitar" : "Desabilitar"}
                        >
                          <Power className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-100">
                {!isConnected ? (
                  <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => connect({ connectorId: def.connectorId, providerKind: def.providerKind })}>
                    <Plug className="w-3 h-3 mr-1" /> Conectar
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => disconnect(def.connectorId)}>
                      <Unplug className="w-3 h-3 mr-1" /> Desconectar
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEnabled(def.connectorId, !(conns[0]?.enabled !== false))}>
                        <Power className="w-3 h-3 mr-1" /> {conns[0]?.enabled !== false ? "Desabilitar" : "Habilitar"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}