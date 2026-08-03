/**
 * TimelineDrawer.jsx — Fase 4 (Visualização Híbrida / Timeline Drawer)
 *
 * Drawer (vaul) que mescla Messages e SystemEvents da sessão em uma única
 * linha do tempo cronológica. Apenas consome a mesma fonte de dados do chat
 * (read-only) — nunca altera o fluxo do useConversation.
 */

import React, { useEffect, useState } from "react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { base44 } from "@/api/base44Client";
import { Clock, FileText, Bell, Mail, Brain, MessageSquare } from "lucide-react";
import { formatTime } from "@/components/timeline/formatTime";

const EVENT_META = {
  knowledge_ingested: { label: "Conhecimento ingerido", icon: FileText, color: "text-violet-500", bg: "bg-violet-50" },
  watch_triggered: { label: "Watch disparado", icon: Bell, color: "text-amber-500", bg: "bg-amber-50" },
  email_sent: { label: "Email enviado", icon: Mail, color: "text-sky-500", bg: "bg-sky-50" },
  connector_exec: { label: "Conector executado", icon: Brain, color: "text-indigo-500", bg: "bg-indigo-50" },
  planning_completed: { label: "Planejamento concluído", icon: Brain, color: "text-emerald-500", bg: "bg-emerald-50" },
};

function TimelineMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
        <MessageSquare className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${isUser ? "text-zinc-700" : "text-violet-600"}`}>
            {isUser ? "Você" : "MemoryOS"}
          </span>
          {msg.created_date && (
            <span className="text-[10px] text-zinc-400">{formatTime(msg.created_date)}</span>
          )}
        </div>
        <p className="text-sm text-zinc-600 mt-0.5 line-clamp-3 whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function TimelineEventCard({ event }) {
  const meta = EVENT_META[event.type] || { label: event.type, icon: Clock, color: "text-zinc-500", bg: "bg-zinc-100" };
  const Icon = meta.icon;
  const p = event.payload || {};

  let detail = "";
  if (p.displayName) detail = p.displayName;
  else if (p.watchName) detail = p.watchName;
  else if (p.to) detail = p.to;

  return (
    <div className="flex gap-3">
      <div className={`w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${meta.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-700">{meta.label}</span>
          {event.status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              event.status === "success" ? "bg-emerald-50 text-emerald-600"
              : event.status === "failure" ? "bg-red-50 text-red-600"
              : "bg-zinc-100 text-zinc-500"
            }`}>{event.status}</span>
          )}
          {event.created_date && (
            <span className="text-[10px] text-zinc-400">{formatTime(event.created_date)}</span>
          )}
        </div>
        {detail && <p className="text-sm text-zinc-600 mt-0.5 truncate">{detail}</p>}
        {p.stats && (
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {[
              p.stats.entities && `${p.stats.entities} entidades`,
              p.stats.keywords && `${p.stats.keywords} palavras-chave`,
              p.stats.tasks && `${p.stats.tasks} tarefas`,
              p.stats.topics && `${p.stats.topics} assuntos`,
            ].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function TimelineDrawer({ open, onOpenChange, sessionId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [events, messages] = await Promise.all([
          base44.entities.SystemEvent.filter({ conversationId: sessionId }, "-created_date", 200),
          base44.entities.Message.filter({ session_id: sessionId }, "-created_date", 200),
        ]);
        if (!alive) return;
        const merged = [
          ...events.map((e) => ({ kind: "event", id: "ev_" + e.id, date: e.created_date, data: e })),
          ...messages.map((m) => ({ kind: "message", id: "msg_" + m.id, date: m.created_date, data: m })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        setItems(merged);
      } catch {
        /* silent */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, sessionId]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[80vh] max-h-[80vh]">
        <DrawerHeader className="text-left shrink-0">
          <DrawerTitle className="flex items-center gap-2 font-heading">
            <Clock className="w-4 h-4 text-violet-500" />
            Linha do Tempo
          </DrawerTitle>
          <DrawerDescription>
            Mensagens e eventos de sistema da conversa, em ordem cronológica.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
          {loading && (
            <p className="text-sm text-zinc-400 text-center py-8">Carregando linha do tempo...</p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8">Nada registrado nesta conversa ainda.</p>
          )}
          {!loading && items.map((item) =>
            item.kind === "message"
              ? <TimelineMessage key={item.id} msg={item.data} />
              : <TimelineEventCard key={item.id} event={item.data} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}