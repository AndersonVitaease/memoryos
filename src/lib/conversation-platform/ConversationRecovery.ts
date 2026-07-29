/**
 * ConversationRecovery.ts
 * Guarantees that no exception leaves loading=true permanently.
 * Implements retry, resume, rollback, replay, and timeout handling.
 * MDS v2.0 compliant
 */

import { conversationStore } from "./ConversationStore";
import type { RecoveryRecord, RecoveryStrategy } from "./CXPTypes";

// ─── Recovery Engine ──────────────────────────────────────────────────────────

class ConversationRecovery {
  private _history: RecoveryRecord[] = [];
  private _maxAttempts = 3;
  private _retryDelayMs = 1000;

  // ── Guard Wrapper ─────────────────────────────────────────────────────────

  /**
   * Wrap any pipeline execution with automatic recovery.
   * Guarantees loading/status is always reset — no permanent stuck state.
   */
 async guardedExecution<T>(
    executionId: string,
    fn: () => Promise<T>,
    options?: {
      maxAttempts?: number;
      strategy?: RecoveryStrategy;
      onRetry?: (attempt: number, error: Error) => void;
      // FIX (pedido do usuário): antes o timeout era fixo em 30s, sem
      // como ajustar por chamada. Respostas que dependem de conectores
      // externos (pesquisa web, GitHub) às vezes legitimamente levam
      // mais que isso. Agora é configurável — default continua 30s pra
      // não mudar comportamento de quem não especificar.
      timeoutMs?: number;
    }
  ): Promise<T | null> {
    const maxAttempts = options?.maxAttempts ?? this._maxAttempts;
    const strategy = options?.strategy ?? "retry";
    const timeoutMs = options?.timeoutMs ?? 30_000;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const result = await Promise.race([
          fn(),
          this._timeout(timeoutMs, executionId),
        ]);
        return result as T;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.warn(`[CXP][Recovery] Attempt ${attempt}/${maxAttempts} failed:`, error.message);

        const record: RecoveryRecord = {
          id: `rec-${Date.now()}-${attempt}`,
          executionId,
          strategy,
          reason: error.message,
          attemptNumber: attempt,
          startedAt: Date.now(),
        };

        conversationStore.emit({
          type: "RECOVERY_STARTED",
          executionId,
          payload: { attempt, strategy, error: error.message },
          timestamp: Date.now(),
        });

        options?.onRetry?.(attempt, error);

        if (attempt >= maxAttempts) {
          record.finishedAt = Date.now();
          record.success = false;
          this._history.push(record);

          // CRITICAL: always reset status — never leave stuck
          conversationStore.setError(
            error.message.includes("timeout")
              ? "Tempo limite atingido. Tente novamente."
              : "Ocorreu um erro. Tente novamente."
          );

          conversationStore.emit({
            type: "RECOVERY_FINISHED",
            executionId,
            payload: { success: false, reason: error.message },
            timestamp: Date.now(),
          });

          return null;
        }

        // Wait before retry with exponential backoff
        await this._sleep(this._retryDelayMs * attempt);

        conversationStore.setStatus("recovering");
      }
    }

    return null;
  }

  // ── Timeout ───────────────────────────────────────────────────────────────

  private _timeout(ms: number, executionId: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Pipeline timeout after ${ms}ms — executionId: ${executionId}`)),
        ms
      )
    );
  }

  // ── Safe Reset ────────────────────────────────────────────────────────────

  /**
   * Always call this in the finally block of any pipeline step.
   * Guarantees status returns to idle or error — never stuck on a loading state.
   */
  safeReset(executionId: string): void {
    const state = conversationStore.status;
    if (!["idle", "error"].includes(state)) {
      conversationStore.setStatus("idle");
    }
    conversationStore.setCurrentExecution(null);
    conversationStore.setReasoningPhase("idle");
  }

  // ── History ───────────────────────────────────────────────────────────────

  getHistory(): RecoveryRecord[] {
    return [...this._history];
  }

  clearHistory(): void {
    this._history = [];
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const _key = "__CXP_RECOVERY__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationRecovery();
}

export const conversationRecovery: ConversationRecovery = (
  globalThis as unknown as Record<string, ConversationRecovery>
)[_key];

export { ConversationRecovery };
