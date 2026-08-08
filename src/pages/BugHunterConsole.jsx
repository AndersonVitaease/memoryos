import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Bug, Loader2, RefreshCw, Globe, Camera, TerminalSquare,
  MousePointerClick, XCircle, CheckCircle2, AlertTriangle, Power,
  Sparkles, Play, MessageSquare, Compass, Repeat, Plug, Brain, Square,
} from "lucide-react";
import BugFindingsList from "@/components/bug-hunter/BugFindingsList";
import BugHunterRunsList from "@/components/bug-hunter/BugHunterRunsList";

/**
 * BugHunterConsole — painel de teste manual do Playwright MCP + Hunt autonomo.
 *
 * Modo simples: um bloco de ate maxSteps passos (bugHunterRun, legacy).
 * Modo continuo: encadeia varios blocos (chunks) de ~4min numa MESMA conversa
 * do MemoryOS para construir um contexto grande (150-200+ perguntas) e testar a
 * memoria. O encadeamento e feito por polling da entidade BugHunterRun
 * (status 'awaiting_next_chunk' -> invoca proximo chunk com o chat_session_id),
 * robusto a timeout de HTTP. Botao Parar sinaliza stop_requested na entidade.
 */
const SERVER_NAME = "playwright-bug-hunter";

export default function BugHunterConsole() {
  const [serverId, setServerId] = useState(null);
  const [targetUrl, setTargetUrl] = useState("https://ever-mind-core.base44.app/");
  const [busy, setBusy] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);

  const LOCALSTORAGE_KEY = "bugHunter_activeRun";
  const pollIntervalRef = useRef(null);
  const invokingNextRef = useRef(false);
  const [bgRunId, setBgRunId] = useState(null);
  const [liveFindings, setLiveFindings] = useState([]);

  // Autonomous run state
  const [autoRunning, setAutoRunning] = useState(false);
  const [maxSteps, setMaxSteps] = useState(12);
  const [scenario, setScenario] = useState("");
  const [autoResult, setAutoResult] = useState(null);
  const [autoError, setAutoError] = useState(null);
  const [findings, setFindings] = useState([]);
  const [mode, setMode] = useState("explore");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Modo continuo
  const [continuous, setContinuous] = useState(false);
  const [targetQuestions, setTargetQuestions] = useState(200);
  const [contProgress, setContProgress] = useState(null);
  const [simpleProgress, setSimpleProgress] = useState(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const records = await base44.entities.MCPServerConfig.filter({ name: SERVER_NAME });
        if (records.length > 0) setServerId(records[0].id);
        else setError(`Registro MCPServerConfig '${SERVER_NAME}' nao encontrado.`);
      } catch (e) {
        setError(`Erro ao buscar MCPServerConfig: ${e.message}`);
      }
    })();
  }, []);

  const appendLog = (entry) => setLog((prev) => [...prev.slice(-50), { ts: new Date().toLocaleTimeString(), ...entry }]);

  const callTool = useCallback(async (toolName, args = {}, label) => {
    if (!serverId) { setError("ServerId nao resolvido ainda."); return null; }
    setBusy(toolName); setError(null); setLastResult(null);
    const t0 = Date.now();
    try {
      const res = await base44.functions.invoke("mcpClientCall", { serverId, action: "call", toolName, arguments: args });
      const data = res?.data ?? res;
      if (data?.error) {
        setError(data.error);
        appendLog({ tool: label || toolName, ok: false, ms: Date.now() - t0, msg: data.error });
        return null;
      }
      setLastResult(data?.result ?? data);
      appendLog({ tool: label || toolName, ok: true, ms: Date.now() - t0 });
      return data?.result ?? data;
    } catch (e) {
      const msg = e?.message ?? "Falha na chamada MCP";
      setError(msg); appendLog({ tool: label || toolName, ok: false, ms: Date.now() - t0, msg });
      return null;
    } finally { setBusy(null); }
  }, [serverId]);

  const handleNavigate = () => callTool("browser_navigate", { url: targetUrl }, "Navigate");
  const handleSnapshot = () => callTool("browser_snapshot", {}, "Snapshot");
  const handleConsole = () => callTool("browser_console_messages", { level: "error" }, "Console Errors");
  const handleScreenshot = () => callTool("browser_take_screenshot", {}, "Screenshot");
  const handleClose = () => callTool("browser_close", {}, "Close");

  const loadFindings = useCallback(async () => {
    try { const recs = await base44.entities.BugFinding.list("-created_date", 20); setFindings(recs || []); } catch (e) {}
  }, []);
  useEffect(() => { loadFindings(); }, [loadFindings]);

  const applyPreset = (key) => {
    if (key === "repetition") {
      setMode("conversation"); setContinuous(false);
      setScenario("Teste de TEIMOSIA/REPETICAO. Faca uma pergunta factual ao chat (ex: 'quais sao minhas tarefas pendentes?' ou 'quais emails recebi hoje?'). Espere a resposta. Depois faca a MESMA pergunta de novo. Espere. Depois peca explicitamente 'pesquise novamente' ou 'quero que pesquise de novo'. O comportamento CORRETO e o MemoryOS re-executar a busca. Se em vez disso o assistente RECUSAR ou afirmar que ja pesquisou ('ja pesquisei', 'pesquisei 3 vezes', 'ja respondi isso', 'nao preciso pesquisar de novo'), isso e um BUG DE COMPORTAMENTO (teimosia) — reporte como finding categoria functional, severidade high, com a frase exata da recusa no campo actual.");
      setMaxSteps("14");
    } else if (key === "connectors") {
      setMode("conversation"); setContinuous(false);
      setScenario("Proble TODOS os connectors do MemoryOS (Google Workspace: Gmail/Drive/Calendar, Microsoft 365: Outlook/OneDrive/Calendar, GitHub, WhatsApp). Para cada connector faca UMA pergunta que exercite uma capability, avalie a resposta contra os BUG CRITERIA, depois passe ao proximo.");
      setMaxSteps("16");
    } else if (key === "continuity") {
      setMode("conversation"); setContinuous(true); setTargetQuestions(200);
      setScenario("Teste de CONTINUIDADE DE MEMORIA em contexto grande. Faca perguntas variadas que dependam de contexto pessoal e do que ja foi conversado (ex: 'o que voce sabe sobre mim?', 'resuma o que conversamos ate aqui', 'voce lembra o que te disse sobre X?'). Intercale com perguntas de connector. O objetivo e acumular contexto e verificar se o MemoryOS mantem continuidade apos muitas perguntas.");
      setMaxSteps("80");
    }
  };

  // ── Polling do modo continuo: le a entidade BugHunterRun, encadeia chunks, detecta stop ──
  const finalizeContinuous = useCallback((runId, finalStatus) => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    setAutoRunning(false);
    setBgRunId(null);
    setStopping(false);
    try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch (e) {}
    loadFindings();
    // busca o resultado final para exibir
    (async () => {
      try {
        const recs = await base44.entities.BugHunterRun.filter({ run_id: runId });
        if (recs[0]) setAutoResult({ ...recs[0], _continuous: true });
      } catch (e) {}
    })();
  }, [loadFindings]);

  const startContinuousPolling = useCallback((runId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setBgRunId(runId);
    setAutoError(null);
    // Watchdog: se nao houve progresso (q_answered/chunk_count/updated_date) em 120s, o chunk travou.
    let lastProgressSig = "";
    let lastProgressAt = Date.now();
    pollIntervalRef.current = setInterval(async () => {
      let rec = null;
      try {
        const recs = await base44.entities.BugHunterRun.filter({ run_id: runId });
        rec = recs && recs[0];
      } catch (e) { /* ignore */ }
      if (rec) {
        setContProgress({
          questionsAnswered: rec.questions_answered || 0,
          questionsSent: rec.questions_sent || 0,
          findings: rec.findings_count || 0,
          chunks: rec.chunk_count || 0,
          chatSessionId: rec.chat_session_id || "",
          status: rec.status,
          target: rec.target_questions || 0,
          stopped: !!rec.stop_requested,
        });
        // Inicializa o watchdog com base no updated_date real da entidade.
        // Se a run ja esta sem atualizar ha mais de 120s, o watchdog dispara
        // imediatamente em vez de esperar 120s a partir do retorno do usuario.
        if (lastProgressSig === "") {
          const sinceUpdate = Date.now() - new Date(rec.updated_date).getTime();
          lastProgressAt = Date.now() - sinceUpdate;
        }
        try {
          const recs2 = await base44.entities.BugFinding.filter({ run_id: runId });
          setLiveFindings(recs2 || []);
        } catch (e) {}
      }
      if (!rec) return;

      // Usuario pediu para parar -> finaliza IMEDIATAMENTE, mesmo se o backend
      // ainda esta "running" (funcao pode estar presa num InvokeLLM sem timeout).
      if (rec.stop_requested) {
        finalizeContinuous(runId, "stopped");
        return;
      }

      if (rec.status === "running") {
        // Watchdog: se nao houve progresso (q_answered/chunk_count/updated_date) em 120s, o chunk travou.
        const sig = (rec.questions_answered || 0) + ":" + (rec.chunk_count || 0) + ":" + (rec.updated_date || "");
        if (sig !== lastProgressSig) {
          lastProgressSig = sig;
          lastProgressAt = Date.now();
        } else if (Date.now() - lastProgressAt > 90000) {
          appendLog({ tool: "watchdog", ok: false, ms: 0, msg: "chunk travado > 90s sem progresso — finalizando" });
          try { await base44.entities.BugHunterRun.update(rec.id, { status: "stopped", stop_requested: true }); } catch (e) {}
          finalizeContinuous(runId, "stopped");
          return;
        }
        return; // chunk em execucao
      }

      // Alvo alcancado, completed, failed ou stopped -> finaliza
      const target = rec.target_questions || 0;
      const reached = target > 0 && (rec.questions_answered || 0) >= target;
      if (rec.status === "completed" || rec.status === "failed" || rec.status === "stopped" || reached) {
        finalizeContinuous(runId, rec.status || (reached ? "completed" : "stopped"));
        return;
      }

      // awaiting_next_chunk -> invoca proximo chunk (com guarda anti-duplo)
      if (rec.status === "awaiting_next_chunk") {
        if (invokingNextRef.current) return;
        invokingNextRef.current = true;
        // marca running imediatamente para evitar re-disparo na proxima passada
        try { await base44.entities.BugHunterRun.update(rec.id, { status: "running" }); } catch (e) {}
        const chunkPayload = {
          targetUrl,
          maxSteps: Number(maxSteps) || 80,
          scenario: scenario.trim() || undefined,
          mode,
          loginEmail: mode === "conversation" ? loginEmail.trim() || undefined : undefined,
          loginPassword: mode === "conversation" ? loginPassword || undefined : undefined,
          runId,
          continuous: true,
          chatSessionId: rec.chat_session_id || "",
          targetQuestions: target,
          chunkIndex: rec.chunk_count || 0,
        };
        appendLog({ tool: "chunk_" + ((rec.chunk_count || 0) + 1), ok: true, ms: 0, msg: "encadeando proximo chunk" });
        base44.functions.invoke("bugHunterRun", chunkPayload)
          .catch(() => {})
          .finally(() => { invokingNextRef.current = false; });
      }
    }, 5000);
  }, [targetUrl, maxSteps, scenario, mode, loginEmail, loginPassword, finalizeContinuous]);

  const handleStop = useCallback(async () => {
    if (!bgRunId) return;
    setStopping(true);
    try {
      const recs = await base44.entities.BugHunterRun.filter({ run_id: bgRunId });
      if (recs[0]) await base44.entities.BugHunterRun.update(recs[0].id, { stop_requested: true });
    } catch (e) {}
  }, [bgRunId]);

  // ── Polling do modo simples (legacy): localStorage + BugFinding ──
  const startPolling = useCallback((runId, startTime) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setBgRunId(runId);
    setSimpleProgress({ questionsAnswered: 0, questionsSent: 0, findings: 0, steps: 0, status: "running" });
    pollIntervalRef.current = setInterval(async () => {
      try {
        const stored = JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || "{}");
        if (stored.runId === runId && stored.completed) {
          clearInterval(pollIntervalRef.current); pollIntervalRef.current = null;
          setAutoRunning(false); setBgRunId(null); setSimpleProgress(null);
          if (stored.error) setAutoError(stored.error);
          else setAutoResult({ ...stored.result, wallMs: stored.completedAt - startTime });
          loadFindings();
          localStorage.removeItem(LOCALSTORAGE_KEY);
          return;
        }
      } catch (e) {}
      if (Date.now() - startTime > 280000) {
        clearInterval(pollIntervalRef.current); pollIntervalRef.current = null;
        setAutoRunning(false); setBgRunId(null); setSimpleProgress(null);
        localStorage.removeItem(LOCALSTORAGE_KEY);
        return;
      }
      try {
        const recs = await base44.entities.BugFinding.filter({ run_id: runId });
        setLiveFindings(recs || []);
      } catch (e) {}
      // Le o registro BugHunterRun para progresso ao vivo (parcial persistido pelo backend)
      try {
        const runRecs = await base44.entities.BugHunterRun.filter({ run_id: runId });
        const rec = runRecs && runRecs[0];
        if (rec) {
          setSimpleProgress({
            questionsAnswered: rec.questions_answered || 0,
            questionsSent: rec.questions_sent || 0,
            findings: rec.findings_count || 0,
            steps: rec.steps_executed || 0,
            status: rec.status || "running",
            ageSec: Math.round((Date.now() - new Date(rec.created_date).getTime())/1000),
          });
        }
      } catch (e) {}
    }, 3000);
  }, [loadFindings]);

  const handleAutoRun = () => {
    if (!targetUrl) return;
    setAutoRunning(true);
    setAutoResult(null);
    setAutoError(null);
    setLiveFindings([]);
    setSimpleProgress(null);
    setContProgress(continuous ? { questionsAnswered: 0, questionsSent: 0, findings: 0, chunks: 0, status: "running", target: Number(targetQuestions) || 0, stopped: false } : null);

    const runId = `bugHunter_${Date.now()}`;
    const startTime = Date.now();
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({
      runId, startTime, targetUrl, maxSteps: Number(maxSteps) || 5, completed: false,
      continuous, targetQuestions: Number(targetQuestions) || 0,
    }));

    if (continuous) {
      // Modo continuo: invoca o primeiro chunk e deixa o polling encadear os proximos.
      base44.functions.invoke("bugHunterRun", {
        targetUrl,
        maxSteps: Number(maxSteps) || 80,
        scenario: scenario.trim() || undefined,
        mode,
        loginEmail: mode === "conversation" ? loginEmail.trim() || undefined : undefined,
        loginPassword: mode === "conversation" ? loginPassword || undefined : undefined,
        runId,
        continuous: true,
        targetQuestions: Number(targetQuestions) || 0,
        chunkIndex: 0,
      }).catch(() => {});
      startContinuousPolling(runId);
    } else {
      // Modo simples (legacy): fire-and-forget + localStorage completion.
      base44.functions.invoke("bugHunterRun", {
        targetUrl,
        maxSteps: Number(maxSteps) || 5,
        scenario: scenario.trim() || undefined,
        mode,
        loginEmail: mode === "conversation" ? loginEmail.trim() || undefined : undefined,
        loginPassword: mode === "conversation" ? loginPassword || undefined : undefined,
        runId,
      })
        .then((res) => {
          const data = res?.data ?? res;
          try {
            const stored = JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || "{}");
            if (stored.runId === runId) localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ ...stored, completed: true, result: data, completedAt: Date.now() }));
          } catch (e) {}
        })
        .catch((e) => {
          const cause = e?.response?.data?.error || e?.response?.data || e?.data?.error || e?.data || e?.message || "Run falhou";
          try {
            const stored = JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || "{}");
            if (stored.runId === runId) localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ ...stored, completed: true, error: typeof cause === "string" ? cause : JSON.stringify(cause), completedAt: Date.now() }));
          } catch (err) {}
        });
      startPolling(runId, startTime);
    }
  };

  // Resume de run em andamento ao voltar para a pagina
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) || "{}");
      if (stored.runId && !stored.completed) {
        setAutoRunning(true);
        if (stored.continuous) {
          setContinuous(true);
          setTargetQuestions(Number(stored.targetQuestions) || 200);
          startContinuousPolling(stored.runId);
        } else {
          startPolling(stored.runId, stored.startTime);
        }
      } else if (stored.runId && stored.completed && !stored.continuous) {
        setAutoResult({ ...stored.result, wallMs: stored.completedAt - stored.startTime });
        if (stored.error) setAutoError(stored.error);
        localStorage.removeItem(LOCALSTORAGE_KEY);
      }
    } catch (e) {}
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    };
  }, [startPolling, startContinuousPolling]);

  const isContinuousRunning = autoRunning && continuous;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Bug className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Bug Hunter Console</h1>
            <p className="text-xs text-zinc-500">Playwright MCP — teste manual + hunt autonomo (simples e continuo)</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded-md font-mono ${serverId ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500"}`}>
              {serverId ? "server conectado" : "resolvendo server..."}
            </span>
          </div>
        </div>

        {/* Target URL */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <label className="block text-xs font-medium text-zinc-400">URL alvo (app publicado)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://seu-app.base44.app/" className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40" />
            </div>
            <button onClick={handleNavigate} disabled={!serverId || !!busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-40 transition">
              {busy === "browser_navigate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Navegar
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ActionButton icon={MousePointerClick} label="Snapshot" sub="arvore de acessibilidade" onClick={handleSnapshot} busy={busy === "browser_snapshot"} disabled={!serverId || !!busy} />
          <ActionButton icon={TerminalSquare} label="Console Errors" sub="erros de JS da pagina" onClick={handleConsole} busy={busy === "browser_console_messages"} disabled={!serverId || !!busy} />
          <ActionButton icon={Camera} label="Screenshot" sub="evidencia visual" onClick={handleScreenshot} busy={busy === "browser_take_screenshot"} disabled={!serverId || !!busy} />
          <ActionButton icon={Power} label="Close" sub="encerrar contexto (libera RAM)" onClick={handleClose} busy={busy === "browser_close"} disabled={!serverId || !!busy} danger />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-mono text-xs break-all">{error}</span>
          </div>
        )}

        {lastResult && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Resultado</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <ResultViewer result={lastResult} />
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Log de execucao</span>
            <button onClick={() => setLog([])} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><XCircle className="w-3 h-3" /> limpar</button>
          </div>
          <div className="max-h-56 overflow-y-auto p-3 space-y-1 font-mono text-xs">
            {log.length === 0 ? <p className="text-zinc-600 italic">Nenhuma chamada ainda.</p> : log.slice().reverse().map((e, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="text-zinc-600">{e.ts}</span>
                {e.ok ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                <span className={e.ok ? "text-zinc-300" : "text-red-300"}>{e.tool}</span>
                <span className="text-zinc-600 ml-auto">{e.ms}ms</span>
                {!e.ok && e.msg && <span className="text-red-400/70 truncate max-w-[200px]" title={e.msg}>{e.msg}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Autonomous run */}
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Hunt Autonomo</h3>
            <span className="text-[10px] text-zinc-500">bugHunterRun — LLM + Playwright em loop</span>
          </div>

          {/* Mode toggle */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setMode("explore"); setContinuous(false); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition ${mode === "explore" && !continuous ? "bg-violet-500/15 border-violet-500/40 text-violet-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
              <Compass className="w-4 h-4" /> Exploracao livre
            </button>
            <button onClick={() => { setMode("conversation"); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition ${mode === "conversation" && !continuous ? "bg-violet-500/15 border-violet-500/40 text-violet-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
              <MessageSquare className="w-4 h-4" /> Conversa autonoma
            </button>
            <button onClick={() => { setMode("conversation"); setContinuous(true); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition ${continuous ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
              <Repeat className="w-4 h-4" /> Modo continuo
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {continuous
              ? "MODO CONTINUO: encadeia varios blocos de ~4min numa MESMA conversa do MemoryOS, mantendo o contexto acumulado entre os blocos (retoma via session_id). Ideal para testar a memoria com um contexto grande (150-200+ perguntas). Cada bloco respeita o limite de 5min da plataforma. Voce pode parar a qualquer momento."
              : mode === "conversation"
                ? "O LLM gera as perguntas sozinho, envia ao chat do MemoryOS, avalia cada resposta e cria findings."
                : "O LLM navega o app livremente clicando em links e botoes, procurando erros de console e fluxos quebrados."}
          </p>

          {/* Cenarios prontos */}
          <div className="space-y-1.5">
            <span className="block text-[10px] font-medium text-zinc-500">Cenarios prontos (clique para preencher)</span>
            <div className="flex flex-wrap gap-1.5">
              <PresetChip label="Teimosia / Repeticao" icon={Repeat} onClick={() => applyPreset("repetition")} />
              <PresetChip label="Probar todos os connectors" icon={Plug} onClick={() => applyPreset("connectors")} />
              <PresetChip label="Continuidade de memoria (continuo)" icon={Brain} onClick={() => applyPreset("continuity")} />
            </div>
          </div>

          {/* Login credentials (conversation + continuous) */}
          {(mode === "conversation" || continuous) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1">Login email (teste)</label>
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="usuario@teste.com" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-1">Login senha (teste)</label>
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="senha de teste" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
              </div>
              <p className="md:col-span-2 text-[10px] text-zinc-600">Cada bloco abre um browser novo e faz login (contexto limpo). No modo continuo, a conversa e retomada via session_id do chat.</p>
            </div>
          )}

          {/* Continuous: meta de perguntas */}
          {continuous && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="md:col-span-1">
                <label className="block text-[10px] font-medium text-zinc-500 mb-1">Meta de perguntas (0 = ate parar)</label>
                <input type="number" min="0" max="2000" value={targetQuestions} onChange={(e) => setTargetQuestions(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="md:col-span-2 flex items-end">
                <p className="text-[10px] text-zinc-500 leading-relaxed">Quantas perguntas devem ser respondidas no total antes de parar automaticamente. Use 0 para rodar ate voce clicar em Parar. ~25 perguntas por bloco de 4min, entao 200 perguntas = ~8 blocos (~35min).</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 mb-1">{continuous ? "Max passos por bloco (chunk)" : "Max steps"}</label>
              <input type="number" min="1" max={continuous ? 200 : 20} value={maxSteps} onChange={(e) => setMaxSteps(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-zinc-500 mb-1">Cenario (opcional — guia a exploracao)</label>
              <input value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder={continuous ? "ex: teste de continuidade de memoria com perguntas variadas" : mode === "conversation" ? "ex: pergunte sobre minhas tarefas, decisoes e memoria pessoal" : "ex: faca login, abra o chat, envie uma mensagem"} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleAutoRun} disabled={autoRunning || !targetUrl} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 transition">
              {autoRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : (continuous ? <Repeat className="w-4 h-4" /> : mode === "conversation" ? <MessageSquare className="w-4 h-4" /> : <Play className="w-4 h-4" />)}
              {autoRunning ? (continuous ? "Executando continuo..." : "Cacando bugs...") : (continuous ? "Iniciar Modo Continuo" : mode === "conversation" ? "Iniciar Conversa Autonoma" : "Rodar Hunt Autonomo")}
            </button>
            {isContinuousRunning && (
              <button onClick={handleStop} disabled={stopping} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50 transition">
                {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {stopping ? "Parando..." : "Parar"}
              </button>
            )}
          </div>

          {autoError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-mono text-xs break-all">{autoError}</span>
            </div>
          )}

          {/* Progresso ao vivo (modo simples) */}
          {autoRunning && !continuous && simpleProgress && (
            <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 space-y-2">
              <div className="flex items-center gap-2 text-sm text-violet-300">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="flex-1">Cacando bugs — o hunt navega e faz perguntas em loop (ate ~3min).</span>
                {simpleProgress.ageSec != null && <span className="text-[10px] text-zinc-500 font-mono">{simpleProgress.ageSec}s</span>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <ProgressStat label="Perguntas enviadas" value={simpleProgress.questionsSent} />
                <ProgressStat label="Perguntas respondidas" value={simpleProgress.questionsAnswered} />
                <ProgressStat label="Bugs encontrados" value={simpleProgress.findings} />
                <ProgressStat label="Status" value={simpleProgress.status === "running" ? "executando" : simpleProgress.status} />
              </div>
              {liveFindings.length > 0 && (
                <p className="text-[10px] text-zinc-500">{liveFindings.length} bug(s) detectado(s) ate agora — veja abaixo.</p>
              )}
            </div>
          )}

          {/* Progresso continuo ao vivo */}
          {isContinuousRunning && contProgress && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="flex-1">Executando em modo continuo — voce pode parar a qualquer momento.</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <ProgressStat label="Perguntas respondidas" value={contProgress.target > 0 ? `${contProgress.questionsAnswered}/${contProgress.target}` : contProgress.questionsAnswered} />
                <ProgressStat label="Perguntas enviadas" value={contProgress.questionsSent} />
                <ProgressStat label="Blocs (chunks)" value={contProgress.chunks} />
                <ProgressStat label="Bugs encontrados" value={contProgress.findings} />
              </div>
              <p className="text-[10px] text-zinc-500 font-mono truncate">
                status: {contProgress.status}{contProgress.chatSessionId ? ` · sessao: ${contProgress.chatSessionId.slice(-12)}` : ""}
              </p>
            </div>
          )}

          {/* Resultado (modo simples) */}
          {autoResult && !continuous && !autoResult._continuous && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> concluido</span>
                <span className="text-zinc-500">{autoResult.stepsExecuted} passos</span>
                <span className="text-zinc-500">{autoResult.durationMs}ms</span>
                <span className="ml-auto px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">{autoResult.findingsCreated} finding(s)</span>
                {autoResult.questionsAnswered !== undefined && (
                  <span className={`px-2 py-0.5 rounded-md font-medium border ${autoResult.questionsAnswered >= (autoResult.minQuestions || 1) ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`} title="Perguntas enviadas E com resposta lida">
                    {autoResult.questionsAnswered}/{autoResult.minQuestions || 1} respondidas
                  </span>
                )}
              </div>
              {autoResult.findings?.length > 0 && (
                <div className="space-y-1.5">
                  {autoResult.findings.map((f) => (
                    <div key={f.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <SeverityBadge severity={f.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{f.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{f.category} · {f.id}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">historico de acoes</summary>
                <div className="mt-2 space-y-0.5 font-mono text-[11px] text-zinc-500 max-h-40 overflow-y-auto">
                  {autoResult.history?.map((h, i) => (<div key={i} className={h.error ? "text-red-400/70" : ""}>{h.step}. {h.action}: {h.description}{h.error ? " — " + h.error : ""}</div>))}
                </div>
              </details>
              {autoResult.transcript?.length > 0 && (
                <details className="text-xs" open>
                  <summary className="cursor-pointer text-violet-400/80 hover:text-violet-300 font-medium">transcript (perguntas e respostas — prova de conversa)</summary>
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                    {autoResult.transcript.map((t, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                        <p className="text-[11px] text-violet-300 font-medium break-words">P{t.step}: {t.question}</p>
                        {t.response_evidence ? <p className="text-[10px] text-zinc-500 mt-1 line-clamp-4 font-mono break-words">{t.response_evidence.slice(0, 300)}</p> : <p className="text-[10px] text-amber-500 mt-1">resposta nao lida (run terminou antes do snapshot)</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Resultado final (modo continuo) */}
          {autoResult && autoResult._continuous && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> {autoResult.status === "stopped" ? "parado" : "concluido"}</span>
                <span className="text-zinc-500">{autoResult.chunk_count} bloco(s)</span>
                <span className="text-zinc-500">{autoResult.questions_answered} respondidas</span>
                <span className="ml-auto px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">{autoResult.findings_count} finding(s)</span>
              </div>
              {liveFindings.length > 0 && (
                <div className="space-y-1.5">
                  {liveFindings.slice(0, 10).map((f) => (
                    <div key={f.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <SeverityBadge severity={f.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{f.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{f.category} · {f.severity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Runs recentes — transcript persistido (prova de conversa) */}
        <BugHunterRunsList />

        {/* Findings report */}
        <BugFindingsList findings={findings} onRefresh={loadFindings} />

        <p className="text-xs text-zinc-600 leading-relaxed">
          {continuous
            ? <>No <span className="font-mono">modo continuo</span>, o Bug Hunter encadeia blocos de ~4min numa mesma conversa do MemoryOS (retomada via <span className="font-mono">session_id</span>), acumulando contexto. Cada bloco respeita o limite de 5min da plataforma; o orçamento de tempo (~230s) deixa margem segura.</>
            : <>O <span className="font-mono">bugHunterRun</span> navega o app, o LLM decide cada acao com base no snapshot + erros de console, e cria <span className="font-mono">BugFinding</span>s quando detecta bugs. O browser e fechado no fim para liberar RAM na VPS.</>}
        </p>
      </div>
    </div>
  );
}

function ProgressStat({ label, value }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-2 py-2">
      <p className="text-base font-semibold text-emerald-300">{value}</p>
      <p className="text-[9px] text-zinc-500 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const map = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    info: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  const cls = map[severity] || map.medium;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0 ${cls}`}>{severity || "medium"}</span>;
}

function PresetChip({ label, icon: Icon, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-violet-500/40 hover:text-violet-300 transition">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function ActionButton({ icon: Icon, label, sub, onClick, busy, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition disabled:opacity-40 ${danger ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10" : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50"}`}>
      <div className="flex items-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <Icon className={`w-4 h-4 ${danger ? "text-red-400" : "text-amber-400"}`} />}
        <span className="text-sm font-medium text-zinc-200">{label}</span>
      </div>
      <span className="text-[10px] text-zinc-500">{sub}</span>
    </button>
  );
}

function ResultViewer({ result }) {
  if (result?.images?.length > 0) {
    const img = result.images[0];
    return (<div className="p-3"><img src={`data:${img.mimeType || "image/png"};base64,${img.data}`} alt="screenshot" className="w-full rounded-lg border border-zinc-800" /></div>);
  }
  if (result?.content?.length > 0) {
    return (<div className="p-3 max-h-80 overflow-y-auto">{result.content.map((c, i) => (<pre key={i} className="text-xs text-zinc-400 whitespace-pre-wrap break-words font-mono">{c.text || JSON.stringify(c, null, 2)}</pre>))}</div>);
  }
  if (result?.messages) {
    return (
      <div className="p-3 space-y-1 max-h-80 overflow-y-auto">
        {result.messages.length === 0 ? <p className="text-xs text-zinc-500 italic">Nenhum erro de console.</p> : result.messages.map((m, i) => (
          <div key={i} className="text-xs font-mono p-2 rounded bg-red-500/5 border border-red-500/10 text-red-300"><span className="text-red-500">[{m.type || "error"}]</span> {m.text}</div>
        ))}
      </div>
    );
  }
  return <pre className="p-3 max-h-80 overflow-y-auto text-xs text-zinc-400 whitespace-pre-wrap break-words font-mono">{JSON.stringify(result, null, 2)}</pre>;
}