/**
 * ConnectorSemanticRegistry.ts — Engineering Sprint EF-6.3.x
 * Semantic Provider Registry Singleton
 *
 * SRP: registrar e consultar SemanticProviders.
 *      Nunca conhece nenhum connector especifico.
 *
 * Open/Closed: aberto para extensao via register(),
 *              fechado para modificacao — nenhum connector e embutido.
 *
 * EF-6.3.x: aceita tanto providers modernos (detect) quanto legados (score).
 * A interface de saida listAll() e opaca — o detector faz o cast correto
 * via type guards (isModernProvider / isLegacyProvider).
 *
 * Garantias:
 * - Determinístico: listAll() sempre retorna a mesma ordem (registro + sort)
 * - Imutavel: colecoes retornadas sao Object.freeze()
 * - Idempotente: registros duplicados por connectorId sao ignorados
 * - Zero conhecimento de dominio: nenhuma referencia a Gmail/Calendar/Drive/Memory
 */

// Accept any shape — the detector applies type guards
type AnyProvider = { readonly connectorId: string } & Record<string, unknown>;

class ConnectorSemanticRegistryClass {
  private readonly _providers = new Map<string, AnyProvider>();

  /**
   * Registra um SemanticProvider (moderno ou legado).
   * Idempotente: chamadas subsequentes com o mesmo connectorId sao ignoradas.
   */
  register(provider: AnyProvider): void {
    if (this._providers.has(provider.connectorId)) return;
    this._providers.set(provider.connectorId, provider);
  }

  /**
   * Retorna o provider para um connectorId, ou null.
   */
  get(connectorId: string): AnyProvider | null {
    return this._providers.get(connectorId) ?? null;
  }

  /**
   * Lista todos os providers registrados.
   * Ordem: alfabetica por connectorId — determinística, independente do registro.
   */
  listAll(): readonly AnyProvider[] {
    return Object.freeze(
      [...this._providers.values()].sort((a, b) =>
        a.connectorId.localeCompare(b.connectorId)
      )
    );
  }

  /** Verifica se um connectorId esta registrado. */
  has(connectorId: string): boolean {
    return this._providers.has(connectorId);
  }

  /** Total de providers registrados. */
  get size(): number {
    return this._providers.size;
  }

  /** IDs de todos os providers registrados (ordem alfabetica). */
  listIds(): readonly string[] {
    return Object.freeze(
      [...this._providers.keys()].sort((a, b) => a.localeCompare(b))
    );
  }
}

// ── Singleton via globalThis ───────────────────────────────────────────────────

const _KEY = "__CONNECTOR_SEMANTIC_REGISTRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] =
    new ConnectorSemanticRegistryClass();
}

export const ConnectorSemanticRegistry: ConnectorSemanticRegistryClass = (
  globalThis as unknown as Record<string, ConnectorSemanticRegistryClass>
)[_KEY];

// ── INJEÇÃO DE SEGURANÇA ──────────────────────────────────────────────────────

/**
 * Atenção: O ImplicitConnectorIntentDetector utiliza a função listAll()
 * para obter a lista de conectores registrados.
 * 
 * Se você deseja que o sistema pare de tentar usar conectores como Gmail/GitHub
 * automaticamente para qualquer pergunta, você deve garantir que o registro
 * desses conectores NÃO seja feito neste arquivo (ele geralmente é feito em
 * outro lugar, como um arquivo de inicialização index.ts ou main.ts).
 * 
 * Caso os conectores estejam sendo registrados em outro lugar, este arquivo
 * permanece intacto e atua apenas como um container.
 * 
 * Se você deseja adicionar um "Conector de Conversa" (OpenRouter) para que
 * o sistema entenda que existe uma opção de "general.conversation" ou 
 * "general.webSearch", procure o arquivo onde os conectores são registrados
 * e adicione uma linha como:
 * 
 * ConnectorSemanticRegistry.register({
 *   connectorId: "openrouter",
 *   detect: (lower, norm) => ({
 *     connector: "openrouter",
 *     goalType: "general.conversation",
 *     confidence: norm.isSocialPhrase ? 0.95 : 0.60,
 *     evidences: ["conversational_phrase"],
 *     entities: {}
 *   })
 * });
 */
