/**
 * GmailConnectorCard — Implementation 009
 * UI para interagir com o GmailConnector.
 */

import { useState } from "react";
import {
  Mail, Search, Tag, FileText, Loader2, Play,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { listMessages, searchMessages, listLabels } from "@/lib/gmail/GmailConnector";
import { runGmailConnectorTests } from "@/lib/gmail/gmailConnectorTests";

// ── Message row ───────────────────────────────────────────────────────────────

function MessageRow({ msg }) {
  const [open, setOpen] = useState(false);
  const date = msg.internalDate
    ? new Date(Number(msg.internalDate)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="border border-zinc-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-zinc-50 transition"
      >
        <Mail className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 truncate">{msg.subject}</p>
          <p className="text-xs text-zinc-500 truncate">{msg.from}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {date && <span className="text-xs text-zinc-400">{date}</span>}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-100 space-y-1 text-xs text-zinc-600">
          <p><span className="font-medium">Para:</span> {msg.to || "—"}</p>
          <p><span className="font-medium">Snippet:</span> {msg.snippet || "—"}</p>
          <p><span className="font-medium">Labels:</span> {msg.labelIds?.join(", ") || "—"}</p>
          <p className="font-mono text-zinc-400">ID: {msg.id}</p>
        </div>
      )}
    </div>
  );
}

// ── Test panel ────────────────────────────────────────────────────────────────

function GmailTestPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGmailConnectorTests();
      setResults(r);
    } catch (e) {
      setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden mt-4">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <span className="text-xs font-semibold text-zinc-600">Testes — Implementation 009 (GmailConnector)</span>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Testando..." : "Rodar Testes"}
        </button>
      </div>
      {results && (
        <div className="p-4 space-y-3">
          <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${results.verdict === "PASS" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {results.verdict === "PASS" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>
          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>{suite.passed}/{suite.total}</span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                    <span className="flex-1 font-mono">{r.name}</span>
                    {!r.passed && <span className="text-red-400 truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                    <span className="text-zinc-400 shrink-0">{r.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function GmailConnectorCard() {
  const [tab, setTab]           = useState("inbox");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [messages, setMessages] = useState(null);
  const [labels, setLabels]     = useState(null);
  const [query, setQuery]       = useState("");

  const handleListMessages = async () => {
    setLoading(true); setError(null); setMessages(null);
    const r = await listMessages({ maxResults: 10 });
    if (r.ok) setMessages(r.data.messages);
    else setError(r.error);
    setLoading(false);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(null); setMessages(null);
    const r = await searchMessages(query.trim(), 10);
    if (r.ok) setMessages(r.data.messages);
    else setError(r.error);
    setLoading(false);
  };

  const handleListLabels = async () => {
    setLoading(true); setError(null); setLabels(null);
    const r = await listLabels();
    if (r.ok) setLabels(r.data.labels);
    else setError(r.error);
    setLoading(false);
  };

  const tabs = [
    { id: "inbox",  label: "Caixa de entrada", icon: Mail },
    { id: "search", label: "Pesquisa",          icon: Search },
    { id: "labels", label: "Labels",            icon: Tag },
  ];

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Gmail</h3>
            <span className="text-xs text-zinc-400">Implementation 009 — Somente leitura</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-zinc-100 pb-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setMessages(null); setLabels(null); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === id ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Inbox tab */}
        {tab === "inbox" && (
          <div className="space-y-3">
            <button
              onClick={handleListMessages}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Carregar ultimos 10 e-mails
            </button>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            {messages !== null && messages.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">Caixa de entrada vazia.</p>
            )}
            {messages?.length > 0 && (
              <div className="space-y-2">
                {messages.map(m => <MessageRow key={m.id} msg={m} />)}
              </div>
            )}
          </div>
        )}

        {/* Search tab */}
        {tab === "search" && (
          <div className="space-y-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="from:amazon, subject:ANVISA, is:important..."
                className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar
              </button>
            </form>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            {messages !== null && messages.length === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">Nenhum resultado encontrado.</p>
            )}
            {messages?.length > 0 && (
              <div className="space-y-2">
                {messages.map(m => <MessageRow key={m.id} msg={m} />)}
              </div>
            )}
          </div>
        )}

        {/* Labels tab */}
        {tab === "labels" && (
          <div className="space-y-3">
            <button
              onClick={handleListLabels}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
              Listar labels
            </button>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            {labels?.length > 0 && (
              <div className="space-y-1">
                {labels.map(l => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-700">{l.name}</span>
                      <span className="text-xs text-zinc-400">{l.type}</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {l.messagesUnread > 0 && <span className="font-semibold text-zinc-800">{l.messagesUnread} nao lidas</span>}
                      {l.messagesTotal > 0 && <span className="ml-2">/ {l.messagesTotal} total</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <GmailTestPanel />
    </div>
  );
}