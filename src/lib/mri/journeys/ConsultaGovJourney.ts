/**
 * MRI — MemoryOS Reference Implementation
 * ConsultaGovJourney — Journey de referência para consulta de documentos gov.br
 * Valida: GovConnector + GovernmentSpecialist + Working Memory + Audit
 */

import { JourneyManager } from "../core/journey/JourneyManager";
import { ExecutionEngine, type Plan } from "../core/execution/ExecutionEngine";
import { WorkingMemoryEngine } from "../core/memory/WorkingMemoryEngine";
import { AuditTrail } from "../core/audit/AuditTrail";
import { EventBus } from "../core/event-bus/EventBus";
import { MockGovConnector } from "../connectors/MockGovConnector";

export interface ConsultaGovInput {
  userId:    string;
  sessionId: string;
  cpf:       string;
}

export interface ConsultaGovResult {
  journeyId:   string;
  executionId: string;
  cpfData:     unknown;
  auditCount:  number;
  success:     boolean;
}

/**
 * Journey de referência completa demonstrando o fluxo MRS Cap. 1:
 * Contexto → Goal → Planner → Security Gate → Connector → Audit → Event
 */
export async function runConsultaGovJourney(
  input: ConsultaGovInput
): Promise<ConsultaGovResult> {
  // 1. Inicializar motores do Core
  const audit    = new AuditTrail();
  const eventBus = new EventBus();
  const memory   = new WorkingMemoryEngine();
  const journeyMgr = new JourneyManager();
  const engine   = new ExecutionEngine(audit, eventBus);

  // 2. Registrar Connector (sem tocar no Core)
  engine.registerConnector(new MockGovConnector());

  // 3. Criar Jornada
  const journey = journeyMgr.create({
    userId:          input.userId,
    identityContext: "PF",
    title:           "Consulta CPF gov.br",
    goal:            `Verificar situação do CPF ${input.cpf}`,
  });

  // 4. Armazenar CPF na Working Memory (Memory Before Repetition)
  await memory.store({
    userId:          input.userId,
    sessionId:       input.sessionId,
    journeyId:       journey.journeyId,
    identityContext: "PF",
    type:            "ENTITY_EXTRACTED",
    tier:            "working",
    content:         { cpf: input.cpf },
    priority:        0.8,
    tags:            ["cpf", "document"],
  });

  // 5. Criar Plano
  const plan: Plan = {
    planId:    `plan-${Date.now()}`,
    journeyId: journey.journeyId,
    userId:    input.userId,
    sessionId: input.sessionId,
    steps: [{
      stepId:       "step-validate-cpf",
      name:         "Validar CPF na Receita Federal",
      connectorId:  "com.memoryos.gov.mock",
      capabilityId: "gov.document.validate",
      input:        { cpf: input.cpf },
      dependsOn:    [],
      parallel:     false,
      required:     true,
      riskLevel:    "LOW",
      isReversible: false,
      timeoutMs:    5000,
    }],
  };

  // 6. Executar via Execution Engine (Security Gate automático)
  const result = await engine.execute(plan);

  // 7. Atualizar Jornada
  if (result.status === "success") {
    journeyMgr.updateContext(journey.journeyId, { cpfResult: result.stepResults[0]?.output });
    journeyMgr.complete(journey.journeyId);
  } else {
    journeyMgr.pause(journey.journeyId);
  }

  // 8. Publicar evento de conclusão
  await eventBus.publish({
    type:         "journey.completed",
    sourceEngine: "ConsultaGovJourney",
    priority:     "NORMAL",
    payload:      { journeyId: journey.journeyId, success: result.status === "success" },
    correlationId: result.executionId,
  });

  return {
    journeyId:   journey.journeyId,
    executionId: result.executionId,
    cpfData:     result.stepResults[0]?.output,
    auditCount:  audit.totalEntries,
    success:     result.status === "success",
  };
}