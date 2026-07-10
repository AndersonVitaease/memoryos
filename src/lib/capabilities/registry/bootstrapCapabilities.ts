// ─── Bootstrap Capabilities ───────────────────────────────────────────────────
// Foundation v1.0 · Registra os 4 engines oficiais no CapabilityRegistry global
// Mantém compatibilidade com bootstrapDefaultRegistry (ReviewEngineRegistry)

import { globalCapabilityRegistry } from "./CapabilityRegistry";
import { toCapability }   from "./ReviewEngineAdapter";
import { MRIEngine }   from "../../review/registry/engines/MRIEngine";
import { MQCCSEngine } from "../../review/registry/engines/MQCCSEngine";
import { MERSEngine }  from "../../review/registry/engines/MERSEngine";
import { MADSEngine }  from "../../review/registry/engines/MADSEngine";

// Also keep the legacy registry in sync
import { bootstrapDefaultRegistry } from "../../review/registry/defaultRegistry";

let _bootstrapped = false;

/** Idempotent — safe to call multiple times. */
export function bootstrapCapabilities(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;

  // 1. Keep legacy ReviewEngineRegistry working
  bootstrapDefaultRegistry();

  // 2. Register in the unified CapabilityRegistry
  for (const Engine of [MRIEngine, MQCCSEngine, MERSEngine, MADSEngine]) {
    const cap = toCapability(new (Engine as any)());
    if (!globalCapabilityRegistry.has(cap.manifest.id)) {
      globalCapabilityRegistry.register(cap);
    }
  }
}