/**
 * ConnectorEventCard.jsx — card rico para SystemEvent type=Connector*
 * (ConnectorRegistered, ConnectorExecutionStarted/Completed/Failed, etc.)
 */

import React from "react";
import { Plug, Play, CheckCircle, XCircle } from "lucide-react";
import EventShell from "../EventShell";

const ICON_BY_TYPE = {
  ConnectorRegistered: Plug,
  ConnectorExecutionStarted: Play,
  ConnectorExecutionCompleted: CheckCircle,
  ConnectorExecutionFailed: XCircle,
};

export default function ConnectorEventCard({ event, time }) {
  const p = event.payload || {};
  const connectorId = event.metadata?.connectorId || p.connectorId || "connector";
  const Icon = ICON_BY_TYPE[event.type] || Plug;
  const caps = p.capabilities || [];
  return (
    <EventShell icon={Icon} type={event.type} status={event.status} source={event.source} time={time} accent="text-blue-500">
      <div className="text-sm text-zinc-700">
        <div className="font-medium text-zinc-800">{connectorId}</div>
        {caps.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {caps.slice(0, 8).map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">{c}</span>
            ))}
            {caps.length > 8 && <span className="text-[10px] text-zinc-400">+{caps.length - 8}</span>}
          </div>
        )}
      </div>
    </EventShell>
  );
}