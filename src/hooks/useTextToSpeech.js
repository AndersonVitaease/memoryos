import { useState, useCallback, useEffect, useRef } from "react";

/**
 * Hook para Text-to-Speech (TTS) via Web Speech API.
 *
 * - Gratuito, instantâneo, funciona em todas as plataformas
 * - Limpa markdown antes de falar (para uma fala mais natural)
 * - Prioriza voz em português brasileiro
 * - Pode ser interrompido a qualquer momento
 *
 * Retorna:
 * - isSpeaking: bool
 * - isSupported: bool
 * - speak(text, { onEnd }): reproduz texto em voz
 * - stopSpeaking(): interrompe fala imediatamente
 */
export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const onEndRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSupported(false);
      return;
    }
    // Carrega vozes (alguns navegadores precisam deste trigger)
    window.speechSynthesis.getVoices();
  }, []);

  const speak = useCallback((text, { onEnd } = {}) => {
    if (!("speechSynthesis" in window) || !text) return;

    // Interrompe qualquer fala anterior
    window.speechSynthesis.cancel();

    // Limpa markdown para fala mais natural
    const cleanText = String(text)
      .replace(/[#*_`~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;
    utterance.pitch = 1;

    // Tenta encontrar uma voz em português
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang.startsWith("pt"));
    if (ptVoice) utterance.voice = ptVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEndRef.current?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onEndRef.current?.();
    };

    onEndRef.current = onEnd || null;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    onEndRef.current = null;
  }, []);

  return { isSpeaking, isSupported, speak, stopSpeaking };
}