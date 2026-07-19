/**
 * ConsoleInterceptorLegacy.ts
 *
 * Mantido apenas para compatibilidade com qualquer importacao remanescente.
 * Nao instala mais nenhum monkey-patch — e uma no-op segura.
 * O RuntimeDebug nao depende de interceptacao de console.
 */
export function installConsoleInterceptor(): void {
  // No-op — RuntimeDebug substitui essa abordagem completamente.
}