/**
 * ReferenceResolutionService.ts — Sprint C-02.2
 * Orquestrador do Reference Resolution MVP.
 *
 * SRP: receber uma Reference, localizar o resolver correto no Registry e
 *      retornar um ResolutionResult. Nenhuma logica de resolucao aqui.
 *
 * Dependency Inversion: depende de ResolverRegistry e ReferenceResolver (interfaces),
 *                       nao de adapters concretos.
 *
 * Pre-configurado com GoogleDriveReferenceResolver e GmailReferenceResolver.
 */

import type { Reference }         from "./Reference";
import type { ResolutionResult }  from "./ResolutionResult";
import type { ResolverContext }   from "./ReferenceResolver";
import { failedResult }           from "./ResolutionResult";
import { ResolverRegistry }       from "./ResolverRegistry";
import { GoogleDriveReferenceResolver } from "./adapters/GoogleDriveReferenceResolver";
import { GmailReferenceResolver }       from "./adapters/GmailReferenceResolver";

// ── ReferenceResolutionService ────────────────────────────────────────────────

export class ReferenceResolutionService {
  private readonly _registry: ResolverRegistry;

  constructor(registry?: ResolverRegistry) {
    this._registry = registry ?? buildDefaultRegistry();
  }

  /**
   * Resolve uma referencia humana em um identificador tecnico.
   * Nunca lanca excecao — sempre retorna ResolutionResult.
   *
   * @param reference  Referencia humana + connector alvo
   * @param context    Dados pre-carregados (lista de arquivos / mensagens)
   */
  async resolve(
    reference: Reference,
    context?: ResolverContext,
  ): Promise<ResolutionResult> {
    if (!reference.text?.trim()) {
      return failedResult(reference.connector, reference.text ?? "", "Reference text is empty");
    }

    const resolver = this._registry.lookup(reference.connector);
    if (!resolver) {
      return failedResult(
        reference.connector,
        reference.text,
        `No resolver registered for connector: "${reference.connector}"`,
      );
    }

    return resolver.resolve(reference, context);
  }

  /** Registra um resolver adicional (extensibility hook). */
  register(resolver: import("./ReferenceResolver").ReferenceResolver): void {
    this._registry.register(resolver);
  }

  /** Lista connectors suportados. */
  supportedConnectors(): string[] {
    return this._registry.list();
  }

  /** Acesso ao registry interno (para testes e inspecao). */
  registry(): ResolverRegistry {
    return this._registry;
  }
}

// ── Default registry factory ──────────────────────────────────────────────────

function buildDefaultRegistry(): ResolverRegistry {
  const registry = new ResolverRegistry();
  registry.register(new GoogleDriveReferenceResolver());
  registry.register(new GmailReferenceResolver());
  return registry;
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__REFERENCE_RESOLUTION_SERVICE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ReferenceResolutionService();
}

export const referenceResolutionService: ReferenceResolutionService = (
  globalThis as unknown as Record<string, ReferenceResolutionService>
)[_KEY];