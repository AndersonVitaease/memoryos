import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, Brain } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { getOrCreateActiveSession, shouldProcessBatch, processConversationBatch } from "@/lib/conversationEngine";
import { retrieveContext } from "@/lib/contextRetrieval";

export default function ChatInterface({ projectId, projectName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [session, setSession] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { init(); }, [projectId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const init = async () => {
    setInitialLoading(true);
    const activeSession = await getOrCreateActiveSession(projectId);
    setSession(activeSession);
    const msgs = await base44.entities.Message.filter({ session_id: activeSession.id }, "created_date", 100);
    setMessages(msgs);
    setInitialLoading(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const userMsg = input.trim();
    if (!userMsg || loading || !session) return;

    setInput("");
    setLoading(true);

    const savedUserMsg = await base44.entities.Message.create({
      session_id: session.id,
      project_id: projectId,
      role: "user",
      content: userMsg,
      memory_tier: "active",
    });
    setMessages((prev) => [...prev, savedUserMsg]);

    const { context, sources, recentMessages } = await retrieveContext(userMsg, session.id, projectId);

    const historyText = recentMessages
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n\n");

    const prompt = `Você é o MemoryOS — a memória permanente do projeto "${projectName}".
Responda com contexto, histórico e conhecimento. Nunca peça que o usuário resuma ou recupere contexto.
Responda sempre em português brasileiro.

${context ? `## CONHECIMENTO RECUPERADO\n${context}` : "## CONHECIMENTO RECUPERADO\n(Ainda não há conhecimento suficiente.)"}

${historyText ? `## CONVERSA RECENTE\n${historyText}` : ""}

## PERGUNTA
${userMsg}`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt });

    const savedAssistant = await base44.entities.Message.create({
      session_id: session.id,
      project_id: projectId,
      role: "assistant",
      content: response,
      sources_used: sources.map((s) => s.id),
      memory_tier: "active",
    });
    setMessages((prev) => [...prev, savedAssistant]);
    setLoading(false);

    // Processar lote em background
    const allMessages = [...messages, savedUserMsg, savedAssistant];
    const userMessageCount = allMessages.filter((m) => m.role === "user").length;
    if (shouldProcessBatch(userMessageCount)) {
      processConversationBatch(session, allMessages, projectId).catch(() => {});
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-200">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-semibold text-zinc-700 font-heading">Converse com a memória do projeto</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-sm">
              O MemoryOS organiza e preserva todo o conhecimento automaticamente.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-zinc-900 text-white rounded-br-md"
                : "bg-white border border-zinc-200 text-zinc-700 rounded-bl-md shadow-sm"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-sm text-zinc-400">Consultando a memória...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-zinc-200 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Converse com sua memória..."
            rows={1}
            className="flex-1 resize-none px-4 py-3 rounded-2xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white max-h-32"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="p-3 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-30 transition-all">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}