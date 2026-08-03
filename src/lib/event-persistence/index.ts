/**
 * event-persistence — barrel + auto-inicializacao do EventPersistenceBridge.
 *
 * Importar este modulo (side-effect) ativa a escuta do CognitiveEventBus
 * e a persistencia em SystemEvent. Nenhuma chamada explicita necessaria.
 *
 * Uso: `import "@/lib/event-persistence";` em qualquer ponto do live path
 * (ex.: ConversationManager.ts, que ja esta no caminho do ChatPage).
 */

import "./EventPersistenceBridge";

export { eventPersistenceBridge, EventPersistenceBridgeClass } from "./EventPersistenceBridge";