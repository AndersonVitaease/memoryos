/**
 * OperationalContextStore.ts — Sprint C-03.0
 * Repositorio interno do contexto operacional.
 *
 * Acesso exclusivo via OperationalContextManager.
 * Nao exportar instancia diretamente — use o Manager.
 * Estado em memoria — jamais persiste.
 */

import type { OperationalContext } from "./OperationalContext";
import { emptyContext }            from "./OperationalContext";

export class OperationalContextStore {
  private _ctx: OperationalContext = emptyContext();

  get(): OperationalContext {
    return this._ctx;
  }

  set(ctx: OperationalContext): void {
    this._ctx = ctx;
  }

  reset(): void {
    this._ctx = emptyContext();
  }
}