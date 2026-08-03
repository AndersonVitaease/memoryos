/**
 * ToDoCapability.ts — servico Microsoft To Do (Tasks) do Microsoft Graph.
 *
 * Fase 2 (MS-EXP-02) — RFC-006 / ADR-013.
 * Capacidades: todo.listLists, todo.listTasks, todo.createTask, todo.completeTask.
 * Escopo OAuth necessario: Tasks.ReadWrite.
 *
 * Endpoints:
 *   GET   /me/todo/lists                     — listar listas
 *   GET   /me/todo/lists/{id}/tasks           — listar tarefas de uma lista
 *   POST  /me/todo/lists/{id}/tasks           — criar tarefa
 *   PATCH /me/todo/lists/{id}/tasks/{taskId}  — atualizar (status="completed")
 *
 * Observacao: a lista padrao do usuario e normalmente "Tasks"; o Planner
 * pode resolver pelo displayName ou usar listId explicito.
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const ToDoCapability: MicrosoftCapability = {
  id: "microsoft-todo",
  operations: ["todo.listLists", "todo.listTasks", "todo.createTask", "todo.completeTask"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "todo.listLists": {
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/todo/lists?$select=id,displayName,isOwner`,
          accessToken,
        );
        return ok({ lists: data.value ?? [] }, start, eid, logs, operation);
      }

      case "todo.listTasks": {
        const listId = typeof payload.listId === "string" ? payload.listId : null;
        if (!listId) return fail("listId é obrigatório (use todo.listLists para descobrir)", start, eid, logs, operation);
        const top = typeof payload.top === "number" ? payload.top : 50;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/todo/lists/${listId}/tasks?$top=${top}&$select=id,title,status,importance,dueDateTime`,
          accessToken,
        );
        return ok({ tasks: data.value ?? [] }, start, eid, logs, operation);
      }

      case "todo.createTask": {
        const listId = typeof payload.listId === "string" ? payload.listId : null;
        const title = typeof payload.title === "string" ? payload.title : "";
        if (!listId) return fail("listId é obrigatório", start, eid, logs, operation);
        if (!title) return fail("title é obrigatório", start, eid, logs, operation);
        const body: Record<string, unknown> = { title };
        if (typeof payload.dueDateTime === "string") {
          body.dueDateTime = { dateTime: payload.dueDateTime, timeZone: "America/Sao_Paulo" };
        }
        const data = await graphFetch(`/me/todo/lists/${listId}/tasks`, accessToken, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return ok({ task: data }, start, eid, logs, operation);
      }

      case "todo.completeTask": {
        const listId = typeof payload.listId === "string" ? payload.listId : null;
        const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
        if (!listId) return fail("listId é obrigatório", start, eid, logs, operation);
        if (!taskId) return fail("taskId é obrigatório", start, eid, logs, operation);
        const data = await graphFetch(`/me/todo/lists/${listId}/tasks/${taskId}`, accessToken, {
          method: "PATCH",
          body: JSON.stringify({ status: "completed" }),
        });
        return ok({ task: data }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown todo operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};