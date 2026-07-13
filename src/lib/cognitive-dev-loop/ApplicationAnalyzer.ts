/**
 * ApplicationAnalyzer.ts — Cognitive Development Loop
 * Beta-03.1 · 2026-07-13
 *
 * Analyzes the current Base44 application state using the Base44 Production Connector.
 * Returns structured ApplicationAnalysis.
 */

import { Base44Connector } from "../connector-runtime/connectors/Base44Connector";
import type { ApplicationAnalysis, EntityCountSummary } from "./CDLTypes";
import { makeCDLId } from "./CDLTypes";

const CTX = { executionId: "cdl_app_analysis", userId: "cdl", policyContext: {} };
const ENTITIES_TO_COUNT = ["Project", "ChatSession", "Message", "Document", "Task", "Decision", "Topic", "KnowledgeEntity"];

export class ApplicationAnalyzer {
  private readonly connector: Base44Connector;

  constructor() {
    this.connector = new Base44Connector();
  }

  async analyze(): Promise<ApplicationAnalysis> {
    const t0 = Date.now();
    await this.connector.initialize(CTX as any);
    const errors: string[] = [];

    // 1. Auth
    let authStatus = false;
    let userId = "unknown";
    let userEmail = "unknown";
    let userRole = "unknown";
    try {
      const r = await this.connector.execute("auth.me", {}, CTX as any);
      if (r.success) {
        authStatus = true;
        userId     = (r.data as any)?.id ?? "unknown";
        userEmail  = (r.data as any)?.email ?? "unknown";
        userRole   = (r.data as any)?.role ?? "unknown";
      } else { errors.push(`auth.me: ${r.error}`); }
    } catch (e) { errors.push(`auth.me exception: ${String(e)}`); }

    // 2. Workspace info
    try {
      const r = await this.connector.execute("workspace.info", {}, CTX as any);
      if (!r.success) errors.push(`workspace.info: ${r.error}`);
    } catch (e) { errors.push(`workspace.info exception: ${String(e)}`); }

    // 3. Projects
    let projects: Array<{ id: string; name: string; type: string }> = [];
    try {
      const r = await this.connector.execute("projects.list", { limit: 20 }, CTX as any);
      if (r.success) projects = (r.data as any)?.items ?? [];
      else errors.push(`projects.list: ${r.error}`);
    } catch (e) { errors.push(`projects.list exception: ${String(e)}`); }

    // 4. Sessions
    let sessions: Array<{ id: string; title: string; status: string }> = [];
    try {
      const r = await this.connector.execute("sessions.list", { limit: 10 }, CTX as any);
      if (r.success) sessions = (r.data as any)?.items ?? [];
      else errors.push(`sessions.list: ${r.error}`);
    } catch (e) { errors.push(`sessions.list exception: ${String(e)}`); }

    // 5. Entity counts
    const entityCounts: EntityCountSummary[] = [];
    for (const entity of ENTITIES_TO_COUNT) {
      try {
        const r = await this.connector.execute("entities.count", { entity }, CTX as any);
        if (r.success) entityCounts.push({ entity, count: (r.data as any)?.count ?? 0 });
        else entityCounts.push({ entity, count: 0 });
      } catch { entityCounts.push({ entity, count: 0 }); }
    }

    return {
      id:               makeCDLId("app_analysis"),
      generatedAt:      Date.now(),
      durationMs:       Date.now() - t0,
      platform:         "base44",
      userId, userEmail, userRole,
      projectCount:     projects.length,
      projects,
      sessionCount:     sessions.length,
      sessions,
      entityCounts,
      authStatus,
      connectorVersion: "2.0.0",
      errors,
    };
  }
}