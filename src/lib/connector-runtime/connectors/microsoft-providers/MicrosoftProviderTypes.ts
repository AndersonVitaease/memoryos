/**
 * MicrosoftProviderTypes.ts — Contratos da camada de Provider Router do
 * conector Microsoft Graph (ADR-014 / RFC-007).
 *
 * SRP: definir a interface que TODO provedor de acesso ao Microsoft Graph
 * (OfficialGraph, Base44Outlook, MCP futuro, REST/SDK futuro) DEVE implementar.
 *
 * Open/Closed: novo provedor = nova classe que implementa MicrosoftProvider.
 *              Nenhum outro arquivo muda (shell, planner, capability registry).
 *
 * Diferenca vs. WhatsApp: aqui o Provider nao abstrai QUAL backend chamar
 * (todos chamam o MESMO Graph). Abstrai QUAL CREDENCIAL/fluxo OAuth usar para
 * chamar a mesma API. Os providers sao estrategias de acesso, nao APIs
 * concorrentes.
 *
 * workspaceId-aware: multi-conta de primeira classe. Cada chamada que toca
 * credencial recebe o workspaceId da conta corrente (default "default").
 */
import type { ConnectorLog, ConnectorResult } from "../../ConnectorTypes";

/**
 * Contexto repassado pelo shell ao provider em cada execute().
 * workspaceId identifica a conta Microsoft corrente (multi-conta).
 */
export interface MicrosoftProviderContext {
  readonly workspaceId: string;
  readonly start: number;
  readonly eid: string;
  readonly logs: ConnectorLog[];
}

/**
 * Interface que todo provedor de acesso ao Microsoft Graph implementa.
 * Cada provedor decide COMO obter token e chamar Graph (OAuth proprio,
 * App-User Connector da plataforma, servidor MCP, SDK REST direto).
 */
export interface MicrosoftProvider {
  /** Identificador unico do provedor (ex: "official-graph"). */
  readonly id: string;
  /** Nome legivel para UI (ex: "Microsoft 365 (OAuth proprio)"). */
  readonly displayName: string;
  /** True se e o provedor oficial/direto (nao intermediario). */
  readonly isOfficial: boolean;

  /**
   * Operations que este provedor cobre. O router so seleciona um provedor
   * para operations que ele declara cobrir. Provedores stub declaram [].
   */
  readonly operations: readonly string[];

  /**
   * Tem credencial/token valido para a conta workspaceId?
   * Usado pelo router para escolher ENTRE provedores concorrentes disponiveis
   * (nao para bloquear — um provedor que cobre a op mas nao esta disponivel
   * ainda pode ser retornado como fallback para emitir seu proprio erro de
   * "nao conectado", preservando paridade com o shell antigo).
   */
  isAvailable(workspaceId: string): Promise<boolean>;

  /** Executa a operation e retorna ConnectorResult. */
  execute(
    operation: string,
    payload: Record<string, unknown>,
    ctx: MicrosoftProviderContext,
  ): Promise<ConnectorResult>;
}

/**
 * Informacao de conta para UI de switcher multi-conta (espelha Google).
 * listAccounts() no registry retorna estas entradas.
 */
export interface MicrosoftAccountInfo {
  readonly workspaceId: string;
  readonly email: string;
  readonly providerId: string;
}