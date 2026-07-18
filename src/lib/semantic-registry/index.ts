/**
 * semantic-registry/index.ts — Engineering Sprint 9.2.2
 * Public barrel — registra os 4 providers oficiais no Registry singleton.
 *
 * Para adicionar um novo connector:
 *   1. Criar src/lib/semantic-registry/providers/SlackSemanticProvider.ts
 *   2. Importar e registrar abaixo.
 *   Zero mudancas no detector.
 */

export type { SemanticProvider, SemanticScore } from "./SemanticTypes";
export { ConnectorSemanticRegistry } from "./ConnectorSemanticRegistry";

import { ConnectorSemanticRegistry } from "./ConnectorSemanticRegistry";
import { GmailSemanticProvider }    from "./providers/GmailSemanticProvider";
import { CalendarSemanticProvider } from "./providers/CalendarSemanticProvider";
import { DriveSemanticProvider, DriveOpenDocumentSemanticProvider } from "./providers/DriveSemanticProvider";
import { MemorySemanticProvider }   from "./providers/MemorySemanticProvider";

// Auto-register all official providers at module load.
// register() is idempotent — safe to call multiple times.
ConnectorSemanticRegistry.register(GmailSemanticProvider);
ConnectorSemanticRegistry.register(CalendarSemanticProvider);
ConnectorSemanticRegistry.register(DriveOpenDocumentSemanticProvider); // higher priority: download/open
ConnectorSemanticRegistry.register(DriveSemanticProvider);              // fallback: search
ConnectorSemanticRegistry.register(MemorySemanticProvider);