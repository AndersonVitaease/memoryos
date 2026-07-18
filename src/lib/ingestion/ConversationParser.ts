// ConversationParser.ts — Sprint EF-37
// Parses raw input from various sources into normalized KipConversation

import type { KipConversation, KipMessage, SourceType } from "./KipTypes";

let _seq = 0;
const uid = (prefix = "msg") => `${prefix}-${Date.now()}-${++_seq}`;

export const ConversationParser = {
  parse(raw: string | object, sourceType: SourceType, conversationId?: string): KipConversation {
    const id = conversationId ?? `conv-${Date.now()}-${++_seq}`;
    switch (sourceType) {
      case "chatgpt_export": return parseChatGPTExport(raw, id);
      case "json":           return parseJSON(raw, id);
      case "markdown":       return parseMarkdown(raw as string, id);
      case "txt":            return parseTXT(raw as string, id);
      default:               return parseTXT(typeof raw === "string" ? raw : JSON.stringify(raw), id);
    }
  },

  parseMessages(text: string): KipMessage[] {
    return parseTXT(text, "conv-0").messages;
  },
};

function parseChatGPTExport(raw: string | object, id: string): KipConversation {
  let data: any;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return parseTXT(String(raw), id); }

  const messages: KipMessage[] = [];
  if (Array.isArray(data)) {
    data.forEach((item: any) => {
      if (item.mapping) {
        Object.values(item.mapping as Record<string, any>).forEach((node: any) => {
          const msg = node?.message;
          if (!msg || !msg.content?.parts) return;
          const content = msg.content.parts.join(" ").trim();
          if (!content) return;
          messages.push({
            id:        uid(),
            author:    msg.author?.role ?? "user",
            role:      msg.author?.role === "assistant" ? "assistant" : "user",
            content,
            timestamp: (msg.create_time ?? 0) * 1000 || Date.now(),
          });
        });
      }
    });
  }

  return { id, sourceType: "chatgpt_export", messages, importedAt: Date.now() };
}

function parseJSON(raw: string | object, id: string): KipConversation {
  let data: any;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return parseTXT(String(raw), id); }

  const messages: KipMessage[] = [];
  const arr = Array.isArray(data) ? data : data.messages ?? [];
  arr.forEach((item: any) => {
    if (item.content || item.text || item.message) {
      messages.push({
        id:        uid(),
        author:    item.author ?? item.role ?? "user",
        role:      (item.role === "assistant" ? "assistant" : "user"),
        content:   item.content ?? item.text ?? item.message ?? "",
        timestamp: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
      });
    }
  });

  return { id, sourceType: "json", messages, importedAt: Date.now() };
}

function parseMarkdown(text: string, id: string): KipConversation {
  const lines = text.split("\n");
  const messages: KipMessage[] = [];
  let buffer = "";
  let currentRole: "user" | "assistant" = "user";

  for (const line of lines) {
    const userMatch = line.match(/^#+\s*(User|Human|Usuário):\s*(.*)/i);
    const asstMatch = line.match(/^#+\s*(Assistant|AI|MemoryOS|Bot):\s*(.*)/i);
    if (userMatch || asstMatch) {
      if (buffer.trim()) {
        messages.push({ id: uid(), author: currentRole, role: currentRole, content: buffer.trim(), timestamp: Date.now() });
      }
      currentRole = userMatch ? "user" : "assistant";
      buffer = (userMatch?.[2] ?? asstMatch?.[2] ?? "") + " ";
    } else {
      buffer += line + " ";
    }
  }
  if (buffer.trim()) {
    messages.push({ id: uid(), author: currentRole, role: currentRole, content: buffer.trim(), timestamp: Date.now() });
  }
  if (messages.length === 0 && text.trim()) {
    messages.push({ id: uid(), author: "user", role: "user", content: text.trim(), timestamp: Date.now() });
  }
  return { id, sourceType: "markdown", messages, importedAt: Date.now() };
}

function parseTXT(text: string, id: string): KipConversation {
  // Split on blank lines or "---" separators
  const segments = text.split(/\n{2,}|---/).map(s => s.trim()).filter(Boolean);
  const messages: KipMessage[] = segments.map(seg => ({
    id:        uid(),
    author:    "user",
    role:      "user" as const,
    content:   seg,
    timestamp: Date.now(),
  }));
  if (messages.length === 0 && text.trim()) {
    messages.push({ id: uid(), author: "user", role: "user", content: text.trim(), timestamp: Date.now() });
  }
  return { id, sourceType: "txt", messages, importedAt: Date.now() };
}