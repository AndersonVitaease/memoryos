/**
 * Phase53Page — GitHub Production Bring-Up
 * Parts 5–9: Auth Config, Runtime Validation, Diagnostics, Recovery, Certification
 */
import React, { useState, useCallback } from "react";
import { GitHubTokenManager } from "@/lib/github-bringup/GitHubTokenManager";
import { GitHubBringUpEngine } from "@/lib/github-bringup/GitHubBringUpEngine";
import { GitHubCertification } from "@/lib/github-bringup/GitHubCertification";

// ── Mini UI Atoms ─────────────────────────────────────────────────────────────

function Badge({ label, style = "" }) {
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${style}`}>{label}</span>
  );
}

const STATE_STYLE = {
  VALID: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  MISSING: "bg-red-900/50 text-red-300 border-red-700",
  INVALID: "bg-red-900/50 text-red-300 border-red-700",
  EXPIRED: "bg-orange-900/50 text-orange-300 border-orange-700",
  INSUFFICIENT_PERMISSIONS: "bg-amber-900/50 text-amber-300 border-amber-700",
  SUCCESS: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  FAILED: "bg-red-900/50 text-red-300 border-red-700",
  SKIPPED: "bg-zinc-800/40 text-zinc-500 border-zinc-700",
  OPERATIONAL: "bg-emerald-900/60 text-emerald-200 border-emerald-600",
  PARTIAL: "bg-amber-900/50 text-amber-300 border-amber-700",
  NOT_CONFIGURED: "bg-zinc-800/60 text-zinc-400 border-zinc-600",
  CERTIFIED: "bg-emerald-900/60 text-emerald-200 border-emerald-500",
  CONDITIONAL: "bg-amber-900/50 text-amber-300 border-amber-700",
  AUTHENTICATED: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
};

function Spinner() {
  return <div className="w-5 h-5 border-2 border-zinc-700 border-t-violet-400 rounded-full animate-spin" />;
}

// ── Auth Configurator ─────────────────────────────────────────────────────────

function AuthConfigurator({ onTokenSet }) {
  const [token, setToken] = useState("");
  const [target, setTarget] = useState("runtime");
  const [msg, setMsg] = useState(null);
  const mgr = new GitHubTokenManager();

  const inject = () => {
    if (!token.trim()) { setMsg({ type: "error", text: "Token cannot be empty" }); return; }
    try {
      mgr.inject(token.trim(), target);
      setMsg({ type: "ok", text: `Token injected via ${target}` });
      setToken("");
      if (onTokenSet) onTokenSet();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    }
  };

  const clear = () => {
    mgr.clear();
    setMsg({ type: "ok", text: "Token cleared from all sources" });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-100 text-sm font-bold">Authentication Configuration</span>
        <Badge label="PART 1" style="bg-sky-900/40 text-sky-300 border-sky-700" />
      </div>
      <p className="text-zinc-400 text-xs">Inject a GitHub Personal Access Token. Required scopes: <code className="text-violet-300">repo</code> + <code className="text-violet-300">read:user</code></p>
      <div className="flex gap-2 flex-wrap">
        <input
          type="password"
          placeholder="ghp_…"
          value={token}
          onChange={e => setToken(e.target.value)}
          className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
        />
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none"
        >
          <option value="runtime">Runtime (globalThis)</option>
          <option value="sessionStorage">Session Storage</option>
          <option value="localStorage">Local Storage</option>
        </select>
        <button onClick={inject} className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition">
          Inject
        </button>
        <button onClick={clear} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition">
          Clear
        </button>
      </div>
      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}

// ── Token Diagnostics Panel ───────────────────────────────────────────────────

function TokenDiagnosticsPanel({ diag, loading }) {
  if (loading) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
      <Spinner />
      <span className="text-zinc-400 text-sm">Diagnosing token…</span>
    </div>
  );
  if (!diag) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-100 text-sm font-bold">Token Diagnostics</span>
        <Badge label={diag.state} style={STATE_STYLE[diag.state] ?? ""} />
        <Badge label={`source: ${diag.source}`} style="bg-zinc-800 text-zinc-400 border-zinc-700" />
        <span className="text-zinc-600 text-xs ml-auto">{diag.latencyMs}ms</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          { l: "State",    v: diag.state,    ok: diag.state === "VALID" },
          { l: "Login",    v: diag.login ?? "N/A", ok: !!diag.login },
          { l: "Scopes",   v: diag.scopes ?? "N/A", ok: true },
          { l: "Rate Limit", v: diag.rateLimit ? `${diag.rateLimit.remaining}/${diag.rateLimit.limit}` : "N/A", ok: !!diag.rateLimit },
        ].map(m => (
          <div key={m.l} className="bg-zinc-800/60 rounded p-2">
            <div className={`font-mono font-bold truncate ${m.ok ? "text-emerald-400" : "text-zinc-500"}`}>{m.v}</div>
            <div className="text-zinc-500 text-xs">{m.l}</div>
          </div>
        ))}
      </div>

      <p className="text-zinc-400 text-xs font-mono">{diag.detail}</p>

      {diag.rateLimit && (
        <p className="text-zinc-600 text-xs">Rate limit resets: {diag.rateLimit.resetAt}</p>
      )}
    </div>
  );
}

// ── Recovery Assistant ────────────────────────────────────────────────────────

function RecoveryAssistant({ plan }) {
  if (!plan) return null;
  const severityStyle = plan.severity === "CRITICAL" ? "border-red-700 bg-red-950/20" : plan.severity === "HIGH" ? "border-orange-700 bg-orange-950/10" : "border-amber-700 bg-amber-950/10";
  return (
    <div className={`border rounded-xl p-4 space-y-3 ${severityStyle}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-100 text-sm font-bold">Recovery Assistant</span>
        <Badge label={plan.severity} style={plan.severity === "CRITICAL" ? "bg-red-900/50 text-red-300 border-red-700" : "bg-amber-900/50 text-amber-300 border-amber-700"} />
      </div>
      <p className="text-zinc-300 text-xs">{plan.cause}</p>
      <div className="space-y-2">
        {plan.steps.map(s => (
          <div key={s.step} className="flex gap-3 bg-zinc-800/40 rounded-lg p-2.5">
            <div className="shrink-0 w-5 h-5 rounded-full bg-violet-800 flex items-center justify-center text-violet-200 text-xs font-bold">{s.step}</div>
            <div>
              <p className="text-zinc-200 text-xs font-medium">{s.action}</p>
              <p className="text-zinc-400 text-xs mt-0.5">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bring-Up Report Panel ─────────────────────────────────────────────────────

function BringUpReportPanel({ report }) {
  const [expanded, setExpanded] = useState({});
  const toggle = id => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-100 text-sm font-bold">Read-Only Validation</span>
          <Badge label={report.overallStatus} style={STATE_STYLE[report.overallStatus] ?? ""} />
          <span className="text-zinc-600 text-xs ml-auto">{report.durationMs}ms</span>
        </div>
        <div className="flex gap-3 mt-2 text-xs">
          <span className="text-emerald-400">✓ {report.passed} passed</span>
          {report.failed > 0 && <span className="text-red-400">✗ {report.failed} failed</span>}
          {report.skipped > 0 && <span className="text-zinc-500">– {report.skipped} skipped</span>}
          {report.login && <span className="text-zinc-500">login: {report.login}</span>}
          {report.repository && <span className="text-zinc-500">repo: {report.repository}</span>}
        </div>
      </div>

      {report.operations.map((op, i) => (
        <div key={i} className={`border-b border-zinc-800/40 last:border-0 ${op.status === "FAILED" ? "bg-red-950/10" : ""}`}>
          <button onClick={() => op.data && toggle(i)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-800/20 transition">
            <Badge label={op.status} style={STATE_STYLE[op.status] ?? ""} />
            <span className="text-zinc-400 text-xs font-mono w-44 shrink-0">{op.operation}</span>
            <span className="text-zinc-300 text-xs flex-1 truncate">{op.detail}</span>
            <span className="text-zinc-700 text-xs shrink-0">{op.latencyMs > 0 ? `${op.latencyMs}ms` : ""}</span>
            {op.data && <span className="text-zinc-600 text-xs">{expanded[i] ? "▲" : "▼"}</span>}
          </button>
          {expanded[i] && op.data && (
            <div className="px-4 pb-3 ml-4 border-l-2 border-zinc-800">
              <pre className="text-xs text-zinc-400 bg-zinc-800/50 rounded p-2 overflow-x-auto max-h-40">
                {JSON.stringify(op.data, null, 2)}
              </pre>
              <div className="mt-2 text-xs text-zinc-600 font-mono">
                execId: {op.evidence.executionId} · {op.evidence.timestamp}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Certification Card ────────────────────────────────────────────────────────

function CertificationCard({ cert }) {
  if (!cert) return null;
  return (
    <div className={`border rounded-xl p-5 space-y-3 ${cert.status === "CERTIFIED" ? "bg-emerald-950/20 border-emerald-600" : "bg-amber-950/10 border-amber-700"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-100 text-base font-bold">GitHub Production Operational Certification</span>
        <Badge label={cert.status} style={STATE_STYLE[cert.status] ?? ""} />
        <Badge label={cert.level} style="bg-violet-900/40 text-violet-300 border-violet-700" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {[
          { l: "Cert ID",       v: cert.certId },
          { l: "Connector",     v: `${cert.connector} ${cert.version}` },
          { l: "Authenticated", v: cert.login },
          { l: "Ops Validated", v: `${cert.passedCount}/${cert.passedCount + cert.failedCount}` },
          { l: "Read-Only",     v: cert.readOnlyVerified ? "✓ VERIFIED" : "✗ FAILED" },
          { l: "P95 Latency",   v: `${cert.latencyP95Ms}ms` },
          { l: "Rate Limit",    v: cert.rateLimit ? `${cert.rateLimit.remaining}/${cert.rateLimit.limit}` : "N/A" },
          { l: "Issued By",     v: cert.issuedBy },
          { l: "Issued At",     v: new Date(cert.issuedAt).toISOString().slice(0, 19).replace("T", " ") },
        ].map(m => (
          <div key={m.l} className="bg-zinc-800/40 rounded p-2">
            <div className="text-zinc-200 font-mono text-xs truncate">{m.v}</div>
            <div className="text-zinc-500 text-xs">{m.l}</div>
          </div>
        ))}
      </div>

      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Validated Operations</p>
        <div className="flex flex-wrap gap-1">
          {cert.operationsValidated.map(op => (
            <span key={op} className="text-xs bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono">{op}</span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Certification Notes</p>
        {cert.notes.map((n, i) => (
          <p key={i} className="text-zinc-400 text-xs font-mono">→ {n}</p>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Phase53Page() {
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [bringUpReport, setBringUpReport] = useState(null);
  const [cert, setCert] = useState(null);
  const [targetRepo, setTargetRepo] = useState("");

  const runDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const mgr = new GitHubTokenManager();
      setDiag(await mgr.diagnose());
    } finally { setDiagLoading(false); }
  }, []);

  const runBringUp = useCallback(async () => {
    setRunLoading(true);
    setBringUpReport(null);
    setCert(null);
    try {
      const mgr = new GitHubTokenManager();
      const freshDiag = await mgr.diagnose();
      setDiag(freshDiag);

      const engine = new GitHubBringUpEngine();
      let owner, repo;
      if (targetRepo.includes("/")) {
        [owner, repo] = targetRepo.split("/");
      }
      const report = await engine.run(owner, repo);
      setBringUpReport(report);

      if (report.certificationReady || report.passed >= 6) {
        const certEngine = new GitHubCertification();
        setCert(certEngine.issue(report, freshDiag));
      }
    } finally { setRunLoading(false); }
  }, [targetRepo]);

  const recovery = diag?.recoveryPlan ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-5">
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-violet-400">MemoryOS</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Phase 5.3</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">GitHub Production Bring-Up</span>
          </div>
          <h1 className="text-lg font-bold">GitHub Production Bring-Up</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            Transition GitHub: DISCOVERABLE → AUTHENTICATED → INVOKABLE → OPERATIONAL
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs font-mono">
            {["IMPLEMENTED ✓", "REGISTERED ✓", "DISCOVERABLE ✓", "AUTHENTICATED", "INVOKABLE", "OPERATIONAL"].map((s, i) => (
              <React.Fragment key={s}>
                <span className={s.includes("✓") ? "text-emerald-400" : "text-zinc-400"}>{s}</span>
                {i < 5 && <span className="text-zinc-700">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Auth Configurator */}
        <AuthConfigurator onTokenSet={runDiag} />

        {/* Diagnostics controls */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-100 text-sm font-bold">Diagnostics & Validation</span>
            <Badge label="PARTS 2–7" style="bg-violet-900/40 text-violet-300 border-violet-700" />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="text"
              placeholder="owner/repo (optional — auto-detected)"
              value={targetRepo}
              onChange={e => setTargetRepo(e.target.value)}
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
            />
            <button onClick={runDiag} disabled={diagLoading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs rounded-lg transition">
              {diagLoading ? "Diagnosing…" : "Diagnose Token"}
            </button>
            <button onClick={runBringUp} disabled={runLoading}
              className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition">
              {runLoading ? "Running…" : "Run Full Bring-Up"}
            </button>
          </div>
          {runLoading && (
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <Spinner />
              <span>Executing 12 read-only operations against GitHub API…</span>
            </div>
          )}
        </div>

        {/* Token Diagnostics */}
        <TokenDiagnosticsPanel diag={diag} loading={diagLoading} />

        {/* Recovery Assistant */}
        {recovery && <RecoveryAssistant plan={recovery} />}

        {/* Bring-Up Report */}
        {bringUpReport && <BringUpReportPanel report={bringUpReport} />}

        {/* Certification */}
        {cert && <CertificationCard cert={cert} />}

        {/* Instructions when nothing run */}
        {!diag && !diagLoading && !bringUpReport && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-2">
            <p className="text-zinc-400 text-sm">Inject your GitHub PAT above, then click <strong className="text-zinc-200">Diagnose Token</strong> or <strong className="text-zinc-200">Run Full Bring-Up</strong>.</p>
            <p className="text-zinc-600 text-xs font-mono">Token sources checked: globalThis.__GITHUB_TOKEN__ → sessionStorage → localStorage → VITE_GITHUB_TOKEN</p>
          </div>
        )}

      </div>
    </div>
  );
}