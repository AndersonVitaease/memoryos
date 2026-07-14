/**
 * SHRTypes.ts — Sprint 6.3.1
 * Core type definitions for the Self-Healing Runtime layer.
 */

export type RuntimeState = "IDLE" | "STARTING" | "READY" | "DEGRADED" | "RECOVERING" | "RESTARTING" | "FAILED" | "STOPPED";

export type ModuleState = "READY" | "DEGRADED" | "FAILED" | "RECOVERING" | "RESTARTING" | "STOPPED";

export type HealthStatus = "READY" | "DEGRADED" | "FAILED" | "RECOVERING";

export type WatchTrigger =
  | "CODE_CHANGE"
  | "CONFIG_CHANGE"
  | "CONNECTOR_CHANGE"
  | "MODULE_UPDATE"
  | "KG_CHANGE"
  | "MANUAL"
  | "SCHEDULED";

export type RecoveryStrategy = "RESTART_MODULE" | "RESTORE_SNAPSHOT" | "WARMUP_ONLY" | "FULL_RECOVERY";

export interface ModuleDescriptor {
  id: string;
  name: string;
  version: string;
  dependencies: string[];
  state: ModuleState;
  lastRestartAt?: number;
  restartCount: number;
  errorCount: number;
}

export interface RuntimeSnapshot {
  id: string;
  capturedAt: number;
  trigger: WatchTrigger;
  kgState: {
    isReady: boolean;
    entityCount: number;
    relationshipCount: number;
    moduleCount: number;
    ageMs: number;
  };
  runtimeState: RuntimeState;
  moduleStates: Record<string, ModuleState>;
  connectorCount: number;
  sessionCount: number;
  metricsSnapshot: Record<string, number>;
  memorySnapshot: {
    implementationCount: number;
    patternCount: number;
    bugCount: number;
  };
}

export interface RestartPlan {
  id: string;
  triggeredAt: number;
  trigger: WatchTrigger;
  affectedModule: string;
  dependencyChain: string[];
  strategy: RecoveryStrategy;
  estimatedDurationMs: number;
}

export interface RecoveryAttempt {
  id: string;
  moduleId: string;
  attempt: number;
  maxAttempts: number;
  startedAt: number;
  completedAt?: number;
  success: boolean;
  errorDetail?: string;
}

export interface WarmupResult {
  id: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  steps: WarmupStep[];
  success: boolean;
  failedSteps: string[];
}

export interface WarmupStep {
  name: string;
  success: boolean;
  durationMs: number;
  detail: string;
}

export interface SHREvent {
  id: string;
  type: SHREventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

export type SHREventType =
  | "RuntimeStarted"
  | "RuntimeStopping"
  | "RuntimeRestarting"
  | "RuntimeRecovered"
  | "WarmupStarted"
  | "WarmupFinished"
  | "RecoveryStarted"
  | "RecoveryFinished"
  | "ModuleRestarted"
  | "ModuleRecovered"
  | "SnapshotCaptured"
  | "SnapshotRestored"
  | "WatchTriggerFired"
  | "DependencyResolved"
  | "AuditRecorded";

export interface AuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  trigger: WatchTrigger;
  modules: string[];
  durationMs: number;
  result: "SUCCESS" | "PARTIAL" | "FAILED";
  rca?: string;
  snapshotId?: string;
}

export interface RuntimeMetricsSnapshot {
  avgRestartMs: number;
  avgRecoveryMs: number;
  avgWarmupMs: number;
  availabilityPercent: number;
  totalRecoveries: number;
  totalRestarts: number;
  totalWarmups: number;
  successRate: number;
  uptimeMs: number;
  lastRestartAt?: number;
  lastRecoveryAt?: number;
}

export interface DiagnosticResult {
  overall: boolean;
  runtimeState: RuntimeState;
  details: DiagnosticCheck[];
  capturedAt: number;
}

export interface DiagnosticCheck {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface RecoveryHistoryEntry {
  id: string;
  timestamp: number;
  moduleId: string;
  attempts: number;
  finalResult: "RECOVERED" | "DEGRADED" | "FAILED";
  totalDurationMs: number;
  rca: string;
}