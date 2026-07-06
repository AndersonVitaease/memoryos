/**
 * Statistics Tests (Sprint 30)
 * Includes registeredByCategory and registeredByType.
 */

import { createStatistics } from "../statistics.js";

export const STATISTICS_TESTS = [
  { id: 159, name: "createStatistics returns frozen object", run: () => createStatistics(), assert: (r) => Object.isFrozen(r) },
  { id: 160, name: "inc increments registeredConnectors", run: () => { const s = createStatistics(); s.inc("registeredConnectors"); s.inc("registeredConnectors"); return s.get("registeredConnectors"); }, assert: (r) => r === 2 },
  { id: 161, name: "inc increments activeConnectors", run: () => { const s = createStatistics(); s.inc("activeConnectors", 5); return s.get("activeConnectors"); }, assert: (r) => r === 5 },
  { id: 162, name: "inc increments compatibleConnectors", run: () => { const s = createStatistics(); s.inc("compatibleConnectors", 3); return s.get("compatibleConnectors"); }, assert: (r) => r === 3 },
  { id: 163, name: "inc increments incompatibleConnectors", run: () => { const s = createStatistics(); s.inc("incompatibleConnectors", 2); return s.get("incompatibleConnectors"); }, assert: (r) => r === 2 },
  { id: 164, name: "inc increments connectorQueries", run: () => { const s = createStatistics(); s.inc("connectorQueries", 10); return s.get("connectorQueries"); }, assert: (r) => r === 10 },
  { id: 165, name: "dec decrements counters", run: () => { const s = createStatistics(); s.inc("registeredConnectors", 10); s.dec("registeredConnectors", 3); return s.get("registeredConnectors"); }, assert: (r) => r === 7 },
  { id: 166, name: "get returns 0 for unknown key", run: () => { const s = createStatistics(); return s.get("nonexistent"); }, assert: (r) => r === 0 },
  { id: 167, name: "inc on unknown key does nothing", run: () => { const s = createStatistics(); s.inc("unknownKey", 5); return s.get("unknownKey"); }, assert: (r) => r === 0 },
  // === registeredByCategory ===
  { id: 168, name: "incCategory increments category counter", run: () => { const s = createStatistics(); s.incCategory("email"); s.incCategory("email"); s.incCategory("crm"); return { email: s.getCategory("email"), crm: s.getCategory("crm") }; }, assert: (r) => r.email === 2 && r.crm === 1 },
  { id: 169, name: "decCategory decrements category counter", run: () => { const s = createStatistics(); s.incCategory("email", 5); s.decCategory("email", 2); return s.getCategory("email"); }, assert: (r) => r === 3 },
  { id: 170, name: "decCategory removes category when count reaches 0", run: () => { const s = createStatistics(); s.incCategory("email", 1); s.decCategory("email", 1); return s.snapshot().registeredByCategory; }, assert: (r) => r.email === undefined },
  { id: 171, name: "getCategory returns 0 for unknown category", run: () => { const s = createStatistics(); return s.getCategory("nonexistent"); }, assert: (r) => r === 0 },
  { id: 172, name: "incCategory ignores non-string", run: () => { const s = createStatistics(); s.incCategory(123); return s.getCategory("123"); }, assert: (r) => r === 0 },
  // === registeredByType ===
  { id: 173, name: "incType increments type counter", run: () => { const s = createStatistics(); s.incType("INBOUND"); s.incType("INBOUND"); s.incType("OUTBOUND"); return { inbound: s.getType("INBOUND"), outbound: s.getType("OUTBOUND") }; }, assert: (r) => r.inbound === 2 && r.outbound === 1 },
  { id: 174, name: "decType decrements type counter", run: () => { const s = createStatistics(); s.incType("INBOUND", 5); s.decType("INBOUND", 2); return s.getType("INBOUND"); }, assert: (r) => r === 3 },
  { id: 175, name: "decType removes type when count reaches 0", run: () => { const s = createStatistics(); s.incType("INBOUND", 1); s.decType("INBOUND", 1); return s.snapshot().registeredByType; }, assert: (r) => r.INBOUND === undefined },
  { id: 176, name: "getType returns 0 for unknown type", run: () => { const s = createStatistics(); return s.getType("nonexistent"); }, assert: (r) => r === 0 },
  // === Snapshot & Reset & Describe ===
  { id: 177, name: "snapshot returns all counters including category and type", run: () => { const s = createStatistics(); s.inc("registeredConnectors", 3); s.incCategory("email", 2); s.incCategory("crm", 1); s.incType("INBOUND", 2); s.incType("OUTBOUND", 1); return s.snapshot(); }, assert: (r) => r.registeredConnectors === 3 && r.registeredByCategory.email === 2 && r.registeredByCategory.crm === 1 && r.registeredByType.INBOUND === 2 && r.registeredByType.OUTBOUND === 1 },
  { id: 178, name: "resetStatistics zeroes all counters including category and type", run: () => { const s = createStatistics(); s.inc("registeredConnectors", 10); s.incCategory("email", 5); s.incType("INBOUND", 3); s.resetStatistics(); return s.snapshot(); }, assert: (r) => r.registeredConnectors === 0 && r.registeredByCategory.email === undefined && r.registeredByType.INBOUND === undefined },
  { id: 179, name: "describeStatistics returns readable string with category breakdown", run: () => { const s = createStatistics(); s.inc("registeredConnectors", 5); s.incCategory("email", 3); s.incType("INBOUND", 2); return s.describeStatistics(); }, assert: (r) => typeof r === "string" && r.includes("Connector Registry") && r.includes("Registered Connectors: 5") && r.includes("By Category:") && r.includes("email: 3") && r.includes("By Type:") && r.includes("INBOUND: 2") },
  { id: 180, name: "snapshot returns copies (not mutable references)", run: () => { const s = createStatistics(); s.inc("registeredConnectors", 1); s.incCategory("email", 1); const snap1 = s.snapshot(); s.inc("registeredConnectors", 1); s.incCategory("email", 1); const snap2 = s.snapshot(); return { rc1: snap1.registeredConnectors, rc2: snap2.registeredConnectors, cat1: snap1.registeredByCategory.email, cat2: snap2.registeredByCategory.email }; }, assert: (r) => r.rc1 === 1 && r.rc2 === 2 && r.cat1 === 1 && r.cat2 === 2 },
  { id: 181, name: "snapshot registeredByCategory is a copy", run: () => { const s = createStatistics(); s.incCategory("email", 1); const snap = s.snapshot(); snap.registeredByCategory.email = 999; return s.getCategory("email"); }, assert: (r) => r === 1 },
  { id: 182, name: "snapshot registeredByType is a copy", run: () => { const s = createStatistics(); s.incType("INBOUND", 1); const snap = s.snapshot(); snap.registeredByType.INBOUND = 999; return s.getType("INBOUND"); }, assert: (r) => r === 1 },
];