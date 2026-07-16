/**
 * GoogleWorkspaceCapabilityRegistry.ts — Engineering Sprint 7.0
 * Central registry of all GWS capabilities across all services.
 * Capabilities are registered by each service module at import time.
 */

import type { GWSCapability, GWSServiceId } from "./GoogleWorkspaceTypes";

// ── Registry ──────────────────────────────────────────────────────────────────

class CapabilityRegistryClass {
  private readonly _byId      = new Map<string, GWSCapability>();
  private readonly _byService = new Map<GWSServiceId, GWSCapability[]>();

  /**
   * Register a capability. Idempotent by id.
   */
  register(capability: GWSCapability): void {
    if (this._byId.has(capability.id)) return;
    this._byId.set(capability.id, capability);

    const list = this._byService.get(capability.serviceId) ?? [];
    list.push(capability);
    this._byService.set(capability.serviceId, list);
  }

  /**
   * Register multiple capabilities at once.
   */
  registerMany(capabilities: GWSCapability[]): void {
    capabilities.forEach((c) => this.register(c));
  }

  get(id: string): GWSCapability | null {
    return this._byId.get(id) ?? null;
  }

  forService(serviceId: GWSServiceId): GWSCapability[] {
    return this._byService.get(serviceId) ?? [];
  }

  all(): GWSCapability[] {
    return [...this._byId.values()];
  }

  ids(): string[] {
    return [...this._byId.keys()];
  }

  get size(): number {
    return this._byId.size;
  }
}

const _KEY = "__GWS_CAP_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilityRegistryClass();
}
export const GoogleWorkspaceCapabilityRegistry: CapabilityRegistryClass = (
  globalThis as unknown as Record<string, CapabilityRegistryClass>
)[_KEY];

// ── Bootstrap: stub capabilities for all planned services ─────────────────────
// Each service module replaces stubs with real implementations at import time.

const SERVICE_STUBS: Array<{ id: string; serviceId: GWSServiceId; name: string; desc: string; scopes: string[] }> = [
  // Drive
  { id: "drive.list_files",     serviceId: "drive",    name: "List Files",      desc: "List files in Google Drive",          scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
  { id: "drive.get_file",       serviceId: "drive",    name: "Get File",        desc: "Get file metadata",                   scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
  { id: "drive.search",         serviceId: "drive",    name: "Search Files",    desc: "Search files by name or content",     scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
  // Calendar
  { id: "calendar.list_events", serviceId: "calendar", name: "List Events",     desc: "List calendar events",                scopes: ["https://www.googleapis.com/auth/calendar.readonly"] },
  { id: "calendar.get_event",   serviceId: "calendar", name: "Get Event",       desc: "Get a specific event",                scopes: ["https://www.googleapis.com/auth/calendar.readonly"] },
  { id: "calendar.create_event",serviceId: "calendar", name: "Create Event",    desc: "Create a new calendar event",         scopes: ["https://www.googleapis.com/auth/calendar.events"] },
  // Contacts
  { id: "contacts.list",        serviceId: "contacts", name: "List Contacts",   desc: "List Google Contacts",                scopes: ["https://www.googleapis.com/auth/contacts.readonly"] },
  { id: "contacts.search",      serviceId: "contacts", name: "Search Contacts", desc: "Search contacts by name or email",    scopes: ["https://www.googleapis.com/auth/contacts.readonly"] },
  // Docs
  { id: "docs.get",             serviceId: "docs",     name: "Get Document",    desc: "Get a Google Doc",                    scopes: ["https://www.googleapis.com/auth/documents.readonly"] },
  { id: "docs.list",            serviceId: "docs",     name: "List Documents",  desc: "List Google Docs via Drive",          scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
  // Sheets
  { id: "sheets.get",           serviceId: "sheets",   name: "Get Spreadsheet", desc: "Get a Google Sheet",                  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] },
  { id: "sheets.read_range",    serviceId: "sheets",   name: "Read Range",      desc: "Read cell range from a sheet",        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] },
  // Tasks
  { id: "tasks.list",           serviceId: "tasks",    name: "List Tasks",      desc: "List Google Tasks",                   scopes: ["https://www.googleapis.com/auth/tasks.readonly"] },
  { id: "tasks.create",         serviceId: "tasks",    name: "Create Task",     desc: "Create a new Google Task",            scopes: ["https://www.googleapis.com/auth/tasks"] },
  // Keep
  { id: "keep.list_notes",      serviceId: "keep",     name: "List Notes",      desc: "List Google Keep notes (when available)", scopes: [] },
];

SERVICE_STUBS.forEach(({ id, serviceId, name, desc, scopes }) => {
  GoogleWorkspaceCapabilityRegistry.register({
    id,
    serviceId,
    name,
    description:    desc,
    requiredScopes: scopes,
    handler: async () => ({
      success:    false,
      data:       null,
      error:      `Capability "${id}" not yet implemented — stub only`,
      durationMs: 0,
    }),
  });
});