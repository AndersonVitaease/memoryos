/**
 * ReferenceMessage.ts — Sprint C-02.3
 * Modelo canonico para qualquer mensagem pesquisavel.
 *
 * SRP: representar uma mensagem de forma neutra ao Connector.
 * Nenhuma propriedade especifica de Gmail, Outlook, Slack etc.
 * A conversao e responsabilidade exclusiva do Connector adapter.
 *
 * Mapeamento esperado pelos adapters:
 *   Gmail:   id → id, subject → title, from → author, snippet → summary, internalDate → date
 *   Outlook: id → id, subject → title, sender.emailAddress.name → author, bodyPreview → summary
 */

export interface ReferenceMessage {
  /** Identificador tecnico da mensagem no Connector de origem */
  readonly id: string;
  /** Assunto ou titulo da mensagem — campo primario de matching */
  readonly title: string;
  /** Remetente ou autor — campo secundario de matching */
  readonly author: string;
  /** Trecho ou preview do conteudo — campo terciario de matching */
  readonly summary: string;
  /** Data da mensagem (ISO 8601 ou epoch string) — usada para fallback por recencia */
  readonly date: string;
}