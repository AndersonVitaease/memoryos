/**
 * Phase700Page.jsx — Voice Center Dashboard
 * Sprint 7.0.0 · Voice Interaction Platform
 */

import React, { useState, useEffect } from "react";
import {
  Mic,
  MicOff,
  Radio,
  Activity,
  BarChart2,
  Database,
  GitBranch,
  Loader2,
  CheckCircle2,
  XCircle,
  Volume2,
  Cpu,
  Wifi,
  Shield,
  RotateCcw,
} from "lucide-react";
import { getVoiceInteractionManager } from "@/lib/voice-platform/VoiceInteractionManager";
import { getVoicePermissionManager } from "@/lib/voice-platform/VoicePermissionManager";
import { getVoiceMicrophoneManager } from "@/lib/voice-platform/VoiceMicrophoneManager";
import { getVoiceAnalyzer } from "@/lib/voice-platform/VoiceAnalyzer";
import { getVoicePlayback } from "@/lib/voice-platform/VoicePlayback";
import { getVoiceMetrics } from "@/lib/voice-platform/VoiceMetrics";
import VoiceVisualizer from "@/components/voice/VoiceVisualizer";
import { runVIPTests } from "@/lib/voice-platform/vipTests";

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Badge({ children, color = "zinc" }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
    zinc: "bg-zinc-100 text-zinc-600",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color = "violet" }) {
  const colors = { violet: "text-violet-500 bg-violet-50", emerald: "text-emerald-500 bg-emerald-50", amber: "text-amber-500 bg-amber-50", blue: "text-blue-500 bg-blue-50", zinc: "text-zinc-500 bg-zinc-100" };
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-lg font-bold text-zinc-800 font-heading">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function TestRow({ result }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-50 last:border-0">
      {result.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      <span className={`text-sm flex-1 ${result.passed ? "text-zinc-700" : "text-red-700"}`}>{result.name}</span>
      <span className="text-xs text-zinc-400">{result.durationMs}ms</span>
    </div>
  );
}

// ─── Phase700Page ─────────────────────────────────────────────────────────────

