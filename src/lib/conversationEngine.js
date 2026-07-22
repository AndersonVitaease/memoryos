import { base44 } from "@/api/base44Client";

/**
 * Conversation Memory Engine
 *
 * Processa lotes de mensagens e extrai conhecimento estruturado:
 * - Resumo incremental da sessão
 * - Assuntos/tópicos
 * - Entidades (pessoas, empresas, produtos, etc.)
 * - Decisões
 * - Tarefas/próximos passos
 * - Palavras-chave
 *
 * O usuário nunca percebe esse processamento.
 */

const BATCH_SIZE = 5;

const CONVERSATION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resumo atualizado da conversa até agora (máx 500 palavras)" },
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do assunto/tema" },
          description: { type: "string", description: "Descrição breve" },
        },
        required: ["name"],
      },
      description: "Assuntos
