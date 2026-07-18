/**
 * IntegrationSuite.ts
 * Master registration file for all EV-2 integration tests.
 *
 * Sprint: EV-2
 * Usage: import and call registerAllIntegrationTests() to load all suites.
 */

import { registerKQPipelineIntegrationTests }          from "./KnowledgeQueryPipelineIntegrationTests";
import { registerPlanningPipelineIntegrationTests }    from "./PlanningKnowledgePipelineIntegrationTests";
import { registerDecisionPipelineIntegrationTests }    from "./DecisionKnowledgePipelineIntegrationTests";
import { registerEngineeringPipelineIntegrationTests } from "./EngineeringKnowledgePipelineIntegrationTests";
import { registerConnectorPipelineIntegrationTests }   from "./ConnectorKnowledgePipelineIntegrationTests";
import { registerGovernancePipelineIntegrationTests }  from "./GovernancePipelineIntegrationTests";
import { registerOKPipelineIntegrationTests }          from "./OperationalKnowledgePipelineIntegrationTests";
import { registerPipelineStressTests }                 from "./PipelineStressTests";
import { registerPipelinePerformanceTests }            from "./PipelinePerformanceTests";

export function registerAllIntegrationTests(): void {
  registerKQPipelineIntegrationTests();
  registerPlanningPipelineIntegrationTests();
  registerDecisionPipelineIntegrationTests();
  registerEngineeringPipelineIntegrationTests();
  registerConnectorPipelineIntegrationTests();
  registerGovernancePipelineIntegrationTests();
  registerOKPipelineIntegrationTests();
  registerPipelineStressTests();
  registerPipelinePerformanceTests();
}

export const INTEGRATION_SUITES = [
  "KnowledgeQueryPipeline [INT]",
  "PlanningKnowledgePipeline [INT]",
  "DecisionKnowledgePipeline [INT]",
  "EngineeringKnowledgePipeline [INT]",
  "ConnectorKnowledgePipeline [INT]",
  "GovernancePipeline [INT]",
  "OperationalKnowledgePipeline [INT]",
  "PipelineStress [INT]",
  "PipelinePerformance [INT]",
] as const;