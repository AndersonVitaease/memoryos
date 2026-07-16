/**
 * MissionRegistry.ts — Engineering Sprint 8.1
 * Central registry of all Mission definitions.
 * Missions are connector-agnostic — they express user objectives only.
 */

import type { MissionDefinition } from "./MissionDefinition";

// ── Mission catalogue ─────────────────────────────────────────────────────────

const MISSIONS: MissionDefinition[] = [
  {
    id: "PrepareMeeting",
    name: "Preparar Reuniao",
    description: "Reune agenda, documentos e comunicacoes relacionadas a uma reuniao especifica.",
    requiredEntities:  ["meeting", "date"],
    optionalEntities:  ["participant", "location", "project"],
    priority: 1,
    successCriteria: [
      "Proxima reuniao identificada",
      "Documentos relevantes recuperados",
      "Emails relacionados encontrados",
    ],
    recommendedCapabilities: [
      { capabilityId: "calendar.nextMeeting", connectorId: "calendar", priority: 1, dependsOn: [],                         mode: "sequential", timeoutMs: 8000,  label: "Proxima Reuniao" },
      { capabilityId: "calendar.today",       connectorId: "calendar", priority: 2, dependsOn: [],                         mode: "parallel",   timeoutMs: 8000,  label: "Agenda de Hoje" },
      { capabilityId: "drive.searchFiles",    connectorId: "drive",    priority: 3, dependsOn: ["calendar.nextMeeting"],   mode: "sequential", timeoutMs: 10000, label: "Documentos" },
      { capabilityId: "searchEmails",         connectorId: "gmail",    priority: 4, dependsOn: ["calendar.nextMeeting"],   mode: "sequential", timeoutMs: 10000, label: "Emails relacionados" },
    ],
    fallbackCapabilities: [
      { capabilityId: "calendar.thisWeek",    connectorId: "calendar", priority: 1, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Semana (fallback)" },
      { capabilityId: "drive.listFiles",      connectorId: "drive",    priority: 2, dependsOn: [], mode: "parallel",   timeoutMs: 8000, label: "Drive (fallback)" },
    ],
    aggregationStrategy: "llm",
    estimatedDurationMs: 5000,
  },

  {
    id: "FindCustomerInformation",
    name: "Encontrar Informacoes do Cliente",
    description: "Consolida todas as informacoes disponiveis sobre um cliente: emails, documentos e reunioes.",
    requiredEntities:  ["customer", "name"],
    optionalEntities:  ["company", "project", "date_range"],
    priority: 2,
    successCriteria: [
      "Emails do cliente encontrados",
      "Documentos associados localizados",
      "Reunioes com o cliente identificadas",
    ],
    recommendedCapabilities: [
      { capabilityId: "searchEmails",          connectorId: "gmail",    priority: 1, dependsOn: [],               mode: "parallel",   timeoutMs: 12000, label: "Emails do Cliente" },
      { capabilityId: "drive.searchFiles",     connectorId: "drive",    priority: 2, dependsOn: [],               mode: "parallel",   timeoutMs: 12000, label: "Documentos do Cliente" },
      { capabilityId: "calendar.searchEvents", connectorId: "calendar", priority: 3, dependsOn: [],               mode: "parallel",   timeoutMs: 10000, label: "Reunioes com Cliente" },
    ],
    fallbackCapabilities: [
      { capabilityId: "drive.listFiles",   connectorId: "drive",    priority: 1, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Listagem Drive (fallback)" },
      { capabilityId: "calendar.thisWeek", connectorId: "calendar", priority: 2, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Semana (fallback)" },
    ],
    aggregationStrategy: "llm",
    estimatedDurationMs: 4000,
  },

  {
    id: "SummarizeProject",
    name: "Resumir Projeto",
    description: "Gera um resumo completo de um projeto: documentos, tarefas, emails e eventos recentes.",
    requiredEntities:  ["project"],
    optionalEntities:  ["date_range", "participant"],
    priority: 3,
    successCriteria: [
      "Documentos do projeto localizados",
      "Emails do projeto encontrados",
      "Resumo gerado via LLM",
    ],
    recommendedCapabilities: [
      { capabilityId: "drive.searchFiles",     connectorId: "drive",    priority: 1, dependsOn: [],                   mode: "parallel",   timeoutMs: 12000, label: "Documentos do Projeto" },
      { capabilityId: "searchEmails",          connectorId: "gmail",    priority: 2, dependsOn: [],                   mode: "parallel",   timeoutMs: 12000, label: "Emails do Projeto" },
      { capabilityId: "calendar.searchEvents", connectorId: "calendar", priority: 3, dependsOn: [],                   mode: "parallel",   timeoutMs: 10000, label: "Eventos do Projeto" },
    ],
    fallbackCapabilities: [
      { capabilityId: "drive.listFiles",   connectorId: "drive", priority: 1, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Drive (fallback)" },
    ],
    aggregationStrategy: "llm",
    estimatedDurationMs: 5000,
  },

  {
    id: "ReviewPendingTasks",
    name: "Revisar Tarefas Pendentes",
    description: "Lista tarefas pendentes, emails nao respondidos e documentos aguardando revisao.",
    requiredEntities:  [],
    optionalEntities:  ["project", "date_range", "assignee"],
    priority: 2,
    successCriteria: [
      "Reunioes da semana identificadas",
      "Emails pendentes listados",
      "Documentos aguardando acao localizados",
    ],
    recommendedCapabilities: [
      { capabilityId: "calendar.thisWeek",  connectorId: "calendar", priority: 1, dependsOn: [],                  mode: "sequential", timeoutMs: 8000,  label: "Semana" },
      { capabilityId: "searchEmails",       connectorId: "gmail",    priority: 2, dependsOn: ["calendar.thisWeek"], mode: "sequential", timeoutMs: 12000, label: "Emails Pendentes" },
      { capabilityId: "drive.searchFiles",  connectorId: "drive",    priority: 3, dependsOn: [],                  mode: "parallel",   timeoutMs: 12000, label: "Docs Pendentes" },
    ],
    fallbackCapabilities: [
      { capabilityId: "calendar.today", connectorId: "calendar", priority: 1, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Hoje (fallback)" },
    ],
    aggregationStrategy: "template",
    estimatedDurationMs: 4500,
  },

  {
    id: "PrepareTrip",
    name: "Preparar Viagem",
    description: "Consolida informacoes de viagem: confirmacoes, documentos, agenda e emails relacionados.",
    requiredEntities:  ["trip", "destination"],
    optionalEntities:  ["date", "airline", "hotel"],
    priority: 3,
    successCriteria: [
      "Emails de confirmacao localizados",
      "Documentos de viagem encontrados",
      "Agenda do periodo consolidada",
    ],
    recommendedCapabilities: [
      { capabilityId: "searchEmails",          connectorId: "gmail",    priority: 1, dependsOn: [],               mode: "parallel",   timeoutMs: 12000, label: "Confirmacoes" },
      { capabilityId: "drive.searchFiles",     connectorId: "drive",    priority: 2, dependsOn: [],               mode: "parallel",   timeoutMs: 12000, label: "Docs de Viagem" },
      { capabilityId: "calendar.searchEvents", connectorId: "calendar", priority: 3, dependsOn: [],               mode: "parallel",   timeoutMs: 10000, label: "Agenda da Viagem" },
    ],
    fallbackCapabilities: [
      { capabilityId: "drive.listFiles",    connectorId: "drive",    priority: 1, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Drive (fallback)" },
      { capabilityId: "calendar.thisWeek",  connectorId: "calendar", priority: 2, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Semana (fallback)" },
    ],
    aggregationStrategy: "llm",
    estimatedDurationMs: 5000,
  },

  {
    id: "ReviewInvoices",
    name: "Revisar Faturas",
    description: "Localiza faturas, contratos financeiros e emails de cobranca.",
    requiredEntities:  [],
    optionalEntities:  ["vendor", "date_range", "amount"],
    priority: 2,
    successCriteria: [
      "Documentos financeiros localizados",
      "Emails de fatura/cobranca encontrados",
    ],
    recommendedCapabilities: [
      { capabilityId: "drive.searchFiles", connectorId: "drive", priority: 1, dependsOn: [], mode: "parallel",   timeoutMs: 12000, label: "Documentos Financeiros" },
      { capabilityId: "searchEmails",      connectorId: "gmail", priority: 2, dependsOn: [], mode: "parallel",   timeoutMs: 12000, label: "Emails de Fatura" },
    ],
    fallbackCapabilities: [
      { capabilityId: "drive.listFiles",   connectorId: "drive", priority: 1, dependsOn: [], mode: "sequential", timeoutMs: 8000, label: "Drive (fallback)" },
    ],
    aggregationStrategy: "template",
    estimatedDurationMs: 3500,
  },
];

// ── Registry API ──────────────────────────────────────────────────────────────

export class MissionRegistry {
  private static _missions = new Map<string, MissionDefinition>(
    MISSIONS.map((m) => [m.id, m])
  );

  static get(id: string): MissionDefinition | null {
    return this._missions.get(id) ?? null;
  }

  static list(): MissionDefinition[] {
    return Array.from(this._missions.values()).sort((a, b) => a.priority - b.priority);
  }

  static register(mission: MissionDefinition): void {
    this._missions.set(mission.id, mission);
  }

  static ids(): string[] {
    return Array.from(this._missions.keys());
  }
}