/**
 * MRI — MemoryOS Reference Implementation
 * IConnector — Interface oficial do Connector (MCS Capítulo 6)
 */

export interface ExecutionContext {
  executionId:     string;
  stepId:          string;
  userId:          string;
  sessionId:       string;
  journeyId:       string;
  identityContext: string;
  timeoutMs:       number;
  secrets:         { get(key: string): string | undefined };
}

export interface ValidationResult {
  valid:   boolean;
  error?:  string;
}

export interface ConnectorResult {
  connectorId:  string;
  capabilityId: string;
  status:       "success" | "failed" | "rolled_back";
  outputData:   unknown;
  executionRef: unknown;
  auditData: {
    action:    string;
    resource?: string;
    timestamp: string;
    userId:    string;
  };
}

export interface RollbackResult {
  status:       "rolled_back" | "failed";
  executionRef: unknown;
  error?:       string;
}

export interface HealthResult {
  status:       "healthy" | "degraded" | "unhealthy";
  latencyMs:    number;
  version:      string;
  timestamp:    string;
  dependencies: Array<{ name: string; status: string }>;
}

export interface ConnectorMetadata {
  connectorId:         string;
  capabilityId:        string;
  supportsRollback:    boolean;
  estimatedLatencyMs:  number;
  version:             string;
}

export interface IConnector {
  readonly connectorId:  string;
  readonly capabilityId: string;

  execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult>;
  rollback?(executionRef: unknown, ctx: ExecutionContext): Promise<RollbackResult>;
  validate(input: unknown): ValidationResult;
  healthCheck(): Promise<HealthResult>;
  getMetadata(): ConnectorMetadata;
}