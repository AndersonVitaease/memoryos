/**
 * WorkflowStateMachine.ts
 * Sprint 6.2.3 — Engineering Workflow Integration
 *
 * Máquina de estados explícita e determinística para o Engineering Workflow.
 * Não utiliza flags booleanas — cada transição é validada contra a tabela de
 * transições válidas antes de ser aplicada.
 * SRP: única responsabilidade é gerenciar e validar transições de estado.
 */

import type { WorkflowState, WorkflowExecution, WorkflowEvent, WorkflowEventType } from './WorkflowTypes';
import { VALID_TRANSITIONS } from './WorkflowTypes';

let _eventSeq = 0;
function makeEventId(): string {
  return `evt-${Date.now()}-${++_eventSeq}`;
}

export class WorkflowStateMachine {
  /**
   * Validates and applies a state transition.
   * Throws an explicit error for any invalid transition — no silent state corruption.
   */
  static transition(
    execution: WorkflowExecution,
    nextState: WorkflowState,
    eventType: WorkflowEventType,
    actor: string,
    payload: Record<string, unknown> = {}
  ): WorkflowExecution {
    const currentState = execution.state;
    const allowed = VALID_TRANSITIONS[currentState];

    if (!allowed.includes(nextState)) {
      throw new Error(
        `[WorkflowStateMachine] Invalid transition: ${currentState} → ${nextState} ` +
        `for request ${execution.request.id}. Allowed: [${allowed.join(', ')}]`
      );
    }

    // Build and append the event before mutating state.
    const event: WorkflowEvent = {
      id: makeEventId(),
      timestamp: new Date().toISOString(),
      correlationId: execution.correlationId,
      requestId: execution.request.id,
      actor,
      eventType,
      payload: { from: currentState, to: nextState, ...payload },
      status: nextState === 'FAILED' || nextState === 'ROLLED_BACK' ? 'FAILURE' : 'SUCCESS',
    };

    execution.events.push(event);
    execution.state = nextState;

    if (nextState === 'COMPLETED' || nextState === 'ROLLED_BACK' || nextState === 'REJECTED' || nextState === 'FAILED') {
      execution.completedAt = new Date().toISOString();
    }

    return execution;
  }

  /** Returns whether a given transition is valid from the current state. */
  static canTransition(currentState: WorkflowState, nextState: WorkflowState): boolean {
    return VALID_TRANSITIONS[currentState]?.includes(nextState) ?? false;
  }

  /** Returns all valid next states from the current state. */
  static validNextStates(currentState: WorkflowState): WorkflowState[] {
    return [...(VALID_TRANSITIONS[currentState] ?? [])];
  }

  /** Returns true if the execution is in a terminal state. */
  static isTerminal(state: WorkflowState): boolean {
    return VALID_TRANSITIONS[state]?.length === 0;
  }

  /** Emits a pure informational event without changing state. */
  static emitEvent(
    execution: WorkflowExecution,
    eventType: WorkflowEventType,
    actor: string,
    payload: Record<string, unknown> = {},
    status: WorkflowEvent['status'] = 'SUCCESS'
  ): WorkflowEvent {
    const event: WorkflowEvent = {
      id: makeEventId(),
      timestamp: new Date().toISOString(),
      correlationId: execution.correlationId,
      requestId: execution.request.id,
      actor,
      eventType,
      payload,
      status,
    };
    execution.events.push(event);
    return event;
  }
}