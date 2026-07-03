import { base44 } from "@/api/base44Client";

const LAST_VISIT_KEY = "memoryos_last_visit";

export function getLastVisit() {
  return localStorage.getItem(LAST_VISIT_KEY);
}

export function updateLastVisit() {
  localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function getFirstName(user) {
  if (user?.full_name && user.full_name.trim()) {
    return user.full_name.split(" ")[0];
  }
  if (user?.email) {
    return user.email.split("@")[0];
  }
  return "";
}

/**
 * Busca todo o contexto necessário para a Home em paralelo.
 */
export async function fetchMemorySnapshot() {
  const lastVisit = getLastVisit();
  const lastVisitDate = lastVisit ? new Date(lastVisit) : null;

  const [user, activeSessions, spaces, decisions, tasks, documents, topics] = await Promise.all([
    base44.auth.me(),
    base44.entities.ChatSession.filter({ status: "active" }, "-last_message_at", 10),
    base44.entities.Project.list("-updated_date", 20),
    base44.entities.Decision.list("-created_date", 20),
    base44.entities.Task.list("-created_date", 20),
    base44.entities.Document.list("-created_date", 20),
    base44.entities.Topic.list("-created_date", 20),
  ]);

  const pendingTasks = tasks.filter((t) => t.status !== "done");

  const sinceLastVisit = lastVisitDate
    ? {
        newDecisions: decisions.filter((d) => new Date(d.created_date) > lastVisitDate),
        newTasks: tasks.filter((t) => new Date(t.created_date) > lastVisitDate),
        newDocuments: documents.filter((d) => new Date(d.created_date) > lastVisitDate),
        newTopics: topics.filter((t) => new Date(t.created_date) > lastVisitDate),
        evolvedSessions: activeSessions.filter((s) => new Date(s.updated_date) > lastVisitDate),
      }
    : null;

  const activity = [
    ...decisions.map((d) => ({ ...d, _type: "decision" })),
    ...tasks.map((t) => ({ ...t, _type: "task" })),
    ...documents.map((d) => ({ ...d, _type: "document" })),
    ...topics.map((t) => ({ ...t, _type: "topic" })),
  ]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 15);

  return {
    user,
    activeSessions,
    spaces,
    pendingTasks,
    sinceLastVisit,
    activity,
    isFirstVisit: !lastVisitDate,
  };
}