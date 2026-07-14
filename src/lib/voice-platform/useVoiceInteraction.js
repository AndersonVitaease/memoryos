/**
 * useVoiceInteraction.js — Voice Interaction Platform (VIP)
 * React hook — single interface for all voice consumers.
 * Replaces useVoicePipeline, useVoiceRecognition, useTextToSpeech.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getVoiceInteractionManager } from "./VoiceInteractionManager";

export function useVoiceInteraction({ onSend } = {}) {
  const manager = getVoiceInteractionManager();
  const [vimState, setVimState] = useState(manager.state);
  const onSendRef = useRef(onSend);

  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  // Register onSend on the manager
  useEffect(() => {
    manager.onSend = (text, opts) => onSendRef.current?.(text, opts) ?? null;
  }, [manager]);

  // Subscribe to state changes
  useEffect(() => {
    manager.init(); // idempotent
    const unsub = manager.subscribe(setVimState);
    return unsub;
  }, [manager]);

  const startCapture = useCallback(() => manager.startCapture(), [manager]);
  const stopCapture = useCallback(() => manager.stopCapture(), [manager]);
  const cancel = useCallback(() => manager.cancel(), [manager]);
  const stopSpeaking = useCallback(() => manager.stopSpeaking(), [manager]);

  return {
    // State
    phase: vimState.phase,
    permission: vimState.permission,
    waveform: vimState.waveform,
    interimText: vimState.interimText,
    elapsedMs: vimState.elapsedMs,
    isSpeaking: vimState.isSpeaking,
    error: vimState.error,
    isSupported: vimState.isSupported,
    currentSession: vimState.currentSession,

    // Derived
    isListening: vimState.phase === "listening",
    isProcessing: ["transcribing", "retrieving", "generating"].includes(vimState.phase),
    isIdle: vimState.phase === "idle",

    // Controls
    startCapture,
    stopCapture,
    cancel,
    stopSpeaking,

    // Telemetry
    getMetrics: () => manager.getMetrics(),
    getSessionHistory: () => manager.getSessionHistory(),
  };
}