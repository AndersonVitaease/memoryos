/**
 * Base Connector (Sprint 29)
 *
 * Todo Connector do MemoryOS deverá obrigatoriamente herdar de BaseConnector.
 *
 * Implementa:
 *   initialize() — CREATED → INITIALIZED
 *   connect()    — INITIALIZED → CONNECTED (com hooks)
 *   disconnect() — CONNECTED → DISCONNECTED (com hooks)
 *   destroy()    — * → DESTROYED (com hooks)
 *
 * Implementações padrão. Subclasses podem sobrescrever.
 */

import { createLifecycleManager } from "./connectorLifecycle.js";
import { createHookManager } from "./connectorHooks.js";

export class BaseConnector {
  constructor(manifest) {
    this._manifest = manifest;
    this._lifecycle = createLifecycleManager();
    this._hooks = createHookManager();
  }

  get manifest() {
    return this._manifest;
  }

  get lifecycle() {
    return this._lifecycle;
  }

  get hooks() {
    return this._hooks;
  }

  initialize() {
    return this._lifecycle.transition("INITIALIZED");
  }

  connect() {
    const before = this._hooks.run("beforeConnect", { manifest: this._manifest });
    const transition = this._lifecycle.transition("CONNECTED");
    const after = this._hooks.run("afterConnect", { manifest: this._manifest });
    return { transition, before, after };
  }

  disconnect() {
    const before = this._hooks.run("beforeDisconnect", { manifest: this._manifest });
    const transition = this._lifecycle.transition("DISCONNECTED");
    const after = this._hooks.run("afterDisconnect", { manifest: this._manifest });
    return { transition, before, after };
  }

  destroy() {
    const before = this._hooks.run("beforeDestroy", { manifest: this._manifest });
    const transition = this._lifecycle.transition("DESTROYED");
    const after = this._hooks.run("afterDestroy", { manifest: this._manifest });
    return { transition, before, after };
  }
}