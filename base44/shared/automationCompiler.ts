/**
 * automationCompiler -- Transforma CapabilityCandidate (descoberta) em
 * AutomationSpec (automacao executavel). Deterministico. SEM browser. SEM
 * Maxun. SEM CapabilityMap.
 *
 * Regras:
 *  - capability_type=WRITE -> COMPILATION_FAILED{write_blocked} (nao auto-executa).
 *  - Sem discovered_from_url -> COMPILATION_FAILED.
 *  - READ sem input_fields: scrape puro -> pode ser Maxun-creatable (publica).
 *  - READ com input_fields: form-fill; Maxun-creatable apenas se redutivel a
 *    targetUrl (enabler form_action/form_method fora desta etapa) -> NOT_CREATABLE
 *    -> executor=playwright.
 *  - Se Candidate possuir robotId associado (pre-existente via maxunImport):
 *    executor=maxun, reusa robotId.
 *  - webSessionRequired: playwright=true; maxun=false.
 *
 * Resultado:
 *   AutomationSpec  (status validation=pending)
 *   COMPILATION_FAILED { reason }
 *
 * Nao inventa selectors/elementos. Usa apenas dados reais do Candidate.
 */
import { canonicalizeId, computeIdentityHash, originOf } from './capabilityIdentity.ts';
import { AutomationSpec } from './automationSpec.ts';

export type CompilationFailed = { ok: false; reason: string; detail?: string };
export type CompilationOk = { ok: true; spec: AutomationSpec };
export type CompilationResult = CompilationOk | CompilationFailed;

// Entrada esperada: registro CapabilityCandidate ( campos snake_case do schema ).
export interface CandidateInput {
  id: string;
  site_url: string;
  suggested_id: string;
  description?: string;
  evidence: string;        // JSON array
  input_fields: string;   // JSON array
  discovered_from_url: string;
  status: string;
  canonical_id?: string;
  identity_hash?: string;
  capability_type?: string;
  risk_level?: string;
}

interface AssociatedRobot {
  robotId: string;
  flow?: unknown[];
}

// Uma AutomationSpec e "Maxun-creatable" sse:
//  - capabilityType === 'READ'
//  - webSessionRequired === false (publica)
//  - inputs.length === 0 (scrape puro de entryUrl)  -> duplicate(entryUrl)
//  - NAO ha inputs (form-fill com POST autenticado) -> nao e redutivel a URL
//    nesta etapa (sem enabler form_action/form_method).
// Se inputs.length > 0 -> NOT_CREATABLE (limitacao honesta do contrato Cloud).
export function isMaxunCreatable(spec: Pick<AutomationSpec, 'capabilityType' | 'webSessionRequired' | 'inputs'>): boolean {
  if (spec.capabilityType !== 'READ') return false;
  if (spec.webSessionRequired) return false;
  if (!Array.isArray(spec.inputs) || spec.inputs.length > 0) return false;
  return true;
}

export function compileCandidateToSpec(
  candidate: CandidateInput,
  associatedRobot?: AssociatedRobot | null,
): CompilationResult {
  // 1. WRITE bloqueado para auto-execucao.
  const capType = (candidate.capability_type === 'WRITE') ? 'WRITE' : 'READ';
  if (capType === 'WRITE') {
    return { ok: false, reason: 'write_blocked', detail: 'Capability WRITE nao e auto-executavel (governanca manual permanece).' };
  }

  // 2. Campos obrigatorios.
  const entryUrl = String(candidate.discovered_from_url || '').trim();
  if (!entryUrl) return { ok: false, reason: 'missing_entry_url' };

  const siteOrigin = originOf(candidate.site_url || entryUrl);

  // 3. Inputs (normalizados ja pelo discovery).
  let inputs: string[] = [];
  try {
    const p = JSON.parse(candidate.input_fields || '[]');
    if (Array.isArray(p)) inputs = p.map((x) => String(x)).filter(Boolean);
  } catch { inputs = []; }

  // 4. Evidence -- valida que ha ao menos uma evidence com snapshot_ref_found.
  let evidences: unknown[] = [];
  try {
    const p = JSON.parse(candidate.evidence || '[]');
    evidences = Array.isArray(p) ? p : [p];
  } catch { evidences = []; }
  const hasReliableEvidence = evidences.some((e) => {
    if (!e || typeof e !== 'object') return false;
    const ev = e as Record<string, unknown>;
    return ev.snapshot_ref_found === true || ev.element != null;
  });
  // READ com inputs exige evidence confiavel (form real). READ scrape puro
  // (inputs=0) aceita sem evidence (scrape da entryUrl).
  if (inputs.length > 0 && !hasReliableEvidence) {
    return { ok: false, reason: 'no_reliable_evidence' };
  }

  // 5. capabilityId = canonical_id (ja deterministico do discovery).
  const capabilityId = candidate.canonical_id || canonicalizeId(candidate.suggested_id || '');
  if (!capabilityId) return { ok: false, reason: 'cannot_derive_capability_id' };

  // 6. riskLevel.
  const riskLevel: 'safe' | 'reversible' | 'irreversible' =
    candidate.risk_level === 'reversible' ? 'reversible' :
    candidate.risk_level === 'irreversible' ? 'irreversible' : 'safe';

  // 7. robotId pre-existente (via maxunImport) -> executor maxun reutiliza.
  const hasRobot = Boolean(associatedRobot && associatedRobot.robotId);
  let robotId: string | null = null;
  let actions: AutomationSpec['actions'] = null;
  if (hasRobot && associatedRobot) {
    robotId = associatedRobot.robotId;
    if (Array.isArray(associatedRobot.flow) && associatedRobot.flow.length > 0) {
      actions = associatedRobot.flow as AutomationSpec['actions'];
    }
  }

  // 8. Determinar executor + webSessionRequired + targetUrl.
  // Ordem correta: computa creatability com o valor pretendido para Maxun
  // (webSessionRequired=false). Se creatable -> maxun; senao -> playwright.
  let executor: AutomationSpec['executor'];
  let webSessionRequired: boolean;
  let targetUrl: string | null = null;
  if (hasRobot) {
    executor = 'maxun';
    webSessionRequired = false; // maxun nunca exige WebSession
  } else {
    const creatable = isMaxunCreatable({ capabilityType: capType, webSessionRequired: false, inputs });
    if (creatable) {
      executor = 'maxun';
      targetUrl = entryUrl; // duplicate(entryUrl) -> robot de scrape puro
      webSessionRequired = false;
    } else {
      executor = 'playwright';
      webSessionRequired = true; // form-fill exige WebSession autenticada
    }
  }

  // 9. expectedResult: READ -> links (prioritario) ou snapshot (fallback).
  const expectedResult: AutomationSpec['expectedResult'] = inputs.length > 0
    ? { kind: 'links', minItems: 1 }
    : { kind: 'snapshot', minItems: undefined };

  const spec: AutomationSpec = {
    specVersion: 1,
    capabilityId,
    siteOrigin,
    entryUrl,
    executor,
    webSessionRequired,
    inputs,
    actions,
    robotId,
    targetUrl,
    riskLevel,
    capabilityType: capType,
    expectedResult,
    validation: { status: 'pending' },
  };

  return { ok: true, spec };
}