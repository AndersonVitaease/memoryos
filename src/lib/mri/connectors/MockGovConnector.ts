/**
 * MRI — MemoryOS Reference Implementation
 * MockGovConnector — Connector de referência para serviços governamentais (mock)
 * Demonstra: auth por certificado, múltiplos endpoints, fallback
 */

import type { IConnector, ExecutionContext, ConnectorResult, ValidationResult, HealthResult, ConnectorMetadata } from "../core/interfaces";

export interface GovCpfInput {
  cpf: string;
}

export interface GovCnpjInput {
  cnpj: string;
}

type GovInput = GovCpfInput | GovCnpjInput;

// Mock database
const MOCK_CPF: Record<string, { status: string; name: string }> = {
  "000.000.000-00": { status: "REGULAR",    name: "João da Silva" },
  "111.111.111-11": { status: "PENDENTE",   name: "Maria Souza" },
  "222.222.222-22": { status: "CANCELADO",  name: "Carlos Pereira" },
};

const MOCK_CNPJ: Record<string, { status: string; razaoSocial: string }> = {
  "00.000.000/0000-00": { status: "ATIVA",    razaoSocial: "Empresa Exemplo Ltda" },
  "11.111.111/0001-11": { status: "BAIXADA",  razaoSocial: "Outra Empresa S.A." },
};

export class MockGovConnector implements IConnector {
  readonly connectorId  = "com.memoryos.gov.mock";
  readonly capabilityId = "gov.document.validate";

  validate(input: unknown): ValidationResult {
    const i = input as GovInput;
    if (!i) return { valid: false, error: "input is required" };
    if ("cpf" in i  && !i.cpf)  return { valid: false, error: "cpf is required" };
    if ("cnpj" in i && !i.cnpj) return { valid: false, error: "cnpj is required" };
    return { valid: true };
  }

  async execute(input: unknown, ctx: ExecutionContext): Promise<ConnectorResult> {
    const validation = this.validate(input);
    if (!validation.valid) throw new Error(validation.error);

    const i = input as GovInput;

    // Simula latência de API governamental
    await new Promise(r => setTimeout(r, 200));

    let outputData: unknown;
    let resource:   string;

    if ("cpf" in i) {
      const result = MOCK_CPF[i.cpf] ?? { status: "NAO_ENCONTRADO", name: "Desconhecido" };
      outputData = { cpf: i.cpf, ...result, consultedAt: new Date().toISOString() };
      resource   = `cpf:${i.cpf}`;
    } else {
      const result = MOCK_CNPJ[(i as GovCnpjInput).cnpj] ?? { status: "NAO_ENCONTRADO", razaoSocial: "Desconhecida" };
      outputData = { cnpj: (i as GovCnpjInput).cnpj, ...result, consultedAt: new Date().toISOString() };
      resource   = `cnpj:${(i as GovCnpjInput).cnpj}`;
    }

    return {
      connectorId:  this.connectorId,
      capabilityId: this.capabilityId,
      status:       "success",
      outputData,
      executionRef: { resource, timestamp: new Date().toISOString() },
      auditData: {
        action:    "gov.document.validate",
        resource,
        timestamp: new Date().toISOString(),
        userId:    ctx.userId,
      },
    };
  }

  // Consultas não têm rollback
  getMetadata(): ConnectorMetadata {
    return {
      connectorId:        this.connectorId,
      capabilityId:       this.capabilityId,
      supportsRollback:   false,
      estimatedLatencyMs: 300,
      version:            "1.0.0",
    };
  }

  async healthCheck(): Promise<HealthResult> {
    return {
      status:       "healthy",
      latencyMs:    200,
      version:      "1.0.0",
      timestamp:    new Date().toISOString(),
      dependencies: [{ name: "mock-gov-api", status: "ok" }],
    };
  }

  validate_impl = this.validate;
}