/**
 * UUID utility — gera IDs únicos compatíveis com todos os ambientes
 * Foundation: MCS
 * Sprint: 1
 */

/**
 * Gera um UUID v4 usando crypto.randomUUID quando disponível,
 * com fallback manual para ambientes sem suporte completo.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback manual compatível com todos os browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}