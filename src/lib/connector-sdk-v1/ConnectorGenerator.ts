/**
 * ConnectorGenerator.ts — MemoryOS Connector SDK v1.0
 * Beta-03 · 2026-07-13
 *
 * Main entry point — creates, validates and certifies a complete connector
 * artifact from a ConnectorConfig.
 *
 * Commands:
 *   generate(config)  — produce GeneratedConnector from config
 *   validate(config)  — validate config + manifest before generating
 *   certify(connector) — run PCS + SDKValidator and return full report
 */

import type { ConnectorConfig, GeneratedConnector, SDKValidationReport } from "./SDKTypes";
import { ConnectorManifestBuilder } from "./ConnectorManifestBuilder";
import { ConnectorCodeGenerator }   from "./ConnectorCodeGenerator";
import { DocumentationGenerator }   from "./DocumentationGenerator";
import { SDKValidator }             from "./SDKValidator";
import { PCSGenerator }             from "../production-connector-standard/PCSGenerator";

export class ConnectorGenerator {
  private readonly manifestBuilder = new ConnectorManifestBuilder();
  private readonly codeGen         = new ConnectorCodeGenerator();
  private readonly docGen          = new DocumentationGenerator();
  private readonly validator       = new SDKValidator();

  /** Generate a complete connector artifact from a ConnectorConfig. */
  generate(config: ConnectorConfig): GeneratedConnector {
    const manifest = this.manifestBuilder.build(config);

    const manifestValidation = this.manifestBuilder.validateManifest(manifest);
    if (!manifestValidation.valid) {
      throw new Error(`Manifest validation failed:\n${manifestValidation.errors.join("\n")}`);
    }

    const connectorCode         = this.codeGen.generateConnector(manifest);
    const testsCode             = this.codeGen.generateTests(manifest);
    const knowledgeProviderCode = config.hasKnowledgeProvider ? this.codeGen.generateKnowledgeProvider(manifest) : null;
    const readme                = this.docGen.generateReadme(manifest);
    const pcsGuide              = this.docGen.generatePCSGuide(manifest);
    const certificationGuide    = this.docGen.generateCertificationGuide(manifest);

    return {
      id:                    manifest.id,
      manifest,
      connectorCode,
      testsCode,
      knowledgeProviderCode,
      readme,
      pcsGuide,
      certificationGuide,
      generatedAt:           Date.now(),
    };
  }

  /** Validate a config before generating — returns errors. */
  validateConfig(config: ConnectorConfig): { valid: boolean; errors: string[] } {
    try {
      const manifest = this.manifestBuilder.build(config);
      return this.manifestBuilder.validateManifest(manifest);
    } catch (err) {
      return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  /** Validate a manifest already built. */
  validateManifest(manifest: Parameters<ConnectorManifestBuilder["validateManifest"]>[0]): ReturnType<SDKValidator["validateManifest"]> {
    return this.validator.validateManifest(manifest);
  }

  /** Certify a live connector instance against PCS and SDK rules. */
  async certify(connector: any): Promise<{
    sdkReport: SDKValidationReport;
    pcsSpec: Awaited<ReturnType<PCSGenerator["generate"]>>;
  }> {
    const [sdkReport, pcsSpec] = await Promise.all([
      this.validator.validateConnector(connector),
      new PCSGenerator().generate(connector),
    ]);
    return { sdkReport, pcsSpec };
  }
}