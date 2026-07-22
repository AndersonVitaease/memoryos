/**
 * semantic-registry/index.ts — Engineering Sprint EF-6.3.x
 * Public barrel — registra os providers oficiais no Registry singleton.
 *
 * Padrao EF-6.3.x: 1 SemanticProvider por dominio.
 *   - DriveSemanticProvider: moderno (detect) — determina goalType internamente
 *   - GmailSemanticProvider: legado (score + implicitGoalType) — compativel
 *   - CalendarSemanticProvider: legado (score + implicitGoalType) — compativel
 *
 * Para adicionar um novo connector:
 *   1. Criar src/lib/semantic-registry/providers/SlackSemanticProvider.ts
 *      (implementar SemanticProvider com detect() — padrao moderno)
 *   2. Importar e registrar abaixo.
 *   Zero mudancas no detector.
 */

export type { SemanticProvider, SemanticDetection, SemanticScore } from "./SemanticTypes";
export { ConnectorSemanticRegistry } from "./ConnectorSemanticRegistry";

import { ConnectorSemanticRegistry } from "./ConnectorSemanticRegistry";
import { GmailSemanticProvider }     from "./providers/GmailSemanticProvider";
import { CalendarSemanticProvider }  from "./providers/CalendarSemanticProvider";
import { DriveSemanticProvider }     from "./providers/DriveSemanticProvider";
import { MemorySemanticProvider }    from "./providers/MemorySemanticProvider";
// [EXP-GITHUB-SEM] — remover esta linha + apagar GitHubSemanticProvider.ts para reverter
import { GitHubSemanticProvider }    from "./providers/GitHubSemanticProvider";

// Auto-register all official providers at module load.
// register() is idempotent — safe to call multiple times.
// 1 provider per domain — EF-6.3.x architectural standard.
ConnectorSemanticRegistry.register(GmailSemanticProvider    as never);
ConnectorSemanticRegistry.register(CalendarSemanticProvider as never);
ConnectorSemanticRegistry.register(DriveSemanticProvider    as never);
ConnectorSemanticRegistry.register(MemorySemanticProvider   as never);
// [EXP-GITHUB-SEM] — remover esta linha para reverter o experimento
ConnectorSemanticRegistry.register(GitHubSemanticProvider   as never);