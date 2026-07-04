import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, Brain, Sparkles, ChevronDown, ChevronUp, Radio, Volume2, X, Paperclip } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { getOrCreateActiveSession, shouldProcessBatch, processConversationBatch } from "@/lib/conversationEngine";
import { runMemoryPipeline } from "@/lib/memoryPipeline";
import { useVoicePipeline } from "@/hooks/useVoicePipeline";
import { ingestKnowledge, ACCEPT_MAP } from "@/lib/knowledgeIngestionPipeline";
import { detectSkills, buildSkillsPrompt } from "@/lib/skills/detector";
import VoiceButton from "@/components/chat/VoiceButton";
import VoiceMode from "@/components/chat/VoiceMode";
import AttachmentMenu from "@/components/chat/AttachmentMenu";
import ProcessingBubble from "@/components/chat/ProcessingBubble";
import PasteTextDialog from "@/components/chat/PasteTextDialog";
import LinkDialog from "@/components/chat/LinkDialog";

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [processingItems, setProcessingItems] = useState([]);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileInputTypeRef = useRef(null);

  const pipeline = useVoicePipeline({
    onSend: async (text, { setPhase }) => {
      return await sendAndReceive(text, { setPhase });
    },
  });

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

  const sendAndReceive = async (userMsg, { setPhase } = {}) => {
    if (!userMsg || !userMsg.trim() || loading || !session) return null;

    setLoading(true);

    // Salvar mensagem do usuário
    const savedUserMsg = await base44.entities.Message.create({
      session_id: session.id,
      role: "user",
      content: userMsg,
      memory_tier: "active",
    });
    setMessages((prev) => [...prev, savedUserMsg]);

    // === MEMORY RETRIEVAL PIPELINE ===
    // Etapa obrigatória: consulta todo o banco antes de responder
    setPhase?.("retrieving");
    const { context, sources, sessionSummary } = await runMemoryPipeline(
      userMsg,
      session.id,
      session.project_id
    );

    // === SKILLS DETECTION ===
    // Identifica o domínio da pergunta e carrega especialistas relevantes
    const activeSkills = detectSkills(userMsg);
    const skillsPrompt = buildSkillsPrompt(activeSkills);

    // Histórico da conversa atual (do estado, não do banco)
    const historyMessages = [...messages, savedUserMsg].slice(-30);
    const historyText = historyMessages
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n\n");
    const totalMessages = messages.length + 1;
    const hasStructuredMemory = context.length > 0 || sources.length > 0;

    // Lista de fontes consultadas pelo pipeline
    const sourceTypes = [...new Set(sources.map((s) => s.type))];
    const sourcesText = sourceTypes.length > 0
      ? sourceTypes.map((t) => `- ${t} (${sources.filter((s) => s.type === t).length} registros)`).join("\n")
      : "Nenhuma fonte estruturada encontrada no banco.";

    // Construir prompt com a personalidade oficial do MemoryOS
    const prompt = `Você é o MemoryOS — a memória permanente do usuário.

Você não é um chatbot. Você não é um assistente automático. Você não é um FAQ.
Você é uma memória viva, inteligente e companheira, que acompanha a jornada do usuário ao longo do tempo.
Sua missão é preservar, conectar e utilizar o conhecimento do usuário — não apenas responder perguntas.

O usuário não conversa com um software. O usuário conversa com a própria memória.
Toda resposta deve transmitir essa sensação.

## COMO VOCÊ CONVERSA

- Converse. Nunca apenas responda.
- A conversa deve parecer natural, como duas pessoas inteligentes discutindo um assunto.
- Use linguagem simples, elegante, humana e objetiva.
- Evite formalidade excessiva, listas desnecessárias, linguagem jurídica ou técnica quando não for preciso.
- Transmite inteligência, calma, organização, clareza, confiança, curiosidade e continuidade.
- Nunca pareça frio, mecânico, nem um manual de instruções.

## CONTINUIDADE

O usuário deve sentir que a conversa nunca foi interrompida — mesmo depois de dias ou semanas.
Quando natural, use expressões como:
- "Na última vez conversamos sobre..."
- "Anteriormente registramos..."
- "Lembro que decidimos..."
- "Naquela ocasião..."
Use isso com naturalidade, sem exagerar.

## COMO UTILIZAR A MEMÓRIA

Quando utilizar informações armazenadas, não apenas responda — explique naturalmente de onde veio aquela conclusão:
- "Estou considerando a decisão registrada anteriormente sobre..."
- "Essa conclusão utiliza documentos que você compartilhou..."
Sem parecer uma referência bibliográfica. Sem citar IDs ou nomes técnicos de entidades.

## INTELIGÊNCIA

Conecte informações de fontes diferentes.
Se o usuário perguntar "Como está o projeto?", não liste dados soltos — mostre evolução:
"Desde nossa última conversa concluímos X, implementamos Y e o próximo passo é Z."
Isso demonstra que você acompanha a jornada.

## TAMANHO DAS RESPOSTAS

Adapte automaticamente:
- Pergunta simples → resposta curta e direta.
- Pergunta estratégica → resposta completa e articulada.
- Nunca escreva textos enormes para perguntas simples.

## EXPLICAÇÕES

Explique conceitos difíceis de forma simples, com exemplos, comparações e analogias — sem parecer professor, sem parecer documentação técnica.

## EMOÇÃO

Não finja emoções humanas. Mas transmita interesse, atenção, continuidade, companheirismo e disposição para ajudar.

## O QUE NUNCA FAZER

Nunca diga:
- "Como uma IA..."
- "Como modelo de linguagem..."
- "Não tenho memória..."
- "Cada conversa é independente..."
...quando existir memória carregada no contexto.

## MEMÓRIA PARCIAL

Se apenas parte do histórico estiver disponível, diga naturalmente:
"Encontrei algumas coisas relacionadas na memória, mas meu conhecimento sobre isso ainda é parcial."

## CONFLITOS

Se houver informações conflitantes: apresente ambas, explique o conflito e indique qual parece mais recente ou confiável. Nunca invente respostas.

## PRINCÍPIO FUNDAMENTAL

- O MemoryOS não responde perguntas. O MemoryOS conversa.
- O MemoryOS não armazena arquivos. O MemoryOS preserva conhecimento.
- O MemoryOS não possui sessões independentes. O MemoryOS possui uma única memória permanente.

Antes de responder, pense como uma memória. Depois responda como um companheiro de longa data. Nunca como um chatbot.

${skillsPrompt ? `${skillsPrompt}` : ""}
---

## ESTADO ATUAL DA MEMÓRIA
- Esta conversa possui ${totalMessages} mensagens preservadas.
${activeSkills.length > 0 ? `- Especialistas ativos: ${activeSkills.map((s) => s.name).join(", ")}.` : "- Nenhum especialista específico ativo para esta pergunta."}
${sessionSummary ? "- Existe um resumo da conversa disponível abaixo." : ""}
${hasStructuredMemory ? `- Memória estruturada recuperada: ${sources.length} registros de ${sourceTypes.length} fontes (${sourceTypes.join(", ")}).` : "- Nenhuma memória estruturada encontrada para esta pergunta."}

## FONTES CONSULTADAS
${sourcesText}

${context ? `## MEMÓRIA ESTRUTURADA RECUPERADA\n${context}` : ""}

${sessionSummary ? `## RESUMO DA CONVERSA\n${sessionSummary}` : ""}

${historyText ? `## HISTÓRICO DA CONVERSA\n${historyText}` : ""}

## O QUE O USUÁRIO ACABOU DE DIZER
${userMsg}`;

    setPhase?.("generating");
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

    const responseText = typeof response === "string" ? response : String(response);

    // TTS é gerenciado pelo VoicePipeline — não fazer aqui

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

    return responseText;
  };

  const runIngestion = async ({ type, file, url, text }) => {
    if (!session) return;
    const itemId = `ingestion-${Date.now()}`;
    const displayName = file?.name || url || "Texto colado";

    setProcessingItems((prev) => [
      ...prev,
      { id: itemId, name: displayName, type, stage: "receiving", error: null },
    ]);

    // Salvar mensagem do usuário (registro do conteúdo adicionado)
    const userMsg = await base44.entities.Message.create({
      session_id: session.id,
      role: "user",
      content: type === "link" ? `📎 ${url}` : `📎 ${displayName}`,
      memory_tier: "active",
    });
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await ingestKnowledge({
        type,
        file,
        url,
        text,
        name: displayName,
        sessionId: session.id,
        projectId: session.project_id,
        onStage: (stage) => {
          setProcessingItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, stage } : item))
          );
        },
      });

      const stats = result.stats;
      const statsLines = [];
      if (stats.entities > 0) statsLines.push(`✓ ${stats.entities} entidades identificadas`);
      if (stats.keywords > 0) statsLines.push(`✓ ${stats.keywords} palavras-chave extraídas`);
      if (stats.decisions > 0) statsLines.push(`✓ ${stats.decisions} decisões registradas`);
      if (stats.tasks > 0) statsLines.push(`✓ ${stats.tasks} tarefas identificadas`);
      if (stats.topics > 0) statsLines.push(`✓ ${stats.topics} assuntos catalogados`);

      const completionText = `**${result.displayName}** processado.\n\n✓ Resumo criado.\n${statsLines.join("\n")}\n\nEste conteúdo agora faz parte da sua memória permanente.`;

      const assistantMsg = await base44.entities.Message.create({
        session_id: session.id,
        role: "assistant",
        content: completionText,
        memory_tier: "active",
      });
      setMessages((prev) => [...prev, assistantMsg]);

      setProcessingItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setProcessingItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, error: "Erro ao processar conteúdo." } : item
        )
      );

      const errorMsg = await base44.entities.Message.create({
        session_id: session.id,
        role: "assistant",
        content: `Não consegui processar **${displayName}**. Ocorreu um erro durante o processamento. Tente novamente.`,
        memory_tier: "active",
      });
      setMessages((prev) => [...prev, errorMsg]);

      setTimeout(() => {
        setProcessingItems((prev) => prev.filter((item) => item.id !== itemId));
      }, 3000);
    }
  };

  const handleAttachmentSelect = (type) => {
    setAttachmentMenuOpen(false);
    if (type === "text") {
      setPasteDialogOpen(true);
      return;
    }
    if (type === "link") {
      setLinkDialogOpen(true);
      return;
    }
    fileInputTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = ACCEPT_MAP[type] || "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await runIngestion({ type: fileInputTypeRef.current, file });
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading || !session) return;
    setInput("");
    await sendAndReceive(text);
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] lg:h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Session header with rolling summary toggle */}
      {session?.summary && (
        <div className="border-b border-zinc-100 bg-white">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center gap-2 px-4 lg:px-6 py-2.5 text-left hover:bg-zinc-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-xs font-medium text-zinc-500 truncate">
              Memória ativa — {messages.length} mensagens
            </span>
            {showSummary ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400 ml-auto shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-auto shrink-0" />}
          </button>
          {showSummary && (
            <div className="px-4 lg:px-6 pb-4">
              <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">Resumo da Memória</p>
                <p className="text-sm text-zinc-600 whitespace-pre-wrap">{session.summary}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
        <div className="max-w-3xl mx-auto space-y-3 lg:space-y-4">
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

          {processingItems.map((item) => (
            <ProcessingBubble key={item.id} item={item} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Voice pipeline status indicator */}
      {(pipeline.state !== "idle" || pipeline.error) && (
        <div className={`border-t px-4 lg:px-6 py-2 flex items-center gap-2 ${
          pipeline.state === "listening" ? "bg-red-50 border-red-100" :
          pipeline.state === "speaking" ? "bg-emerald-50/50 border-zinc-100" :
          pipeline.error ? "bg-red-50 border-red-100" :
          "bg-violet-50 border-violet-100"
        }`}>
          {pipeline.state === "listening" && (<>
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-600 font-medium">{pipeline.phaseLabel}</span>
            {pipeline.interimText && <span className="text-xs text-red-400 truncate ml-1">{pipeline.interimText}</span>}
          </>)}
          {(pipeline.state === "transcribing" || pipeline.state === "retrieving" || pipeline.state === "generating") && (<>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500 shrink-0" />
            <span className="text-xs text-violet-600 font-medium">{pipeline.phaseLabel}</span>
          </>)}
          {pipeline.state === "speaking" && (<>
            <Volume2 className="w-4 h-4 text-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs text-emerald-600 font-medium">{pipeline.phaseLabel}</span>
            <button type="button" onClick={pipeline.stopSpeaking} className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-medium">Parar</button>
          </>)}
          {pipeline.error && (
            <span className="text-xs text-red-600 font-medium truncate">{pipeline.error.message}</span>
          )}
          {(pipeline.isProcessing || pipeline.state === "speaking") && !pipeline.error && (
            <button type="button" onClick={pipeline.cancel} className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 font-medium transition">
              <X className="w-3 h-3" />
              Cancelar
            </button>
          )}
        </div>
      )}

      {/* Input — fixo na parte inferior */}
      <div className="border-t border-zinc-200 bg-white px-3 sm:px-4 lg:px-6 py-3 lg:py-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
          {/* Conversa Contínua — modo separado para longas conversas por voz */}
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setContinuousMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition"
            >
              <Radio className="w-3.5 h-3.5" />
              Conversa Contínua
            </button>
          </div>

          <div className="flex items-end gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                disabled={loading}
                className="p-3 rounded-2xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30 transition-all shrink-0"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              {attachmentMenuOpen && (
                <AttachmentMenu
                  onSelect={handleAttachmentSelect}
                  onClose={() => setAttachmentMenuOpen(false)}
                />
              )}
            </div>
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
              className={`flex-1 resize-none px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white max-h-32 ${
                pipeline.isListening ? "border-red-300 bg-red-50/30" : "border-zinc-200"
              }`}
              readOnly={pipeline.isListening}
              disabled={loading}
            />
            {pipeline.isSupported && (
              <VoiceButton
                disabled={loading || pipeline.isProcessing}
                onPressStart={pipeline.startCapture}
                onPressEnd={pipeline.stopCapture}
                onCancel={pipeline.cancel}
              />
            )}
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

      {/* Hidden file input for attachments */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Paste text dialog */}
      <PasteTextDialog
        open={pasteDialogOpen}
        onOpenChange={setPasteDialogOpen}
        onSubmit={(text) => runIngestion({ type: "text", text })}
      />

      {/* Link dialog */}
      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onSubmit={(url) => runIngestion({ type: "link", url })}
      />

      {/* Conversa Contínua — overlay para longas conversas por voz */}
      {continuousMode && (
        <VoiceMode
          onSendAndReceive={(text) => sendAndReceive(text)}
          onClose={() => {
            setContinuousMode(false);
            pipeline.stopSpeaking();
          }}
        />
      )}
    </div>
  );
}