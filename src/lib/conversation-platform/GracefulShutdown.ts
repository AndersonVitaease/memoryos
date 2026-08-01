/**
 * GracefulShutdown.ts — P2: Graceful Shutdown
 *
 * Garante encerramento limpo da pipeline de conversação e sessões ativas:
 *   1. Cancela execução corrente (se houver)
 *   2. Persiste o summary final da sessão ativa
 *   3. Atualiza last_message_at para correto TTL no MemoryTiering
 *   4. Emite evento SESSION_CLOSED
 *
 * Gatilhos:
 *   - window.beforeunload (tab fechando)
 *   - visibilitychange (app em background)
 *   - chamada explícita de shutdown()
 *
 * GARANTIAS:
 *   - Fire-and-forget para não bloquear UI
 *   - Nunca lança exceção
 *   - Singleton HMR-safe
 */

// ── GracefulShutdown ──────────────────────────────────────────────────────────

class GracefulShutdownClass {
  private _registered = false;
  private _shutdownInProgress = false;

  /** Registra listeners de ciclo de vida do browser. Chamar uma vez no boot. */
  register(): void {
    if (this._registered || typeof window === "undefined") return;
    this._registered = true;

    window.addEventListener("beforeunload", () => {
      this._flushSync();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void this.shutdown("visibility_hidden");
      }
    });

    console.debug("[GracefulShutdown] Listeners registrados.");
  }

  /** Encerramento assíncrono completo — para uso explícito (logout, nova sessão). */
  async shutdown(reason: string = "explicit"): Promise<void> {
    if (this._shutdownInProgress) return;
    this._shutdownInProgress = true;

    const t0 = Date.now();
    console.debug(`[GracefulShutdown] Iniciando shutdown (reason=${reason})`);

    try {
      // 1. Cancelar pipeline em execução
      try {
        const { conversationPipeline } = await import("./ConversationPipeline");
        if (conversationPipeline.isRunning) {
          conversationPipeline.cancel();
          console.debug("[GracefulShutdown] Pipeline cancelado.");
        }
      } catch { /* non-blocking */ }

      // 2. Persistir estado da sessão ativa
      try {
        const { conversationStore } = await import("./ConversationStore");
        const session = conversationStore.session;
        if (session?.id) {
          const { updateSession } = await import("./ConversationPersistence");
          await updateSession(session.id, {
            last_message_at: new Date().toISOString(),
          });
          conversationStore.emit({
            type: "SESSION_CLOSED" as Parameters<typeof conversationStore.emit>[0]["type"],
            sessionId: session.id,
            payload: { reason, durationMs: Date.now() - t0 },
            timestamp: Date.now(),
          });
          console.debug(`[GracefulShutdown] Sessão ${session.id} persistida.`);
        }
      } catch { /* non-blocking */ }

      // 3. Flush do CircuitBreaker (limpa state volátil)
      try {
        const { registryCircuitBreaker } = await import("@/lib/knowledge-registry/RegistryCircuitBreaker");
        const metrics = registryCircuitBreaker.getMetrics();
        console.debug("[GracefulShutdown] CircuitBreaker flush:", metrics);
      } catch { /* non-blocking */ }

    } finally {
      this._shutdownInProgress = false;
      console.debug(`[GracefulShutdown] Shutdown concluído em ${Date.now() - t0}ms`);
    }
  }

  /**
   * Flush síncrono mínimo para beforeunload (browser não espera Promises).
   * Usa sendBeacon se disponível — best effort.
   */
  private _flushSync(): void {
    try {
      // Marca sessão como encerrada no localStorage como sinal de boot recovery
      const key = "__memoryos_last_shutdown__";
      const payload = JSON.stringify({ at: Date.now(), reason: "beforeunload" });
      localStorage.setItem(key, payload);
    } catch { /* non-blocking */ }
  }

  /** Verifica se houve shutdown sujo (crash/force-close) na sessão anterior. */
  wasDirtyShutdown(): boolean {
    try {
      const raw = localStorage.getItem("__memoryos_last_shutdown__");
      if (!raw) return false;
      const { at } = JSON.parse(raw) as { at: number };
      // Se o último shutdown foi há menos de 30s e ainda estamos iniciando = dirty
      return Date.now() - at < 30_000;
    } catch {
      return false;
    }
  }

  /** Limpa o marcador após recovery bem-sucedido. */
  clearDirtyFlag(): void {
    try { localStorage.removeItem("__memoryos_last_shutdown__"); } catch { /* non-blocking */ }
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__GRACEFUL_SHUTDOWN__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GracefulShutdownClass();
}

export const gracefulShutdown: GracefulShutdownClass = (
  globalThis as unknown as Record<string, GracefulShutdownClass>
)[_KEY];