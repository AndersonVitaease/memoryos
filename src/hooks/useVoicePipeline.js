import { useState, useRef, useCallback, useEffect } from "react";
import { useHaptics } from "./useHaptics";
import { useTextToSpeech } from "./useTextToSpeech";
import { transcribeAudioBlob, isMediaRecorderSupported } from "@/lib/audioTranscription";

/**
 * Voice Pipeline — Máquina de estados para Push-to-Talk.
 *
 * Estratégia dual (transparente para o usuário):
 * 1. SpeechRecognition (Web Speech API) — tempo real, interim, gratuito
 * 2. MediaRecorder + Whisper (fallback) — acionado se SR retornar vazio
 *
 * Causa raiz do "Não detectei nenhuma fala" no Safari/iOS:
 * O onresult entrega apenas resultados INTERIM (isFinal=false) e o
 * onend dispara sem que o interim tenha sido promovido a final.
 * Fix: capturamos o último interim e o usamos como texto se não houver final.
 * Fix 2: se mesmo o interim estiver vazio (SR silenciosamente falha no Safari),
 * usamos o áudio capturado pelo MediaRecorder → Whisper.
 */

const TIMEOUTS = {
  listening: 60000,
  transcribing: 30000, // inclui fallback Whisper (upload + transcrição)
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

const LOG = "[VoicePipeline]";
function log(...args) { console.log(LOG, ...args); }

export function useVoicePipeline({ onSend } = {}) {
  const [state, setState] = useState("idle");
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState(null);

  const onSendRef = useRef(onSend);
  const recognitionRef = useRef(null);
  const accumulatedRef = useRef("");       // texto final do SR
  const lastInterimRef = useRef("");       // último interim do SR (Safari não finaliza)
  const abortRef = useRef(false);
  const processingRef = useRef(false);
  const timeoutRef = useRef(null);
  const stateRef = useRef("idle");
  const recoveryTimerRef = useRef(null);

  // MediaRecorder (fallback)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const audioBlobRef = useRef(null);

  const haptics = useHaptics();
  const tts = useTextToSpeech();

  useEffect(() => { onSendRef.current = onSend; });
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const MR = isMediaRecorderSupported();
    // Suportado se tiver PELO MENOS um dos mecanismos
    if (!SR && !MR) setIsSupported(false);
    log("Init: SpeechRecognition=", !!SR, "MediaRecorder=", !!MR);
    return () => {
      clearTimeouts();
      cleanupRecognition();
      cleanupMediaRecorder();
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

  const cleanupMediaRecorder = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.ondataavailable = null; rec.onstop = null; rec.stop(); } catch (e) { /* noop */ }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    audioChunksRef.current = [];
  };

  // === MediaRecorder ===

  const startMediaRecorder = useCallback(async () => {
    if (!isMediaRecorderSupported()) {
      log("MediaRecorder não suportado — fallback indisponível");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Escolhe o melhor mime type suportado
      let mimeType = "";
      const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      audioBlobRef.current = null;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      log("MediaRecorder iniciado", { mimeType: recorder.mimeType });
    } catch (err) {
      log("MediaRecorder falhou ao iniciar:", err.message);
    }
  }, []);

  const stopMediaRecorder = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        audioBlobRef.current = blob;
        log("MediaRecorder finalizado", { size: blob.size, type: blob.type });
        // Libera o microfone
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        resolve(blob);
      };
      try { recorder.stop(); } catch (e) { resolve(null); }
    });
  }, []);

  // === Estado ===

  const transitionTo = useCallback((newState) => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    stateRef.current = newState;
    setState(newState);
    log("Estado →", newState);

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
    cleanupMediaRecorder();
    tts.stopSpeaking();
    processingRef.current = false;
    haptics.feedback("error");
    log("Erro:", err);

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

  // === Processamento ===

  const processTranscription = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    // Aguarda MediaRecorder finalizar (rápido, ~50ms)
    await stopMediaRecorder();

    // 1) Tenta texto do SpeechRecognition: final OU último interim
    let text = accumulatedRef.current.trim() || lastInterimRef.current.trim();
    log("Texto SR:", JSON.stringify({ final: accumulatedRef.current, interim: lastInterimRef.current }));

    // 2) Fallback: se SR retornou vazio, usa áudio via Whisper
    if (!text && audioBlobRef.current && audioBlobRef.current.size > 0) {
      log("SR vazio — ativando fallback Whisper");
      try {
        text = await transcribeAudioBlob(audioBlobRef.current);
        log("Whisper:", text);
      } catch (err) {
        log("Whisper falhou:", err.message);
      }
    }

    // Limpa tudo
    accumulatedRef.current = "";
    lastInterimRef.current = "";
    audioBlobRef.current = null;
    setInterimText("");

    if (!text) {
      processingRef.current = false;
      handleError({ type: "empty" });
      return;
    }

    // Pequeno delay para UX
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
  }, [stopMediaRecorder, transitionTo, handleError, tts]);

  // === Captura ===

  const startCapture = useCallback(() => {
    if (!isSupported) {
      handleError({ type: "not-supported" });
      return;
    }

    tts.stopSpeaking();
    cleanupRecognition();
    cleanupMediaRecorder();

    // Reset
    accumulatedRef.current = "";
    lastInterimRef.current = "";
    audioBlobRef.current = null;
    abortRef.current = false;
    processingRef.current = false;
    setInterimText("");
    setError(null);

    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    // Inicia MediaRecorder em paralelo (fallback transparente)
    startMediaRecorder();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SR) {
      // Sem SR — depende apenas do MediaRecorder + Whisper
      log("SpeechRecognition indisponível — usando MediaRecorder apenas");
      transitionTo("listening");
      haptics.feedback("start");
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "pt-BR";

    rec.onstart = () => {
      log("SR onstart disparado");
    };

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      log("SR onresult: resultIndex=", e.resultIndex, "results.length=", e.results.length);
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const t = result[0].transcript;
        const isFinal = result.isFinal;
        log(`  [${i}] isFinal=${isFinal} transcript="${t}"`);
        if (isFinal) final += t;
        else interim += t;
      }
      if (interim) {
        lastInterimRef.current = interim;
        setInterimText(interim);
      }
      if (final) {
        accumulatedRef.current += (accumulatedRef.current ? " " : "") + final;
        lastInterimRef.current = "";
        setInterimText("");
      }
    };

    rec.onerror = (e) => {
      log("SR onerror:", e.error);
      if (e.error === "aborted") return;
      if (e.error === "no-speech") return; // tratado no fallback
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        handleError({ type: "not-allowed" });
        return;
      }
      if (e.error === "network") {
        handleError({ type: "network" });
        return;
      }
    };

    rec.onend = () => {
      log("SR onend: accumulated=", JSON.stringify(accumulatedRef.current), "interim=", JSON.stringify(lastInterimRef.current));
      if (abortRef.current) {
        accumulatedRef.current = "";
        lastInterimRef.current = "";
        setInterimText("");
        return;
      }
      // Promoção de interim → final (fix principal para Safari)
      if (!accumulatedRef.current.trim() && lastInterimRef.current.trim()) {
        accumulatedRef.current = lastInterimRef.current.trim();
        log("Interim promovido a final:", accumulatedRef.current);
      }
      if (stateRef.current === "transcribing") {
        processTranscription();
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
      log("SR start() chamado");
      transitionTo("listening");
      haptics.feedback("start");
    } catch (err) {
      log("SR start() falhou:", err.message);
      try { rec.abort(); } catch (e2) { /* noop */ }
      // SR falhou, mas MediaRecorder pode ainda estar ativo
      transitionTo("listening");
      haptics.feedback("start");
    }
  }, [isSupported, tts, haptics, transitionTo, handleError, processTranscription, startMediaRecorder, cleanupRecognition, cleanupMediaRecorder]);

  const stopCapture = useCallback(() => {
    transitionTo("transcribing");
    haptics.feedback("end");

    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch (e) { /* noop */ }
    }

    // Safety-net: se onend não disparar em 2s (bug do Safari), processa mesmo assim
    setTimeout(() => {
      if (stateRef.current === "transcribing" && !processingRef.current) {
        log("Safety-net: onend não disparou, processando");
        if (!accumulatedRef.current.trim() && lastInterimRef.current.trim()) {
          accumulatedRef.current = lastInterimRef.current.trim();
        }
        processTranscription();
      }
    }, 2000);
  }, [transitionTo, haptics, processTranscription]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    cleanupRecognition();
    cleanupMediaRecorder();
    tts.stopSpeaking();
    processingRef.current = false;
    haptics.feedback("cancel");
    accumulatedRef.current = "";
    lastInterimRef.current = "";
    audioBlobRef.current = null;
    setInterimText("");
    setError(null);
    stateRef.current = "cancelled";
    setState("cancelled");

    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = setTimeout(() => {
      stateRef.current = "idle";
      setState((s) => (s === "cancelled" ? "idle" : s));
    }, 400);
  }, [haptics, tts, cleanupRecognition, cleanupMediaRecorder]);

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