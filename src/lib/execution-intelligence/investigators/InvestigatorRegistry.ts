/**
 * InvestigatorRegistry.ts — EI-06 (RFC-008 / ADR-015)
 *
 * Registry singleton (HMR-safe via globalThis) de Investigators. Open/Closed:
 * novos investigators sao adicionados via register() sem mexer em codigo
 * existente; deactivate()/activate() controla quem roda sem remover do mapa.
 *
 * EI-06 nasce VAZIO por design — validators genericos sao as CLASSES
 * (GenericFieldValidator, DateFormatValidator); registros concretos com
 * `requiredFields`/`dateFields` por (connector,capability) sao de dominio
 * (EI-07) ou configurados pelos callers. Registro vazio = prepare() behavior
 * identico ao EI-05 (gaps=[], risks=[]) — paridade preservada.
 *
 * Invariant: o registry NUNCA despacha. So enumera investigators ativos que
 * aplicam-se a request; o ExecutionIntelligence os executa.
 */

import type { ExecutionRequest } from "../ExecutionTypes";
import type { Investigator } from "./InvestigatorTypes";

const _g = globalThis as unknown as Record<string, unknown>;
const _KEY = "__EI_INVESTIGATOR_REGISTRY__";

class InvestigatorRegistry {
  private readonly _byId = new Map<string, Investigator>();
  private readonly _active = new Set<string>();

  /** Adiciona (ou sobrescreve) um investigator e o marca ativo. */
  register(investigator: Investigator): void {
    this._byId.set(investigator.id, investigator);
    this._active.add(investigator.id);
  }

  /** Desativa um investigator (continua registrado, mas nao roda). */
  deactivate(id: string): boolean {
    return this._active.delete(id);
  }

  /** Reativa um investigator registrado. Retorna false se nao existe. */
  activate(id: string): boolean {
    if (!this._byId.has(id)) return false;
    this._active.add(id);
    return true;
  }

  /** Todos os investigators registrados (ativos + inativos). */
  list(): readonly Investigator[] {
    return Array.from(this._byId.values());
  }

  /** Todos os investigators ativos. */
  active(): readonly Investigator[] {
    return this.list().filter((i) => this._active.has(i.id));
  }

  /**
   * Resolve os investigators ativos que se aplicam a request (appliesTo=true
   * ou ausente). Ordem de registro preservada (Map mantem ordem de insercao).
   */
  resolve(request: ExecutionRequest): readonly Investigator[] {
    return this.active().filter((i) => !i.appliesTo || i.appliesTo(request));
  }
}

function getRegistry(): InvestigatorRegistry {
  if (!_g[_KEY]) _g[_KEY] = new InvestigatorRegistry();
  return _g[_KEY] as InvestigatorRegistry;
}

export const investigatorRegistry: InvestigatorRegistry = getRegistry();
export { InvestigatorRegistry };