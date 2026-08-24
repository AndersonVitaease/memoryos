/**
 * RuntimeSnapshotPersistence — Publishes terminal runtime snapshots as SystemEvent records.
 *
 * The EventPersistenceBridge delegates snapshot publishing here so that the
 * bridge itself stays focused on event-bus wiring. Only executions that have
 * reached a terminal state (via the certified diagnostics adapter) are
 * published, and each execution is published at most once per session.
 */
import type { RuntimeDebugBus } from "@/lib/debug/RuntimeDebug";
import type { DiagnosticsAdapter } from "@/lib/debug/RuntimeDiagnosticsAdapter";
import type { RuntimeDiagnosticSnapshot } from "@/lib/debug/RuntimeDiagnostics";

export interface SystemEventEntity {
  create(record: Record<string, unknown>): Promise<{ id: string }>;
  filter(
    query: Record<string, unknown>,
    sort?: string,
    limit?: number,
  ): Promise<Array<Record<string, unknown>>>;
}

export interface RuntimeSnapshotPublisherConfig {
  runtimeDebug: RuntimeDebugBus;
  diagnosticsAdapter: DiagnosticsAdapter;
  systemEvents: SystemEventEntity;
  resolveScope: () => Promise<{ userId: string; workspaceId: string } | null>;
  warn: (message: string) => void;
}

interface PublishedResult {
  persisted: number;
  failed: number;
}

export class RuntimeSnapshotPublisher {
  private readonly _config: RuntimeSnapshotPublisherConfig;
  private readonly _published = new Set<string>();

  constructor(config: RuntimeSnapshotPublisherConfig) {
    this._config = config;
  }

  async flush(): Promise<PublishedResult> {
    let persisted = 0;
    let failed = 0;

    const terminalIds = this._config.diagnosticsAdapter.getTerminalExecutionIds();

    for (const executionId of terminalIds) {
      if (this._published.has(executionId)) continue;

      const snapshot = this._config.diagnosticsAdapter.getSnapshot(executionId);
      if (!snapshot) continue;

      // Idempotency: skip if a SystemEvent for this execution already exists.
      const existing = await this._checkExisting(executionId).catch(() => []);
      if (existing.length > 0) {
        this._published.add(executionId);
        continue;
      }

      const scope = await this._config.resolveScope().catch(() => null);

      try {
        await this._config.systemEvents.create({
          conversationId: "",
          correlationId: executionId,
          executionId,
          workspaceId: scope?.workspaceId ?? null,
          type: "runtime_snapshot",
          source: "RuntimeSnapshotPublisher",
          actor: "system",
          status: snapshot.status ?? "success",
          payload: this._projectPayload(snapshot),
          metadata: {
            traceCompleteness: snapshot.traceCompleteness,
            gaps: snapshot.gaps,
            truncated: snapshot.truncated,
            componentCount: snapshot.components.length,
            errorCount: snapshot.errors.length,
          },
        });
        this._published.add(executionId);
        persisted++;
      } catch (err) {
        failed++;
        this._config.warn(
          `executionId=${executionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { persisted, failed };
  }

  private async _checkExisting(
    executionId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this._config.systemEvents.filter({
      correlationId: executionId,
      type: "runtime_snapshot",
    });
  }

  private _projectPayload(
    snapshot: RuntimeDiagnosticSnapshot,
  ): Record<string, unknown> {
    return {
      executionId: snapshot.executionId,
      status: snapshot.status,
      traceCompleteness: snapshot.traceCompleteness,
      components: snapshot.components,
      steps: snapshot.steps,
      connectors: snapshot.connectors,
      capabilities: snapshot.capabilities,
      gaps: snapshot.gaps,
      errorCount: snapshot.errors.length,
      errorCodes: snapshot.errors.map((e) => e.errorCode).filter(Boolean),
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      durationMs: snapshot.durationMs,
    };
  }
}