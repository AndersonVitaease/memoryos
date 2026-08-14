/**
 * automationSpec -- Contrato minimo de uma AutomationSpec.
 *
 * Representa uma AUTOMACAO EXECUTAVEL derivada de uma CapabilityCandidate.
 * Distinta de CapabilityCandidate (descoberta) e de CapabilityMap (validada).
 *
 * Reusa estruturas existentes:
 *   - capabilityId  <- CapabilityCandidate.canonical_id (capabilityIdentity.ts)
 *   - siteOrigin    <- originOf(site_url)
 *   - entryUrl      <- discovered_from_url
 *   - inputs        <- input_fields (normalizados)
 *   - actions       <- flow (WhereWhatPair[]) se existir (maxunImport/webConnectorConnect)
 *   - robotId       <- robot Maxun (maxunImport/maxunRun)
 *   - riskLevel/capabilityType <- CapabilityCandidate.risk_level/capability_type
 *
 * Sem campos inventados. Sem framework generica.
 */
import { originOf } from './capabilityIdentity.ts';

export type AutomationExecutor = 'playwright' | 'maxun';

export type SpecValidationStatus = 'pending' | 'pass' | 'fail' | 'inconclusive';

export interface WhereWhatPair {
  where?: { url?: string; [k: string]: unknown };
  what?: Array<{ action: string; args?: unknown[]; name?: string }>;
}

export interface AutomationSpec {
  specVersion: 1;
  capabilityId: string;
  siteOrigin: string;
  entryUrl: string;
  executor: AutomationExecutor;
  webSessionRequired: boolean;
  inputs: string[];
  actions: WhereWhatPair[] | null;
  robotId: string | null;
  targetUrl: string | null;
  riskLevel: 'safe' | 'reversible' | 'irreversible';
  capabilityType: 'READ' | 'WRITE';
  expectedResult: { kind: 'links' | 'snapshot' | 'extracted'; minItems?: number };
  validation: { status: SpecValidationStatus; notes?: string };
}

export const SPEC_VERSION = 1 as const;

export function makeSpecId(): string {
  return 'spec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Normaliza site_url -> origin. Reusa originOf (capabilityIdentity.ts).
 */
export function specSiteOrigin(siteUrl: string): string {
  return originOf(siteUrl);
}