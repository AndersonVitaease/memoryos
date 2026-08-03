/**
 * useConversation.js
 * React hook — bridges ConversationManager to component state.
 * ChatPage uses ONLY this hook.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { conversationManager } from "./ConversationManager";

export function useConversation() {
  const [state, setState] = useState(() => conversationManager.state);
  const initializedRef = useRef(false);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = conversationManager.subscribe((s) => setState({ ...s }));
    return unsub;
  }, []);

  // Initialize — sempre chama, mas o SessionManager decide internamente
  // se relê do banco (store vazio) ou mantém o que já está em memória.
  useEffect(() => {
    conversationManager.initialize().catch(console.error);
  }, []);

  const send = useCallback(async (text) => {
    return conversationManager.send(text);
  }, []);

  const stop = useCallback(() => {
    conversationManager.stop();
  }, []);

  const cancel = useCallback(() => {
    conversationManager.cancel();
  }, []);

  const retry = useCallback(async (text) => {
    return conversationManager.retry(text);
  }, []);

  const appendMessage = useCallback((message) => {
    conversationManager.appendMessage(message);
  }, []);

  const setMessages = useCallback((messages) => {
    conversationManager.setMessages(messages);
  }, []);

  return {
    // State
    messages: state.messages,
    session: state.session,
    status: state.status,
    reasoningPhase: state.reasoningPhase,
    streamSession: state.streamSession,
    currentExecution: state.currentExecution,
    error: state.error,
    isInitialized: state.isInitialized,
    isLoading: conversationManager.isLoading,

   // Actions
    send,
    stop,
    cancel,
    retry,
    appendMessage,
    setMessages,

    // Session
    newSession: (title) => conversationManager.newSession(title),
    switchSession: (id) => conversationManager.switchSession(id),
    renameSession: (id, title) => conversationManager.renameSession(id, title),
    archiveCurrentSession: () => conversationManager.archiveCurrentSession(),

    // Metrics
    getMetrics: () => conversationManager.getMetrics(),
    getDetailedMetrics: () => conversationManager.getDetailedMetrics(),
    getEventHistory: () => conversationManager.getEventHistory(),
  };
}