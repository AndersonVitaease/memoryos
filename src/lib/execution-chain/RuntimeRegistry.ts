// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-09: RuntimeRegistry
// Every runtime module registers itself here with its metadata.
// Enables health monitoring, dependency tracking and capability discovery.
// ══════════════════════════════════════════════════════════════════════════════

export interface RuntimeDescriptor {
  readonly id:           string;
  readonly version:      string;
  readonly owner:        string;
  readonly capabilities: readonly string[];
  readonly dependencies: readonly string[];
  readonly lifecycle:    "singleton" | "scoped" | "transient";
  readonly health:       () => RuntimeHealthStatus;
}

export interface RuntimeHealthStatus {
  readonly status:       "healthy" | "degraded" | "unhealthy";
  readonly uptime:       number;
  readonly version:      string;
  readonly dependencies: readonly string[];
}

export class RuntimeRegistry {
  private readonly _registry = new Map<string, RuntimeDescriptor>();
  private readonly _startedAt: number;

  constructor(now: number) {
    this._startedAt = now;
  }

  register(descriptor: RuntimeDescriptor): void {
    this._registry.set(descriptor.id, Object.freeze(descriptor));
  }

  resolve(id: string): RuntimeDescriptor | undefined {
    return this._registry.get(id);
  }

  listAll(): RuntimeDescriptor[] {
    return Array.from(this._registry.values());
  }

  health(): Record<string, RuntimeHealthStatus> {
    const result: Record<string, RuntimeHealthStatus> = {};
    for (const [id, desc] of this._registry) {
      result[id] = desc.health();
    }
    return result;
  }

  uptime(now: number): number {
    return now - this._startedAt;
  }
}