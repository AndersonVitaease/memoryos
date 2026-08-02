/**
 * ChatPage.jsx — Conversation Experience Platform consumer
 * Sprint 7.0.1 (VXP): Smart auto-scroll, transcript review, VXP status states.
 * Architecture: render only. All logic in useConversation() + useVoiceInteraction().
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Brain, Sparkles, ChevronDown, ChevronUp,
  Radio, Volume2, X, Paperclip, RotateCcw, Square,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useConversation } from "@/lib/conversation-platform/useConversation";
import { useVoiceInteraction } from "@/lib/voice-platform/useVoiceInteraction";
import { ingestKnowledge, ACCEPT_MAP } from "@/lib/knowledgeIngestionPipeline";
import { base44 } from "@/api/base44Client";
import VoicePanel from "@/components/voice/VoicePanel";
import VoiceMode from "@/components/chat/VoiceMode";
import AttachmentMenu from "@/components/chat/AttachmentMenu";
import ProcessingBubble from "@/components/chat/ProcessingBubble";
import PasteTextDialog from "@/components/chat/PasteTextDialog";
import LinkDialog from "@/components/chat/LinkDialog";
import StreamingMessage from "@/components/chat/StreamingMessage";
import ReasoningIndicator from "@/components/chat/ReasoningIndicator";

// ─── VXP Status labels ────────────────────────────────────────────────────────

const PHASE_LABELS = {
  idle: null,
  retrieving_memory: "Recuperando memoria...",
  consulting_specialists: "Consultando especialistas...",
  executing_capabilities: "Executando conectores...",
  building_response: "Construindo resposta...",
  responding: "Respondendo...",
};

const STATUS_LABELS = {
  preparing: "Preparando...",
  persisting: "Salvando...",
  reasoning: null,
  routing: null,
  synthesizing: null,
  streaming: null,
  finalizing: "Finalizando...",
  recovering: "Recuperando...",
  error: null,
  idle: null,
};

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const conversation = useConversation();
  const [input, setInput] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [processingItems, setProcessingItems] = useState([]);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");

  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (!conversation.isLoading) {
      setLongWait(false);
      return;
    }
    const timer = setTimeout(() => setLongWait(true), 15_000);
    return () => clearTimeout(timer);
  }, [conversation.isLoading]);


  // VXP Sprint 7.0.1: transcript review state
  const [pendingTranscript, setPendingTranscript] = useState(null);

  // Smart auto-scroll
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  const fileInputRef = useRef(null);
  const fileInputTypeRef = useRef(null);

  // ── Voice — VXP: transcript review before send ────────────────────────────

  const pipeline = useVoiceInteraction({
    onSend: async (text, opts) => {
      setPendingTranscript(text);
      return null;
    },
  });

  const onConfirmTranscript = useCallback(async () => {
    const text = pendingTranscript;
    setPendingTranscript(null);
    if (!text) return;
    setLastUserMessage(text);
    await conversation.send(text);
    const msgs = conversation.messages;
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      pipeline.stopSpeaking?.();
    }
  }, [pendingTranscript, conversation, pipeline]);

  const onCancelTranscript = useCallback(() => {
    setPendingTranscript(null);
    pipeline.cancel?.();
  }, [pipeline]);

  const onEditTranscript = useCallback(() => {
    const text = pendingTranscript;
    setPendingTranscript(null);
    pipeline.cancel?.();
    setInput(text ?? "");
  }, [pendingTranscript, pipeline]);

  // ── Smart auto-scroll ─────────────────────────────────────────────────────

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 80;
      if (scrollTop < lastScrollTopRef.current - 5) {
        userScrolledRef.current = true;
      }
      if (atBottom) {
        userScrolledRef.current = false;
      }
      lastScrollTopRef.current = scrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const streamingContent = conversation.messages.find((m) => m.isStreaming)?.streamingContent;
  useEffect(() => {
    if (userScrolledRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages.length, conversation.isLoading, streamingContent]);

  // ── Send (text) ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || conversation.isLoading) return;
    setLastUserMessage(text);
    setInput("");
    userScrolledRef.current = false;
    await conversation.send(text);
  }, [input, conversation]);

  // ── Attachments ───────────────────────────────────────────────────────────

  const runIngestion = async ({ type, file, url, text }) => {
    const session = conversation.session;
    if (!session) return;
    const itemId = `ingestion-${Date.now()}`;
    const displayName = file?.name || url || "Texto colado";

    setProcessingItems((prev) => [
      ...prev,
      { id: itemId, name: displayName, type, stage: "receiving", error: null },
    ]);

    const savedUserMsg = await base44.entities.Message.create({
      session_id: session.id,
      role: "user",
      content: type === "link" ? `Adicionando link: ${url}` : `Adicionando: ${displayName}`,
      memory_tier: "active",
    });
    conversation.appendMessage(savedUserMsg);

    try {
      const result = await ingestKnowledge({
        type, file, url, text,
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
      const lines = [];
      if (stats.entities > 0) lines.push(`✓ ${stats.entities} entidades`);
      if (stats.keywords > 0) lines.push(`✓ ${stats.keywords} palavras-chave`);
      if (stats.decisions > 0) lines.push(`✓ ${stats.decisions} decisoes`);
      if (stats.tasks > 0) lines.push(`✓ ${stats.tasks} tarefas`);
      if (stats.topics > 0) lines.push(`✓ ${stats.topics} assuntos`);

      const emailLine = result.emailSent
        ? `\n\n📧 Email enviado para \`${result.emailSent.to}\`\nAssunto: _${result.emailSent.subject}_`
        : "";

      const savedAssistantMsg = await base44.entities.Message.create({
        session_id: session.id,
        role: "assistant",
        content: `**${result.displayName}** processado e salvo na memoria.\n\n${lines.join("\n")}${emailLine}`,
        memory_tier: "active",
      });
      conversation.appendMessage(savedAssistantMsg);

      setProcessingItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error("[ChatPage] Falha ao processar anexo:", err);
      const detail = err?.message || err?.error_message || "Motivo desconhecido.";
      setProcessingItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, error: `Erro ao processar: ${detail}` } : item
        )
      );
      setTimeout(() => {
        setProcessingItems((prev) => prev.filter((item) => item.id !== itemId));
      }, 8000);
    }
  };

  const handleAttachmentSelect = (type) => {
    setAttachmentMenuOpen(false);
    if (type === "text") { setPasteDialogOpen(true); return; }
    if (type === "link") { setLinkDialogOpen(true); return; }
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

  // ── Thinking/reasoning label ─────────────────────────────────────────────

  const reasoningLabel =
    PHASE_LABELS[conversation.reasoningPhase] ??
    STATUS_LABELS[conversation.status] ??
    null;

  const showReasoningIndicator =
    conversation.isLoading && !["streaming"].includes(conversation.status);

  // ── Watch Engine: polling para notificações proativas ────────────────────
  const shownActionIdsRef = useRef(new Set());

  useEffect(() => {
    if (!conversation.isInitialized) return;

    const shownActionIds = shownActionIdsRef.current;

    const pollWatchActions = async () => {
      try {
        const sessionId = conversation.session?.id;
        if (!sessionId) return;

        // Busca apenas ações pendentes — dispatched nunca são re-exibidos
        const pendingActions = await base44.entities.PendingWatchAction.filter({ status: 'pending' });

        // Apenas pendentes — nunca re-exibir dispatched (evita duplicação após reload)
        const actionsToShow = pendingActions;

        if (!actionsToShow.length) return;

        for (const action of actionsToShow) {
          if (shownActionIds.has(action.id)) continue;
          shownActionIds.add(action.id);

          // Marcar como dispatched imediatamente para evitar re-exibição
          await base44.entities.PendingWatchAction.update(action.id, {
            status: 'dispatched',
            dispatched_at: new Date().toISOString(),
          });

          let payload = {};
          try { payload = JSON.parse(action.payload || '{}'); } catch {}

          const triggerTime = payload.timestamp
            ? new Date(payload.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

          const content = `⏰ **${payload.watchName || 'Aviso'}**\n\n${payload.message || 'Um Watch disparou!'}\n\n_Horário do disparo: ${triggerTime}_`;

          const savedMsg = await base44.entities.Message.create({
            session_id: sessionId,
            role: 'assistant',
            content,
            memory_tier: 'active',
          });
          conversation.appendMessage(savedMsg);
        }
      } catch { /* silencioso */ }
    };

    // Poll a cada 15s + imediato ao voltar para a aba
    const initialDelay = setTimeout(pollWatchActions, 4000);
    const interval = setInterval(pollWatchActions, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') pollWatchActions(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(initialDelay); clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [conversation.isInitialized, conversation.session?.id]);

  // ── Loading guard ────────────────────────────────────────────────────────

  if (!conversation.isInitialized) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] lg:h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Session summary toggle */}
      {conversation.session?.summary && (
        <div className="border-b border-zinc-100 bg-white">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center gap-2 px-4 lg:px-6 py-2.5 text-left hover:bg-zinc-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-xs font-medium text-zinc-500 truncate">
              Memoria ativa — {conversation.messages.length} mensagens
            </span>
            {showSummary
              ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400 ml-auto shrink-0" />
              : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-auto shrink-0" />}
          </button>
          {showSummary && (
            <div className="px-4 lg:px-6 pb-4">
              <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">Resumo</p>
                <p className="text-sm text-zinc-600 whitespace-pre-wrap">{conversation.session.summary}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages — smart auto-scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6"
      >
        <div className="max-w-3xl mx-auto space-y-3 lg:space-y-4">

          {conversation.messages.length === 0 && !conversation.isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-200">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-800 font-heading">Sua memoria esta pronta</h3>
              <p className="text-sm text-zinc-400 mt-1 max-w-md">
                Converse naturalmente. O MemoryOS organiza, relaciona e preserva todo o conhecimento automaticamente.
              </p>
            </div>
          )}

          {conversation.messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
              </div>
            </div>
          ))}

          {/* Thinking indicator — VXP progressive states */}
          {showReasoningIndicator && (
            <div className="flex justify-start">
              <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <ReasoningIndicator label={reasoningLabel} />
                {longWait && (
                  <p className="text-xs text-zinc-400 mt-1.5">
                    Isso está demorando um pouco mais que o normal — ainda processando, não travou.
                  </p>
                )}
              </div>
            </div>
          )}

          {processingItems.map((item) => (
            <ProcessingBubble key={item.id} item={item} />
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Voice speaking status bar */}
      {(pipeline.isProcessing || pipeline.isSpeaking) && (
        <div className={`border-t px-4 lg:px-6 py-2 flex items-center gap-2 ${
          pipeline.isSpeaking ? "bg-emerald-50/50 border-zinc-100" : "bg-violet-50 border-violet-100"
        }`}>
          {pipeline.isSpeaking && (
            <>
              <Volume2 className="w-4 h-4 text-emerald-500 animate-pulse shrink-0" />
              <span className="text-xs text-emerald-600 font-medium">Respondendo...</span>
              <button type="button" onClick={pipeline.stopSpeaking} className="ml-auto text-xs text-emerald-600 hover:text-emerald-700 font-medium">Parar</button>
            </>
          )}
        </div>
      )}

      {/* Error bar with retry */}
      {conversation.error && (
        <div className="border-t border-red-100 bg-red-50 px-4 lg:px-6 py-2 flex items-center gap-3">
          <span className="text-xs text-red-600 flex-1">{conversation.error}</span>
          {lastUserMessage && (
            <button
              type="button"
              onClick={() => conversation.retry(lastUserMessage)}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-200 bg-white px-3 sm:px-4 lg:px-6 py-3 lg:py-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setContinuousMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition"
            >
              <Radio className="w-3.5 h-3.5" />
              Conversa Continua
            </button>
          </div>

          <div className="flex items-end gap-2">
            {/* Attachment button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                disabled={conversation.isLoading}
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

            {/* Text input */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Converse com sua memoria..."
              rows={1}
              className={`flex-1 resize-none px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white max-h-32 ${
                pipeline.isListening ? "border-red-300 bg-red-50/30" : "border-zinc-200"
              }`}
              readOnly={pipeline.isListening}
              disabled={conversation.isLoading}
            />

            {/* Stop button while loading */}
            {conversation.isLoading && (
              <button
                type="button"
                onClick={() => conversation.cancel()}
                className="p-3 rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 transition-all shrink-0"
                title="Parar"
              >
                <Square className="w-4 h-4" />
              </button>
            )}

            {/* VXP Voice Panel — with transcript review + permission prop */}
            <VoicePanel
              phase={pipeline.phase}
              waveform={pipeline.waveform}
              elapsedMs={pipeline.elapsedMs}
              interimText={pipeline.interimText}
              error={pipeline.error}
              isSpeaking={pipeline.isSpeaking}
              isSupported={pipeline.isSupported}
              isLoading={conversation.isLoading}
              permission={pipeline.permission}
              onStart={pipeline.startCapture}
              onStop={pipeline.stopCapture}
              onCancel={pipeline.cancel}
              stopSpeaking={pipeline.stopSpeaking}
              pendingTranscript={pendingTranscript}
              onConfirmTranscript={onConfirmTranscript}
              onCancelTranscript={onCancelTranscript}
              onEditTranscript={onEditTranscript}
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={conversation.isLoading || !input.trim()}
              className="p-4 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-30 transition-all shadow-sm"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      <PasteTextDialog
        open={pasteDialogOpen}
        onOpenChange={setPasteDialogOpen}
        onSubmit={(text) => runIngestion({ type: "text", text })}
      />

      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onSubmit={(url) => runIngestion({ type: "link", url })}
      />

      {continuousMode && (
        <VoiceMode
          onSendAndReceive={async (text) => {
            await conversation.send(text);
            const msgs = conversation.messages;
            const last = msgs[msgs.length - 1];
            return last?.role === "assistant" ? last.content : null;
          }}
          onClose={() => {
            setContinuousMode(false);
            pipeline.stopSpeaking?.();
          }}
        />
      )}
    </div>
  );
}