/**
 * ReadinessInspector.ts — Sprint 6.3.5
 * Collects environment snapshot before running validators.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";

export interface EnvironmentSnapshot {
  capturedAt: number;
  kgReady: boolean;
  kgEntityCount: number;
  kgHealth: string;
  shrReady: boolean;
  psmReady: boolean;
  ucpReady: boolean;
  eafReady: boolean;
  aelReady: boolean;
  memReady: boolean;
  govReady: boolean;
  archReady: boolean;
  overallReady: boolean;
}

export class ReadinessInspector {
  async inspect(): Promise<EnvironmentSnapshot> {
    const kgReady = KnowledgeGraphStore.isReady();
    const kgFields = KnowledgeGraphStore.snapshotFields() as any;
    const kgEntityCount = kgReady ? (KnowledgeGraphStore.get?.("inspector")?.entityCount ?? 0) : 0;
    const kgHealth = kgFields.kgHealth ?? "NOT_READY";

    const check = async (path: string): Promise<boolean> => {
      try { const m = await import(/* @vite-ignore */ path); return !!m; }
      catch { return false; }
    };

    const [shrReady, psmReady, ucpReady, eafReady, aelReady, memReady, govReady, archReady] = await Promise.all([
      check("../self-healing-runtime/RuntimeSupervisor"),
      check("../runtime-persistence/PersistentSessionManager"),
      check("../universal-connector-platform/ConnectorRuntime"),
      check("../engineering-acceptance/AcceptanceEngine"),
      check("../autonomous-engineering/AutonomousEngineeringLoop"),
      check("../engineering-memory/EngineeringMemory"),
      check("../engineering-governance/EngineeringGovernance"),
      check("../architecture-authority/ArchitectureAuthority"),
    ]);

    const overallReady = shrReady && psmReady && ucpReady && eafReady && aelReady && memReady && govReady && archReady;

    return {
      capturedAt: Date.now(),
      kgReady, kgEntityCount, kgHealth,
      shrReady, psmReady, ucpReady, eafReady, aelReady,
      memReady, govReady, archReady,
      overallReady,
    };
  }
}