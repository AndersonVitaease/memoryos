import { base44 } from '@/api/base44Client';
import { detectWriteMode } from '@/lib/execution-intelligence/adaptive-process/OpenHandsChangeSet';

const POLL_MS = 2_000;
const KEY = '__SUPERVISED_MISSION_BRIDGE_WORKER__';

type WorkerState = { timer?: ReturnType<typeof setInterval>; busy: boolean };

async function tick(state: WorkerState): Promise<void> {
  if (state.busy || typeof document === 'undefined') return;
  state.busy = true;
  console.info('[SUPERVISED-BRIDGE] poll');
  try {
    const pollRes: any = await base44.functions.invoke('supervisedEngineeringMission', { operation: 'poll' });
    const task = (pollRes?.data ?? pollRes)?.task;
    if (!task?.id || !task?.prompt || !task?.sessionId) return;
    console.info('[SUPERVISED-BRIDGE] claimed', { requestId: task.id, sessionId: task.sessionId });

    try {
      const { getExecutionRuntime } = await import('@/lib/execution-intelligence');
      console.info('[SUPERVISED-BRIDGE] module-loaded', { requestId: task.id });
      const runtime = await getExecutionRuntime();
      console.info('[SUPERVISED-BRIDGE] runtime-ready', { requestId: task.id });
      const outcome = await runtime.processCapability({
        connectorId: 'adaptive-process',
        capability: 'supervisedEngineering',
        params: { task: task.prompt, mode: detectWriteMode(task.prompt) },
        context: {
          userId: 'supervised-bridge-worker',
          workspaceId: task.projectId || 'memoryos',
          sessionId: task.sessionId,
          goalId: task.executionId || task.id,
          origin: 'supervised-mission-bridge',
        },
        executionId: task.executionId || task.id,
      });
      await base44.functions.invoke('supervisedEngineeringMission', {
        operation: 'complete', requestId: task.id, result: outcome,
      });
    } catch (error) {
      console.error('[SUPERVISED-BRIDGE] execution-error', {
        requestId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await base44.functions.invoke('supervisedEngineeringMission', {
        operation: 'complete', requestId: task.id,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }
  } catch {
    // Worker is best-effort and inert when no authenticated admin session exists.
  } finally {
    state.busy = false;
  }
}

export function startSupervisedMissionBridgeWorker(): void {
  if (typeof window === 'undefined') return;
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[KEY]) return;
  console.info('[SUPERVISED-BRIDGE] started');
  const state: WorkerState = { busy: false };
  g[KEY] = state;
  void tick(state);
  state.timer = setInterval(() => void tick(state), POLL_MS);
}
