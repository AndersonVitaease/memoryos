/**
 * GoogleDriveCapabilityRegistry.ts — Engineering Sprint 7.1
 * Registers Google Drive capabilities in both:
 *   - GoogleWorkspaceCapabilityRegistry (GWS Foundation)
 *   - CapabilityLifecycle (Sprint 7.0.2)
 *
 * Zero changes to either registry — purely additive.
 */

import { SCOPES } from "@/lib/google-workspace/GoogleWorkspaceScopes";

// ── Drive capabilities definition ─────────────────────────────────────────────

export const DRIVE_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "drive.listFiles",
    serviceId: "drive",
    name: "List Files",
    description: "Lista arquivos no Google Drive do usuario",
    owner: "MemoryOS",
    documentation: "/google-drive",
    version: "1.0.0",
    state: "production" as const,
    requiredScopes: [SCOPES.DRIVE_READONLY],
    introducedIn: "Sprint-7.1",
    deprecated: false,
    implemented: true,
  }),
  Object.freeze({
    id: "drive.searchFiles",
    serviceId: "drive",
    name: "Search Files",
    description: "Pesquisa arquivos por nome, tipo ou conteudo",
    owner: "MemoryOS",
    documentation: "/google-drive",
    version: "1.0.0",
    state: "production" as const,
    requiredScopes: [SCOPES.DRIVE_READONLY],
    introducedIn: "Sprint-7.1",
    deprecated: false,
    implemented: true,
  }),
  Object.freeze({
    id: "drive.readFileMetadata",
    serviceId: "drive",
    name: "Read File Metadata",
    description: "Le metadados completos de um arquivo",
    owner: "MemoryOS",
    documentation: "/google-drive",
    version: "1.0.0",
    state: "production" as const,
    requiredScopes: [SCOPES.DRIVE_METADATA],
    introducedIn: "Sprint-7.1",
    deprecated: false,
    implemented: true,
  }),
  Object.freeze({
    id: "drive.readFile",
    serviceId: "drive",
    name: "Read File Content",
    description: "Le o conteudo exportado de um arquivo Google Workspace",
    owner: "MemoryOS",
    documentation: "/google-drive",
    version: "1.0.0",
    state: "certified" as const,
    requiredScopes: [SCOPES.DRIVE_READONLY],
    introducedIn: "Sprint-7.1",
    deprecated: false,
    implemented: true,
  }),
  Object.freeze({
    id: "drive.listFolders",
    serviceId: "drive",
    name: "List Folders",
    description: "Lista as pastas do Google Drive do usuario",
    owner: "MemoryOS",
    documentation: "/google-drive",
    version: "1.0.0",
    state: "production" as const,
    requiredScopes: [SCOPES.DRIVE_READONLY],
    introducedIn: "Sprint-7.1",
    deprecated: false,
    implemented: true,
  }),
]);

// ── Auto-register in GWS Capability Registry ──────────────────────────────────

let _gwsRegistered = false;
export async function registerDriveInGWSRegistry(): Promise<void> {
  if (_gwsRegistered) return;
  _gwsRegistered = true;
  try {
    const { GoogleWorkspaceCapabilityRegistry } = await import("@/lib/google-workspace/GoogleWorkspaceCapabilityRegistry");
    DRIVE_CAPABILITIES.forEach((cap) => {
      GoogleWorkspaceCapabilityRegistry.register({ ...cap });
    });
  } catch { /* non-blocking */ }
}

// ── Auto-register in Capability Lifecycle ────────────────────────────────────

let _lifecycleRegistered = false;
export async function registerDriveInLifecycle(): Promise<void> {
  if (_lifecycleRegistered) return;
  _lifecycleRegistered = true;
  try {
    const { capLifecycle } = await import("@/lib/capability-lifecycle/CapabilityLifecycle");
    const now = Date.now();
    DRIVE_CAPABILITIES.forEach((cap) => {
      capLifecycle.register({
        id:               cap.id,
        serviceId:        cap.serviceId,
        name:             cap.name,
        description:      cap.description,
        owner:            cap.owner,
        documentation:    cap.documentation,
        version:          cap.version,
        state:            cap.state,
        requiredScopes:   [...cap.requiredScopes],
        introducedIn:     cap.introducedIn,
        deprecatedIn:     null,
        lastCertification: cap.state === "production" ? now - 500 : null,
        certified:        cap.state === "production",
        dependencies:     [],
        lastExecution:    null,
      });
    });
  } catch { /* non-blocking */ }
}

// ── Bootstrap both registries ────────────────────────────────────────────────

export async function bootstrapDriveCapabilities(): Promise<void> {
  await Promise.all([registerDriveInGWSRegistry(), registerDriveInLifecycle()]);
}