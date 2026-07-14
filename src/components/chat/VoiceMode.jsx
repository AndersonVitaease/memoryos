/**
 * VoiceMode.jsx — Voice Interaction Platform (VIP) consumer
 * Sprint 7.0.0: All voice logic delegated to VoiceInteractionManager.
 * No internal pipeline, no MediaRecorder, no AudioContext.
 */

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useVoiceInteraction } from "@/lib/voice-platform/useVoiceInteraction";
import VoiceVisualizer from "@/components/voice/VoiceVisualizer";

const PHASE_LABELS = {
  idle: "Toque para falar",
  listening: "Ouvindo...",
  transcribing: "Convertendo...",
  retrieving: "Consultando memoria...",
  generating: "Gerando resposta...",
  speaking: "Respondendo...",
  completed: "Concluido",
  cancelled: "Cancelado",
  error: "Erro",
};

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function VoiceMode({ onSendAndReceive, onClose }) {
  const [lastResponse, setLastResponse] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");

  const handleSend = async (text, opts) => {
    setLastTranscript(text);
    opts?.setPhase?.("generating");
    const response = await onSendAndReceive?.(text);
    setLastResponse(response ?? "");
    return response;
  };

  const voice = useVoiceInteraction({ onSend: handleSend });

  const handleOrbPress = () => {
    if (voice.phase === "idle") {
      voice.startCapture();
    } else if (voice.phase === "listening") {
      voice.stopCapture();
    } else if (voice.isSpeaking) {
      voice.stopSpeaking();
    } else if (["transcribing", "retrieving", "generating"].includes(voice.phase)) {
      voice.cancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col items-center justify-center">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Orb visualizer — tappable */}
      <button
        onClick={handleOrbPress}
        className="focus:outline-none mb-6"
        aria-label={PHASE_LABELS[voice.phase] ?? ""}
      >
        <VoiceVisualizer
          mode="orb"
          waveform={voice.waveform}
          phase={voice.phase}
        />
      </button>

      {/* Phase label */}
      <p className="text-sm font-medium text-zinc-300 mb-2">
        {voice.error ? voice.error : (PHASE_LABELS[voice.phase] ?? "")}
      </p>

      {/* Timer (during listening) */}
      {voice.phase === "listening" && (
        <p className="text-xs font-mono text-zinc-500 mb-4">
          {formatTime(voice.elapsedMs)}
        </p>
      )}

      {/* Interim text */}
      {voice.interimText && (
        <p className="text-sm text-zinc-400 italic mb-4 max-w-sm text-center px-4">
          {voice.interimText}
        </p>
      )}

      {/* Last transcript */}
      {lastTranscript && !voice.interimText && (
        <div className="mb-4 px-6 max-w-sm w-full">
          <p className="text-xs text-zinc-500 mb-1">Voce disse:</p>
          <p className="text-sm text-zinc-300">{lastTranscript}</p>
        </div>
      )}

      {/* Last response */}
      {lastResponse && (
        <div className="mb-6 px-6 max-w-sm w-full">
          <p className="text-xs text-zinc-500 mb-1">Resposta:</p>
          <div className="text-sm text-zinc-200 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{lastResponse}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Waveform bar (listening) */}
      {voice.phase === "listening" && (
        <div className="mb-6 w-64">
          <VoiceVisualizer
            mode="bars"
            waveform={voice.waveform}
            phase={voice.phase}
            color="#ef4444"
            width={256}
            height={32}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {voice.phase === "listening" && (
          <>
            <button
              onClick={voice.cancel}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:bg-zinc-800 transition"
            >
              Cancelar
            </button>
            <button
              onClick={voice.stopCapture}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-100 transition"
            >
              Enviar
            </button>
          </>
        )}
        {voice.isSpeaking && (
          <button
            onClick={voice.stopSpeaking}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:bg-zinc-800 transition"
          >
            Parar resposta
          </button>
        )}
        {voice.phase === "idle" && !voice.isSpeaking && (
          <p className="text-xs text-zinc-600">Toque no orb para falar</p>
        )}
      </div>
    </div>
  );
}