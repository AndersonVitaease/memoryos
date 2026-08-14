/**
 * executorSelector -- UNICO ponto que decide o executor de uma AutomationSpec.
 *
 * Centraliza a decisao que hoje estava espalhada (WebSiteIntentResolver
 * checa provider==="maxun"; webConnectorConnect branch early). Nao executa nada.
 *
 * Regras:
 *  - spec.executor e a fonte de verdade (setada pelo Compiler).
 *  - capabilities legadas (sem automation) continuam pelo caminho atual.
 *  - WRITE nunca retorna maxun para auto-execucao (ja bloqueado no Compiler).
 */
import type { AutomationExecutor, AutomationSpec } from './automationSpec.ts';

export interface SelectResult {
  executor: AutomationExecutor | null;
  reason: string;
}

export function selectExecutor(spec: AutomationSpec | null | undefined): SelectResult {
  if (!spec) return { executor: null, reason: 'no_spec' };
  // WRITE nunca auto-executa.
  if (spec.capabilityType === 'WRITE') return { executor: null, reason: 'write_blocked' };
  // Validador exige webSession para playwright.
  if (spec.executor === 'playwright' && spec.webSessionRequired) {
    return { executor: 'playwright', reason: 'playwright_websession_required' };
  }
  if (spec.executor === 'maxun') {
    if (!spec.robotId && !spec.targetUrl) {
      return { executor: null, reason: 'maxun_no_robot_and_no_target' };
    }
    return { executor: 'maxun', reason: spec.robotId ? 'maxun_existing_robot' : 'maxun_auto_create' };
  }
  return { executor: null, reason: 'unknown_executor' };
}