import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";

export default function ChatInterface({ projectId, projectName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadMessages();
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    setInitialLoading(true);
    const msgs = await base44.entities.ChatMessage.filter({ project_id: projectId }, "created_date", 100);
    setMessages(msgs);
    setInitialLoading(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");

    const savedUserMsg = await base44.entities.ChatMessage.create({
      project_id: projectId,
      role: "user",
      content: userMsg,
    });
    setMessages((prev) => [...prev, savedUserMsg]);
    setLoading(true);

    // Fetch project documents for context
    const docs = await base44.entities.Document.filter({ project_id: projectId });
    const docsWithText = docs.filter((d) => d.extracted_text);

    // Build context from documents (limit to avoid token overflow)
    let context = "";
    const usedDocIds = [];
    for (const doc of docsWithText) {
      const chunk = doc.extracted_text.substring(0, 2000);
      if ((context + chunk).length > 8000) break;
      context += `\n\n--- Documento: ${doc.name} ---\n${chunk}`;
      usedDocIds.push(doc.id);
    }

    // Get recent conversation history
    const recentMsgs = messages.slice(-10);
    let conversationHistory = recentMsgs
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n");

    const prompt = `Você é o assistente de memória do projeto "${projectName}".
Responda com base nos documentos fornecidos e no histórico da conversa.
Se a informação não estiver nos documentos, diga que não encontrou nos documentos do projeto.
Responda sempre em português brasileiro.

${context ? `DOCUMENTOS DO PROJETO:${context}` : "Nenhum documento encontrado neste projeto."}

${conversationHistory ? `HISTÓRICO RECENTE:\n${conversationHistory}` : ""}

Pergunta do usuário: ${userMsg}`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt });

    const savedAssistant = await base44.entities.ChatMessage.create({
      project_id: projectId,
      role: "assistant",
      content: response,
      sources_used: usedDocIds,
    });
    setMessages((prev) => [...prev, savedAssistant]);
    setLoading(false);
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
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-violet-500" />
            </div>
            <h3 className="font-semibold text-zinc-700 font-heading">Converse com seus documentos</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-sm">
              Faça perguntas sobre os arquivos deste projeto. A IA irá responder com base no conteúdo.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-zinc-900 text-white rounded-br-md"
                  : "bg-white border border-zinc-200 text-zinc-700 rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-zinc max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-sm text-zinc-400">Pensando...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-zinc-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Faça uma pergunta sobre seus documentos..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}