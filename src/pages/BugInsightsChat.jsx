import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  Bug, Loader2, Send, Sparkles, RefreshCw, Lightbulb,
  TrendingDown, Wrench, ShieldAlert, Brain, ChevronDown, ChevronRight,
  X, RotateCcw,
} from "lucide-react";
import CorrectionBriefModal from "@/components/bug-hunter/CorrectionBriefModal";
import { getBugDisplayInfo } from "@/components/bug-hunter/bugDisplayLabel";

const SUGGESTED_QUESTIONS = [
  "Quais padroes recorrentes voce ve nos bugs encontrados?",
  "Como posso melhorar a continuidade de memoria nas respostas do chat?",
  "Os bugs de auth indicam algum problema estrutural?",
  "Priorize os bugs por impacto e sugira uma ordem de correcao.",
  "Que mudancas de comportamento do MemoryOS reduziriam esses bugs?",
];

export default function BugInsightsChat() {
  const [findings, setFindings] = useState([]);
  const [loadingFindings, setLoadingFindings] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBugsPanel, setShowBugsPanel] = useState(true);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludingId, setExcludingId] = useState(null);
  const scrollRef = useRef(null);

  // Bugs visiveis = open/confirmed. Excluidos = false_positive (nao sao bug).
  const visibleFindings = findings.filter((f) => f.status === "open" || f.status === "confirmed");
  const excludedFindings = findings.filter((f) => f.status === "false_positive");

  // Exclui um bug (nao e bug real) — marca false_positive, some do painel.
  // So volta se o Bug Hunter detectar o mesmo bug de novo (novo registro open).
  const excludeBug = async (id, e) => {
    e?.stopPropagation();
    setExcludingId(id);
    try {
      await base44.entities.BugFinding.update(id, { status: "false_positive" });
      setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, status: "false_positive" } : f)));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch (err) {
      // silent
    } finally {
      setExcludingId(null);
    }
  };

  // Restaura um bug excluido — volta para open e reaparece no painel.
  const restoreBug = async (id, e) => {
    e?.stopPropagation();
    try {
      await base44.entities.BugFinding.update(id, { status: "open" });
      setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, status: "open" } : f)));
    } catch (err) {
      // silent
    }
  };

  // Load findings
  const loadFindings = useCallback(async () => {
    setLoadingFindings(true);
    try {
      const recs = await base44.entities.BugFinding.list("-created_date", 30);
      setFindings(recs || []);
 // Nenhum bug selecionado por padrao — o usuario escolhe quais analisar.
      setSelectedIds(new Set());
    } catch (e) {
      // silent
    } finally {
      setLoadingFindings(false);
    }
  }, []);

  useEffect(() => { loadFindings(); }, [loadFindings]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const toggleBug = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const buildBugsContext = () => {
    const selected = findings.filter((f) => selectedIds.has(f.id));
    if (selected.length === 0) return "(Nenhum bug selecionado para analise.)";
    return selected.map((f, i) => {
      return [
        `BUG ${i + 1}:`,
        `  Titulo: ${f.title}`,
        `  Categoria: ${f.category}`,
        `  Severidade: ${f.severity}`,
        `  Status: ${f.status}`,
        f.description ? `  Descricao: ${f.description}` : "",
        f.expected ? `  Esperado: ${f.expected}` : "",
        f.actual ? `  Real: ${f.actual}` : "",
        f.steps_to_reproduce ? `  Passos: ${truncate(f.steps_to_reproduce, 300)}` : "",
        f.console_errors ? `  Console: ${truncate(f.console_errors, 200)}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");
  };

  const send = async (text) => {
    const question = (text || input).trim();
    if (!question || sending) return;

    const userMsg = { role: "user", content: question, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const bugsCtx = buildBugsContext();
      const prompt = [
        "Voce e o Advisor do Bug Hunter — um analista de qualidade sênior do MemoryOS,",
        "um sistema de memoria permanente e inteligente que conversa com o usuario sobre seu conhecimento pessoal.",
        "",
        "Sua funcao: analisar os bugs encontrados pelo Bug Hunter (testes autonomos no app publicado)",
        "e ORIENTAR o dono do MemoryOS sobre como melhorar o comportamento do sistema.",
        "",
        "Seja direto, pratico e aprofundado. Conecte os bugs a causas-raiz de comportamento/arquitetura.",
        "Responda em portugues (pt-BR).",
        "",
        "=== BUGS ENCONTRADOS (contexto para analise) ===",
        bugsCtx,
        "=== FIM DOS BUGS ===",
        "",
        "HISTORICO DA CONVERSA:",
        ...messages.slice(-6).map((m) => `${m.role}: ${m.content}`),
        "",
        `PERGUNTA DO DONO DO MEMORYOS: ${question}`,
        "",
        "Responda com orientacoes acao-orientadas: o que mudar no comportamento do MemoryOS,",
        "que padroes evitar, prioridades de correcao, e melhorias estruturais se aplicavel.",
      ].join("\n");

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
      });

      const aiMsg = { role: "assistant", content: typeof res === "string" ? res : JSON.stringify(res), ts: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Erro ao gerar analise: " + e.message, ts: Date.now(), error: true }]);
    } finally {
      setSending(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/40 px-5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
          <Brain className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-base font-semibold">Bug Insights Chat</h1>
          <p className="text-[11px] text-zinc-500">Analise os bugs e oriente melhorias no comportamento do MemoryOS</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {selectedCount} bug{selectedCount !== 1 ? "s" : ""} no contexto
          </span>
          <button
            onClick={() => setShowBugsPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
          >
            {showBugsPanel ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {showBugsPanel ? "Ocultar bugs" : "Mostrar bugs"}
          </button>
          <button
            onClick={loadFindings}
            disabled={loadingFindings}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition disabled:opacity-40"
          >
            {loadingFindings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </button>
          <button
            onClick={() => setShowBriefModal(true)}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-40"
            title={selectedCount === 0 ? "Selecione bugs para gerar o brief" : "Gera brief de correcao unificado (bugs + OIE)"}
          >
            <Wrench className="w-3.5 h-3.5" />
            Brief de Correcao
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Bugs panel */}
        {showBugsPanel && (
          <aside className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-900/30 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Bugs (selecione p/ contexto)</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[10px] text-zinc-600 hover:text-zinc-400"
              >
                limpar
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loadingFindings ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                </div>
              ) : visibleFindings.length === 0 ? (
                <p className="text-xs text-zinc-600 italic text-center py-6">Nenhum bug encontrado.</p>
              ) : (
                visibleFindings.map((f, idx) => {
                  const selected = selectedIds.has(f.id);
                  const info = getBugDisplayInfo(f);
                  const relTime = formatRelativeTime(f.created_date);
                  return (
                    <div
                      key={f.id}
                      onClick={() => toggleBug(f.id)}
                      className={`w-full text-left p-2.5 pr-8 rounded-lg border transition cursor-pointer relative group ${
                        selected
                          ? "bg-violet-500/10 border-violet-500/30"
                          : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <button
                        onClick={(e) => excludeBug(f.id, e)}
                        disabled={excludingId === f.id}
                        className="absolute top-1.5 right-1.5 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition opacity-30 group-hover:opacity-100 disabled:opacity-40"
                        title="Excluir (nao e bug)"
                      >
                        {excludingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      </button>
                      <div className="flex items-center gap-2 mb-1.5">
                        <SeverityDot severity={f.severity} />
                        {info.serviceLabel && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${info.serviceColor}`}>
                            {info.serviceLabel}
                          </span>
                        )}
                        <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${statusColor(f.status)}`}>{f.status}</span>
                        <span className="text-[9px] text-zinc-600 font-mono ml-auto">{info.categoryLabel}</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-snug line-clamp-2">{info.enhancedTitle}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[9px] font-mono text-zinc-600">
                          #{visibleFindings.length - idx}
                        </span>
                        <span className="text-[9px] text-zinc-600">·</span>
                        <span className="text-[9px] text-zinc-600" title={f.created_date ? new Date(f.created_date).toLocaleString('pt-BR') : ''}>
                          {relTime}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Excluidos (falsos positivos) — colapsados por padrao */}
            {excludedFindings.length > 0 && (
              <div className="shrink-0 border-t border-zinc-800 px-3 py-2">
                <button
                  onClick={() => setShowExcluded((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition"
                >
                  {showExcluded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {showExcluded ? "Ocultar excluidos" : `Ver excluidos (${excludedFindings.length})`}
                </button>
                {showExcluded && (
                  <div className="mt-2 space-y-1.5">
                    {excludedFindings.map((f) => {
                      const info = getBugDisplayInfo(f);
                      return (
                        <div key={f.id} className="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800 border-dashed opacity-60">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityDot severity={f.severity} />
                            <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-blue-500/15 text-blue-400">falso positivo</span>
                            <button
                              onClick={(e) => restoreBug(f.id, e)}
                              className="ml-auto text-[10px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition"
                              title="Restaurar para open"
                            >
                              <RotateCcw className="w-3 h-3" /> restaurar
                            </button>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">{info.enhancedTitle}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Chat */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                  <Lightbulb className="w-7 h-7 text-violet-400" />
                </div>
                <h2 className="text-lg font-semibold text-zinc-200 mb-1">Analise seus bugs e melhore o MemoryOS</h2>
                <p className="text-sm text-zinc-500 mb-6 max-w-md">
                  Selecione os bugs a esquerda (ou use os ja selecionados) e pergunte como eles revelam problemas
                  de comportamento do MemoryOS. A IA conecta os bugs a causas-raiz e sugere correcoes.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => send(q)}
                      disabled={sending}
                      className="px-3 py-2 rounded-lg text-xs bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700 text-zinc-300 transition disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => <MessageBubble key={i} message={m} />)
            )}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                <span>Analisando bugs...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <div className="flex gap-2 max-w-4xl mx-auto">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Pergunte como melhorar o MemoryOS com base nos bugs..."
                disabled={sending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={sending || !input.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 transition"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </div>
          </div>
        </main>
      </div>

      {showBriefModal && (
        <CorrectionBriefModal
          findings={findings.filter((f) => selectedIds.has(f.id))}
          onClose={() => setShowBriefModal(false)}
        />
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} max-w-4xl mx-auto`}>
      <div
        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-violet-500 text-white"
            : message.error
              ? "bg-red-500/10 border border-red-500/20 text-red-300"
              : "bg-zinc-800/80 border border-zinc-700 text-zinc-200"
        } max-w-[85%]`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <FormattedContent text={message.content} />
        )}
      </div>
    </div>
  );
}

function FormattedContent({ text }) {
  // Simple markdown-ish: **bold**, bullet lines starting with - or *, numbered lines
  const lines = String(text).split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        // bullet
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-violet-400 mt-0.5">·</span>
              <span className="flex-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^[-*]\s+/, "")) }} />
            </div>
          );
        }
        // numbered
        const numMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-violet-400 font-mono text-xs mt-0.5">{numMatch[1]}.</span>
              <span className="flex-1" dangerouslySetInnerHTML={{ __html: inlineFormat(numMatch[2]) }} />
            </div>
          );
        }
        // heading-ish (short line ending without punctuation, followed by content)
        if (trimmed.length < 80 && !trimmed.endsWith(".") && !trimmed.endsWith(":") === false) {
          return <p key={i} className="font-medium text-zinc-100" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />;
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />;
      })}
    </div>
  );
}

function inlineFormat(text) {
  // Escape HTML first
  let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // bold **text**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-50 font-semibold">$1</strong>');
  // inline code `code`
  s = s.replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-zinc-900/80 text-violet-300 font-mono text-[11px]">$1</code>');
  return s;
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function SeverityDot({ severity }) {
  const map = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-500", low: "bg-blue-500", info: "bg-zinc-500" };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[severity] || map.medium}`} />;
}

function statusColor(status) {
  const map = {
    open: "bg-amber-500/15 text-amber-400",
    confirmed: "bg-red-500/15 text-red-400",
    fixed: "bg-emerald-500/15 text-emerald-400",
    false_positive: "bg-blue-500/15 text-blue-400",
    wontfix: "bg-zinc-500/15 text-zinc-400",
  };
  return map[status] || map.open;
}