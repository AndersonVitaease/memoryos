/**
 * ConnectorCapabilityExecutor.ts — Engineering Sprint E-02.4
 * Adapter: ICapabilityExecutor → UniversalConnectorRouter.
 *
 * SRP: implementar ICapabilityExecutor delegando para o UCR.
 *
 * Dependency Inversion:
 *   ExecutionDispatcher depende de ICapabilityExecutor (não de UCR).
 *   ConnectorCapabilityExecutor depende de UniversalConnectorRouter.
 *   Assim o Dispatcher continua sem conhecer nenhum Connector.
 *
 * Nenhuma rede. Nenhum OAuth.
 */

import type {
  ICapabilityExecutor,
  CapabilityExecutorInput,
  CapabilityExecutorOutput,
  StepStatus,
} from "@/lib/runtime-engine/RuntimeTypes";
import { UniversalConnectorRouter } from "./UniversalConnectorRouter";

// ── ConnectorCapabilityExecutor ───────────────────────────────────────────────

export class ConnectorCapabilityExecutor implements ICapabilityExecutor {
  constructor(private readonly _router: UniversalConnectorRouter) {}

  async execute(input: CapabilityExecutorInput): Promise<CapabilityExecutorOutput> {
    const { executionId, step } = input;

    const routerResult = await this._router.route(executionId, step);

    if (!routerResult.found || routerResult.result === null) {
      return Object.freeze({
        status: "failed" as StepStatus,
        output: null,
        error:  routerResult.error ?? "Router: connector or capability not found",
      });
    }

    const r = routerResult.result;

    const status: StepStatus =
      r.status === "success" ? "completed" :
      r.status === "timeout" ? "timeout"   :
      "failed";

    return Object.freeze({
      status,
      output: r.output,
      error:  r.error,
    });
  }
}