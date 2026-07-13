/**
 * index.ts — MemoryOS Connector SDK v1.0
 * Beta-03 · 2026-07-13
 *
 * Official SDK for creating production-ready MemoryOS connectors.
 * Every future connector must be created using this SDK.
 *
 * Usage:
 *   import { ConnectorGenerator } from "@/lib/connector-sdk-v1";
 *   const sdk = new ConnectorGenerator();
 *   const artifact = sdk.generate(config);
 */

export { ConnectorGenerator }         from "./ConnectorGenerator";
export { ConnectorManifestBuilder }   from "./ConnectorManifestBuilder";
export { ConnectorCodeGenerator }     from "./ConnectorCodeGenerator";
export { DocumentationGenerator }     from "./DocumentationGenerator";
export { SDKValidator }               from "./SDKValidator";
export { runSDKTests }                from "./sdkTests";
export type {
  ConnectorConfig, ConnectorManifest, CapabilityDeclaration, GeneratedConnector,
  SDKValidationReport, SDKValidationCheck, SDKTestReport, SDKTestResult,
  AuthType, KnowledgeProviderType,
} from "./SDKTypes";