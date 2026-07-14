/**
 * ConnectorRuntime.ts — Sprint 6.3.0
 * The single runtime host for all connectors.
 * No connector may execute outside this runtime.
 */

import type { ConnectorDescriptor, UCPRuntimeStats } from "./UCPTypes";
import { ConnectorRegistry }    from "./ConnectorRegistry";
import { ConnectorFactory, ConnectorBlueprint } from "./ConnectorFactory";
import { ConnectorLifecycle }   from "./ConnectorLifecycle";
import { ConnectorHealth }      from "./ConnectorHealth";
import { ConnectorMetrics }     from "./ConnectorMetrics";
import { ConnectorLogger }      from "./ConnectorLogger";
import { ConnectorAudit }       from "./ConnectorAudit";
import { ConnectorDiagnostics } from "./ConnectorDiagnostics";

export class ConnectorRuntime {
  readonly registry    = new ConnectorRegistry();
  readonly factory     = new ConnectorFactory();
  readonly lifecycle   = new ConnectorLifecycle();
  readonly health      = new ConnectorHealth();
  readonly metrics     = new ConnectorMetrics();
  readonly logger      = new ConnectorLogger();
  readonly audit       = new ConnectorAudit();
  readonly diagnostics = new ConnectorDiagnostics();

  private readonly _startedAt = Date.now();
  private readonly _version   = "6.3.0";
  private _running = false;

  start(): void {
    if (this._running) return;
    this._running = true;
    this.logger.info("runtime", `ConnectorRuntime ${this._version} started`);
  }

  stop(): void {
    this._running = false;
    this.logger.info("runtime", "ConnectorRuntime stopped");
  }

  isRunning(): boolean { return this._running; }

  /** Install a connector via blueprint — factory → registry → lifecycle → audit */
  install(blueprint: ConnectorBlueprint): ConnectorDescriptor {
    if (!this._running) throw new Error("ConnectorRuntime is not started");

    const descriptor = this.factory.create(blueprint);
    this.registry.register(descriptor);
    this.lifecycle.init(descriptor.id);
    this.health.mark(descriptor.id, "UNKNOWN", "Registered, awaiting configuration");
    this.audit.install(descriptor.id, `Installed ${descriptor.displayName} v${descriptor.version.label}`);
    this.logger.info(descriptor.id, `Connector ${descriptor.displayName} installed`);

    return descriptor;
  }

  /** Transition lifecycle and sync to registry */
  transitionLifecycle(connectorId: string, to: ConnectorDescriptor["lifecycle"]): void {
    this.lifecycle.transition(connectorId, to);
    this.registry.update(connectorId, { lifecycle: to, updatedAt: Date.now() });
    this.audit.lifecycleChange(connectorId, `Lifecycle → ${to}`);
    this.logger.info(connectorId, `Lifecycle transitioned to ${to}`);
  }

  /** Run diagnostics and sync health */
  runDiagnostics(connectorId: string): ReturnType<ConnectorDiagnostics["run"]> {
    const descriptor = this.registry.get(connectorId);
    if (!descriptor) throw new Error(`Connector ${connectorId} not found`);

    // Sync current lifecycle into descriptor for diagnostics
    const current = this.lifecycle.get(connectorId);
    const fresh = { ...descriptor, lifecycle: current };
    const result = this.diagnostics.run(fresh);

    if (result.overall) {
      this.health.mark(connectorId, "HEALTHY", "Diagnostics passed");
    } else {
      this.health.mark(connectorId, "DEGRADED", result.details.filter(d => d.startsWith("FAIL")).join("; "));
    }
    this.registry.update(connectorId, { health: this.health.get(connectorId) });
    return result;
  }

  stats(): UCPRuntimeStats {
    const all = this.registry.all();
    return {
      totalConnectors:   all.length,
      readyConnectors:   all.filter(c => c.lifecycle === "READY").length,
      degradedConnectors: all.filter(c => c.lifecycle === "DEGRADED").length,
      failedConnectors:  all.filter(c => c.lifecycle === "FAILED").length,
      totalCallsAllTime: this.metrics.totalCallsAllConnectors(),
      runtimeStartedAt:  this._startedAt,
      version:           this._version,
    };
  }
}