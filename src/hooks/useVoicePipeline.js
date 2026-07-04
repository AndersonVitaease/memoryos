import { useState, useRef, useCallback, useEffect } from "react";
import { useHaptics } from "./useHaptics";
import { useTextToSpeech } from "./useTextToSpeech";

/**
 * Voice Pipeline — Máquina de estados para Push-to-Talk.
 *
 * Estados: idle → listening → transcribing → retrieving → generating → speaking → completed → idle
 *                                    ↓                    ↓             ↓           ↓
 *                               cancelled / error (a qualquer momento)
 *
 * Garantias de produção:
 * - Timeout em cada etapa (nenhum estado infinito)
 * - Instância fresca de SpeechRecognition a cada captura (Safari-safe)
 * - onend não dispara? Safety-net processa após 2s
 * - Feedback háptico + sonoro em start / end / cancel / error
 * - Cancelamento a qualquer momento
 * - TTS integrado (pressionar mic durante TTS interrompe)
 * - Logs internos de timing
 */

const TIMEOUTS = {
  listening: 60000,
  transcribing: 10000,
  retrieving: 10000,
  generating: 30000,
  speaking: 30000,
};

const PHASE_LABELS = {
  idle: "",
  listening: "🎤 Ouvindo...",
  transcribing: "📝 Convertendo voz em texto...",
  retrieving: "🧠 Consultando memória...",
  generating: "💬 Gerando resposta...",
  speaking: "🔊 Respondendo...",
  error: "",
  cancelled: "",
  completed: "",
};

const ERROR_MESSAGES = {
  "not-allowed": "Permissão de microfone negada. Habilite o acesso nas configurações do navegador.",
  "not-supported": "Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.",
  "no-speech": "Não detectei nenhuma fala. Tente novamente.",
  "empty": "Não detectei nenhuma fala. Tente novamente.",
  "timeout": "A operação demorou demais. Tente novamente.",
  "network": "Erro de rede. Verifique sua conexão.",
  "default": "Algo deu errado. Tente novamente.",
};

