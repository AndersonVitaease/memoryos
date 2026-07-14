/**
 * VoiceInteractionManager.ts — Voice Interaction Platform (VIP)
 * Single public API for the entire voice platform.
 * Coordinates: Permission → Microphone → Recorder → Analyzer → Playback → Session → Metrics
 */

import type { VoicePipelinePhase, WaveformData, PermissionState, VoiceSession as IVoiceSession } from "./VoiceTypes";
import { getVoicePermissionManager } from "./VoicePermissionManager";
import { getVoiceMicrophoneManager } from "./VoiceMicrophoneManager";
import { getVoiceRecorder } from "./VoiceRecorder";
import type { RecorderResult } from "./VoiceRecorder";
import { getVoiceAnalyzer } from "./VoiceAnalyzer";
import { getVoicePlayback } from "./VoicePlayback";
import { VoiceSessionObject } from "./VoiceSession";
import { getVoiceMetrics } from "./VoiceMetrics";
import { transcribeAudioBlob } from "@/lib/audioTranscription";

const LOG = "[VIP:Manager]";
function log(...a: unknown[]) { console.log(LOG, ...a); }

export interface VIMState {
  phase: VoicePipelinePhase;
  permission: PermissionState;
  waveform: WaveformData | null;
  interimText: string;
  elapsedMs: number;
  isSpeaking: boolean;
  error: string | null;
  isSupported: boolean;
  currentSession: IVoiceSession | null;
}

export interface SendOptions {
  setPhase?: (phase: string) => void;
}

type StateListener = (state: VIMState) => void;

const PHASE_ERRORS: Record<string, string> = {
  "not-allowed": "Permissao de microfone negada. Habilite nas configuracoes do navegador.",
  "not-supported": "Seu navegador nao suporta gravacao de voz.",
  "no-speech": "Nao detectei nenhuma fala. Tente novamente.",
  "empty": "Nao detectei nenhuma fala. Tente novamente.",
  "timeout": "A operacao demorou demais. Tente novamente.",
  "network": "Erro de rede. Verifique sua conexao.",
  "default": "Algo deu errado. Tente novamente.",
};

class VoiceInteractionManager {
  // Sub-managers
  private _perm = getVoicePermissionManager();
  private _mic = getVoiceMicrophoneManager();
  private _recorder = getVoiceRecorder();
  private _analyzer = getVoiceAnalyzer();
  private _playback = getVoicePlayback();
  private _metrics = getVoiceMetrics();

  // State
  private _phase: VoicePipelinePhase = "idle";
  private _waveform: WaveformData | null = null;
  private _interimText = "";
  private _error: string | null = null;
  private _currentSession: VoiceSessionObject | null = null;
  private _aborted = false;
  private _processing = false;
  private _elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private _elapsedMs = 0;
  private _recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  // SR
  private _recognition: SpeechRecognition | null = null;
  private _accumulated = "";
  private _lastInterim = "";

  // Listeners
  private _listeners = new Set<StateListener>();

  // Public send callback (set by consumer)
  public onSend?: (text: string, opts: SendOptions) => Promise<string | null>;

  get state(): VIMState {
    return {
      phase: this._phase,
      permission: this._perm.state,
      waveform: this._waveform,
      interimText: this._interimText,
      elapsedMs: this._elapsedMs,
      isSpeaking: this._playback.isPlaying,
      error: this._error,
      isSupported: this._checkSupported(),
      currentSession: this._currentSession?.toSnapshot() ?? null,
    };
  }

  subscribe(fn: StateListener): () => void {
    this._listeners.add(fn);
    fn(this.state);
    return () => this._listeners.delete(fn);
  }

  private _emit() {
    const s = this.state;
    this._listeners.forEach((fn) => fn(s));
  }

  private _setPhase(phase: VoicePipelinePhase) {
    this._phase = phase;
    this._emit();
    log("Phase →", phase);
  }

  private _checkSupported(): boolean {
    const hasSR = !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
    const hasMR = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    return hasSR || hasMR;
  }

  /** Initialize: query permission without prompting. */
  async init(): Promise<void> {
    await this._perm.query();
    this._perm.subscribe(() => this._emit());
    this._analyzer.subscribe((data) => {
      this._waveform = data;
      this._currentSession?.recordAmplitude(data.amplitude, data.peak, data.noiseLevel);
      this._emit();
    });
    log("Initialized, permission:", this._perm.state);
  }

  // ─── Capture ────────────────────────────────────────────────────────────────

  async startCapture(): Promise<void> {
    if (!this._checkSupported()) {
      this._setError("not-supported");
      return;
    }

    // Stop any ongoing playback
    this._playback.stop();

    // Reset state
    this._aborted = false;
    this._processing = false;
    this._accumulated = "";
    this._lastInterim = "";
    this._interimText = "";
    this._error = null;
    if (this._recoveryTimer) { clearTimeout(this._recoveryTimer); this._recoveryTimer = null; }

    // Acquire microphone (persistent — reuses existing stream)
    const ok = await this._mic.acquire();
    if (!ok) {
      this._setError("not-allowed");
      return;
    }

    const stream = this._mic.stream!;

    // Connect analyzer for waveform
    this._analyzer.connect(stream);
    await this._analyzer.resume();

    // Create session
    this._currentSession = new VoiceSessionObject(this._mic.deviceId, "pt-BR");

    // Start recorder (for fallback)
    this._recorder.start(stream);

    // Start SpeechRecognition
    this._startSR();

    // Start elapsed timer
    this._startElapsedTimer();

    this._setPhase("listening");
    log("Capture started");
  }

