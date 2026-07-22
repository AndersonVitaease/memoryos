/**
 * RuntimeContextLayer.ts — EXPERIMENTAL (Sprint EXP-RUNTIME-CONTEXT-LAYER)
 *
 * EXPERIMENTO REVERSIVEL.
 *
 * REVERSAO:
 *   1. Apagar src/lib/runtime-context/ (este arquivo).
 *   2. Remover os dois blocos [EXP-RUNTIME-CONTEXT-LAYER] em ConversationPipeline.ts.
 *   Nenhum outro arquivo precisa ser alterado.
 *
 * POSICAO ARQUITETURAL:
 *   ConversationPipeline
 *     ↓
 *   RuntimeContextLayer   ← esta camada
 *     ↓
 *   Router
 *     ↓
 *   GoalBridge
 *     ↓
 *   Planner
 *     ↓
 *   Runtime
 *     ↓
 *   Connector
 *
 * RESPONSABILIDADE UNICA:
 *   Centralizar todo o estado operacional da conversa:
 *     - ExecutionIntent (dominio, proposito, artefato atual)
 *     - CurrentGoal (goalType derivado da ultima execucao)
 *     - CurrentConnector (connector que executou por ultimo)
 *     - CurrentCapability (capability que executou por ultimo)
 *     - CurrentExecution (executionId ativo)
 *     - CurrentArtifact (owner/repo/path/fileId/resultPaths/cursor)
 *     - CurrentResultSet (items da ultima busca)
 *     - SessionState (metadata da sessao corrente)
 *
 * PERSISTENCIA:
 *   SOMENTE RuntimeContextLayer chama:
 *     conversationStore.getConnectorContext()
 *     conversationStore.setConnectorContext()
 *     conversationStore.clearConnectorContext()
 *   Nenhum outro componente novo acessa ConversationStore diretamente.
 *
 * API PUBLICA:
 *   get()               — retorna o snapshot atual
 *   set(partial)        — substitui campos do contexto
 *   update(...)         — atualiza apos execucao bem-sucedida
 *   clear()             — limpa tudo (troca de sessao)
 *   snapshot()          — retorna copia profunda (para debug)
 *   restore(snapshot)   — restaura a partir de snapshot
 *   resolveContinuation(message) — detecta e resolve mensagem de continuidade
 *   dump()              — log completo do estado (somente leitura)
 *   dumpExecutionIntent()
 *   dumpCurrentGoal()
 *   dumpCurrentConnector()
 *   dumpCurrentArtifact()
 *   dumpCurrentResultSet()
 */

import type { BaseConnectorContext } from "@/lib/connector-context/ConnectorContextStore";
import { conversationStore } from "@/lib/conversation-platform/ConversationStore";
import {
  ExecutionIntentManager,
  isContinuationMessage,
  domainFromGoalType,
  purposeFromGoalType,
  artifactTypeFromGoalType,
  extractArtifact,
} from "@/lib/execution-intent/ExecutionIntent";
import type {
  ExecutionDomain,
  ExecutionPurpose,
  ArtifactType,
  CurrentArtifact,
  ExecutionIntentRecord,
} from "@/lib/execution-intent/ExecutionIntent";
import type { ExecutionResultSet } from "@/lib/execution-result-set/ExecutionResultSet";

// ── RuntimeContext types ──────────────────────────────────────────────────────

export interface RuntimeContextState {
  /** Active executionId (from ConversationPipeline) */
  currentExecutionId:   string | null;
  /** GoalType of the last successful connector execution */
  currentGoalType:      string | null;
  /** ConnectorId of the last execution */
  currentConnector:     string | null;
  /** Capability name of the last execution */
  currentCapability:    string | null;
  /** Domain of the active execution context */
  currentDomain:        ExecutionDomain;
  /** Artifact currently in context */
  currentArtifact:      CurrentArtifact;
  /** EF-41: NavigableResultSet from the last connector execution (official) */
  currentResultSet:     ExecutionResultSet | null;
  /** @deprecated Legacy string[] paths — kept for backward compat only */
  currentResultSetPaths: string[];
  /** ExecutionIntent derived from last successful execution */
  executionIntent:      ExecutionIntentRecord | null;
  /** Session metadata */
  sessionId:            string | null;
  /** Timestamp of last update */
  updatedAt:            number;
}

