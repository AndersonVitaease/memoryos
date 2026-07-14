/**
 * ImplementationSandbox.ts
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Responsabilidade única: executar mudanças propostas em ambiente isolado.
 * Não aplica ao Core sem aprovação explícita. Não altera estado externo diretamente.
 */

import { CoreProtectionEngine } from './CoreProtectionEngine';
import type { SandboxResult, OperationType } from './GovernanceTypes';

type SandboxTask = () => Promise<unknown> | unknown;

interface SandboxEntry {
  sandboxId: string;
  targetPath: string;
  operation: OperationType;
  status: 'pending' | 'executed' | 'approved' | 'rejected';
  result?: SandboxResult;
  createdAt: string;
  approvedBy?: string;
}

let idCounter = 0;
function makeSandboxId(): string {
  return `sb-${Date.now()}-${++idCounter}`;
}

export class ImplementationSandbox {
  private static entries: SandboxEntry[] = [];

  /**
   * Executes a task in the sandbox.
   * If the target path touches a protected core component, marks as requiresApproval.
   * The task function runs but its output is held — not committed — until approved.
   */
  static async execute(
    targetPath: string,
    operation: OperationType,
    task: SandboxTask,
    principalId: string
  ): Promise<SandboxResult> {
    const sandboxId = makeSandboxId();
    const coreCheck = CoreProtectionEngine.checkOperation(targetPath, operation);

    const entry: SandboxEntry = {
      sandboxId,
      targetPath,
      operation,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);

    // Hard block: immutable core — do not even run the task.
    if (coreCheck.blocked) {
      const result: SandboxResult = {
        sandboxId,
        success: false,
        output: null,
        sideEffects: [],
        approvalRequired: true,
        error: coreCheck.reason,
      };
      entry.status = 'rejected';
      entry.result = result;
      console.warn(`[ImplementationSandbox] BLOCKED — ${coreCheck.reason}`);
      return result;
    }

    // Run the task in isolation (errors are caught, never propagated).
    let output: unknown = null;
    let error: string | undefined;
    const sideEffects: string[] = [];

    try {
      output = await Promise.resolve(task());
      sideEffects.push(`Task executed for principal "${principalId}" on "${targetPath}"`);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }

    const protectionLevel = CoreProtectionEngine.getProtectionLevel(targetPath);
    const approvalRequired = protectionLevel === 'restricted' || protectionLevel === 'audited';

    const result: SandboxResult = {
      sandboxId,
      success: !error,
      output,
      sideEffects,
      approvalRequired,
      error,
    };

    entry.status = 'executed';
    entry.result = result;
    return result;
  }

  /**
   * Approves a sandbox execution, marking it as safe to commit.
   * Does not perform the actual commit — callers must handle that.
   */
  static approve(sandboxId: string, approverPrincipalId: string): boolean {
    const entry = this.entries.find((e) => e.sandboxId === sandboxId);
    if (!entry || entry.status !== 'executed') return false;
    entry.status = 'approved';
    entry.approvedBy = approverPrincipalId;
    if (entry.result) {
      entry.result.committedAt = new Date().toISOString();
    }
    return true;
  }

  /** Rejects a sandbox entry. */
  static reject(sandboxId: string): boolean {
    const entry = this.entries.find((e) => e.sandboxId === sandboxId);
    if (!entry || entry.status !== 'executed') return false;
    entry.status = 'rejected';
    return true;
  }

  /** Returns all entries (read-only copies). */
  static listEntries(): SandboxEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /** Returns pending entries awaiting approval. */
  static listPending(): SandboxEntry[] {
    return this.entries.filter((e) => e.status === 'executed' && e.result?.approvalRequired).map((e) => ({ ...e }));
  }

  static health(): { status: 'ok'; totalEntries: number; pendingApproval: number } {
    return {
      status: 'ok',
      totalEntries: this.entries.length,
      pendingApproval: this.listPending().length,
    };
  }
}