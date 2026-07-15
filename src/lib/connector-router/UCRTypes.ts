/**
 * UCRTypes.ts — Engineering Sprint E-02.4
 * Canonical types for the Universal Connector Router.
 *
 * SRP: apenas contratos de dados. Sem lógica. Sem rede. Sem OAuth.
 *
 * Consumers:
 *   - IConnector
 *   - ConnectorRegistry
 *   - UniversalConnectorRouter
 *   - ConnectorCapabilityExecutor (adapts to ICapabilityExecutor)
 */

// ── ConnectorCapability ───────────────────────────────────────────────────────

export interface ConnectorCapability {
  readonly id:                     string;
  readonly version:                string;
  readonly description:            string;
  readonly requiresAuthentication: boolean;
  readonly requiresConfirmation:   boolean;
  readonly supportsStreaming:       boolean;
  readonly estimatedCostMs:        number;
  readonly timeoutMs:              number;
  readonly metadata:               Readonly<Record<string, unknown>>;
}

// ── ConnectorInput / ConnectorResult ─────────────────────────────────────────

export interface ConnectorInput {
  readonly executionId: string;
  readonly capability:  string;
  readonly parameters:  Readonly<Record<string, unknown>>;
}

export type ConnectorResultStatus = "success" | "failed" | "timeout" | "not_found";

export interface ConnectorResult {
  readonly connectorId:  string;
  readonly capability:   string;
  readonly status:       ConnectorResultStatus;
  readonly output:       unknown;
  readonly error:        string | null;
  readonly durationMs:   number;
}

// ── IConnector ────────────────────────────────────────────────────────────────

export interface IConnector {
  /** Unique, stable identifier (e.g. "gmail", "calendar", "drive", "github"). */
  connectorId(): string;

  /** Declares all capabilities this connector supports. */
  capabilities(): readonly ConnectorCapability[];

  /** Executes a capability. Must never throw — return a failed result instead. */
  execute(input: ConnectorInput): Promise<ConnectorResult>;

  /** Returns basic health information. */
  health(): ConnectorHealth;

  /** Returns human-readable metadata about this connector. */
  metadata(): ConnectorMetadata;
}

// ── Health / Metadata ─────────────────────────────────────────────────────────

export type ConnectorHealthStatus = "healthy" | "degraded" | "unavailable";

export interface ConnectorHealth {
  readonly status:     ConnectorHealthStatus;
  readonly message:    string;
  readonly checkedAt:  number;
}

export interface ConnectorMetadata {
  readonly name:        string;
  readonly version:     string;
  readonly description: string;
  readonly author:      string;
  readonly tags:        readonly string[];
}

// ── Router result ─────────────────────────────────────────────────────────────

export interface RouterResult {
  readonly found:         boolean;
  readonly connectorId:   string;
  readonly capability:    string;
  readonly result:        ConnectorResult | null;
  readonly error:         string | null;
}