export default function Phase700Page() {
  const [activeTab, setActiveTab] = useState("overview");
  const [vimState, setVimState] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [devices, setDevices] = useState([]);
  const [waveform, setWaveform] = useState(null);
  const [testReport, setTestReport] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [voices, setVoices] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const manager = getVoiceInteractionManager();
    manager.init().then(() => {
      const unsub = manager.subscribe(setVimState);
      return unsub;
    });

    const mic = getVoiceMicrophoneManager();
    mic.enumerateDevices().then(setDevices);
    mic.subscribe((d) => setDevices(d));

    const analyzer = getVoiceAnalyzer();
    analyzer.subscribe(setWaveform);

    const pb = getVoicePlayback();
    setVoices(pb.getVoices("pt"));
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => setVoices(pb.getVoices("pt"));
    }

    loadMetrics();
  }, []);

  const loadMetrics = () => {
    const m = getVoiceMetrics();
    setMetrics(m.compute());
    setSessions(m.history.slice().reverse().slice(0, 20));
  };

  const runTests = async () => {
    setTestRunning(true);
    setTestReport(null);
    try {
      const report = await runVIPTests();
      setTestReport(report);
    } catch (e) {
      setTestReport({ error: e.message });
    } finally {
      setTestRunning(false);
      loadMetrics();
    }
  };

  const permColor = {
    GRANTED: "green", DENIED: "red", BLOCKED: "red", REQUESTING: "yellow", UNKNOWN: "zinc",
  }[vimState?.permission ?? "UNKNOWN"] ?? "zinc";

  const tabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "waveform", label: "Waveform", icon: Radio },
    { id: "devices", label: "Dispositivos", icon: Cpu },
    { id: "playback", label: "Playback", icon: Volume2 },
    { id: "sessions", label: "Sessoes", icon: Database },
    { id: "metrics", label: "Metricas", icon: BarChart2 },
    { id: "tests", label: "Testes", icon: GitBranch },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-violet-600 flex items-center justify-center">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-heading text-zinc-900">Voice Center</h1>
            <p className="text-xs text-zinc-500">Sprint 7.0.0 · Voice Interaction Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={permColor}>{vimState?.permission ?? "UNKNOWN"}</Badge>
          <Badge color={["idle", "completed", "cancelled"].includes(vimState?.phase ?? "idle") ? "zinc" : "violet"}>
            {vimState?.phase ?? "idle"}
          </Badge>
          <button onClick={loadMetrics} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Mic} label="Total Sessoes" value={metrics?.totalSessions ?? 0} color="violet" />
        <StatCard icon={Activity} label="Duracao Media" value={metrics?.avgRecordingDuration ? `${Math.round(metrics.avgRecordingDuration / 1000)}s` : "—"} color="blue" />
        <StatCard icon={Wifi} label="Latencia STT" value={metrics?.avgTranscriptionLatency ? `${metrics.avgTranscriptionLatency}ms` : "—"} color="emerald" />
        <StatCard icon={Shield} label="Cancelamentos" value={metrics?.cancelledSessions ?? 0} color="amber" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${activeTab === tab.id ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"}`}>
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* VIP Architecture */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Arquitetura VIP</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { name: "VoicePermissionManager", desc: "Unica solicitacao de permissao", status: "active" },
                { name: "VoiceMicrophoneManager", desc: "MediaStream persistente", status: "active" },
                { name: "VoiceRecorder", desc: "MediaRecorder puro", status: "active" },
                { name: "VoiceAnalyzer", desc: "AudioContext + AnalyserNode", status: "active" },
                { name: "VoiceVisualizer", desc: "Bars / Wave / Orb", status: "active" },
                { name: "VoiceSession", desc: "Telemetria por sessao", status: "active" },
                { name: "VoicePlayback", desc: "TTS centralizado", status: "active" },
                { name: "VoiceMetrics", desc: "Metricas automaticas", status: "active" },
                { name: "VoiceInteractionManager", desc: "API publica unica", status: "active" },
              ].map((m) => (
                <div key={m.name} className="border border-zinc-100 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <p className="text-xs font-semibold text-zinc-800">{m.name}</p>
                  </div>
                  <p className="text-xs text-zinc-400">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Live state */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Estado Atual</h3>
            {vimState ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Fase</span><Badge color={vimState.phase === "error" ? "red" : vimState.phase === "listening" ? "red" : vimState.phase === "idle" ? "zinc" : "violet"}>{vimState.phase}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Permissao</span><Badge color={permColor}>{vimState.permission}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Suportado</span><Badge color={vimState.isSupported ? "green" : "red"}>{vimState.isSupported ? "Sim" : "Nao"}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Speaking</span><Badge color={vimState.isSpeaking ? "emerald" : "zinc"}>{vimState.isSpeaking ? "Sim" : "Nao"}</Badge></div>
                <div className="flex justify-between"><span className="text-zinc-500">Elapsed</span><span className="font-medium">{vimState.elapsedMs}ms</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Interim</span><span className="text-xs text-zinc-400 truncate max-w-[120px]">{vimState.interimText || "—"}</span></div>
              </div>
            ) : <p className="text-sm text-zinc-400">Inicializando...</p>}
          </div>

          {/* Approval criteria */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Criterios de Aprovacao</h3>
            <ul className="space-y-2">
              {[
                "Uma unica solicitacao de permissao por sessao",
                "MediaStream persistente entre gravacoes",
                "VoiceButton sem estado proprio",
                "VoicePipeline utiliza apenas a nova plataforma",
                "Waveform em tempo real via AnalyserNode",
                "Cronometro funcional durante gravacao",
                "Cancelar e Enviar independentes",
                "VoiceMode reutiliza toda a infraestrutura",
                "Toda captura passa pela Voice Interaction Platform",
              ].map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm text-zinc-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Waveform ── */}
      {activeTab === "waveform" && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-4">Visualizador em Tempo Real</h3>
            <p className="text-xs text-zinc-400 mb-4">Inicie uma gravacao no Chat para ver os dados em tempo real.</p>

            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">Barras</p>
                <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-center h-20">
                  <VoiceVisualizer mode="bars" waveform={waveform} phase={vimState?.phase ?? "idle"} width={400} height={48} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">Onda</p>
                <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-center h-20">
                  <VoiceVisualizer mode="wave" waveform={waveform} phase={vimState?.phase ?? "idle"} width={400} height={48} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">Orb</p>
                <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-center h-24">
                  <VoiceVisualizer mode="orb" waveform={waveform} phase={vimState?.phase ?? "idle"} />
                </div>
              </div>
            </div>

            {waveform && (
              <div className="grid grid-cols-3 gap-3 mt-4 text-xs text-center">
                <div className="bg-zinc-50 rounded-lg p-3"><p className="text-zinc-400">Amplitude</p><p className="font-bold text-zinc-800">{waveform.amplitude.toFixed(3)}</p></div>
                <div className="bg-zinc-50 rounded-lg p-3"><p className="text-zinc-400">Peak</p><p className="font-bold text-zinc-800">{waveform.peak.toFixed(3)}</p></div>
                <div className="bg-zinc-50 rounded-lg p-3"><p className="text-zinc-400">Frequencia</p><p className="font-bold text-zinc-800">{Math.round(waveform.frequency)}Hz</p></div>
                <div className="bg-zinc-50 rounded-lg p-3"><p className="text-zinc-400">Energia</p><p className="font-bold text-zinc-800">{waveform.energy.toFixed(3)}</p></div>
                <div className="bg-zinc-50 rounded-lg p-3"><p className="text-zinc-400">Ruido</p><p className="font-bold text-zinc-800">{waveform.noiseLevel.toFixed(3)}</p></div>
                <div className="bg-zinc-50 rounded-lg p-3"><p className="text-zinc-400">FFT Bins</p><p className="font-bold text-zinc-800">{waveform.bars.length}</p></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Devices ── */}
      {activeTab === "devices" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Dispositivos de Audio</h3>
          {devices.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhum dispositivo disponivel. Conceda permissao de microfone.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.deviceId} className="flex items-center gap-3 p-3 border border-zinc-100 rounded-lg">
                  <Mic className="w-4 h-4 text-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-700 truncate">{d.label}</p>
                    <p className="text-xs text-zinc-400 font-mono truncate">{d.deviceId.slice(0, 20)}...</p>
                  </div>
                  {d.deviceId === getVoiceMicrophoneManager().deviceId && (
                    <Badge color="green">Ativo</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 p-4 bg-violet-50 rounded-xl border border-violet-100">
            <p className="text-xs font-semibold text-violet-700 mb-1">MediaStream Persistente</p>
            <p className="text-xs text-zinc-500">
              O VoiceMicrophoneManager mantem o MediaStream ativo entre gravacoes,
              evitando re-prompts de permissao e reducao de latencia de inicializacao.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge color={getVoiceMicrophoneManager().isReady ? "green" : "zinc"}>
                {getVoiceMicrophoneManager().isReady ? "Stream Ativo" : "Sem Stream"}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* ── Playback ── */}
      {activeTab === "playback" && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-3">Vozes TTS Disponiveis (pt)</h3>
            {voices.length === 0 ? (
              <p className="text-sm text-zinc-400">Nenhuma voz portuguesa encontrada. Verifique as configuracoes do sistema.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {voices.map((v) => (
                  <div key={v.voiceURI} className="flex items-center gap-3 p-2 border border-zinc-100 rounded-lg">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-700">{v.name}</p>
                      <p className="text-xs text-zinc-400">{v.lang} · {v.localService ? "Local" : "Remota"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-800 mb-2">Controles TTS</h3>
            <p className="text-xs text-zinc-400">Rate · Pitch · Volume · Voice configurados via VoicePlayback.setRate() / setPitch() / setVolume()</p>
          </div>
        </div>
      )}

      {/* ── Sessions ── */}
      {activeTab === "sessions" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Historico de Sessoes</h3>
          {sessions.length === 0 ? (
            <p className="text-sm text-zinc-400">Nenhuma sessao registrada. Utilize o Voice Panel no Chat.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.sessionId} className="p-3 border border-zinc-100 rounded-lg text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-zinc-400">{s.sessionId.slice(-12)}</span>
                    <Badge color={s.cancelled ? "yellow" : s.error ? "red" : "green"}>
                      {s.cancelled ? "Cancelado" : s.error ? "Erro" : "OK"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-zinc-500">
                    <span>Duracao: {Math.round(s.duration / 1000)}s</span>
                    <span>Palavras: {s.wordsRecognized}</span>
                    <span>Peak: {s.peakAmplitude.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Metrics ── */}
      {activeTab === "metrics" && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Metricas Consolidadas</h3>
          {metrics ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Total Sessoes", metrics.totalSessions],
                ["Bem-sucedidas", metrics.successfulSessions],
                ["Canceladas", metrics.cancelledSessions],
                ["Falhas", metrics.failedSessions],
                ["Duracao Media", `${Math.round(metrics.avgRecordingDuration / 1000)}s`],
                ["Latencia STT", `${metrics.avgTranscriptionLatency}ms`],
                ["Amplitude Media", metrics.avgAmplitude.toFixed(3)],
                ["Peak Medio", metrics.avgPeak.toFixed(3)],
                ["Palavras/sessao", metrics.avgWordsPerSession],
                ["Tempo Total", `${Math.round(metrics.totalRecordingTime / 1000)}s`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-zinc-50 pb-2">
                  <span className="text-zinc-500">{k}</span>
                  <span className="font-medium text-zinc-800">{v}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-zinc-400">Sem dados.</p>}
        </div>
      )}

      {/* ── Tests ── */}
      {activeTab === "tests" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={runTests} disabled={testRunning}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition">
              {testRunning ? <><Loader2 className="w-4 h-4 animate-spin" /> Executando...</> : <><GitBranch className="w-4 h-4" /> Executar Suite VIP</>}
            </button>
            {testReport && !testReport.error && (
              <Badge color={testReport.verdict === "PASS" ? "green" : "red"}>
                {testReport.verdict} — {testReport.totalPassed}/{testReport.totalTests}
              </Badge>
            )}
          </div>

          {testReport?.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{testReport.error}</p>
            </div>
          )}

          {testReport && !testReport.error && (
            <>
              <div className={`rounded-xl p-4 border ${testReport.verdict === "PASS" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <p className={`text-sm font-bold ${testReport.verdict === "PASS" ? "text-emerald-700" : "text-red-700"}`}>
                  {testReport.architecturalStatus}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {testReport.totalPassed} aprovados · {testReport.totalFailed} reprovados · {testReport.durationMs}ms
                </p>
              </div>

              {testReport.suites.map((suite) => (
                <div key={suite.suite} className="bg-white border border-zinc-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-zinc-800">{suite.suite}</h4>
                    <div className="flex items-center gap-2">
                      <Badge color={suite.failed === 0 ? "green" : "red"}>{suite.passed}/{suite.total}</Badge>
                      <span className="text-xs text-zinc-400">{suite.durationMs}ms</span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {suite.results.map((r) => <TestRow key={r.name} result={r} />)}
                  </div>
                  {suite.results.filter((r) => !r.passed).map((r) => (
                    <div key={r.name} className="mt-2 bg-red-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-red-700">{r.name}</p>
                      <p className="text-xs text-red-500 mt-1">{r.error}</p>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}