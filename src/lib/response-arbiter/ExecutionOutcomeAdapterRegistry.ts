/**
 * ExecutionOutcomeAdapterRegistry.ts — Adapter Registry
 *
 * SRP: manter o catalogo de IExecutionOutcomeDomainAdapters e
 *      resolver o adapter correto para um dado ExecutionOutcome.
 *
 * Plugin Architecture:
 *   - register()   → adiciona novos adapters em runtime (GitHubAdapter, DriveAdapter…)
 *   - unregister() → remove adapters nao-builtin por dominio
 *   - resolve()    → encontra o adapter mais especifico para um outcome
 *
 * Sem conhecimento de Connectors, Pipeline ou Runtime.
 * Sem efeitos colaterais alem da propria tabela de registro.
 */

import type { ExecutionOutcome, ExecutionDomain } from "./ExecutionOutcomeTypes";
import type {
  IExecutionOutcomeDomainAdapter,
  AdapterRegistration,
  ResolveResult,
  RegistrySnapshot,
} from "./ExecutionOutcomeAdapterRegistryTypes";
import { generalAdapter, unknownAdapter } from "./ExecutionOutcomeDomainAdapter";

// ── ExecutionOutcomeAdapterRegistry ──────────────────────────────────────────

export class ExecutionOutcomeAdapterRegistry {

  /**
   * Lista ordenada por prioridade: primeiro registrado = menor prioridade.
   * Ultimo registrado para um dominio = maior prioridade (override).
   */
  private readonly _registrations: AdapterRegistration[] = [];

  constructor() {
    // Registrar adapters builtin com prioridade minima (sempre fallback)
    this._registerBuiltin(generalAdapter);
    this._registerBuiltin(unknownAdapter);
  }

  private _registerBuiltin(adapter: IExecutionOutcomeDomainAdapter): void {
    this._registrations.push(
      Object.freeze({ adapter, registeredAt: Date.now(), builtin: true }),
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Registra um adapter especializado.
   * Se ja existir um adapter para um dos dominios declarados (nao-builtin),
   * ele e substituido.
   *
   * @param adapter Implementacao de IExecutionOutcomeDomainAdapter.
   */
  register(adapter: IExecutionOutcomeDomainAdapter): void {
    // Remove registros nao-builtin cujos dominios colidem com o novo adapter
    for (let i = this._registrations.length - 1; i >= 0; i--) {
      const reg = this._registrations[i];
      if (reg.builtin) continue;
      const hasOverlap = reg.adapter.domains.some((d) => adapter.domains.includes(d));
      if (hasOverlap) {
        this._registrations.splice(i, 1);
      }
    }
    // Adiciona no final = maior prioridade de resolucao
    this._registrations.push(
      Object.freeze({ adapter, registeredAt: Date.now(), builtin: false }),
    );
  }

  /**
   * Remove um adapter nao-builtin pelo dominio.
   * Adapters builtin (GeneralAdapter, UnknownAdapter) nunca sao removidos.
   *
   * @param domain Dominio do adapter a remover.
   * @returns true se algum adapter foi removido.
   */
  unregister(domain: ExecutionDomain): boolean {
    const before = this._registrations.length;
    for (let i = this._registrations.length - 1; i >= 0; i--) {
      const reg = this._registrations[i];
      if (!reg.builtin && reg.adapter.domains.includes(domain)) {
        this._registrations.splice(i, 1);
      }
    }
    return this._registrations.length < before;
  }

  /**
   * Resolve o adapter mais especifico para um outcome.
   * Estrategia: percorre registrations de tras para frente (ultimo = maior prioridade).
   * Primeiro testa supports(); se nenhum suportar, cai no UnknownAdapter.
   */
  resolve(outcome: ExecutionOutcome): ResolveResult {
    // Percorre do mais recente para o mais antigo
    for (let i = this._registrations.length - 1; i >= 0; i--) {
      const reg = this._registrations[i];
      if (reg.adapter.domains.includes(outcome.domain) && reg.adapter.supports(outcome)) {
        return Object.freeze({
          adapter:     reg.adapter,
          resolved:    true,
          domain:      outcome.domain,
          adapterName: reg.adapter.constructor?.name ?? "adapter",
        });
      }
    }

    // Fallback: UnknownAdapter (sempre suporta tudo)
    return Object.freeze({
      adapter:     unknownAdapter,
      resolved:    false, // false = nenhum adapter especializado encontrado
      domain:      outcome.domain,
      adapterName: "UnknownAdapter",
    });
  }

  /**
   * Resolve o adapter mais especifico por dominio (sem outcome).
   * Util para inspecao e testes.
   */
  resolveByDomain(domain: ExecutionDomain): ResolveResult {
    for (let i = this._registrations.length - 1; i >= 0; i--) {
      const reg = this._registrations[i];
      if (reg.adapter.domains.includes(domain)) {
        return Object.freeze({
          adapter:     reg.adapter,
          resolved:    true,
          domain,
          adapterName: reg.adapter.constructor?.name ?? "adapter",
        });
      }
    }
    return Object.freeze({
      adapter:     unknownAdapter,
      resolved:    false,
      domain,
      adapterName: "UnknownAdapter",
    });
  }

  /**
   * Lista todos os adapters registrados (builtin + externos).
   */
  listAdapters(): readonly AdapterRegistration[] {
    return Object.freeze([...this._registrations]);
  }

  /**
   * Numero total de adapters registrados.
   */
  count(): number {
    return this._registrations.length;
  }

  /**
   * Remove todos os adapters nao-builtin.
   * Builtin (General, Unknown) sao preservados.
   */
  clear(): void {
    for (let i = this._registrations.length - 1; i >= 0; i--) {
      if (!this._registrations[i].builtin) {
        this._registrations.splice(i, 1);
      }
    }
  }

  /**
   * Snapshot imutavel do estado do registry (para observabilidade/testes).
   */
  snapshot(): RegistrySnapshot {
    return Object.freeze({
      count:    this._registrations.length,
      adapters: Object.freeze(
        this._registrations.map((r) =>
          Object.freeze({
            domains:      r.adapter.domains,
            builtin:      r.builtin,
            registeredAt: r.registeredAt,
          }),
        ),
      ),
    });
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__EXECUTION_OUTCOME_ADAPTER_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ExecutionOutcomeAdapterRegistry();
}

export const executionOutcomeAdapterRegistry: ExecutionOutcomeAdapterRegistry = (
  globalThis as unknown as Record<string, ExecutionOutcomeAdapterRegistry>
)[_KEY];