  stopCapture(): void {
    this._stopSR();
    this._setPhase("transcribing");
    this._stopElapsedTimer();

    // Safety-net: if SR onend doesn't fire in 2s
    setTimeout(() => {
      if (this._phase === "transcribing" && !this._processing) {
        log("Safety-net fired");
        if (!this._accumulated.trim() && this._lastInterim.trim()) {
          this._accumulated = this._lastInterim.trim();
        }
        this._process();
      }
    }, 2000);
  }

  cancel(): void {
    this._aborted = true;
    this._stopSR();
    this._recorder.cancel();
    this._stopElapsedTimer();
    this._playback.stop();
    this._processing = false;
    this._accumulated = "";
    this._lastInterim = "";
    this._interimText = "";
    this._currentSession?.end({ cancelled: true });
    if (this._currentSession) {
      this._metrics.record(this._currentSession.toSnapshot());
      this._currentSession = null;
    }
    this._setPhase("cancelled");
    this._scheduleIdle(400);
    log("Cancelled");
  }

  stopSpeaking(): void {
    this._playback.stop();
    if (this._phase === "speaking") this._setPhase("idle");
  }

  // ─── SpeechRecognition ──────────────────────────────────────────────────────

  private _startSR() {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "pt-BR";

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) { this._lastInterim = interim; this._interimText = interim; this._emit(); }
      if (final) { this._accumulated += (this._accumulated ? " " : "") + final; this._lastInterim = ""; this._interimText = ""; this._emit(); }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") this._setError("not-allowed");
      else if (e.error === "network") this._setError("network");
    };

    rec.onend = () => {
      if (this._aborted) return;
      if (!this._accumulated.trim() && this._lastInterim.trim()) {
        this._accumulated = this._lastInterim.trim();
      }
      if (this._phase === "transcribing") this._process();
    };

    try { rec.start(); this._recognition = rec; } catch (e) { log("SR start failed:", e); }
  }

  private _stopSR() {
    if (this._recognition) {
      try { this._recognition.onresult = null; this._recognition.onerror = null; this._recognition.onend = null; this._recognition.stop(); } catch { /* noop */ }
      this._recognition = null;
    }
  }

  // ─── Processing ─────────────────────────────────────────────────────────────

  private async _process() {
    if (this._processing || this._aborted) return;
    this._processing = true;

    const stTime = Date.now();

    // Get audio blob
    let blob: Blob | null = null;
    try { const result = await this._recorder.stop(); blob = result.blob; } catch { /* noop */ }

    let text = this._accumulated.trim() || this._lastInterim.trim();
    this._accumulated = "";
    this._lastInterim = "";
    this._interimText = "";

    // Whisper fallback
    if (!text && blob && blob.size > 0) {
      log("SR empty — Whisper fallback");
      try { text = await transcribeAudioBlob(blob); } catch (e) { log("Whisper failed:", e); }
    }

    if (!text) {
      this._processing = false;
      this._currentSession?.end({ error: "empty" });
      if (this._currentSession) this._metrics.record(this._currentSession.toSnapshot());
      this._currentSession = null;
      this._setError("empty");
      return;
    }

    const latencyMs = Date.now() - stTime;
    this._currentSession?.recordTranscriptionLatency(latencyMs);
    this._currentSession?.recordWords(text.split(/\s+/).length);

    if (this._aborted) { this._processing = false; this._setPhase("idle"); return; }

    // Delegate to onSend
    this._setPhase("retrieving");

    try {
      const response = await this.onSend?.(text, {
        setPhase: (p) => {
          if (!this._aborted && !["idle", "error", "cancelled"].includes(this._phase)) {
            this._setPhase(p as VoicePipelinePhase);
          }
        },
      });

      if (this._aborted) { this._processing = false; this._setPhase("idle"); return; }

      this._currentSession?.end();
      if (this._currentSession) this._metrics.record(this._currentSession.toSnapshot());
      this._currentSession = null;
      this._processing = false;

      if (response) {
        this._setPhase("speaking");
        this._playback.speak(response, {
          onEnd: () => {
            if (this._phase === "speaking") {
              this._setPhase("completed");
              this._scheduleIdle(300);
            }
          },
        });
      } else {
        this._setPhase("idle");
      }
    } catch {
      this._processing = false;
      this._currentSession?.end({ error: "processing-error" });
      if (this._currentSession) this._metrics.record(this._currentSession.toSnapshot());
      this._currentSession = null;
      this._setError("default");
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private _startElapsedTimer() {
    this._elapsedMs = 0;
    this._elapsedTimer = setInterval(() => {
      this._elapsedMs += 100;
      this._emit();
    }, 100);
  }

  private _stopElapsedTimer() {
    if (this._elapsedTimer) { clearInterval(this._elapsedTimer); this._elapsedTimer = null; }
  }

  private _setError(type: string) {
    this._stopElapsedTimer();
    this._error = PHASE_ERRORS[type] ?? PHASE_ERRORS.default;
    this._setPhase("error");
    this._scheduleIdle(3500);
  }

  private _scheduleIdle(ms: number) {
    if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
    this._recoveryTimer = setTimeout(() => {
      if (["error", "cancelled", "completed"].includes(this._phase)) {
        this._error = null;
        this._setPhase("idle");
      }
    }, ms);
  }

  getMetrics() { return this._metrics.compute(); }
  getSessionHistory() { return this._metrics.history; }
}

export function getVoiceInteractionManager(): VoiceInteractionManager {
  if (!(globalThis as any).__VIP_MANAGER__) {
    (globalThis as any).__VIP_MANAGER__ = new VoiceInteractionManager();
  }
  return (globalThis as any).__VIP_MANAGER__;
}