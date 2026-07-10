// ─── Default Registry Bootstrap ──────────────────────────────────────────────
// Foundation v1.0 · Registra os 4 engines oficiais no singleton global

import { globalRegistry } from "./ReviewEngineRegistry";
import { MRIEngine }   from "./engines/MRIEngine";
import { MQCCSEngine } from "./engines/MQCCSEngine";
import { MERSEngine }  from "./engines/MERSEngine";
import { MADSEngine }  from "./engines/MADSEngine";

let _bootstrapped = false;

/** Idempotent — safe to call multiple times. */
export function bootstrapDefaultRegistry(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;

  for (const Engine of [MRIEngine, MQCCSEngine, MERSEngine, MADSEngine]) {
    const engine = new (Engine as any)();
    if (!globalRegistry.has(engine.id)) {
      globalRegistry.register(engine);
    }
  }
}