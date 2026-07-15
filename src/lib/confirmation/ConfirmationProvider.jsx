/**
 * ConfirmationProvider — Engineering Sprint E-01
 * Provider React centralizado para comunicacao com RuntimeConfirmationEngine.
 *
 * A UI nao conversa diretamente com o Engine.
 * Sempre atraves deste Provider.
 *
 * Expoe: dialog (JSX), requestAction(opts, action) → Promise<result|null>
 */

import { createContext, useContext, useState, useCallback } from "react";
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
  const [pendingUI, setPendingUI] = useState(null);

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

  const dialog = pendingUI ? (
    <ConfirmationDialog
      request={pendingUI.request}
      onConfirm={() => pendingUI.resolveDecision(true)}
      onCancel={() => pendingUI.resolveDecision(false)}
    />
  ) : null;

  return (
    <ConfirmationCtx.Provider value={{ requestAction }}>
      {children}
      {dialog}
    </ConfirmationCtx.Provider>
  );
}

export function useConfirmation() {
  const ctx = useContext(ConfirmationCtx);
  if (!ctx) throw new Error("useConfirmation must be used inside <ConfirmationProvider>");
  return ctx;
}