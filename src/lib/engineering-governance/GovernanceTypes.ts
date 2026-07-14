/**
 * GovernanceTypes.ts
 * MV > MPS > MAS > MDS > Implementation
 * Sprint 6.2.2 — Engineering Governance & Core Protection
 *
 * Tipos centrais compartilhados por todos os motores de governança.
 */

export type ProtectionLevel = 'immutable' | 'restricted' | 'audited' | 'open';
export type PermissionLevel = 'none' | 'read' | 'propose' | 'execute' | 'admin';
export type ImpactSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none';
export type OperationType = 'read' | 'write' | 'delete' | 'refactor' | 'migrate' | 'rollback';
export type AuditEventType =
  | 'permission_check'
  | 'impact_analysis'
  | 'sandbox_execution'
  | 'rollback_triggered'
  | 'policy_evaluated'
  | 'security_violation'
  | 'core_access_attempt'
  | 'change_approved'
  | 'change_rejected';

export interface ProtectedComponent {
  id: string;
  name: string;
  path: string;
  level: ProtectionLevel;
  reason: string;
  dependencies: string[];
  ownedBy: string;
}

export interface Permission {
  principalId: string;
  principalRole: string;
  operation: OperationType;
  targetPath: string;
  level: PermissionLevel;
  grantedAt: string;
  expiresAt?: string;
  conditions?: string[];
}

export interface ImpactReport {
  targetPath: string;
  operation: OperationType;
  severity: ImpactSeverity;
  affectedComponents: string[];
  dependencyChain: string[];
  riskScore: number; // 0–100
  requiresApproval: boolean;
  summary: string;
}

export interface SandboxResult {
  sandboxId: string;
  success: boolean;
  output: unknown;
  sideEffects: string[];
  approvalRequired: boolean;
  committedAt?: string;
  error?: string;
}

export interface Snapshot {
  snapshotId: string;
  createdAt: string;
  label: string;
  paths: string[];
  state: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  snapshotId: string;
  restoredPaths: string[];
  failedPaths: string[];
  executedAt: string;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  targets: string[]; // path globs
  requiredPermission: PermissionLevel;
  blockConditions: string[];
  enabled: boolean;
}

export interface PolicyEvaluation {
  policyId: string;
  passed: boolean;
  reason: string;
  blockedBy?: string;
}

export interface AuditRecord {
  id: string;
  eventType: AuditEventType;
  timestamp: string;
  principalId: string;
  targetPath: string;
  operation: OperationType;
  outcome: 'allowed' | 'denied' | 'pending';
  details: Record<string, unknown>;
}

export interface SecurityCheckResult {
  allowed: boolean;
  violations: string[];
  checkedAt: string;
}

/**
 * P4 — Single source of truth for permission level ranking.
 * Imported by EngineeringPermissionEngine and GovernancePolicyEngine.
 * Never duplicate this constant in any other module.
 */
export const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  propose: 2,
  execute: 3,
  admin: 4,
};

// ─── UI-facing constants ──────────────────────────────────────────────────────

export const PROTECTED_COMPONENTS: string[] = [
  'src/lib/wme',
  'src/lib/sprint1',
  'src/lib/fce',
  'src/lib/abv',
  'src/lib/connector-runtime',
  'src/lib/AuthContext.jsx',
  'src/lib/officialLibraryManager.js',
];

export const ENGINEERING_POLICIES: string[] = [
  'No direct modification of immutable core components without Architecture Board approval',
  'All write operations must pass the full governance pipeline',
  'Deletion of any protected component requires admin-level permission',
  'Security violations are automatically blocked and audited',
  'Rollback snapshot must be captured before any destructive operation',
  'Sandbox execution is mandatory for restricted and audited components',
  'All governance decisions are recorded in an append-only audit trail',
];