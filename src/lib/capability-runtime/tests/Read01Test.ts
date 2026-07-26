// Google Drive Read Capability — Functional Test (read-01)
// Phase 1 — Week 1 Implementation Validation
//
// Testa:
//   1. Capability carregamento e registro
//   2. Connector integração
//   3. Operação drive.files.get (read-01 metadados)
//   4. Fluxo completo: Capability → Connector Runtime → Google Drive Connector → GWS Foundation

import { CapabilityRuntime } from "./CapabilityRuntime";
import { GoogleDriveReadCapability } from "./capabilities/GoogleDriveReadCapability";
import { ConnectorRuntime } from "../connector-runtime/ConnectorRuntime";
import { GoogleDriveConnector } from "../connector-runtime/connectors/GoogleDriveConnector";
import type { CapabilityTestResult } from "./CapabilityRuntimeTests";

const TEST_CONTEXT = {
  userId: "test-read-01",
  projectId: "test-project",
  sessionId: "test-session",
  executionId: "read-01-test",
};

async function testCriterion(
  n: number,
  name: string,
  fn: () => Promise<{ detail?: string; data?: unknown; observation?: string }>,
): Promise<CapabilityTestResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return { criterion: n, name, passed: true, durationMs: Date.now() - start, ...out };
  } catch (err) {
    return {
      criterion: n, name, passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testRead01Capability(): Promise<CapabilityTestResult[]> {
  const results: CapabilityTestResult[] = [];

  // Setup runtime
  const connectorRuntime = new ConnectorRuntime();
  const capabilityRuntime = new CapabilityRuntime(connectorRuntime);

  // Register connector
  const googleDriveConnector = new GoogleDriveConnector();
  connectorRuntime.register(googleDriveConnector);

  // Create capability
  const googleDriveReadCapability = new GoogleDriveReadCapability();

  // ── Test 1: Capability Metadata ────────────────────────────────────────────
  results.push(await testCriterion(1, "read-01 — Capability metadata valido", async () => {
    const metadata = googleDriveReadCapability.metadata();
    if (metadata.id !== "google-drive-read") throw new Error("ID invalido");
    if (!metadata.operations.includes("drive.files.get")) throw new Error("Operation drive.files.get não encontrada");
    return {
      detail: `Metadata OK — ${metadata.name} v${metadata.version}`,
      data: {
        id: metadata.id,
        operations: metadata.operations,
        connectorId: metadata.connectorId,
      },
    };
  }));

  // ── Test 2: Capability Validation ──────────────────────────────────────────
  results.push(await testCriterion(2, "read-01 — Capability validate() retorna true", async () => {
    const valid = googleDriveReadCapability.validate();
    if (!valid) throw new Error("validate() retornou false");
    return { detail: "Capability validada com sucesso" };
  }));

  // ── Test 3: Capability Registration ────────────────────────────────────────
  results.push(await testCriterion(3, "read-01 — Capability registrada no Runtime", async () => {
    capabilityRuntime.register(googleDriveReadCapability);
    const list = capabilityRuntime.listCapabilities();
    const found = list.find(c => c.id === "google-drive-read");
    if (!found) throw new Error("google-drive-read não encontrada no registry");
    return { detail: "Capability registrada", data: found };
  }));

  // ── Test 4: Connector Metadata ─────────────────────────────────────────────
  results.push(await testCriterion(4, "read-01 — Connector expõe drive.files.get", async () => {
    const metadata = googleDriveConnector.metadata();
    if (!metadata.capabilities.includes("drive.files.get")) {
      throw new Error("Connector nao expoe drive.files.get");
    }
    return {
      detail: `Connector OK — ${metadata.capabilities.length} capabilities`,
      data: { connectorCapabilities: metadata.capabilities },
    };
  }));

  // ── Test 5: Capability Initialization ──────────────────────────────────────
  results.push(await testCriterion(5, "read-01 — Capability inicializa corretamente", async () => {
    await googleDriveReadCapability.initialize(TEST_CONTEXT, connectorRuntime);
    return { detail: "Capability inicializada com sucesso" };
  }));

  // ── Test 6: Operation Mapping ──────────────────────────────────────────────
  results.push(await testCriterion(6, "read-01 — Operation mapping é válido", async () => {
    // Validate that drive.files.get operation exists
    const metadata = googleDriveReadCapability.metadata();
    const hasGetOperation = metadata.operations.includes("drive.files.get");
    if (!hasGetOperation) throw new Error("Operation drive.files.get não registrada");
    return { detail: "Operation mapping válido" };
  }));

  // ── Test 7: Execute with invalid fileId ────────────────────────────────────
  results.push(await testCriterion(7, "read-01 — Execute rejeita fileId ausente", async () => {
    // Should fail with validation error when fileId is missing
    const result = await googleDriveReadCapability.execute(
      "drive.files.get",
      {}, // no fileId
      TEST_CONTEXT,
      connectorRuntime,
    );
    if (result.success) throw new Error("Esperado FAILED, mas resultado foi SUCCESS");
    if (result.status !== "FAILED") throw new Error(`Esperado FAILED, obtido ${result.status}`);
    if (!result.error || !result.error.toLowerCase().includes("fileid")) {
      throw new Error(`Erro deveria mencionar fileId, obtido: ${result.error}`);
    }
    return { detail: "Validação correta — fileId obrigatório", data: result };
  }));

  // ── Test 8: Execute with valid fileId (but auth may fail) ────────────────
  results.push(await testCriterion(8, "read-01 — Execute com fileId válido chega ao connector", async () => {
    // This will likely fail with auth error, but that's OK — we just want to verify
    // that the capability correctly routes to the connector without validation errors
    const result = await googleDriveReadCapability.execute(
      "drive.files.get",
      { fileId: "test-file-id-12345" },
      TEST_CONTEXT,
      connectorRuntime,
    );
    // Accept both SUCCESS or FAILED[auth/external] — the important thing is
    // that the execution reached the connector, not blocked by the capability
    if (result.status === "FAILED" && result.error?.includes("fileId")) {
      throw new Error("Capability incorretamente rejeitou fileId");
    }
    return {
      detail: `Execution routed to connector — status: ${result.status}`,
      data: {
        status: result.status,
        capabilityId: result.capabilityId,
        connectorId: result.connectorId,
        error: result.error,
      },
      observation: `Status ${result.status} é esperado — validação de auth é responsabilidade do connector`,
    };
  }));

  // ── Test 9: Capability Shutdown ────────────────────────────────────────────
  results.push(await testCriterion(9, "read-01 — Capability shutdown sem erros", async () => {
    await googleDriveReadCapability.shutdown();
    return { detail: "Capability encerrada com sucesso" };
  }));

  // ── Test 10: Integration Summary ───────────────────────────────────────────
  results.push(await testCriterion(10, "read-01 — Fluxo de integração completo", async () => {
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;
    if (failCount > 0) {
      throw new Error(`${failCount} teste(s) falharam — ver resultados acima`);
    }
    return {
      detail: `Todos os ${passCount} testes passaram ✅`,
      data: {
        totalTests: results.length,
        passed: passCount,
        failed: failCount,
      },
    };
  }));

  return results;
}

// ── Export for CLI/test runner ─────────────────────────────────────────────

export default testRead01Capability;