export function useVoicePipeline({ onSend } = {}) {
  const [state, setState] = useState("idle");
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);

  const onSendRef = useRef(onSend);
  const recognitionRef = useRef(null);
  const accumulatedRef = useRef("");
  const abortRef = useRef(false);
  const processingRef = useRef(false);
  const timeoutRef = useRef(null);
  const stateRef = useRef("idle");
  const recoveryTimerRef = useRef(null);
  const timestampsRef = useRef({});

  const haptics = useHaptics();
  const tts = useTextToSpeech();

  useEffect(() => { onSendRef.current = onSend; });
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setIsSupported(false);
    return () => {
      clearTimeouts();
      cleanupRecognition();
      tts.stopSpeaking();
    };
  }, []);

  const clearTimeouts = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
  };

  const cleanupRecognition = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.onstart = null; rec.abort(); } catch (e) { /* noop */ }
      recognitionRef.current = null;
    }
  };

  const transitionTo = useCallback((newState) => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    stateRef.current = newState;
    setState(newState);

    if (TIMEOUTS[newState]) {
      timeoutRef.current = setTimeout(() => {
        handleErrorRef.current({ type: "timeout", phase: newState });
      }, TIMEOUTS[newState]);
    }
  }, []);

  const handleErrorRef = useRef(null);

  const handleError = useCallback((err) => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    cleanupRecognition();
    tts.stopSpeaking();
    processingRef.current = false;
    haptics.feedback("error");

    const message = ERROR_MESSAGES[err.type] ?? ERROR_MESSAGES.default;
    setError({ type: err.type, message });
    stateRef.current = "error";
    setState("error");

    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = setTimeout(() => {
      stateRef.current = "idle";
      setState((s) => (s === "error" ? "idle" : s));
      setError(null);
    }, 3500);
  }, [haptics, tts]);

  handleErrorRef.current = handleError;

  const processTranscription = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    const text = accumulatedRef.current.trim();
    accumulatedRef.current = "";
    setInterimText("");

    if (!text) {
      processingRef.current = false;
      handleError({ type: "empty" });
      return;
    }

    // Já estamos em "transcribing" (definido por stopCapture)
    // Pequeno delay para UX — mostra "Convertendo..." brevemente
    await new Promise((r) => setTimeout(r, 250));

    if (abortRef.current) {
      processingRef.current = false;
      transitionTo("idle");
      return;
    }

    transitionTo("retrieving");

    try {
      const response = await onSendRef.current?.(text, {
        setPhase: (phase) => {
          if (!["idle", "error", "cancelled"].includes(stateRef.current) && !abortRef.current) {
            transitionTo(phase);
          }
        },
      });

      if (abortRef.current) {
        processingRef.current = false;
        transitionTo("idle");
        return;
      }

      if (!response || typeof response !== "string") {
        processingRef.current = false;
        transitionTo("idle");
        return;
      }

      transitionTo("speaking");
      processingRef.current = false;

      tts.speak(response, {
        onEnd: () => {
          if (stateRef.current === "speaking" && !abortRef.current) {
            transitionTo("completed");
            setTimeout(() => {
              if (stateRef.current === "completed") transitionTo("idle");
            }, 300);
          }
        },
      });
    } catch (err) {
      processingRef.current = false;
      handleError({ type: "default" });
    }
  }, [transitionTo, handleError, tts]);

  const startCapture = useCallback(() => {
    if (!isSupported) {
      handleError({ type: "not-supported" });
      return;
    }

    // Interrompe TTS se estiver falando
    tts.stopSpeaking();

    // Limpa reconhecimento anterior (Safari-safe: instância fresca a cada captura)
    cleanupRecognition();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setIsSupported(false);
      handleError({ type: "not-supported" });
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "pt-BR";

    accumulatedRef.current = "";
    abortRef.current = false;
    processingRef.current = false;
    setInterimText("");
    setError(null);

    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) setInterimText(interim);
      if (final) {
        accumulatedRef.current += (accumulatedRef.current ? " " : "") + final;
        setInterimText("");
      }
    };

    rec.onerror = (e) => {
      const errType = e.error;
      if (errType === "aborted") return;
      if (errType === "no-speech") return; // tratado em onend
      if (errType === "not-allowed" || errType === "service-not-allowed") {
        handleError({ type: "not-allowed" });
        return;
      }
      if (errType === "network") {
        handleError({ type: "network" });
        return;
      }
    };

    rec.onend = () => {
      if (abortRef.current) {
        accumulatedRef.current = "";
        setInterimText("");
        return;
      }
      // Processar resultado acumulado
      if (stateRef.current === "transcribing") {
        processTranscription();
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
      transitionTo("listening");
      haptics.feedback("start");
    } catch (err) {
      // "already started" — Safari pode lançar; tenta novamente após cleanup
      try { rec.abort(); } catch (e2) { /* noop */ }
      handleError({ type: "default" });
    }
  }, [isSupported, tts, haptics, transitionTo, handleError, processTranscription]);

  const stopCapture = useCallback(() => {
    // Transiciona imediatamente para "transcribing" (feedback visual instantâneo)
    transitionTo("transcribing");
    haptics.feedback("end");

    // Para o reconhecimento — onend disparará e chamará processTranscription
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch (e) { /* noop */ }
    }

    // Safety-net: se onend não disparar em 2s (bug do Safari), processa mesmo assim
    setTimeout(() => {
      if (stateRef.current === "transcribing" && !processingRef.current) {
        processTranscription();
      }
    }, 2000);
  }, [transitionTo, haptics, processTranscription]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    cleanupRecognition();
    tts.stopSpeaking();
    processingRef.current = false;
    haptics.feedback("cancel");
    accumulatedRef.current = "";
    setInterimText("");
    setError(null);
    stateRef.current = "cancelled";
    setState("cancelled");

    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = setTimeout(() => {
      stateRef.current = "idle";
      setState((s) => (s === "cancelled" ? "idle" : s));
    }, 400);
  }, [haptics, tts]);

  const stopSpeaking = useCallback(() => {
    tts.stopSpeaking();
    if (stateRef.current === "speaking") {
      transitionTo("idle");
    }
  }, [tts, transitionTo]);

  const isProcessing = ["transcribing", "retrieving", "generating"].includes(state);

  return {
    state,
    phaseLabel: PHASE_LABELS[state] || "",
    interimText,
    isSupported,
    error,
    isListening: state === "listening",
    isProcessing,
    isSpeaking: tts.isSpeaking,
    startCapture,
    stopCapture,
    cancel,
    stopSpeaking,
  };
}