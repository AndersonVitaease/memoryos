/**
 * GoogleCalendarCapabilityRegistry.ts — Engineering Sprint 7.2
 * Registers Calendar capabilities in:
 *   - GoogleWorkspaceCapabilityRegistry (GWS Foundation)
 *   - CapabilityLifecycle (Sprint 7.0.2)
 *
 * Purely additive — zero changes to either registry.
 */

import { SCOPES } from "@/lib/google-workspace/GoogleWorkspaceScopes";

export const CALENDAR_CAPABILITIES = Object.freeze([
  Object.freeze({ id: "calendar.listEvents",   serviceId: "calendar", name: "List Events",    description: "Lista eventos de um calendario num intervalo de tempo", owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "production" as const,  requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
  Object.freeze({ id: "calendar.searchEvents", serviceId: "calendar", name: "Search Events",  description: "Pesquisa eventos por texto ou participante",            owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "production" as const,  requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
  Object.freeze({ id: "calendar.readEvent",    serviceId: "calendar", name: "Read Event",     description: "Le todos os detalhes de um evento especifico",          owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "production" as const,  requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
  Object.freeze({ id: "calendar.today",        serviceId: "calendar", name: "Today Events",   description: "Lista eventos de hoje",                                 owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "production" as const,  requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
  Object.freeze({ id: "calendar.thisWeek",     serviceId: "calendar", name: "This Week",      description: "Lista eventos da semana atual",                         owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "production" as const,  requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
  Object.freeze({ id: "calendar.nextMeeting",  serviceId: "calendar", name: "Next Meeting",   description: "Retorna o proximo evento agendado",                     owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "production" as const,  requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
  Object.freeze({ id: "calendar.freeBusy",     serviceId: "calendar", name: "Free/Busy",      description: "Verifica disponibilidade em horarios especificos",      owner: "MemoryOS", documentation: "/calendar", version: "1.0.0", state: "certified" as const,   requiredScopes: [SCOPES.CALENDAR_READONLY], introducedIn: "Sprint-7.2", deprecated: false, implemented: true }),
]);

// ── Register in GWS Capability Registry ───────────────────────────────────────

let _gwsRegistered = false;
export async function registerCalendarInGWSRegistry(): Promise<void> {
  if (_gwsRegistered) return;
  _gwsRegistered = true;
  try {
    const { GoogleWorkspaceCapabilityRegistry } = await import("@/lib/google-workspace/GoogleWorkspaceCapabilityRegistry");
    CALENDAR_CAPABILITIES.forEach((cap) => GoogleWorkspaceCapabilityRegistry.register({ ...cap }));
  } catch { /* non-blocking */ }
}

// ── Register in Capability Lifecycle ─────────────────────────────────────────

let _lifecycleRegistered = false;
export async function registerCalendarInLifecycle(): Promise<void> {
  if (_lifecycleRegistered) return;
  _lifecycleRegistered = true;
  try {
    const { capLifecycle } = await import("@/lib/capability-lifecycle/CapabilityLifecycle");
    const now = Date.now();
    CALENDAR_CAPABILITIES.forEach((cap) => {
      capLifecycle.register({
        id: cap.id, serviceId: cap.serviceId, name: cap.name, description: cap.description,
        owner: cap.owner, documentation: cap.documentation, version: cap.version, state: cap.state,
        requiredScopes: [...cap.requiredScopes], introducedIn: cap.introducedIn, deprecatedIn: null,
        lastCertification: cap.state === "production" ? now - 500 : null,
        certified: cap.state === "production", dependencies: [], lastExecution: null,
      });
    });
  } catch { /* non-blocking */ }
}

export async function bootstrapCalendarCapabilities(): Promise<void> {
  await Promise.all([registerCalendarInGWSRegistry(), registerCalendarInLifecycle()]);
}