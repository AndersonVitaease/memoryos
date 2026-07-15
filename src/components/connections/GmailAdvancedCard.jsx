/**
 * GmailAdvancedCard — Implementation 011 / Sprint E-01
 * UI para reply, replyAll, forward e rascunhos derivados.
 * Confirmacao delegada ao ConfirmationProvider (nao conversa diretamente com o Engine).
 */

import { useState } from "react";
import {
  CornerUpLeft, CornerUpRight, Forward, FileText,
  Loader2, Play, CheckCircle2, XCircle, AlertTriangle, ShieldAlert,
} from "lucide-react";
import {
  replyEmail, replyAll, forwardEmail,
  createReplyDraft, createForwardDraft,
} from "@/lib/gmail/GmailAdvanced";
import { runGmailAdvancedTests } from "@/lib/gmail/gmailAdvancedTests";
import { ConfirmationProvider, useConfirmation } from "@/lib/confirmation/ConfirmationProvider";

// ── Result banner ─────────────────────────────────────────────────────────────

function ResultBanner({ result }) {
  if (!result) return null;
  if (result.ok) return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 mt-3">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>
        {result.data?.status === "draft" ? "Rascunho criado!" : "Enviado com sucesso!"}
        {result.data?.id && <span className="font-mono text-xs ml-2 text-emerald-600">ID: {result.data.id}</span>}
      </span>
    </div>
  );
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 mt-3">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      {result.error}
    </div>
  );
}

// ── Reply / ReplyAll form ─────────────────────────────────────────────────────

function ReplyForm({ onSend, onDraft, loading }) {
  const [messageId, setMessageId] = useState("");
  const [body, setBody]           = useState("");
  const [all, setAll]             = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">ID da mensagem original</label>
        <input value={messageId} onChange={e => setMessageId(e.target.value)}
          placeholder="msg-abc123..."
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 font-mono" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Resposta</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
          placeholder="Texto da resposta..."
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none" />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
        <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="rounded" />
        Responder para todos (Reply All)
      </label>
      <div className="flex gap-2">
        <button onClick={() => onDraft({ messageId, body, replyAll: all })} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Salvar rascunho
        </button>
        <button onClick={() => onSend({ messageId, body, replyAll: all })} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerUpLeft className="w-4 h-4" />}
          Enviar resposta
        </button>
      </div>
    </div>
  );
}

// ── Forward form ──────────────────────────────────────────────────────────────

function ForwardForm({ onSend, onDraft, loading }) {
  const [messageId, setMessageId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [body, setBody]             = useState("");

  const recipientsList = () => recipients.split(",").map(s => s.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">ID da mensagem original</label>
        <input value={messageId} onChange={e => setMessageId(e.target.value)}
          placeholder="msg-abc123..."
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 font-mono" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Destinatarios (separar por virgula)</label>
        <input value={recipients} onChange={e => setRecipients(e.target.value)}
          placeholder="joao@example.com, maria@example.com"
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Nota adicional (opcional)</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
          placeholder="Texto adicional antes da mensagem encaminhada..."
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onDraft({ messageId, recipients: recipientsList(), body })} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Salvar rascunho
        </button>
        <button onClick={() => onSend({ messageId, recipients: recipientsList(), body })} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}
          Encaminhar
        </button>
      </div>
    </div>
  );
}

// ── Test panel ────────────────────────────────────────────────────────────────

function TestPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true); setResults(null);
    try { setResults(await runGmailAdvancedTests()); }
    catch (e) { setResults({ verdict: "FAIL", architecturalStatus: e.message, totalPassed: 0, totalFailed: 1, totalTests: 1, suites: [] }); }
    finally { setRunning(false); }
  };

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden mt-4">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <span className="text-xs font-semibold text-zinc-600">Testes — Implementation 011 (GmailAdvanced)</span>
        <button onClick={handleRun} disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
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

// ── Inner card (needs ConfirmationProvider context) ───────────────────────────

function GmailAdvancedCardInner() {
  const [tab, setTab]         = useState("reply");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const { requestAction }     = useConfirmation();

  const wrap = async (action) => {
    setLoading(true); setResult(null);
    const r = await action();
    if (r !== null) setResult(r);
    setLoading(false);
  };

  const tabs = [
    { id: "reply",   label: "Responder",  icon: CornerUpLeft },
    { id: "forward", label: "Encaminhar", icon: Forward },
  ];

  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
          <CornerUpRight className="w-5 h-5 text-indigo-500" />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-foreground">Gmail — Comunicacao Avancada</h3>
          <span className="text-xs text-zinc-400">Implementation 011 — Reply / Forward</span>
        </div>
      </div>

      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100 mb-4">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          Envio requer confirmacao via <span className="font-mono">RuntimeConfirmationEngine</span>. Rascunhos nao exigem confirmacao.
        </p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-zinc-100 pb-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); setResult(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === id ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "reply" && (
        <ReplyForm
          loading={loading}
          onDraft={(req) => wrap(() => createReplyDraft(req))}
          onSend={(req) => wrap(() => requestAction(
            {
              capability:  req.replyAll ? "gmail.replyAll" : "gmail.replyEmail",
              title:       req.replyAll ? "Confirmar Reply All" : "Confirmar resposta",
              description: `Responder mensagem "${req.messageId}"${req.replyAll ? " para todos" : ""}`,
            },
            () => req.replyAll ? replyAll(req) : replyEmail(req)
          ))}
        />
      )}
      {tab === "forward" && (
        <ForwardForm
          loading={loading}
          onDraft={(req) => wrap(() => createForwardDraft(req))}
          onSend={(req) => wrap(() => requestAction(
            {
              capability:  "gmail.forwardEmail",
              title:       "Confirmar encaminhamento",
              description: `Encaminhar mensagem "${req.messageId}" para ${req.recipients.join(", ")}`,
            },
            () => forwardEmail(req)
          ))}
        />
      )}

      <ResultBanner result={result} />
    </div>
  );
}

// ── Main export (wraps with providers) ───────────────────────────────────────

export default function GmailAdvancedCard() {
  return (
    <ConfirmationProvider>
      <div className="space-y-4">
        <GmailAdvancedCardInner />
        <TestPanel />
      </div>
    </ConfirmationProvider>
  );
}