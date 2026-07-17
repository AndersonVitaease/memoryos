/**
 * Reference.ts — Sprint C-02.2
 * Modelo de dado de entrada do Reference Resolution MVP.
 *
 * SRP: representar exclusivamente uma referencia humana com seu conector alvo.
 * Imutavel. Sem logica de negocio.
 */

export type SupportedConnector = "google-drive" | "gmail";

export interface Reference {
  /** Texto natural fornecido pelo usuario (ex: "MAS", "HostGator", "Roadmap") */
  readonly text: string;
  /** Connector alvo onde a referencia sera resolvida */
  readonly connector: SupportedConnector;
}