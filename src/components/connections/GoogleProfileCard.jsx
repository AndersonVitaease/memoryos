/**
 * GoogleProfileCard — Implementation 008
 * Card de perfil do usuário Google autenticado.
 */

import { useState } from "react";
import { fetchGoogleProfile } from "@/lib/google-profile/GoogleProfileConnector";
import { runGoogleProfileTests } from "@/lib/google-profile/googleProfileTests";
import {
  User, Mail, Globe, ShieldCheck, Hash, Loader2,
  RefreshCw, Play, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";

// ── Profile display ───────────────────────────────────────────────────────────

function ProfileField({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-zinc-100 last:border-0">
      <Icon className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className={`text-sm text-zinc-800 break-all ${mono ? "font-mono" : "font-medium"}`}>
          {value ?? "—"}
        </p>
      </div>
    </div>
  );
}

// ── Test panel ────────────────────────────────────────────────────────────────

function ProfileTestPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const r = await runGoogleProfileTests();
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
        <span className="text-xs font-semibold text-zinc-600">Testes — Implementation 008 (GoogleProfileConnector)</span>
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
            {results.verdict === "PASS"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{results.architecturalStatus}</span>
            <span className="ml-auto text-xs font-normal">{results.totalPassed}/{results.totalTests} · {results.durationMs}ms</span>
          </div>
          {results.suites?.map((suite) => (
            <div key={suite.suite}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-600">{suite.suite}</span>
                <span className={`text-xs font-medium ${suite.failed === 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {suite.passed}/{suite.total}
                </span>
              </div>
              <div className="space-y-0.5">
                {suite.results?.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${r.passed ? "text-zinc-600" : "bg-red-50 text-red-600"}`}>
                    {r.passed
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
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

export default function GoogleProfileCard() {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [fetched, setFetched]   = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    const r = await fetchGoogleProfile();
    setResult(r);
    setFetched(true);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Card principal */}
      <div className="p-5 rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-500" />
            <h3 className="font-semibold text-sm text-foreground">Perfil Google</h3>
            <span className="text-xs text-zinc-400">Implementation 008</span>
          </div>
          <button
            onClick={handleFetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            {fetched ? "Atualizar" : "Carregar perfil"}
          </button>
        </div>

        {/* Not fetched yet */}
        {!fetched && !loading && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Clique em "Carregar perfil" para buscar seus dados do Google.
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Obtendo perfil...
          </div>
        )}

        {/* Error */}
        {fetched && !loading && result && !result.ok && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{result.error}</span>
          </div>
        )}

        {/* Profile */}
        {fetched && !loading && result?.ok && result.profile && (
          <div>
            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-zinc-100">
              {result.profile.picture ? (
                <img
                  src={result.profile.picture}
                  alt={result.profile.name}
                  className="w-14 h-14 rounded-full border-2 border-zinc-100 object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-zinc-400" />
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">{result.profile.name}</p>
                <p className="text-sm text-muted-foreground">{result.profile.email}</p>
                {result.profile.email_verified && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 mt-0.5">
                    <ShieldCheck className="w-3 h-3" /> Email verificado
                  </span>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-0">
              <ProfileField icon={User}       label="Nome"         value={result.profile.given_name} />
              <ProfileField icon={User}       label="Sobrenome"    value={result.profile.family_name} />
              <ProfileField icon={User}       label="Nome completo" value={result.profile.name} />
              <ProfileField icon={Mail}       label="Email"        value={result.profile.email} />
              <ProfileField icon={ShieldCheck} label="Email verificado" value={result.profile.email_verified ? "Sim" : "Nao"} />
              <ProfileField icon={Globe}      label="Idioma"       value={result.profile.locale} />
              <ProfileField icon={Hash}       label="ID Google"    value={result.profile.sub} mono />
              <ProfileField icon={ShieldCheck} label="Status"      value="Conectado — OAuth 2.0 ativo" />
            </div>
          </div>
        )}
      </div>

      {/* Test panel */}
      <ProfileTestPanel />
    </div>
  );
}