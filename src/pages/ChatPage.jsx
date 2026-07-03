import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, Brain, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { getOrCreateActiveSession, shouldProcessBatch, processConversationBatch } from "@/lib/conversationEngine";
import { retrieveContext } from "@/lib/contextRetrieval";

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const init = async () => {
    setInitialLoading(true);
    const activeSession = await getOrCreateActiveSession();
    setSession(activeSession);
    const msgs = await base44.entities.Message.filter({ session_id: activeSession.id }, "created_date", 100);
    setMessages(msgs);
    setInitialLoading(false);
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    const userMsg = input.trim();
    if (!userMsg || loading || !session) return;

    setInput("");
    setLoading(true);

    // Salvar mensagem do usuário
    const savedUserMsg = await base44.entities.Message.create({
      session_id: session.id,
      role: "user",
      content: userMsg,
      memory_tier: "active",
    });
    setMessages((prev) => [...prev, savedUserMsg]);

    // Recuperar contexto relevante (não carrega tudo — apenas o necessário)
    const { context, sources, recentMessages } = await retrieveContext(
      userMsg,
      session.id,
      session.project_id
    );

    // Histórico recente (apenas últimas mensagens)
    const historyText = recentMessages
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n\n");

    // Construir prompt focado
    const prompt = `Você é o MemoryOS — a memória permanente do usuário.
Sua função é responder com contexto, histórico e conhecimento — nunca pedir que o usuário resuma ou recupere contexto.

Responda sempre em português brasileiro, de forma natural e direta.
Se o conhecimento abaixo não contiver a resposta, diga o que você sabe e o que não encontrou na memória.

${context ? `## CONHECIMENTO RECUPERADO\n${context}` : "## CONHECIMENTO RECUPERADO\n(Ainda não há conhecimento suficiente na memória.)"}

${historyText ? `## CONVERSA RECENTE\n${historyText}` : ""}

## PERGUNTA ATUAL
${userMsg}`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt });

    // Salvar resposta
    const savedAssistant = await base44.entities.Message.create({
      session_id: session.id,
      role: "assistant",
      content: response,
      sources_used: sources.map((s) => s.id),
      memory_tier: "active",
    });
    setMessages((prev) => [...prev, savedAssistant]);
    setLoading(false);

    // Processar lote em background (a cada 5 mensagens alternadas = 10 total)
    const allMessages = [...messages, savedUserMsg, savedAssistant];
    const userMessageCount = allMessages.filter((m) => m.role === "user").length;

    if (shouldProcessBatch(userMessageCount)) {
      // Atualizar título na primeira vez
      if (session.title === "Nova conversa" && allMessages.length > 0) {
        const titleResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Crie um título curto (máx 5 palavras) para uma conversa que começou com:\n"${allMessages[0].content}"\nResponda apenas o título.`,
        });
        await base44.entities.ChatSession.update(session.id, { title: titleResult.trim().replace(/["']/g, "") });
        setSession((prev) => ({ ...prev, title: titleResult.trim().replace(/["']/g, "") }));
      }

      // Processar conhecimento em background (não bloqueia a UI)
      processConversationBatch(session, allMessages, session.project_id).then(async (knowledge) => {
        if (knowledge?.summary) {
          setSession((prev) => ({ ...prev, summary: knowledge.summary }));
        }
      }).catch(() => { /* silent — processamento em background */ });
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
      {/* Session header with rolling summary toggle */}
      {session?.summary && (
        <div className="border-b border-zinc-100 bg-white">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center gap-2 px-6 py-2.5 text-left hover:bg-zinc-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-medium text-zinc-500">
              Memória da conversa ativa — {messages.length} mensagens preservadas
            </span>
            {showSummary ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-auto" />}
          </button>
          {showSummary && (
            <div className="px-6 pb-4">
              <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">Resumo da Memória</p>
                <p className="text-sm text-zinc-600 whitespace-pre-wrap">{session.summary}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-200">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-800 font-heading">Sua memória está pronta</h3>
              <p className="text-sm text-zinc-400 mt-1 max-w-md">
                Converse naturalmente. O MemoryOS organiza, relaciona e preserva todo o conhecimento automaticamente — você nunca precisa resumir.
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
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 bg-white px-4 lg:px-6 py-4">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
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
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-3 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-30 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}