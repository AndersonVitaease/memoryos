/**
 * ArchitectureIndexer.ts — OIE Fase 2 (Sprint 3)
 *
 * Responsabilidade unica: projetar os registries vivos (GoalCapabilityRegistry
 * + ConnectorRegistry) num mapa deterministico Goals → Capabilities → Connectors.
 *
 * POR QUE ESTE MAPA EXISTE:
 *   O Coverage Analyzer (Fase 3) precisa responder: "dado o Goal que o
 *   Planner escolheu, quais Capabilities DEVERIAM ter rodado?". Sem este
 *   mapa, a unica fonte de "esperado" seria a propria execucao — tautologia.
 *   O mapa e o ground truth arquitetural: o que o sistema DECLARA que faz,
 *   independente do que efetivamente fez numa execucao especifica.
 *
 * PRINCIPIOS:
 *  - Read-only: nunca altera os registries. E uma projecao, nao um writer.
 *  - Deterministico: sem LLM, sem IA. Le so os registries que ja existem.
 *  - On-demand: constroi sob chamada (async — o ConnectorRegistry real
 *    so fica pronto apos o bootstrap). Nao persiste — os registries sao
 *    a fonte da verdade; re-projetar e barato e sempre atual.
 *  - Drift detection: sinaliza mappings que referenciam connectors/capabilities
 *    inexistentes no runtime (planejamento vs runtime dessincronizados).
 *
 * SAIDAS:
 *  - buildArchitectureMap() → ArchitectureMap completo
 *  - expectedCapabilitiesFor(goalType) → ExpectedCapability[] (query do Coverage)
 *  - validateMappingIntegrity() → DriftReport (bugs de drift arquitetural)
 */

import { GoalCapabilityRegistry, type CapabilityDescriptor } from "@/lib/planning-engine-e022/GoalCapabilityRegistry";
import type { GoalType } from "@/lib/goals/GoalTypes";
import { getRealConnectorRegistry } from "@/lib/connector-runtime-provider/ConnectorRuntimeProvider";
import type { ConnectorRegistry } from "@/lib/connector-runtime/ConnectorRegistry";
import type { ConnectorMetadata, Reversibility } from "@/lib/connector-runtime/ConnectorTypes";

// ── Tipos do mapa ────────────────────────────────────────────────────────────

export interface ExpectedCapability {
  readonly connector: string;
  readonly capability: string;
  readonly reversibility: Reversibility;
  readonly composite: boolean;
}

export interface ConnectorMetaProjection {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly string[];
}

export interface ArchitectureMap {
  readonly goals: ReadonlyMap<GoalType, readonly ExpectedCapability[]>;
  readonly connectors: ReadonlyMap<string, ConnectorMetaProjection>;
  readonly builtAt: number;
  readonly goalCount: number;
  readonly connectorCount: number;
  readonly totalExpectedCapabilities: number;
}

// ── Drift detection ───────────────────────────────────────────────────────────

export interface DriftFinding {
  readonly goalType: GoalType;
  readonly connector: string;
  readonly capability: string;
  readonly kind: "missing_connector" | "missing_capability";
}

export interface DriftReport {
  readonly findings: readonly DriftFinding[];
  readonly hasDrift: boolean;
  readonly checkedAt: number;
}

// ── ArchitectureIndexer ───────────────────────────────────────────────────────

function projectDescriptor(
  desc: CapabilityDescriptor,
  meta: ConnectorMetadata | undefined,
): ExpectedCapability {
  const reversibility: Reversibility = meta?.capabilityReversibility?.[desc.capability] ?? "safe";
  const composite: boolean = meta?.capabilityComposite?.[desc.capability] ?? false;
  return Object.freeze({
    connector: desc.connector,
    capability: desc.capability,
    reversibility,
    composite,
  });
}

export const ArchitectureIndexer = {
  /**
   * Projeta os registries vivos num ArchitectureMap.
   * Async pois o ConnectorRegistry real exige bootstrap.
   */
  async buildArchitectureMap(): Promise<ArchitectureMap> {
    const registry: ConnectorRegistry = await getRealConnectorRegistry();

    // Conectores
    const connectors = new Map<string, ConnectorMetaProjection>();
    for (const meta of registry.listAll()) {
      connectors.set(meta.id, Object.freeze({
        id: meta.id,
        name: meta.name,
        version: meta.version,
        capabilities: Object.freeze([...meta.capabilities]),
      }));
    }

    // Goals → ExpectedCapabilities
    const goals = new Map<GoalType, readonly ExpectedCapability[]>();
    let totalExpected = 0;
    for (const mapping of GoalCapabilityRegistry.listAll()) {
      const projected = mapping.descriptors.map((d) => projectDescriptor(d, registry.get(d.connector)?.metadata()));
      goals.set(mapping.goalType, Object.freeze(projected));
      totalExpected += projected.length;
    }

    return Object.freeze({
      goals,
      connectors,
      builtAt: Date.now(),
      goalCount: goals.size,
      connectorCount: connectors.size,
      totalExpectedCapabilities: totalExpected,
    });
  },

  /**
   * Query direta do Coverage Analyzer: dado um Goal, o que DEVERIA rodar?
   * Retorna [] se o Goal nao tem mapping (Planner fallback / goal nao-mapeado).
   */
  async expectedCapabilitiesFor(goalType: GoalType): Promise<readonly ExpectedCapability[]> {
    const map = await this.buildArchitectureMap();
    return map.goals.get(goalType) ?? [];
  },

  /**
   * Drift detection: mappings que referenciam connectors/capabilities
   * inexistentes no runtime real. Cada finding e um bug arquitetural
   * (planejamento declarou algo que o runtime nao oferece).
   */
  async validateMappingIntegrity(): Promise<DriftReport> {
    const registry: ConnectorRegistry = await getRealConnectorRegistry();
    const findings: DriftFinding[] = [];

    for (const mapping of GoalCapabilityRegistry.listAll()) {
      for (const desc of mapping.descriptors) {
        const connector = registry.get(desc.connector);
        if (!connector) {
          findings.push({
            goalType: mapping.goalType,
            connector: desc.connector,
            capability: desc.capability,
            kind: "missing_connector",
          });
          continue;
        }
        const caps = connector.metadata().capabilities;
        if (!caps.includes(desc.capability)) {
          findings.push({
            goalType: mapping.goalType,
            connector: desc.connector,
            capability: desc.capability,
            kind: "missing_capability",
          });
        }
      }
    }

    return Object.freeze({
      findings: Object.freeze(findings),
      hasDrift: findings.length > 0,
      checkedAt: Date.now(),
    });
  },
};