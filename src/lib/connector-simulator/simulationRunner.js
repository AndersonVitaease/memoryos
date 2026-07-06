/**
 * Simulation Runner (Sprint 30)
 *
 * Executa cenários de simulação de forma determinística.
 *
 * Fluxo:
 *   1. Obtém cenário do registry
 *   2. Cria SimulatedConnector a partir da config
 *   3. connect()
 *   4. Publica eventos (publishEvent)
 *   5. Recebe ações (receiveAction)
 *   6. Aplica failureConfig se presente
 *   7. disconnect()
 *   8. Registra estatísticas
 *   9. Retorna resultado de execução frozen
 */

import {
  SIMULATION_STATUSES,
  deepFreeze,
  nextSimExecutionId,
  nextSimStepId,
} from "./simulatorContracts.js";
import { createSimulatedConnector } from "./simulatedConnector.js";
import { simulateFailure } from "./failureSimulator.js";

export function createSimulationRunner({ registry, statistics }) {
  function _execute(scenarioId) {
    if (!registry) {
      return deepFreeze({
        executionId: nextSimExecutionId(),
        scenarioId: scenarioId || "",
        status: "FAILED",
        error: "registry not provided",
        steps: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    const scenario = registry.get(scenarioId);
    if (!scenario) {
      return deepFreeze({
        executionId: nextSimExecutionId(),
        scenarioId: scenarioId || "",
        status: "FAILED",
        error: `scenario not found: ${scenarioId}`,
        steps: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    const startedAt = new Date().toISOString();
    const steps = [];
    let hasFailure = false;

    // Create simulated connector from scenario config
    const connector = createSimulatedConnector(scenario.connectorConfig);

    // Step 1: Connect
    const connectResult = connector.connect();
    steps.push(
      deepFreeze({
        stepId: nextSimStepId(),
        type: "CONNECT",
        status: connectResult.success ? "COMPLETED" : "FAILED",
        result: connectResult,
      })
    );

    if (!connectResult.success) {
      hasFailure = true;
    }

    // Step 2: Check for CONNECTOR_OFFLINE failure
    if (
      !hasFailure &&
      scenario.failureConfig &&
      scenario.failureConfig.type === "CONNECTOR_OFFLINE"
    ) {
      const failure = simulateFailure({
        type: "CONNECTOR_OFFLINE",
        connectorId: connector.connectorId,
      });
      steps.push(
        deepFreeze({
          stepId: nextSimStepId(),
          type: "FAILURE",
          status: "COMPLETED",
          result: failure,
        })
      );
      hasFailure = true;
      if (statistics) statistics.inc("simulatedFailures");
    }

    // Step 3: Publish events
    if (!hasFailure) {
      for (const event of scenario.events) {
        const pubResult = connector.publishEvent(event);
        steps.push(
          deepFreeze({
            stepId: nextSimStepId(),
            type: "EVENT",
            eventType: event.eventType,
            status: pubResult.accepted ? "COMPLETED" : "FAILED",
            result: pubResult,
          })
        );
        if (statistics) statistics.inc("simulatedEvents");
        if (!pubResult.accepted) hasFailure = true;
      }
    }

    // Step 4: Receive actions
    if (!hasFailure) {
      for (const action of scenario.actions) {
        let actionResult;

        if (
          scenario.failureConfig &&
          scenario.failureConfig.type !== "CONNECTOR_OFFLINE"
        ) {
          // Inject failure for this action
          const failure = simulateFailure({
            type: scenario.failureConfig.type,
            message: scenario.failureConfig.message,
            actionId: action.actionId,
            connectorId: connector.connectorId,
          });
          actionResult = deepFreeze({
            responded: false,
            actionId: action.actionId,
            actionType: action.actionType,
            connectorId: connector.connectorId,
            state: connector.getState(),
            error: failure.message,
            failure,
          });
          hasFailure = true;
          if (statistics) statistics.inc("simulatedFailures");
        } else {
          actionResult = connector.receiveAction(action);
          if (statistics) statistics.inc("simulatedActions");
        }

        steps.push(
          deepFreeze({
            stepId: nextSimStepId(),
            type: "ACTION",
            actionType: action.actionType,
            status: actionResult.responded ? "COMPLETED" : "FAILED",
            result: actionResult,
          })
        );

        if (hasFailure) break;
      }
    }

    // Step 5: Record latency
    if (statistics) statistics.inc("simulatedLatencies");

    // Step 6: Disconnect
    if (connectResult.success && connector.getState() === "CONNECTED") {
      const disconnectResult = connector.disconnect();
      steps.push(
        deepFreeze({
          stepId: nextSimStepId(),
          type: "DISCONNECT",
          status: disconnectResult.success ? "COMPLETED" : "FAILED",
          result: disconnectResult,
        })
      );
    }

    const completedAt = new Date().toISOString();
    const status = hasFailure ? "FAILED" : "COMPLETED";

    if (statistics) statistics.inc("executedScenarios");

    return deepFreeze({
      executionId: nextSimExecutionId(),
      scenarioId,
      scenarioName: scenario.name,
      status,
      connectorId: connector.connectorId,
      steps,
      eventLog: connector.getEventLog(),
      actionLog: connector.getActionLog(),
      startedAt,
      completedAt,
      totalSteps: steps.length,
      hadFailure: hasFailure,
    });
  }

  return Object.freeze({
    executeScenario(scenarioId) {
      return _execute(scenarioId);
    },
  });
}