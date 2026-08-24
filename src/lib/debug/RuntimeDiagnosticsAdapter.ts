/**
 * RuntimeDiagnosticsAdapter — Certified projection over RuntimeDebug.
 *
 * Wraps RuntimeDebug.getDiagnosticSnapshot() so that the EventPersistenceBridge
 * and other consumers never touch the raw debug bus directly. Only snapshots
 * with a terminal event are considered publishable.
 */
import { RuntimeDebug } from "@/lib/debug/RuntimeDebug";
import type { RuntimeDiagnosticSnapshot } from "@/lib/debug/RuntimeDiagnostics";

export interface DiagnosticsAdapter {
  getSnapshot(executionId: string): RuntimeDiagnosticSnapshot | null;
  getTerminalExecutionIds(): string[];
}

function isTerminalSnapshot(snapshot: RuntimeDiagnosticSnapshot): boolean {
  return Boolean(snapshot.status) && (
    snapshot.traceCompleteness === "COMPLETE" ||
    snapshot.traceCompleteness === "PARTIAL"
  );
}

class CertifiedDiagnosticsAdapter implements DiagnosticsAdapter {
  getSnapshot(executionId: string): RuntimeDiagnosticSnapshot | null {
    try {
      return RuntimeDebug.getDiagnosticSnapshot(executionId);
    } catch {
      return null;
    }
  }

  getTerminalExecutionIds(): string[] {
    const executions = RuntimeDebug.getExecutions();
    const terminal: string[] = [];
    for (const execution of executions) {
      if (!execution.endedAt) continue;
      const snapshot = this.getSnapshot(execution.executionId);
      if (snapshot && isTerminalSnapshot(snapshot)) {
        terminal.push(execution.executionId);
      }
    }
    return terminal;
  }
}

export const runtimeDiagnosticsAdapter: DiagnosticsAdapter =
  new CertifiedDiagnosticsAdapter();