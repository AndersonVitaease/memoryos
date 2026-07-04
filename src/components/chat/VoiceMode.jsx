import React, { useState, useEffect } from "react";
import { X, Brain, Loader2, Mic, Volume2 } from "lucide-react";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useHaptics } from "@/hooks/useHaptics";
import ReactMarkdown from "react-markdown";

/**
 * Voice Mode — tela cheia para conversa contínua por voz.
 *
 * Fluxo:
 * 1. Abre e começa a escutar automaticamente
 * 2. Usuário fala → transcrição em tempo real
 * 3. Detecta fim da fala → envia para IA (Memory Pipeline)
 * 4. IA responde → exibe texto + reproduz em voz (TTS)
 * 5. Após TTS → volta a escutar automaticamente (loop contínuo)
 *
 * Interrupção: tocar no orb durante a fala da IA interrompe e volta a escutar.
 */
export default function VoiceMode({ onSendAndReceive, onClose }) {
  const [phase, setPhase] = useState("listening"); // listening | processing | speaking
  const [interimText, setInterimText] = useState("");
  const [aiText, setAiText] = useState("");

  const tts = useTextToSpeech();
  const haptics = useHaptics();

  const handleResult = (text) => {
    if (!text.trim()) return;
    haptics.feedback("end");
    setPhase("processing");
    setInterimText("");

    onSendAndReceive(text)
      .then((response) => {
        if (response) {
          setAiText(response);
          setPhase("speaking");
          tts.speak(response, {
            onEnd: () => {
              setPhase("listening");
              setAiText("");
              setTimeout(() => startListening(), 150);
            },
          });
        } else {
          setPhase("listening");
          setTimeout(() => startListening(), 150);
        }
      })
      .catch(() => {
        setPhase("listening");
        setTimeout(() => startListening(), 150);
      });
  };

  const { isListening, startListening, stopListening, isSupported } = useVoiceRecognition({
    onResult: handleResult,
    onInterim: (text) => setInterimText(text),
  });

  useEffect(() => {
    haptics.feedback("start");
    startListening();
    return () => {
      stopListening();
      tts.stopSpeaking();
    };
  }, []);

  const handleInterrupt = () => {
    tts.stopSpeaking();
    setPhase("listening");
    setAiText("");
    startListening();
  };

  const handleClose = () => {
    stopListening();
    tts.stopSpeaking();
    onClose();
  };

  const phaseConfig = {
    listening: {
      label: "Ouvindo...",
      orbClass: "bg-gradient-to-br from-violet-500 to-indigo-600",
      glowClass: "bg-violet-500/30",
      icon: Mic,
      iconClass: "text-white",
    },
    processing: {
      label: "Consultando memória...",
      orbClass: "bg-gradient-to-br from-amber-500 to-orange-600 scale-90",
      glowClass: "bg-amber-500/30",
      icon: Loader2,
      iconClass: "text-white animate-spin",
    },
    speaking: {
      label: "Respondendo...",
      orbClass: "bg-gradient-to-br from-emerald-500 to-teal-600",
      glowClass: "bg-emerald-500/30",
      icon: Volume2,
      iconClass: "text-white",
    },
  };

  const config = phaseConfig[phase];

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-6">
      {/* Botão fechar */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Nave não suportado */}
      {!isSupported && (
        <div className="text-center max-w-sm">
          <Brain className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-white/80 font-medium">Reconhecimento de voz não suportado</p>
          <p className="text-white/40 text-sm mt-2">
            Seu navegador não suporta reconhecimento de voz. Tente usar Chrome, Edge ou Safari.
          </p>
        </div>
      )}

      {/* Conteúdo principal */}
      {isSupported && (
        <>
          {/* Orb */}
          <button
            onClick={phase === "speaking" ? handleInterrupt : undefined}
            className="relative w-36 h-36 flex items-center justify-center mb-10"
            disabled={phase !== "speaking"}
          >
            {/* Glow */}
            <div className={`absolute inset-[-30%] rounded-full blur-3xl transition-all duration-700 ${config.glowClass}`} />

            {/* Ring pulsante ao escutar */}
            {phase === "listening" && (
              <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
            )}

            {/* Ring pulsante ao falar */}
            {phase === "speaking" && (
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse" />
            )}

            {/* Orb central */}
            <div className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${config.orbClass}`}>
              <config.icon className={`w-10 h-10 ${config.iconClass}`} />
            </div>
          </button>

          {/* Status */}
          <p className="text-white/50 text-sm font-medium mb-6">{config.label}</p>

          {/* Conteúdo dinâmico */}
          <div className="max-w-lg text-center min-h-[60px]">
            {phase === "listening" && interimText && (
              <p className="text-white text-lg leading-relaxed">{interimText}</p>
            )}
            {phase === "listening" && !interimText && (
              <p className="text-white/30 text-sm">Fale naturalmente...</p>
            )}
            {phase === "processing" && (
              <p className="text-white/40 text-sm">Consultando toda a sua memória...</p>
            )}
            {phase === "speaking" && aiText && (
              <div className="text-white/70 text-sm leading-relaxed max-h-40 overflow-y-auto px-4">
                <ReactMarkdown>{aiText}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Dica de interrupção */}
          {phase === "speaking" && (
            <p className="absolute bottom-8 text-white/30 text-xs">
              Toque no orb para interromper e falar
            </p>
          )}
        </>
      )}
    </div>
  );
}