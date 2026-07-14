/**
 * VoicePanel.jsx — Voice Experience Platform (VXP)
 * Sprint 7.0.1: Full UX upgrade.
 * - Permission-aware: never re-prompts when GRANTED
 * - Inline expanded panel during recording
 * - Transcription review before send
 * - Keyboard shortcuts: Space=start/stop, ESC=cancel, Enter=send
 * - Accessibility: aria-labels, role, keyboard
 * - All logic stays in VIP — panel is pure render
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import {
  Mic, Send, X, Volume2, Loader2, CheckCircle,
  Edit3, AlertCircle,
} from "lucide-react";
import VoiceVisualizer from "./VoiceVisualizer";

// ─── Phase label map — Sprint 7.0.1 ──────────────────────────────────────────

const PHASE_LABELS = {
  idle: "",
  listening: "Gravando...",
  transcribing: "Processando audio...",
  retrieving: "Recuperando memoria...",
  generating: "Consultando especialistas...",
  speaking: "Respondendo...",
  completed: "Concluido",
  cancelled: "",
  error: "",
};

const PHASE_ARIA = {
  idle: "Iniciar gravacao de voz",
  listening: "Gravando — pressione Enviar ou ESC para cancelar",
  transcribing: "Processando audio gravado",
  retrieving: "Recuperando memoria",
  generating: "Gerando resposta",
  speaking: "Reproduzindo resposta",
};

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Idle Mic Button ─────────────────────────────────────────────────────────

function IdleButton({ onPress, disabled, permission }) {
  const isBlocked = permission === "BLOCKED" || permission === "DENIED";

  return (
    <button
      type="button"
      disabled={disabled || isBlocked}
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      aria-label={PHASE_ARIA.idle}
      title={isBlocked ? "Permissao de microfone bloqueada" : "Gravar voz (Space)"}
      className={`p-3 rounded-2xl transition-all focus:outline-none focus:ring-2 focus:ring-violet-400 ${
        isBlocked
          ? "bg-red-50 text-red-300 cursor-not-allowed"
          : "bg-zinc-100 text-zinc-500 hover:bg-violet-50 hover:text-violet-600 active:scale-95 disabled:opacity-30"
      }`}
    >
      {isBlocked ? <AlertCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
    </button>
  );
}

// ─── Transcription Review Panel (post-recording) ─────────────────────────────

function TranscriptionReview({ transcript, onSend, onCancel, onEdit }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl border border-violet-200 bg-violet-50 min-w-[280px]">
      <div className="flex items-start gap-2">
        <CheckCircle className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
        <p className="text-xs font-medium text-violet-700">Transcricao</p>
      </div>
      <p className="text-sm text-zinc-700 leading-relaxed px-1">{transcript}</p>
      <div className="flex items-center gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar envio"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-200 transition focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <X className="w-3 h-3" />
          Cancelar
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar transcricao"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-200 transition focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <Edit3 className="w-3 h-3" />
          Editar
        </button>
        <button
          type="button"
          onClick={onSend}
          aria-label="Confirmar e enviar"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          <Send className="w-3 h-3" />
          Enviar
        </button>
      </div>
    </div>
  );
}

// ─── Active Recording Panel ────────────────────────────────────────────────────

function RecordingPanel({ phase, waveform, elapsedMs, interimText, error, onCancel, onSend, isSpeaking, stopSpeaking }) {
  const isListening = phase === "listening";
  const isProcessing = ["transcribing", "retrieving", "generating"].includes(phase);
  const label = error || PHASE_LABELS[phase] || "";

  const panelClass = isSpeaking
    ? "border-emerald-200 bg-emerald-50"
    : isListening
    ? "border-red-200 bg-red-50"
    : "border-violet-200 bg-violet-50";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={PHASE_ARIA[phase] ?? label}
      className={`flex flex-col gap-2 p-3 rounded-2xl border transition-all min-w-[240px] ${panelClass}`}
    >
      {/* Status row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isListening && (
            <div
              className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"
              aria-hidden="true"
            />
          )}
          {isProcessing && (
            <Loader2
              className="w-3.5 h-3.5 text-violet-500 animate-spin shrink-0"
              aria-hidden="true"
            />
          )}
          {isSpeaking && (
            <Volume2
              className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0"
              aria-hidden="true"
            />
          )}
          <span className="text-xs font-medium text-zinc-700">{label}</span>
        </div>

        {isListening && (
          <span className="text-xs font-mono tabular-nums text-zinc-500" aria-label={`Tempo gravado: ${formatTime(elapsedMs)}`}>
            {formatTime(elapsedMs)}
          </span>
        )}
      </div>

      {/* Waveform — real data from VoiceAnalyzer */}
      {(isListening || isProcessing) && (
        <div aria-hidden="true">
          <VoiceVisualizer
            mode="bars"
            waveform={waveform}
            phase={phase}
            width={220}
            height={36}
            animated
          />
        </div>
      )}

      {/* Interim speech recognition text */}
      {interimText && (
        <p className="text-xs text-zinc-500 italic truncate" aria-live="polite">
          {interimText}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        {isSpeaking ? (
          <button
            type="button"
            onClick={stopSpeaking}
            aria-label="Parar resposta"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <X className="w-3.5 h-3.5" />
            Parar
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancelar gravacao (ESC)"
              title="Cancelar (ESC)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-200 transition focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </button>

            {isListening && (
              <button
                type="button"
                onClick={onSend}
                aria-label="Enviar gravacao (Enter)"
                title="Enviar (Enter)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-zinc-700"
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

// ─── VoicePanel (main export) ─────────────────────────────────────────────────

export default function VoicePanel({
  phase,
  waveform,
  elapsedMs,
  interimText,
  error,
  isSpeaking,
  isSupported,
  isLoading,
  permission,
  onStart,
  onStop,
  onCancel,
  stopSpeaking,
  // Transcription review (VXP Sprint 7.0.1)
  pendingTranscript,
  onConfirmTranscript,
  onCancelTranscript,
  onEditTranscript,
}) {
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // ESC → cancel
      if (e.key === "Escape") {
        if (phase === "listening" || isSpeaking) {
          e.preventDefault();
          if (isSpeaking) stopSpeaking?.();
          else onCancel?.();
        }
        if (pendingTranscript) {
          e.preventDefault();
          onCancelTranscript?.();
        }
      }
      // Enter → send (when listening or reviewing)
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (phase === "listening") {
          e.preventDefault();
          onStop?.();
        }
        if (pendingTranscript) {
          e.preventDefault();
          onConfirmTranscript?.();
        }
      }
      // Space → start/stop (only when no text input is focused)
      if (e.key === " " && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "INPUT") {
        if (phase === "idle" && !isLoading && isSupported) {
          e.preventDefault();
          onStart?.();
        } else if (phase === "listening") {
          e.preventDefault();
          onStop?.();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, isSpeaking, pendingTranscript, isLoading, isSupported, onStart, onStop, onCancel, stopSpeaking, onConfirmTranscript, onCancelTranscript]);

  if (!isSupported) return null;

  // Transcription review mode (after stop, before send)
  if (pendingTranscript) {
    return (
      <TranscriptionReview
        transcript={pendingTranscript}
        onSend={onConfirmTranscript}
        onCancel={onCancelTranscript}
        onEdit={onEditTranscript}
      />
    );
  }

  const isActive = !["idle", "cancelled", "completed"].includes(phase) || isSpeaking;

  if (!isActive) {
    return (
      <IdleButton
        onPress={onStart}
        disabled={isLoading}
        permission={permission}
      />
    );
  }

  return (
    <RecordingPanel
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