export interface ContinuationResolution {
  /** Whether the message is a continuation of a previous execution */
  isContinuation:   boolean;
  /** Resolved goalType to inject into GoalBridge (null = let GoalBridge decide normally) */
  resolvedGoalType: string | null;
  /** Artifact context to merge into plan parameters */
  resolvedArtifact: CurrentArtifact | null;
  /** Human-readable reason */
  reason:           string;
}

export interface RuntimeContextSnapshot {
  state:     RuntimeContextState;
  takenAt:   number;
  sessionId: string | null;
}

// ── CONNECTOR_ID used for ConversationStore persistence ──────────────────────

const CONTEXT_SLOT = "runtime-context-layer";

// ── Default state ─────────────────────────────────────────────────────────────

function _defaultState(): RuntimeContextState {
  return {
    currentExecutionId:    null,
    currentGoalType:       null,
    currentConnector:      null,
    currentCapability:     null,
    currentDomain:         "general",
    currentArtifact:       {},
    currentResultSet:      null,
    currentResultSetPaths: [],
    executionIntent:       null,
    sessionId:             null,
    updatedAt:             0,
  };
}

// ── RuntimeContextLayer ───────────────────────────────────────────────────────

class RuntimeContextLayerClass {

  // ── get ───────────────────────────────────────────────────────────────────

  /**
   * Returns the current RuntimeContextState from ConversationStore.
   * Falls back to default state if nothing is stored yet.
   */
  get(): RuntimeContextState {
    try {
      const raw = conversationStore.getConnectorContext(CONTEXT_SLOT);
      if (raw && (raw as any)._rcl === true) {
        return (raw as any).state as RuntimeContextState;
      }
    } catch { /* non-blocking */ }

    // Also load executionIntent from its own slot (backward-compat with existing experiment)
    const intent = ExecutionIntentManager.load();
    const def = _defaultState();
    if (intent) {
      def.executionIntent        = intent;
      def.currentDomain          = intent.domain;
      def.currentGoalType        = null;
      def.currentArtifact        = intent.currentArtifact ?? {};
      def.currentResultSetPaths  = intent.currentArtifact?.resultPaths ?? [];
      // currentResultSet remains null until EF-41 Builder populates it
    }
    return def;
  }

  // ── set ───────────────────────────────────────────────────────────────────

  /**
   * Merges partial state into the current context and persists it.
   */
  set(partial: Partial<RuntimeContextState>): void {
    try {
      const current = this.get();
      const next: RuntimeContextState = { ...current, ...partial, updatedAt: Date.now() };
      this._persist(next);
      console.log("[RUNTIME CONTEXT] Updated (set)", {
        keys:    Object.keys(partial),
        domain:  next.currentDomain,
        goalType: next.currentGoalType,
      });
    } catch (e) {
      console.log("[RUNTIME CONTEXT] set failed (non-blocking):", String(e));
    }
  }

  // ── update ────────────────────────────────────────────────────────────────

  /**
   * Called by ConversationPipeline after a successful connector execution.
   * Updates all contextual fields and delegates ExecutionIntent update.
   */
  update(params: {
    executionId:    string;
    goalType:       string;
    connectorId:    string;
    capability:     string;
    connectorData:  unknown;
    sessionId:      string;
    enrichedOwner?: string;
    enrichedRepo?:  string;
  }): void {
    try {
      const {
        executionId, goalType, connectorId, capability,
        connectorData, sessionId, enrichedOwner, enrichedRepo,
      } = params;

      const domain       = domainFromGoalType(goalType);
      const artifact     = extractArtifact(goalType, connectorData);

      // Preserve owner/repo from plan enrichment if not in output
      if (enrichedOwner && !artifact.owner) artifact.owner = enrichedOwner;
      if (enrichedRepo  && !artifact.repo)  artifact.repo  = enrichedRepo;

      const resultPaths = artifact.resultPaths ?? [];

      // EF-43C: preserve the ResultSet already written by ConnectorResultSynthesizer
      // update() is called by the Pipeline AFTER synthesis — the Synthesizer already
      // persisted the ResultSet via setResultSet(). Resetting to null here was the
      // root cause of currentResultSet staying null after every connector execution.
      const existingState  = this.get();
      const preservedRS    = existingState.currentResultSet;

      const next: RuntimeContextState = {
        currentExecutionId:    executionId,
        currentGoalType:       goalType,
        currentConnector:      connectorId,
        currentCapability:     capability,
        currentDomain:         domain,
        currentArtifact:       artifact,
        currentResultSet:      preservedRS,    // EF-43C: keep ResultSet from Synthesizer
        currentResultSetPaths: resultPaths,    // @deprecated legacy compat
        executionIntent:       null,           // loaded after ExecutionIntentManager.update
        sessionId,
        updatedAt:             Date.now(),
      };

      // Delegate ExecutionIntent persistence (existing experiment — no duplication)
      ExecutionIntentManager.update(executionId, goalType, connectorData, enrichedOwner, enrichedRepo);

      // Now load the freshly-written intent back into our state
      const freshIntent = ExecutionIntentManager.load();
      next.executionIntent = freshIntent;

      this._persist(next);

      console.log("[RUNTIME CONTEXT] Updated", {
        executionId,
        goalType,
        connectorId,
        capability,
        domain,
        artifact,
        resultCount: resultPaths.length,
        sessionId,
      });
    } catch (e) {
      console.log("[RUNTIME CONTEXT] update failed (non-blocking):", String(e));
    }
  }

