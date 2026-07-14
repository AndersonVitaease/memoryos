/**
 * RuntimePersistence.ts — Sprint 6.3.4
 * Singleton facade for the entire persistence layer.
 * Anchored to globalThis to survive HMR.
 */

import { PersistentSessionManager } from "./PersistentSessionManager";
import { RuntimePersistenceAudit }  from "./RuntimePersistenceAudit";
import { RuntimeBootstrapHistory }  from "./RuntimeBootstrapHistory";

const KEY = "__memoryos_runtime_persistence__";

function getInstance(): {
  sessions: PersistentSessionManager;
  audit:    RuntimePersistenceAudit;
  history:  RuntimeBootstrapHistory;
} {
  const g = globalThis as any;
  if (!g[KEY]) {
    g[KEY] = {
      sessions: new PersistentSessionManager(),
      audit:    new RuntimePersistenceAudit(),
      history:  new RuntimeBootstrapHistory(),
    };
  }
  return g[KEY];
}

export const RuntimePersistence = getInstance();