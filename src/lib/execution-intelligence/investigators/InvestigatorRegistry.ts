/**
 * InvestigatorRegistry.ts — EI-07 (RFC-008 / ADR-015)
 *
 * Registry singleton (HMR-safe via globalThis) de Investigators. Open/Closed:
 * novos investigators via register() sem mexer em codigo existente;
 * deactivate()/activate() controla quem roda sem remover do mapa.
 *
 * EI-07 adiciona o Dependency Graph aciclico (ADR-015 secao 4.3): cada
 * investigator declara provides/requires (campos). B.requires X → B roda depois
 * de qualquer A que A.provides X. register() recompute a ordem topologica;
 * ciclo detectado → registro rejeitado (invariante acicliva).
 *
 * Nasce VAZIO por padrao; o modulo registerDefaults (importado por index.ts)
 * registra os investigators de dominio (Travel, Email) no load do wiring.
 * Registro vazio = prepare() behavior identico ao pass-through.
 *
 * Invariant: o registry NUNCA despacha. So enumera investigators ativos que
 * aplicam-se a request, em ordem topologica; o ExecutionIntelligence os executa.
 */

import type { ExecutionRequest } from "../ExecutionTypes";
import type { Investigator } from "./InvestigatorTypes";

const _g = globalThis as unknown as Record<string, unknown>;
const _KEY = "__EI_INVESTIGATOR_REGISTRY__";

class InvestigatorRegistry {
  private readonly _byId = new Map<string, Investigator>();
  private readonly _active = new Set<string>();
  /** Ordem topologica de ids (acicliva). Recomputada a cada register. */
  private _order: readonly string[] = [];

  /** Adiciona (ou sobrescreve) um investigator, marca ativo e recompute a ordem. */
  register(investigator: Investigator): void {
    this._byId.set(investigator.id, investigator);
    this._active.add(investigator.id);
    this._order = this._topoSort();
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
   * Resolve os investigators ativos aplicaveis a request, em ordem topologica
   * (dependencias antes). Invariante acicliva garantida no register.
   */
  resolve(request: ExecutionRequest): readonly Investigator[] {
    const applicable = this.active().filter((i) => !i.appliesTo || i.appliesTo(request));
    const rank = new Map<string, number>();
    this._order.forEach((id, idx) => rank.set(id, idx));
    return applicable.slice().sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }

  /**
   * Ordenacao topologica por dependencia de campos (Kahn). A.requires X → A
   * depois de qualquer B que B.provides X. Ciclo → throw (aciclivo).
   */
  private _topoSort(): readonly string[] {
    const invs = Array.from(this._byId.values());
    if (invs.length === 0) return [];

    // field -> [provider ids]
    const providers = new Map<string, string[]>();
    for (const inv of invs) {
      for (const f of inv.provides ?? []) {
        const arr = providers.get(f) ?? [];
        arr.push(inv.id);
        providers.set(f, arr);
      }
    }

    // edges: provider -> [dependents]; indegree per investigator
    const adj = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const inv of invs) indeg.set(inv.id, 0);
    for (const inv of invs) {
      for (const req of inv.requires ?? []) {
        for (const p of providers.get(req) ?? []) {
          if (p === inv.id) continue;
          const arr = adj.get(p) ?? [];
          arr.push(inv.id);
          adj.set(p, arr);
          indeg.set(inv.id, (indeg.get(inv.id) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const inv of invs) if ((indeg.get(inv.id) ?? 0) === 0) queue.push(inv.id);
    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      order.push(id);
      for (const dep of adj.get(id) ?? []) {
        indeg.set(dep, (indeg.get(dep) ?? 0) - 1);
        if ((indeg.get(dep) ?? 0) === 0) queue.push(dep);
      }
    }

    if (order.length !== invs.length) {
      const cyclic = invs.filter((i) => !order.includes(i.id)).map((i) => i.id);
      throw new Error(
        `[InvestigatorRegistry] Ciclo de dependencias detectado entre investigators: ${cyclic.join(", ")}. ` +
          `O grafo deve ser aciclico (ADR-015 secao 4.3).`,
      );
    }
    return order;
  }
}

function getRegistry(): InvestigatorRegistry {
  if (!_g[_KEY]) _g[_KEY] = new InvestigatorRegistry();
  return _g[_KEY] as InvestigatorRegistry;
}

export const investigatorRegistry: InvestigatorRegistry = getRegistry();
export { InvestigatorRegistry };