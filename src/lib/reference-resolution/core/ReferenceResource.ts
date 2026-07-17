/**
 * ReferenceResource.ts — Sprint C-02.3
 * Modelo canonico para qualquer recurso pesquisavel.
 *
 * SRP: representar um recurso de forma neutra ao Connector.
 * Nenhuma propriedade especifica de Google Drive, Dropbox, OneDrive etc.
 * A conversao e responsabilidade exclusiva do Connector adapter.
 *
 * Mapeamento esperado pelos adapters:
 *   Drive:  id → id, name → title, modifiedTime → lastModified
 *   Notion: id → id, title → title, last_edited_time → lastModified
 */

export interface ReferenceResource {
  /** Identificador tecnico do recurso no Connector de origem */
  readonly id: string;
  /** Titulo legivel — o campo principal de matching */
  readonly title: string;
  /** Resumo opcional — pode ser usado como campo secundario de matching */
  readonly summary?: string;
  /** Data de ultima modificacao (ISO 8601) — usada para fallback por recencia */
  readonly lastModified?: string;
  /** Metadados adicionais — opacos ao Core, para uso futuro pelos adapters */
  readonly metadata?: Readonly<Record<string, unknown>>;
}