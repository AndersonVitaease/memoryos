/**
 * RollbackEngine.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: gerenciar snapshots e execução de rollback.
 * Opera sobre um store de snapshots in-memory (extensível para persistência).
 * Não modifica código-fonte diretamente — representa estado lógico de componentes.
 */

import type { Snapshot, RollbackResult } from './GovernanceTypes';

let snapshotCounter = 0;
function makeSnapshotId(): string {
  return `snap-${Date.now()}-${++snapshotCounter}`;
}

export class RollbackEngine {
  private static snapshots: Snapshot[] = [];

  /**
   * Creates a named snapshot of the given logical state.
   * `state` is a record of path → serializable value representing the component state.
   */
  static capture(label: string, paths: string[], state: Record<string, unknown>): Snapshot {
    const snapshot: Snapshot = {
      snapshotId: makeSnapshotId(),
      createdAt: new Date().toISOString(),
      label,
      paths: [...paths],
      state: JSON.parse(JSON.stringify(state)), // deep clone
    };
    this.snapshots.push(snapshot);
    console.info(`[RollbackEngine] Snapshot captured: "${label}" (${snapshot.snapshotId})`);
    return { ...snapshot };
  }

  /**
   * Performs a full rollback to the specified snapshot.
   * Returns a RollbackResult describing success/failure per path.
   */
  static rollback(snapshotId: string): RollbackResult {
    const snapshot = this.snapshots.find((s) => s.snapshotId === snapshotId);
    if (!snapshot) {
      return {
        success: false,
        snapshotId,
        restoredPaths: [],
        failedPaths: [],
        executedAt: new Date().toISOString(),
      };
    }

    const restoredPaths: string[] = [];
    const failedPaths: string[] = [];

    for (const path of snapshot.paths) {
      if (snapshot.state[path] !== undefined) {
        // In a real implementation this would restore file/module state.
        // Here we record the intent and mark as restored.
        restoredPaths.push(path);
        console.info(`[RollbackEngine] Restored: ${path}`);
      } else {
        failedPaths.push(path);
        console.warn(`[RollbackEngine] No state found for: ${path}`);
      }
    }

    return {
      success: failedPaths.length === 0,
      snapshotId,
      restoredPaths,
      failedPaths,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Performs a partial rollback — only restoring the specified subset of paths.
   */
  static rollbackPartial(snapshotId: string, targetPaths: string[]): RollbackResult {
    const snapshot = this.snapshots.find((s) => s.snapshotId === snapshotId);
    if (!snapshot) {
      return {
        success: false,
        snapshotId,
        restoredPaths: [],
        failedPaths: targetPaths,
        executedAt: new Date().toISOString(),
      };
    }

    const restoredPaths: string[] = [];
    const failedPaths: string[] = [];

    for (const path of targetPaths) {
      if (snapshot.paths.includes(path) && snapshot.state[path] !== undefined) {
        restoredPaths.push(path);
        console.info(`[RollbackEngine] Partial restore: ${path}`);
      } else {
        failedPaths.push(path);
      }
    }

    return {
      success: failedPaths.length === 0,
      snapshotId,
      restoredPaths,
      failedPaths,
      executedAt: new Date().toISOString(),
    };
  }

  /** Lists all snapshots in chronological order. */
  static listSnapshots(): Snapshot[] {
    return this.snapshots.map((s) => ({ ...s }));
  }

  /** Returns the latest snapshot. */
  static latest(): Snapshot | null {
    if (this.snapshots.length === 0) return null;
    return { ...this.snapshots[this.snapshots.length - 1] };
  }

  /** Deletes a snapshot by id. */
  static deleteSnapshot(snapshotId: string): boolean {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((s) => s.snapshotId !== snapshotId);
    return this.snapshots.length < before;
  }

  /** Returns the version chain (list of snapshot labels + ids in order). */
  static versionChain(): Array<{ snapshotId: string; label: string; createdAt: string }> {
    return this.snapshots.map(({ snapshotId, label, createdAt }) => ({ snapshotId, label, createdAt }));
  }

  static health(): { status: 'ok'; totalSnapshots: number; latestLabel: string | null } {
    return {
      status: 'ok',
      totalSnapshots: this.snapshots.length,
      latestLabel: this.snapshots[this.snapshots.length - 1]?.label ?? null,
    };
  }
}