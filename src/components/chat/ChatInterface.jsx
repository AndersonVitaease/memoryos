import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, FileText, Brain } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";

export default function ChatInterface({ projectId, projectName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => { loadMessages(); }, [projectId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadMessages = async () => {
    setInitialLoading(true);
    const msgs = await base44.entities.Message.filter({ project_id: projectId }, "created_date", 100);
    setMessages(msgs);
    setInitialLoading(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");

    const savedUserMsg = await base44.entities.Message.create({
      project_id: projectId,
      conversation_id: projectId, // single conversation per project for now
      role: "user",
      content: userMsg,
    });
    setMessages((prev) => [...prev, savedUserMsg]);
    setLoading(true);

    // Fetch knowledge base for context
    const [docs, entities, keywords] = await Promise.all([
      base44.entities.Document.filter({ project_id: projectId, processing_status: "completed" }, "-created_date", 50),
      base44.entities.KnowledgeEntity.filter({ project_id: projectId }, "created_date", 100),
      base44.entities.Keyword.filter({ project_id: projectId }, "created_date", 100),
    ]);

    // Build context from document summaries + extracted text
    let context = "";
    const usedDocIds = [];
    for (const doc of docs) {
      const docContent = doc.summary || doc.extracted_text?.substring(0, 1500) || "";
      if (!docContent) continue;
      if ((context + docContent).length > 8000) break;
      context += `\n\n--- ${doc.name} (${doc.category || "sem categoria"}) ---\n${docContent}`;
      usedDocIds.push(doc.id);
    }

    // Add entities for quick lookup
    let entityContext = "";
    if (entities.length) {
      entityContext = "\n\nENTIDADES CONHECIDAS NO PROJETO:\n" +
        entities.slice(0, 50).map((e) => `- ${e.type}: ${e.value}`).join("\n");
    }

    let keywordContext = "";
    if (keywords.length) {
      keywordContext = "\n\nPALAVRAS-CHAVE DO PROJETO: " +
        keywords.slice(0, 50).map((k) => k.keyword).join(", ");
    }

    // Recent conversation history
    const recentMsgs = messages.slice(-10);
    let conversationHistory = recentMsgs
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n");

    const prompt = `Você é a memória inteligente do projeto "${projectName}".
Responda com base no conhecimento extraído dos documentos.
Se a informação não estiver no conhecimento disponível, diga que não encontrou na memória do projeto.
Responda sempre em português brasileiro.

${context ? `CONHECIMENTO DOS DOCUMENTOS:${context}` : "Nenhum documento processado neste projeto ainda."}
${entityContext}
${keywordContext}

${conversationHistory ? `HISTÓRICO RECENTE:\n${conversationHistory}` : ""}

Pergunta: ${userMsg}`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt });

    const savedAssistant = await base44.entities.Message.create({
      project_id: projectId,
      conversation_id: projectId,
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 text-violet-500" />
            </div>
            <h3 className="font-semibold text-zinc-700 font-heading">Converse com a memória do projeto</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-sm">
              A IA responde usando o conhecimento extraído dos seus documentos.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-zinc-900 text-white rounded-br-md"
                : "bg-white border border-zinc-200 text-zinc-700 rounded-bl-md"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-zinc max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3">
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
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Faça uma pergunta sobre seus documentos..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()} className="p-2.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition-all">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}