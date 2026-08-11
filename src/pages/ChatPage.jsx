/**
 * ChatPage.jsx — Conversation Experience Platform consumer
 * Sprint 7.0.1 (VXP): Smart auto-scroll, transcript review, VXP status states.
 * Architecture: render only. All logic in useConversation() + useVoiceInteraction().
 * rev: BRT-time-fix-r2 (forca recompile do chunk para puxar formatTime novo)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Brain, Sparkles, ChevronDown, ChevronUp,
  Volume2, Paperclip, RotateCcw, Square, Clock, User, FileText, ExternalLink,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useConversation } from "@/lib/conversation-platform/useConversation";
import { useVoiceInteraction } from "@/lib/voice-platform/useVoiceInteraction";
import { ingestKnowledge, ACCEPT_MAP } from "@/lib/knowledgeIngestionPipeline";
import { base44 } from "@/api/base44Client";
import { persistMessage } from "@/lib/conversation-platform/ConversationPersistence";
import VoicePanel from "@/components/voice/VoicePanel";
import TimelineDrawer from "@/components/timeline/TimelineDrawer";

import AttachmentMenu from "@/components/chat/AttachmentMenu";
import ProcessingBubble from "@/components/chat/ProcessingBubble";
import PasteTextDialog from "@/components/chat/PasteTextDialog";
import LinkDialog from "@/components/chat/LinkDialog";
import StreamingMessage from "@/components/chat/StreamingMessage";
import ReasoningIndicator from "@/components/chat/ReasoningIndicator";
import CopyButton from "@/components/chat/CopyButton";
import RegenerateButton from "@/components/chat/RegenerateButton";
import SuggestedPrompts from "@/components/chat/SuggestedPrompts";
import SessionSwitcher from "@/components/chat/SessionSwitcher";
import ScrollToBottomButton from "@/components/chat/ScrollToBottomButton";
import DateSeparator from "@/components/chat/DateSeparator";
import PdfToolsButton from "@/components/projects/PdfToolsButton";
import { formatTime } from "@/components/timeline/formatTime";
import { formatDateLabel, dayKey } from "@/components/timeline/formatDateLabel";

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

export default function ChatPage({ projectId } = {}) {
  const conversation = useConversation({ projectId });
  const [input, setInput] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [processingItems, setProcessingItems] = useState([]);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [sessionPdfs, setSessionPdfs] = useState([]);
  const [pdfToast, setPdfToast] = useState(null);
  const notifyPdf = useCallback((msg, type = "info") => {
    setPdfToast({ msg, type });
    setTimeout(() => setPdfToast(null), 4000);
  }, []);

  const [longWait, setLongWait] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
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

  // ── Session PDFs (para ferramentas Stirling-PDF inline no chat) ──────────
  const refreshSessionPdfs = useCallback(async (sessionId) => {
    if (!sessionId) { setSessionPdfs([]); return; }
    try {
      const docs = await base44.entities.Document.filter({ session_id: sessionId, file_type: "pdf" }, "-created_date", 50);
      setSessionPdfs(docs.filter((d) => d.file_url));
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    if (!conversation.isInitialized) return;
    refreshSessionPdfs(conversation.session?.id);
  }, [conversation.isInitialized, conversation.session?.id, refreshSessionPdfs]);

  // Smart auto-scroll
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  // Rastreia se o usuario esta perto do fundo (seguindo o texto). Inverso
  // do userScrolledRef anterior — baseado na posicao real do scroll, nao em
  // deteccao de direcao de evento (que tinha race condition e snap-back).
  const isNearBottomRef = useRef(true);

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
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < 20) isNearBottomRef.current = true;
      // FIX (scroll via barra/teclado): antes so desativava o auto-scroll no
      // wheel/touch up. Arrastar a barra de rolagem ou usar PageUp/Setas so
      // disparava handleScroll — isNearBottomRef ficava true e o proximo
      // token puxava de volta pro fundo. Agora desativa tambem aqui quando o
      // usuario se afasta claramente do fundo (>80px). O auto-scroll
      // programatico poe scrollTop no fundo (distance=0), nunca ativa isso;
      // crescimento de conteudo nao dispara scroll. So acao manual deliberada
      // desativa. Threshold alto (80) evita flutuacao de reflow.
      else if (distanceFromBottom > 80) isNearBottomRef.current = false;
      setShowScrollToBottom(distanceFromBottom > 120);
    };

    // Pausa imediata ANTES do scroll acontecer (previne race com o effect de
    // auto-scroll que roda na mesma frame). handleScroll corrige depois se o
    // usuario ainda estiver perto do fundo.
    const handleWheel = (e) => {
      if (e.deltaY < 0) isNearBottomRef.current = false;
    };
    let lastTouchY = null;
    const handleTouchStart = (e) => { lastTouchY = e.touches?.[0]?.clientY ?? null; };
    const handleTouchMove = (e) => {
      const y = e.touches?.[0]?.clientY;
      if (lastTouchY != null && y != null && y > lastTouchY) isNearBottomRef.current = false;
      lastTouchY = y;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  const streamingContent = conversation.messages.find((m) => m.isStreaming)?.streamingContent;
  // Auto-scroll: so segue se o usuario estiver perto do fundo. Se rolou
  // pra cima (isNearBottomRef=false), NAO segue — fica onde esta pra ler.
  // Reativa automaticamente quando rolar de volta ao fundo, ou ao enviar
  // nova mensagem / clicar no botao "ir pro fundo".
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [conversation.messages.length, conversation.isLoading, streamingContent]);

  // ── Send (text) ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || conversation.isLoading) return;
    setLastUserMessage(text);
    setInput("");
    isNearBottomRef.current = true;
    await conversation.send(text);
  }, [input, conversation]);

  // ── Regenerate last assistant response ────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    const lastUser = [...conversation.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || conversation.isLoading) return;
    setLastUserMessage(lastUser.content);
    await conversation.retry(lastUser.content);
  }, [conversation]);

  // ── Pick a suggested prompt ───────────────────────────────────────────────
  const handlePickPrompt = useCallback(async (prompt) => {
    if (conversation.isLoading) return;
    setLastUserMessage(prompt);
    setInput("");
    isNearBottomRef.current = true;
    await conversation.send(prompt);
  }, [conversation]);

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

    const savedUserMsg = await persistMessage({
      sessionId: session.id,
      role: "user",
      content: type === "link" ? `Adicionando link: ${url}` : `Adicionando: ${displayName}`,
    });
    conversation.appendMessage(savedUserMsg);

    try {
      const result = await ingestKnowledge({
        type, file, url, text,
        name: displayName,
        sessionId: session.id,
        projectId: session.project_id,
        workspaceId: session.workspace_id,
        scope: session.scope,
        onStage: (stage) => {
          setProcessingItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, stage } : item))
          );
        },
      });

      // Fase 3 — Feedback via NotificationHub (toast) + SystemEvent persistido pelo pipeline.
      // O chat fica limpo: nenhuma Message de confirmação é injetada aqui.
      setProcessingItems((prev) => prev.filter((item) => item.id !== itemId));
      if (result?.document?.file_type === "pdf" && result.document.file_url) {
        setSessionPdfs((prev) => [result.document, ...prev.filter((p) => p.id !== result.document.id)]);
      }
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

          const savedMsg = await persistMessage({
            sessionId,
            role: 'assistant',
            content,
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
      {/* Session header — switcher + summary toggle */}
      <div className="border-b border-zinc-100 bg-white">
        <div className="w-full flex items-center gap-2 px-4 lg:px-6 py-2.5">
          <SessionSwitcher
            currentSession={conversation.session}
            onNew={() => conversation.newSession(undefined, projectId)}
            onSwitch={(id) => conversation.switchSession(id)}
            onRename={(id, title) => conversation.renameSession(id, title)}
            onArchive={async () => {
              await conversation.archiveCurrentSession();
              await conversation.newSession(undefined, projectId);
            }}
            disabled={conversation.isLoading}
          />
          {conversation.session?.summary && (
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex items-center gap-2 px-2 py-1.5 text-left hover:bg-zinc-50 rounded-lg transition ml-auto"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              <span className="text-xs font-medium text-zinc-500 truncate">
                Resumo — {conversation.messages.length} mensagens
              </span>
              {showSummary
                ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                : <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
            </button>
          )}
        </div>
        {showSummary && conversation.session?.summary && (
          <div className="px-4 lg:px-6 pb-4">
            <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100">
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">Resumo</p>
              <p className="text-sm text-zinc-600 whitespace-pre-wrap">{conversation.session.summary}</p>
            </div>
          </div>
        )}
      </div>

      {/* Messages — smart auto-scroll container */}
      <div className="relative flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6"
        style={{ overflowAnchor: "none" }}
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
              <SuggestedPrompts onPick={handlePickPrompt} />
            </div>
          )}

          {(() => {
            // FIX: PDFs agora sao renderizados INLINE em ordem cronologica
            // (por created_date), no ponto da conversa onde foram adicionados
            // — antes ficavam todos acumulados num bloco fixo no fim do chat,
            // com qualquer texto novo aparecendo acima deles.
            // FIX (ordenação invertida): antes concatenava mensagens + PDFs e
            // ordenava TUDO por created_date num sort global. Se os timestamps
            // do servidor e cliente diferem (ou sao iguais no mesmo segundo),
            // esse sort inverte a ordem inteira do chat. Agora as mensagens
            // seguem a ordem do array (que ja e cronologica: loadMessages
            // ascendente + appendMessage no fim) e os PDFs sao inseridos pela
            // sua posicao cronologica (created_date) sem reordenar as mensagens.
            const _pdfsSorted = [...sessionPdfs].sort((a, b) =>
              new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime()
            );
            const timeline = [];
            let _pi = 0;
            for (let _mi = 0; _mi < conversation.messages.length; _mi++) {
              const _msg = conversation.messages[_mi];
              const _msgTime = _msg.created_date ? new Date(_msg.created_date).getTime() : Infinity;
              while (_pi < _pdfsSorted.length) {
                const _pdf = _pdfsSorted[_pi];
                const _pdfTime = _pdf.created_date ? new Date(_pdf.created_date).getTime() : Infinity;
                if (_pdfTime <= _msgTime) {
                  timeline.push({ kind: "pdf", data: _pdf, sortKey: _pdf.created_date });
                  _pi++;
                } else break;
              }
              timeline.push({ kind: "message", data: _msg, sortKey: _msg.created_date });
            }
            while (_pi < _pdfsSorted.length) {
              timeline.push({ kind: "pdf", data: _pdfsSorted[_pi], sortKey: _pdfsSorted[_pi].created_date });
              _pi++;
            }

            return timeline.map((item, index) => {
              const prev = timeline[index - 1];
              const showDateSep = !prev || dayKey(prev.sortKey) !== dayKey(item.sortKey);

              if (item.kind === "pdf") {
                const pdf = item.data;
                return (
                  <React.Fragment key={`pdf-${pdf.id}`}>
                    {showDateSep && item.sortKey && (
                      <DateSeparator date={formatDateLabel(item.sortKey)} />
                    )}
                    <div className="flex gap-3 group">
                      <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-red-50">
                        <FileText className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 bg-white border border-zinc-200/80 rounded-2xl px-4 py-2.5 shadow-sm">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-700 truncate">{pdf.name}</p>
                            {pdf.summary && (
                              <p className="text-xs text-zinc-400 truncate">{pdf.summary}</p>
                            )}
                          </div>
                          <a
                            href={pdf.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-zinc-100 transition text-zinc-400 hover:text-zinc-600 shrink-0"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <PdfToolsButton
                            doc={pdf}
                            allPdfs={sessionPdfs}
                            onNotification={notifyPdf}
                          />
                        </div>
                        {pdf.created_date && (
                          <div className="text-[11px] mt-1.5 text-zinc-500">
                            {formatTime(pdf.created_date)}
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              const msg = item.data;
              const msgIndex = conversation.messages.indexOf(msg);
              const isLastMessage = msgIndex === conversation.messages.length - 1;
              return (
              <React.Fragment key={msg.id}>
                {showDateSep && msg.created_date && (
                  <DateSeparator date={formatDateLabel(msg.created_date)} />
                )}
              <div className="flex gap-3 group">
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${
                  msg.role === "user" ? "bg-zinc-900" : "bg-gradient-to-br from-violet-500 to-indigo-600"
                }`}>
                  {msg.role === "user"
                    ? <User className="w-4 h-4 text-white" />
                    : <Brain className="w-4 h-4 text-white" />}
                </div>
                <div className={`flex-1 min-w-0 rounded-2xl px-4 py-3 text-lg leading-relaxed ${
                  msg.role === "user"
                    ? "bg-violet-100/60 border border-violet-200/70 text-zinc-700"
                    : "bg-white border border-zinc-200/80 text-zinc-700 shadow-sm"
                }`}>
                  {msg.role === "assistant" ? (
                    msg.isStreaming ? (
                      <StreamingMessage content={msg.streamingContent ?? ""} />
                    ) : (
                      <div className="prose prose-sm prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown
                          components={{
                            // Fix (2026-08-10): sem target="_blank", o link tentava
                            // navegar dentro do MESMO frame onde o MemoryOS esta
                            // rodando (ex: iframe de preview do Base44). Sites como
                            // o Mercado Livre detectam estar sendo carregados dentro
                            // de outro site e redirecionam pra uma pagina generica
                            // em vez do produto. Abrir sempre em aba nova evita isso
                            // por completo, alem de ser a pratica padrao segura pra
                            // links externos.
                            a: ({ node, ...props }) => (
                              <a {...props} target="_blank" rel="noopener noreferrer" />
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.created_date && (
                    <div className="text-[11px] mt-1.5 text-zinc-500">
                      {formatTime(msg.created_date)}
                    </div>
                  )}
                  {msg.role === "assistant" && !msg.isStreaming && (
                    <div className="flex items-center gap-1 mt-2 -mb-1 opacity-0 group-hover:opacity-100 transition">
                      <CopyButton text={msg.content} />
                      {isLastMessage && (
                        <RegenerateButton
                          onRegenerate={handleRegenerate}
                          disabled={conversation.isLoading}
                        />
                      )}
                    </div>
                  )}
                  </div>
                  </div>
              </React.Fragment>
              );
            });
          })()}

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

        {showScrollToBottom && (
          <ScrollToBottomButton
            onClick={() => {
              isNearBottomRef.current = true;
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              setShowScrollToBottom(false);
            }}
          />
        )}
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
              onClick={() => setTimelineOpen(true)}
              disabled={!conversation.session?.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition disabled:opacity-30"
            >
              <Clock className="w-3.5 h-3.5" />
              Linha do Tempo
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
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 280) + "px";
                }
              }}
              className={`flex-1 resize-none px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white max-h-72 overflow-y-auto ${
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

      <TimelineDrawer
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        sessionId={conversation.session?.id}
      />

      {pdfToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            pdfToast.type === "success"
              ? "bg-emerald-600 text-white"
              : pdfToast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 text-white"
          }`}
        >
          {pdfToast.msg}
        </div>
      )}
    </div>
  );
}