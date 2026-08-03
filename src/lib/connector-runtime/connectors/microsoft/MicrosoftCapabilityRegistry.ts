/**
 * MicrosoftCapabilityRegistry.ts — mapa operation -> Capability Executor.
 *
 * Adicionar um servico novo = adicionar uma entrada neste array + um arquivo
 * de executor. O shell (MicrosoftGraphConnector) NUNCA cresce — apenas delega.
 *
 * Fase 0 (este arquivo): 3 executors extraidos do conector original.
 * Fases 2-4 (RFC-006): adicionar Contacts, To Do, OneNote, Teams, SharePoint,
 * Excel/Word/PowerPoint Online aqui.
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import { OutlookMailCapability } from "./OutlookMailCapability";
import { OutlookCalendarCapability } from "./OutlookCalendarCapability";
import { OneDriveCapability } from "./OneDriveCapability";

const CAPABILITIES: readonly MicrosoftCapability[] = [
  OutlookMailCapability,
  OutlookCalendarCapability,
  OneDriveCapability,
];

const _byOperation = new Map<string, MicrosoftCapability>();
for (const cap of CAPABILITIES) {
  for (const op of cap.operations) _byOperation.set(op, cap);
}

/** Resolve qual executor trata uma operation, ou null se desconhecida. */
export function resolveCapability(operation: string): MicrosoftCapability | null {
  return _byOperation.get(operation) ?? null;
}

/** Lista todas as operations suportadas (usada em metadata.capabilities). */
export function listAllOperations(): string[] {
  return Array.from(_byOperation.keys());
}