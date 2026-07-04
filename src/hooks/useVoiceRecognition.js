import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook para reconhecimento de voz (Speech-to-Text) via Web Speech API.
 *
 * Modos:
 * - continuous=false (padrão): detecta fim da fala automaticamente, entrega resultado imediatamente
 * - continuous=true (push-to-talk): acumula fala enquanto ativo, entrega tudo ao parar
 *
 * Retorna:
 * - isListening, interimText, isSupported
 * - startListening(), stopListening() (entrega resultado acumulado)
 * - abortListening() (descarta tudo, não entrega resultado)
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
    if (!SR) {
      setIsSupported(false);
      return;
    }

    const rec = new SR();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = "pt-BR";

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
      console.error("Voice recognition error:", e.error);
    };

    recognitionRef.current = rec;

    return () => {
      try { rec.stop(); } catch (err) { /* noop */ }
    };
  }, [continuous]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    accumulatedRef.current = "";
    abortRef.current = false;
    setInterimText("");
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) { /* already started */ }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (err) { /* noop */ }
    setIsListening(false);
  }, []);

  const abortListening = useCallback(() => {
    abortRef.current = true;
    accumulatedRef.current = "";
    if (!recognitionRef.current) return;
    try { recognitionRef.current.abort(); } catch (err) { /* noop */ }
    setIsListening(false);
    setInterimText("");
  }, []);

  return { isListening, interimText, isSupported, startListening, stopListening, abortListening };
}