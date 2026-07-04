import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook para reconhecimento de voz (Speech-to-Text) via Web Speech API.
 *
 * - continuous=false: detecta automaticamente quando o usuário terminou de falar
 * - interimResults=true: exibe transcrição em tempo real
 * - lang=pt-BR: português brasileiro
 *
 * Retorna:
 * - isListening: bool
 * - interimText: texto parcial em tempo real
 * - isSupported: bool (false se o navegador não suporta)
 * - startListening(): inicia captura
 * - stopListening(): para captura
 */
export function useVoiceRecognition({ onResult, onInterim, onEnd } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef(null);
  const cbRef = useRef({ onResult, onInterim, onEnd });

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
    rec.continuous = false;
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
        setInterimText("");
        cbRef.current.onResult?.(final.trim());
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setInterimText("");
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
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setInterimText("");
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      /* already started or permission denied */
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err) { /* noop */ }
    setIsListening(false);
    setInterimText("");
  }, []);

  return { isListening, interimText, isSupported, startListening, stopListening };
}