import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook para reconhecimento de voz via Web Speech API.
 *
 * Safari-safe: cria uma instância fresca de SpeechRecognition a cada startListening().
 * Reutilizado pelo VoiceMode (Conversa Contínua).
 *
 * Retorna: isListening, interimText, isSupported, startListening, stopListening, abortListening
 */
export function useVoiceRecognition({ onResult, onInterim, onEnd, continuous = false } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef(null);
  const cbRef = useRef({ onResult, onInterim, onEnd });
  const accumulatedRef = useRef("");
  const abortRef = useRef(false);

  useEffect(() => {
    cbRef.current = { onResult, onInterim, onEnd };
  });

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setIsSupported(false);
    return () => { cleanup(); };
  }, []);

  const cleanup = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort(); } catch (e) { /* noop */ }
      recognitionRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    // Instância fresca a cada chamada (Safari-safe)
    cleanup();

    const rec = new SR();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = "pt-BR";

    accumulatedRef.current = "";
    abortRef.current = false;
    setInterimText("");

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) {
        setInterimText(interim);
        cbRef.current.onInterim?.(interim);
      }
      if (final) {
        accumulatedRef.current += (accumulatedRef.current ? " " : "") + final;
        setInterimText("");
        if (!continuous) {
          cbRef.current.onResult?.(accumulatedRef.current.trim());
          accumulatedRef.current = "";
        }
      }
    };

    rec.onend = () => {
      setIsListening(false);
      if (continuous && !abortRef.current && accumulatedRef.current.trim()) {
        cbRef.current.onResult?.(accumulatedRef.current.trim());
      }
      setInterimText("");
      accumulatedRef.current = "";
      abortRef.current = false;
      cbRef.current.onEnd?.();
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") return;
      console.error("Voice recognition error:", e.error);
    };

    recognitionRef.current = rec;

    try {
      rec.start();
      setIsListening(true);
    } catch (err) { /* already started */ }
  }, [continuous, cleanup]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try { rec.stop(); } catch (err) { /* noop */ }
    setIsListening(false);
  }, []);

  const abortListening = useCallback(() => {
    abortRef.current = true;
    accumulatedRef.current = "";
    cleanup();
    setIsListening(false);
    setInterimText("");
  }, [cleanup]);

  return { isListening, interimText, isSupported, startListening, stopListening, abortListening };
}