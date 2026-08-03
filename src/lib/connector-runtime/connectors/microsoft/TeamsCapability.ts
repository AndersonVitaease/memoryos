/**
 * TeamsCapability.ts — servico Microsoft Teams (Chat) do Microsoft Graph.
 *
 * Fase 3 (MS-EXP-03) — RFC-006 / ADR-013.
 * Capacidades: teams.listChats, teams.listMessages, teams.sendMessage.
 * Escopos OAuth necessarios: Chat.Read, ChatMessage.Send.
 *
 * CAVEAT: Teams exige tenant corporativo. Contas pessoais @outlook.com podem
 * nao ter acesso ao /me/chats — Graph retorna 404/Forbidden nesses casos.
 *
 * Endpoints:
 *   GET  /me/chats                 — listar conversas
 *   GET  /chats/{id}/messages      — listar mensagens de uma conversa
 *   POST /chats/{id}/messages      — enviar mensagem
 */
import type { MicrosoftCapability } from "./MicrosoftCapabilityTypes";
import type { ConnectorResult } from "../../ConnectorTypes";
import { graphFetch, ok, fail } from "./MicrosoftGraphHelper";

export const TeamsCapability: MicrosoftCapability = {
  id: "microsoft-teams",
  operations: ["teams.listChats", "teams.listMessages", "teams.sendMessage"],

  async execute(operation, payload, accessToken, ctx): Promise<ConnectorResult> {
    const { start, eid, logs } = ctx;

    switch (operation) {
      case "teams.listChats": {
        const top = typeof payload.top === "number" ? payload.top : 20;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/me/chats?$top=${top}&$select=id,topic,chatType,createdDateTime`,
          accessToken,
        );
        return ok({ chats: data.value ?? [] }, start, eid, logs, operation);
      }

      case "teams.listMessages": {
        const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
        if (!chatId) return fail("chatId é obrigatório (use teams.listChats para descobrir)", start, eid, logs, operation);
        const top = typeof payload.top === "number" ? payload.top : 20;
        const data = await graphFetch<{ value?: unknown[] }>(
          `/chats/${chatId}/messages?$top=${top}&$select=id,body,from,createdDateTime`,
          accessToken,
        );
        return ok({ messages: data.value ?? [] }, start, eid, logs, operation);
      }

      case "teams.sendMessage": {
        const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
        const content = typeof payload.content === "string" ? payload.content : "";
        if (!chatId) return fail("chatId é obrigatório", start, eid, logs, operation);
        if (!content) return fail("content é obrigatório", start, eid, logs, operation);
        const data = await graphFetch(`/chats/${chatId}/messages`, accessToken, {
          method: "POST",
          body: JSON.stringify({
            body: { contentType: "text", content },
          }),
        });
        return ok({ message: data }, start, eid, logs, operation);
      }

      default:
        return fail(`Unknown teams operation: "${operation}"`, start, eid, logs, operation);
    }
  },
};