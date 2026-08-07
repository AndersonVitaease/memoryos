/**
 * irreversibleUi.js — helpers compartilhados para UI cards que rodam
 * capabilities irreversiveis via IrreversibleCaller.
 *
 * Extraido de GmailActionsCard para reuso por GmailAdvancedCard (e futuros
 * cards de write ops). Mantem os cards focados em UI; a normalizacao de
 * outcome e o adapter de dialogo ficam aqui, DRY.
 *
 * outcomeToResult: normaliza ExecutionOutcome no shape que um ResultBanner
 *   consome (success | cancelled/expired | failed).
 * makePendingHandler: factory do handler onPending para o IrreversibleCaller —
 *   surfaceia o dialog e resolve a solicitacao no RuntimeConfirmationEngine.
 */

import { confirm, cancel } from "@/lib/runtime/RuntimeConfirmationEngine";

/**
 * Normaliza um ExecutionOutcome no shape que o ResultBanner consome.
 * - success → { ok, data } (data = inner data do connector, ex: { id, status })
 * - cancelled/expired → { ok:false, cancelled|expired:true, error }
 * - failed/blocked → { ok:false, error }
 */
export function outcomeToResult(outcome) {
  const out = outcome.output;
  if (outcome.status === "success") {
    return out && typeof out === "object" && "ok" in out
      ? out
      : { ok: true, data: out };
  }
  if (outcome.status === "cancelled") {
    return { ok: false, cancelled: true, error: outcome.message ?? "Ação cancelada." };
  }
  if (outcome.status === "expired") {
    return { ok: false, expired: true, error: outcome.message ?? "Confirmação expirou." };
  }
  return { ok: false, error: outcome.message ?? "Operação falhou." };
}

/**
 * Factory do handler onPending para o IrreversibleCaller: surfaceia o dialog
 * (via setPendingConfirm) e resolve a solicitacao no RuntimeConfirmationEngine
 * ao confirmar/cancelar.
 */
export function makePendingHandler(setPendingConfirm) {
  return (pendingReq) => setPendingConfirm({
    request: pendingReq,
    onConfirm: () => { confirm(pendingReq.id); setPendingConfirm(null); },
    onCancel: () => { cancel(pendingReq.id); setPendingConfirm(null); },
  });
}