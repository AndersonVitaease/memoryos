/**
 * ConfirmationProvider — Engineering Sprint E-01 (+ EI-04 confirm bridge)
 * Provider React centralizado para comunicacao com RuntimeConfirmationEngine.
 *
 * A UI nao conversa diretamente com o Engine. Sempre atraves deste Provider.
 *
 * Expoe: dialog (JSX), requestAction(opts, action) → Promise<result|null>
 *
 * EI-04: poll bridge — renderiza o dialog para solicitacoes criadas
 * EXTERNAMENTE (pelo pipeline / cadeia Execution Intelligence), nao apenas as
 * criadas via requestAction. Prevencao de dialogo duplicado via shownIdsRef:
 * requestAction marca o id da solicitacao que ela mesma cria; o poll so exibe
 * ids ainda nao rastreados. Assim o pipeline pode chamar requestConfirmation
 * (engine) direto e o dialog aparece aqui.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import {
  requestConfirmation, confirm, cancel, listPending,
} from "@/lib/runtime/RuntimeConfirmationEngine";

const ConfirmationCtx = createContext(null);

// ── Dialog component ──────────────────────────────────────────────────────────

function ConfirmationDialog({ request, onConfirm, onCancel }) {
  if (!request) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-zinc-800 text-sm">{request.title}</p>
            <p className="text-sm text-zinc-600 mt-1">{request.description}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ConfirmationProvider({ children }) {
  // requestAction path (React-side)
  const [pendingUI, setPendingUI] = useState(null);
  // External path (pipeline / EI) — solicitacoes criadas fora do requestAction
  const [externalPending, setExternalPending] = useState(null);
  // IDs ja rastreados (requestAction ou poll) para evitar dialogo duplicado
  const shownIdsRef = useRef(new Set());

  /**
   * Solicita confirmacao ao usuario e, se confirmado, executa `action`.
   * @param {{ capability, title, description }} opts
   * @param {() => Promise<any>} action
   * @returns {Promise<any|null>} resultado da action, ou null se cancelado/expirado
   */
  const requestAction = useCallback(async (opts, action) => {
    let resolveDecision;
    const decision = new Promise(res => { resolveDecision = res; });

    // Registrar no Engine
    const enginePromise = requestConfirmation(opts);

    // Obter a solicitacao recem-criada
    const pending = listPending();
    const req = pending[pending.length - 1];
    // Marcar como rastreado para o poll nao duplicar
    shownIdsRef.current.add(req.id);

    // Mostrar dialog
    setPendingUI({ request: req, resolveDecision });

    // Aguardar decisao do usuario no dialog
    const userConfirmed = await decision;

    if (userConfirmed) confirm(req.id);
    else cancel(req.id);

    // Aguardar resolucao do Engine
    const result = await enginePromise;
    setPendingUI(null);

    if (!result.confirmed) return null;
    return action();
  }, []);

  // EI-04: poll bridge — exibe dialogs para solicitacoes criadas pelo pipeline
  // (via requestConfirmation direto). Enquanto um dialog externo esta aberto,
  // nao substitui; ao resolver, o proximo poll pega a proxima pendente.
  useEffect(() => {
    const interval = setInterval(() => {
      if (externalPending) return; // ja exibindo um
      const pending = listPending();
      const external = pending.find(r => !shownIdsRef.current.has(r.id));
      if (external) {
        shownIdsRef.current.add(external.id);
        setExternalPending(external);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [externalPending]);

  const handleExternalConfirm = useCallback(() => {
    if (!externalPending) return;
    confirm(externalPending.id);
    setExternalPending(null);
  }, [externalPending]);

  const handleExternalCancel = useCallback(() => {
    if (!externalPending) return;
    cancel(externalPending.id);
    setExternalPending(null);
  }, [externalPending]);

  // requestAction dialog (inalterado)
  const dialog = pendingUI ? (
    <ConfirmationDialog
      request={pendingUI.request}
      onConfirm={() => pendingUI.resolveDecision(true)}
      onCancel={() => pendingUI.resolveDecision(false)}
    />
  ) : null;

  const externalDialog = externalPending ? (
    <ConfirmationDialog
      request={externalPending}
      onConfirm={handleExternalConfirm}
      onCancel={handleExternalCancel}
    />
  ) : null;

  return (
    <ConfirmationCtx.Provider value={{ requestAction }}>
      {children}
      {dialog}
      {externalDialog}
    </ConfirmationCtx.Provider>
  );
}

export function useConfirmation() {
  const ctx = useContext(ConfirmationCtx);
  if (!ctx) throw new Error("useConfirmation must be used inside <ConfirmationProvider>");
  return ctx;
}