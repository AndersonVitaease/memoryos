/**
 * WatchEventCard.jsx — card rico para SystemEvent type=watch_triggered
 */

import React from "react";
import { Bell, Mail } from "lucide-react";
import ReactMarkdown from "react-markdown";
import EventShell from "../EventShell";

export default function WatchEventCard({ event, time }) {
  const p = event.payload || {};
  return (
    <EventShell icon={Bell} type="Aviso disparado" status={event.status} source={event.source} time={time} accent="text-violet-500">
      <div className="text-sm text-zinc-700">
        <div className="font-medium text-zinc-800 mb-1">{p.watchName || "Aviso"}</div>
        <div className="prose prose-sm prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown>{p.message || ""}</ReactMarkdown>
        </div>
      </div>
      {p.provider && (
        <div className="mt-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{p.provider}</span>
        </div>
      )}
      {p.emailSent?.to && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600">
          <Mail className="w-3 h-3" />
          Email enviado para {p.emailSent.to}
        </div>
      )}
    </EventShell>
  );
}