/**
 * DriveDebugStore.ts — Adapter layer (backward-compat shim)
 *
 * Mantém a interface que o DriveDebugPanel usava originalmente,
 * mas delega toda a logica para o RuntimeDebug (Event Bus oficial).
 *
 * O DriveDebugPanel foi migrado para consumir RuntimeDebug diretamente,
 * portanto este arquivo existe apenas para garantir que importacoes legadas
 * nao quebrem durante a transicao.
 */
export { RuntimeDebug as driveDebugStore } from "./RuntimeDebug";
export { installConsoleInterceptor } from "./ConsoleInterceptorLegacy";