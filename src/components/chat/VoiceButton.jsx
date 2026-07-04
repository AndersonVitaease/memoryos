import React from "react";
import { Mic, Square } from "lucide-react";

/**
 * Botão de microfone para o campo de mensagem.
 *
 * - Quando ocioso: mostra ícone de microfone
 * - Quando ouvindo: mostra ícone de parar com animação de pulso vermelha
 * - onToggle: alterna entre começar/parar a escuta
 */
export default function VoiceButton({ isListening, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`p-3 rounded-2xl transition-all shrink-0 ${
        isListening
          ? "bg-red-500 text-white animate-pulse"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}