  // ── clear ─────────────────────────────────────────────────────────────────

  /**
   * Clears all runtime context (e.g. on session change).
   */
  clear(): void {
    try {
      conversationStore.clearConnectorContext(CONTEXT_SLOT);
      ExecutionIntentManager.clear();
      console.log("[RUNTIME CONTEXT] Cleared");
    } catch (e) {
      console.log("[RUNTIME CONTEXT] clear failed (non-blocking):", String(e));
    }
  }

  // ── snapshot ──────────────────────────────────────────────────────────────

  /**
   * Returns a deep copy of the current state for inspection or persistence.
   */
  snapshot(): RuntimeContextSnapshot {
    const state = this.get();
    const snap: RuntimeContextSnapshot = {
      state:     JSON.parse(JSON.stringify(state)),
      takenAt:   Date.now(),
      sessionId: state.sessionId,
    };
    console.log("[RUNTIME CONTEXT] Snapshot taken", {
      sessionId: snap.sessionId,
      takenAt:   snap.takenAt,
      domain:    snap.state.currentDomain,
      goalType:  snap.state.currentGoalType,
    });
    return snap;
  }

  // ── restore ───────────────────────────────────────────────────────────────

  /**
   * Restores state from a previously taken snapshot.
   */
  restore(snap: RuntimeContextSnapshot): void {
    try {
      this._persist(snap.state);
      if (snap.state.executionIntent) {
        conversationStore.setConnectorContext("execution-intent", snap.state.executionIntent);
      }
      console.log("[RUNTIME CONTEXT] Restored", {
        sessionId: snap.sessionId,
        takenAt:   snap.takenAt,
        domain:    snap.state.currentDomain,
      });
    } catch (e) {
      console.log("[RUNTIME CONTEXT] restore failed (non-blocking):", String(e));
    }
  }

  // ── EF-41: ResultSet API ──────────────────────────────────────────────────

  /**
   * Persists a freshly-built ExecutionResultSet into the current context.
   * Called by ConnectorResultSynthesizer after the EF-41 Builder runs.
   */
  setResultSet(resultSet: ExecutionResultSet): void {
    try {
      const current = this.get();
      const next: RuntimeContextState = {
        ...current,
        currentResultSet: resultSet,
        updatedAt:        Date.now(),
      };
      this._persist(next);
      console.log("[RUNTIME CONTEXT] ResultSet stored (EF-41)", {
        id:         resultSet.id,
        connector:  resultSet.connector,
        capability: resultSet.capability,
        entityType: resultSet.entityType,
        itemCount:  resultSet.items.length,
      });
    } catch (e) {
      console.log("[RUNTIME CONTEXT] setResultSet failed (non-blocking):", String(e));
    }
  }

  /**
   * Returns the current ExecutionResultSet, or null if none stored.
   */
  getResultSet(): ExecutionResultSet | null {
    return this.get().currentResultSet ?? null;
  }

  // ── resolveContinuation ───────────────────────────────────────────────────

