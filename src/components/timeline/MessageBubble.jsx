/**
 * MessageBubble.jsx — Fase 4
 * Extração fiel do bubble de chat usado no ChatPage, reutilizado no modo
 * Timeline para itens `kind: "message"` (mesma aparência da Conversação).
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import StreamingMessage from "@/components/chat/StreamingMessage";
import { formatTime } from "./formatTime";

export default function MessageBubble({ msg }) {
  const time = formatTime(msg.created_date);
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
        msg.role === "user"
          ? "bg-zinc-900 text-white rounded-br-md"
          : "bg-white border border-zinc-200 text-zinc-700 rounded-bl-md shadow-sm"
      }`}>
        {msg.role === "assistant" ? (
          msg.isStreaming ? (
            <StreamingMessage content={msg.streamingContent ?? ""} />
          ) : (
            <div className="prose prose-sm prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )
        ) : (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        )}
        {time && (
          <div className={`text-[10px] mt-1.5 ${msg.role === "user" ? "text-zinc-400" : "text-zinc-400"}`}>
            {time}
          </div>
        )}
      </div>
    </div>
  );
}