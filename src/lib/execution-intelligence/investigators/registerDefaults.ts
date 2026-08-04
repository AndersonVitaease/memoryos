/**
 * registerDefaults.ts — EI-07 (RFC-008 / ADR-015)
 *
 * Side-effect module: registra os investigators de dominio padrao no
 * InvestigatorRegistry. Importado por index.ts (side-effect import) para que,
 * quando o runtime wiring for carregado (por um caller vivo pos-migracao), os
 * investigators ja estejam ativos. Open/Closed: novos investigators sao
 * adicionados aqui (ou em modulos de dominio proprios) sem mexer no
 * ExecutionIntelligence.
 *
 * Hoje (EI-07): TravelInvestigator (passagem aerea — dorme ate connector
 * Travellink existir) + EmailInvestigator (envio de email — ativo para
 * sendEmail/mail.send/email.send). Deterministicos (sem LLM/cross-connector).
 *
 * Idempotente via flag _done (re-imports seguras, inclusive HMR).
 */

import { investigatorRegistry } from "./InvestigatorRegistry";
import { TravelInvestigator } from "./TravelInvestigator";
import { EmailInvestigator } from "./EmailInvestigator";

let _done = false;

/** Registra os investigators de dominio padrao (idempotente). */
export function registerDefaultInvestigators(): void {
  if (_done) return;
  investigatorRegistry.register(new TravelInvestigator());
  investigatorRegistry.register(new EmailInvestigator());
  _done = true;
}

// Auto-registro no load do modulo.
registerDefaultInvestigators();