  /**
   * Called by ConversationPipeline BEFORE the Router.
   * Detects if the message is a continuation and resolves the goalType + artifact.
   * Returns null resolvedGoalType when the message should be processed normally.
   */
  resolveContinuation(message: string): ContinuationResolution {
    if (!isContinuationMessage(message)) {
      return {
        isContinuation:   false,
        resolvedGoalType: null,
        resolvedArtifact: null,
        reason:           "Not a continuation message",
      };
    }

    // Delegate to ExecutionIntentManager (existing logic — no duplication)
    const intentResult = ExecutionIntentManager.consume(message);

    if (!intentResult) {
      console.log("[RUNTIME CONTEXT] Resolved — continuation detected but no stored intent", {
        message: message.slice(0, 80),
      });
      return {
        isContinuation:   true,
        resolvedGoalType: null,
        resolvedArtifact: null,
        reason:           "Continuation detected but no stored ExecutionIntent",
      };
    }

    console.log("[RUNTIME CONTEXT] Resolved", {
      message:          message.slice(0, 80),
      resolvedGoalType: intentResult.goalType,
      artifact:         intentResult.artifact,
    });

    return {
      isContinuation:   true,
      resolvedGoalType: intentResult.goalType,
      resolvedArtifact: intentResult.artifact,
      reason:           `ExecutionIntent resolved: goalType=${intentResult.goalType}`,
    };
  }

  // ── Introspection (read-only) ─────────────────────────────────────────────

  dump(): Record<string, unknown> {
    const state = this.get();
    const result = {
      currentExecutionId: state.currentExecutionId,
      currentGoalType:    state.currentGoalType,
      currentConnector:   state.currentConnector,
      currentCapability:  state.currentCapability,
      currentDomain:      state.currentDomain,
      currentArtifact:    state.currentArtifact,
      currentResultSet:   state.currentResultSet,
      sessionId:          state.sessionId,
      updatedAt:          state.updatedAt,
      executionIntent:    state.executionIntent ? {
        domain:          state.executionIntent.domain,
        purpose:         state.executionIntent.purpose,
        artifactType:    state.executionIntent.artifactType,
        continuationMode: state.executionIntent.continuationMode,
        executionId:     state.executionIntent.executionId,
        updatedAt:       state.executionIntent.updatedAt,
      } : null,
    };
    console.log("[RUNTIME CONTEXT] dump()", result);
    return result;
  }

  dumpExecutionIntent(): ExecutionIntentRecord | null {
    const intent = this.get().executionIntent ?? ExecutionIntentManager.load();
    console.log("[RUNTIME CONTEXT] dumpExecutionIntent()", intent);
    return intent;
  }

  dumpCurrentGoal(): string | null {
    const goal = this.get().currentGoalType;
    console.log("[RUNTIME CONTEXT] dumpCurrentGoal()", { currentGoalType: goal });
    return goal;
  }

  dumpCurrentConnector(): { connector: string | null; capability: string | null } {
    const state = this.get();
    const result = { connector: state.currentConnector, capability: state.currentCapability };
    console.log("[RUNTIME CONTEXT] dumpCurrentConnector()", result);
    return result;
  }

  dumpCurrentArtifact(): CurrentArtifact {
    const artifact = this.get().currentArtifact;
    console.log("[RUNTIME CONTEXT] dumpCurrentArtifact()", artifact);
    return artifact;
  }

  dumpCurrentResultSet(): ExecutionResultSet | null {
    const rs = this.get().currentResultSet;
    console.log("[RUNTIME CONTEXT] dumpCurrentResultSet()", { hasResultSet: rs != null, count: rs?.items?.length ?? 0 });
    return rs;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _persist(state: RuntimeContextState): void {
    // Wrap in a BaseConnectorContext-compatible object
    const wrapper: BaseConnectorContext & { _rcl: true; state: RuntimeContextState } = {
      connectorId: CONTEXT_SLOT,
      updatedAt:   state.updatedAt || Date.now(),
      _rcl:        true,
      state,
    };
    conversationStore.setConnectorContext(CONTEXT_SLOT, wrapper);
  }
}

// ── Singleton (globalThis — survives HMR) ────────────────────────────────────

const _KEY = "__RUNTIME_CONTEXT_LAYER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RuntimeContextLayerClass();
}

export const runtimeContextLayer: RuntimeContextLayerClass = (
  globalThis as unknown as Record<string, RuntimeContextLayerClass>
)[_KEY];