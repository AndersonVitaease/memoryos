/**
 * ConnectorRegistry — Sprint 8.1
 * Tabela de Connectors com Status e Capabilities.
 */
import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { isConnected } from "@/lib/google-auth/GoogleAuthSession";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const WORKSPACE_ID = getActiveWorkspaceId();

const CONNECTORS = [
  {
    id: "gmail",
    name: "Gmail",
    emoji: "📧",
    capabilities: [
      "searchEmails",
      "readEmail",
      "sendEmail",
      "replyEmail",
      "listLabels",
      "getAttachment",
    ],
  },
  {
    id: "calendar",
    name: "Google Calendar",
    emoji: "📅",
    capabilities: [
      "calendar.today",
      "calendar.thisWeek",
      "calendar.nextMeeting",
      "calendar.searchEvents",
      "calendar.createEvent",
    ],
  },
  {
    id: "drive",
    name: "Google Drive",
    emoji: "📁",
    capabilities: [
      "drive.listFiles",
      "drive.searchFiles",
      "drive.readFile",
      "drive.uploadFile",
      "drive.createFolder",
    ],
  },
  {
    id: "profile",
    name: "Google Profile",
    emoji: "👤",
    capabilities: [
      "profile.getName",
      "profile.getEmail",
      "profile.getAvatar",
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    emoji: "💬",
    capabilities: ["sendMessage", "receiveMessage"],
    planned: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    emoji: "🛍️",
    capabilities: ["listOrders", "getProduct", "listCustomers"],
    planned: true,
  },
];

function StatusBadge({ status }) {
  if (status === "connected")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold">
        <CheckCircle className="w-3 h-3" /> Conectado
      </span>
    );
  if (status === "planned")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-zinc-600 bg-zinc-700/20 text-zinc-400 text-[11px] font-semibold">
        <AlertCircle className="w-3 h-3" /> Em breve
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-zinc-600 bg-zinc-700/20 text-zinc-400 text-[11px] font-semibold">
      <XCircle className="w-3 h-3" /> Desconectado
    </span>
  );
}

export default function ConnectorRegistry() {
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    setGoogleConnected(isConnected(WORKSPACE_ID));
  }, []);

  const rows = CONNECTORS.map((c) => {
    let status = "disconnected";
    if (c.planned) status = "planned";
    else if (["gmail", "calendar", "drive", "profile"].includes(c.id) && googleConnected)
      status = "connected";
    return { ...c, status };
  });

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/10">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connector</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Capabilities</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.id} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/5"} ${c.planned ? "opacity-50" : ""}`}>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 font-medium">
                  <span className="text-base">{c.emoji}</span>
                  {c.name}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {c.capabilities.map((cap) => (
                    <span key={cap}
                      className="px-1.5 py-0.5 rounded border border-border/50 bg-muted/20 text-[10px] font-mono text-muted-foreground">
                      {cap}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}