/**
 * VoicePanel.jsx — Voice Interaction Platform (VIP)
 * Replaces the bare VoiceButton with a full panel:
 * Waveform · Timer · Status · Cancel · Send
 * Consumes VoiceInteractionManager — no internal state.
 */

import React from "react";
import { Mic, MicOff, Send, X, Volume2, Loader2, CheckCircle } from "lucide-react";
import VoiceVisualizer from "./VoiceVisualizer";

const PHASE_LABELS = {
  idle: "",
  listening: "Ouvindo...",
  transcribing: "Convertendo...",
  retrieving: "Consultando memoria...",
  generating: "Gerando resposta...",
  speaking: "Respondendo...",
  completed: "Concluido",
  cancelled: "",
  error: "",
};

const PHASE_COLORS = {
  listening: "border-red-300 bg-red-50",
  transcribing: "border-violet-200 bg-violet-50",
  retrieving: "border-violet-200 bg-violet-50",
  generating: "border-violet-200 bg-violet-50",
  speaking: "border-emerald-200 bg-emerald-50",
  error: "border-red-200 bg-red-50",
};

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ── Idle button (tap to activate) ─────────────────────────────────────────────

function IdleButton({ onPress, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPress}
      className="p-3 rounded-2xl bg-zinc-100 text-zinc-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30 transition-all"
      title="Gravar voz"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}

// ── Active panel ──────────────────────────────────────────────────────────────

function ActivePanel({ phase, waveform, elapsedMs, interimText, error, onCancel, onSend, isSpeaking, stopSpeaking }) {
  const panelColor = PHASE_COLORS[phase] ?? "border-zinc-200 bg-white";
  const label = PHASE_LABELS[phase] ?? "";
  const isListening = phase === "listening";
  const isProcessing = ["transcribing", "retrieving", "generating"].includes(phase);

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-2xl border transition-all ${panelColor}`}>
      {/* Top row: status + timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isListening && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
          {isProcessing && <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin shrink-0" />}
          {isSpeaking && <Volume2 className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />}
          <span className="text-xs font-medium text-zinc-600">
            {error ? error : label}
          </span>
        </div>
        {isListening && (
          <span className="text-xs font-mono text-zinc-400">{formatTime(elapsedMs)}</span>
        )}
      </div>

      {/* Waveform */}
      {(isListening || isProcessing) && (
        <VoiceVisualizer
          mode="bars"
          waveform={waveform}
          phase={phase}
          width={220}
          height={36}
        />
      )}

      {/* Interim text */}
      {interimText && (
        <p className="text-xs text-zinc-500 italic truncate">{interimText}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 justify-end">
        {isSpeaking ? (
          <button
            type="button"
            onClick={stopSpeaking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition"
          >
            <X className="w-3.5 h-3.5" />
            Parar
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-200 transition"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </button>

            {isListening && (
              <button
                type="button"
                onClick={onSend}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── VoicePanel (main export) ──────────────────────────────────────────────────

export default function VoicePanel({
  phase,
  waveform,
  elapsedMs,
  interimText,
  error,
  isSpeaking,
  isSupported,
  isLoading,     // from conversation
  onStart,
  onStop,
  onCancel,
  stopSpeaking,
}) {
  const isActive = !["idle", "cancelled", "completed"].includes(phase) || isSpeaking;

  if (!isSupported) return null;

  if (!isActive) {
    return (
      <IdleButton
        onPress={onStart}
        disabled={isLoading}
      />
    );
  }

  return (
    <ActivePanel
      phase={phase}
      waveform={waveform}
      elapsedMs={elapsedMs}
      interimText={interimText}
      error={error}
      isSpeaking={isSpeaking}
      onCancel={onCancel}
      onSend={onStop}
      stopSpeaking={stopSpeaking}
    />
  );
}