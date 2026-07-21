/**
 * ExecutionOutcomeAdapterRegistryTypes.ts — Adapter Registry Foundation
 *
 * SRP: contratos puros do sistema de registro de adaptadores de dominio.
 *
 * Sem logica. Sem rede. Sem efeitos colaterais.
 */

import type { ExecutionOutcome, ExecutionDomain } from "./ExecutionOutcomeTypes";
import type { AdaptationResult, AdaptationHint } from "./ExecutionOutcomeAdapterTypes";

// ── IExecutionOutcomeDomainAdapter ────────────────────────────────────────────
// Contrato que todo adaptador especializado deve implementar.
// Open/Closed: novos dominios = nova implementacao; Registry nao muda.

export interface IExecutionOutcomeDomainAdapter {
  /**
   * Dominio ao qual este adaptador responde.
   * Pode ser uma lista quando um adapter cobre multiplos dominios.
   */
  readonly domains: readonly ExecutionDomain[];

  /**
   * Retorna true se este adapter e capaz de adaptar o outcome dado.
   * Permite logica mais fina do que comparar apenas pelo domain.
   * Puro: sem efeitos colaterais.
   */
  supports(outcome: ExecutionOutcome): boolean;

  /**
   * Adapta o outcome em um AdaptationResult.
   * Puro: sem efeitos colaterais, sem rede.
   */
  adapt(outcome: ExecutionOutcome, hint: AdaptationHint): AdaptationResult;
}

// ── AdapterRegistration ───────────────────────────────────────────────────────

export interface AdapterRegistration {
  readonly adapter:       IExecutionOutcomeDomainAdapter;
  readonly registeredAt:  number;
  /** true = adapter embutido (nao pode ser removido via unregister). */
  readonly builtin:       boolean;
}

// ── ResolveResult ─────────────────────────────────────────────────────────────

export interface ResolveResult {
  /** Adapter encontrado (null = nenhum adapter suporta o outcome). */
  readonly adapter:   IExecutionOutcomeDomainAdapter | null;
  /** true = adapter foi encontrado. */
  readonly resolved:  boolean;
  /** Dominio que foi usado para resolver. */
  readonly domain:    ExecutionDomain;
  /** Nome/identificador do adapter resolvido (para observabilidade). */
  readonly adapterName: string;
}

// ── RegistrySnapshot ──────────────────────────────────────────────────────────

export interface RegistrySnapshot {
  readonly count:    number;
  readonly adapters: readonly {
    readonly domains:       readonly ExecutionDomain[];
    readonly builtin:       boolean;
    readonly registeredAt:  number;
  }[];
}