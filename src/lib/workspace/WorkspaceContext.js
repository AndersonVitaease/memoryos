/**
 * WorkspaceContext — Engineering Sprint E-01
 * Abstração centralizada para o Workspace ativo.
 *
 * Responsabilidade unica: prover o workspaceId ativo e funcoes auxiliares.
 * Elimina a duplicacao de `const WORKSPACE_ID = "default"` em todos os modulos.
 *
 * Nao gerencia autenticacao.
 * Nao armazena tokens.
 * Nao depende de UI.
 */

/**
 * ID do workspace ativo.
 * Unica fonte de verdade para todos os conectores.
 */
export const ACTIVE_WORKSPACE_ID = "default";

/**
 * Retorna o workspace ID ativo.
 * Extensivel no futuro para suportar workspaces multiplos.
 * @returns {string}
 */
export function getActiveWorkspaceId() {
  return ACTIVE_WORKSPACE_ID;
}