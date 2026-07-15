/**
 * GmailActionsCard — Implementation 010
 * UI para createDraft, sendDraft e sendEmail com confirmacao obrigatoria.
 */

import { useState } from "react";
import {
  Mail, Send, FileText, Loader2, Play,
  CheckCircle2, XCircle, AlertTriangle, ShieldAlert,
} from "lucide-react";
import { createDraft, sendDraft, sendEmail } from "@/lib/gmail/GmailActions";
import { runGmailActionsTests } from "@/lib/gmail/gmailActionsTests";

// ── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-zinc-800 text-sm">Confirmacao necessaria</p>
            <p className="text-sm text-zinc-600 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
          >
            Confirmar envio
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Result banner ─────────────────────────────────────────────────────────────

function ResultBanner({ result }) {
  if (!result) return null;
  if (result.ok) return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>
        {result.data?.status === "draft" ? "Rascunho criado!" : "Enviado com sucesso!"}
        {result.data?.id && <span className="font-mono text-xs ml-2 text-emerald-600">ID: {result.data.id}</span>}
      </span>
    </div>
  );
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      {result.error}
    </div>
  );
}

// ── Compose form ──────────────────────────────────────────────────────────────

function ComposeForm({ onDraft, onSend, loading }) {
  const [to, setTo]           = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");

  const req = () => ({
    to: to.split(",").map(s => s.trim()).filter(Boolean),
    subject,
    body,
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Para (separar por virgula)</label>
        <input
          type="text"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="joao@example.com, maria@example.com"
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Assunto</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Assunto do e-mail"
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Mensagem</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          placeholder="Corpo do e-mail..."
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onDraft(req())}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Salvar rascunho
        </button>
        <button
          onClick={() => onSend(req())}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar e-mail
        </button>
      </div>
    </div>
  );
}

// ── Send Draft form ───────────────────────────────────────────────────────────

function SendDraftForm({ onSend, loading }) {
  const [draftId, setDraftId] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">ID do rascunho</label>
        <input
          type="text"
          value={draftId}
          onChange={e => setDraftId(e.target.value)}
          placeholder="draft-001..."
          className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-300 font-mono"
        />
      </div>
      <button
        onClick={() => onSend(draftId)}
        disabled={loading || !draftId.trim()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Enviar rascunho
      </button>
    </div>
  );
}

// ── Test panel ────────────────────────────────────────────────────────────────

function GmailActionsTestPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGmailActionsTests();
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
        <span className="text-xs font-semibold text-zinc-600">Testes — Implementation 010 (GmailActions)</span>
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

export default function GmailActionsCard() {
  const [tab, setTab]         = useState("compose");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [confirm, setConfirm] = useState(null); // { message, action }

  const handleDraft = async (req) => {
    setLoading(true); setResult(null);
    const r = await createDraft(req);
    setResult(r);
    setLoading(false);
  };

  const requestSend = (action, message) => {
    setConfirm({ message, action });
  };

  const handleConfirm = async () => {
    const action = confirm.action;
    setConfirm(null);
    setLoading(true); setResult(null);
    const r = await action();
    setResult(r);
    setLoading(false);
  };

  const handleSendEmail = (req) => {
    requestSend(
      () => sendEmail(req),
      `Confirma o envio de um e-mail para "${req.to.join(", ")}" com o assunto "${req.subject}"?`
    );
  };

  const handleSendDraft = (draftId) => {
    requestSend(
      () => sendDraft(draftId),
      `Confirma o envio do rascunho "${draftId}"?`
    );
  };

  const tabs = [
    { id: "compose",    label: "Compor / Rascunho", icon: Mail },
    { id: "send_draft", label: "Enviar rascunho",   icon: Send },
  ];

  return (
    <div className="space-y-4">
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="p-5 rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Gmail — Acoes</h3>
            <span className="text-xs text-zinc-400">Implementation 010 — Envio com confirmacao</span>
          </div>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100 mb-4">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">Confirmacao obrigatoria antes de qualquer envio.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-zinc-100 pb-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setResult(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === id ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === "compose" && (
          <ComposeForm onDraft={handleDraft} onSend={handleSendEmail} loading={loading} />
        )}
        {tab === "send_draft" && (
          <SendDraftForm onSend={handleSendDraft} loading={loading} />
        )}

        {result && <div className="mt-3"><ResultBanner result={result} /></div>}
      </div>

      <GmailActionsTestPanel />
    </div>
  );
}