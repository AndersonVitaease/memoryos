// Connector Runtime — Public API
// Foundation v1.0 · Engineering First

export { ConnectorRuntime }   from "./ConnectorRuntime";
export { ConnectorRegistry }  from "./ConnectorRegistry";
export { ConnectorLoader }    from "./ConnectorLoader";
export { ConnectorExecutor }  from "./ConnectorExecutor";
export { Base44Connector }    from "./connectors/Base44Connector";
export { GitHubConnector }    from "./connectors/GitHubConnector";
export { runConnectorRuntimeTests } from "./connectorRuntimeTests";
export { runBase44ConnectorTests } from "./base44ConnectorTests";
export type { Base44TestResult } from "./base44ConnectorTests";
export type { IConnector }    from "./IConnector";
export type {
  ConnectorContext,
  ConnectorResult,
  ConnectorResultStatus,
  ConnectorMetrics,
  ConnectorHealthReport,
  ConnectorMetadata,
  ConnectorLog,
  ExecutionRecord,
  ConnectorStatus,
  ConnectorHealthStatus,
} from "./ConnectorTypes";