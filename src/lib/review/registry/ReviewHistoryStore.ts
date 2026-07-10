// ─── Review History Store ─────────────────────────────────────────────────────
// Foundation v1.0 · Persiste ReviewReports em memória (swap por DB em Sprint 4+)

import type { ReviewReport } from "../ReviewReport";

export interface HistoryEntry {
  reviewId: string;
  sprint: string;
  sprintLabel: string;
  timestamp: number;
  status: string;
  passRate: number;
  coverage: number;
  overallScore: number;
  report: ReviewReport;
}

class ReviewHistoryStore {
  private readonly store: HistoryEntry[] = [];

  persist(report: ReviewReport): void {
    const entry: HistoryEntry = {
      reviewId:     report.reviewId,
      sprint:       report.sprint,
      sprintLabel:  report.sprintLabel,
      timestamp:    report.timestamp,
      status:       report.status,
      passRate:     report.mri.passRate,
      coverage:     report.mqccs.coverage,
      overallScore: report.mers.overallScore,
      report,
    };
    // Replace existing entry for same reviewId, otherwise append
    const idx = this.store.findIndex(e => e.reviewId === report.reviewId);
    if (idx !== -1) this.store[idx] = entry;
    else this.store.push(entry);
  }

  getAll(): HistoryEntry[] {
    return [...this.store].sort((a, b) => b.timestamp - a.timestamp);
  }

  getBySprint(sprint: string): HistoryEntry[] {
    return this.store.filter(e => e.sprint === sprint);
  }

  getLatest(): HistoryEntry | null {
    if (this.store.length === 0) return null;
    return [...this.store].sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  compare(reviewId1: string, reviewId2: string): { a: HistoryEntry | null; b: HistoryEntry | null } {
    return {
      a: this.store.find(e => e.reviewId === reviewId1) ?? null,
      b: this.store.find(e => e.reviewId === reviewId2) ?? null,
    };
  }

  size(): number {
    return this.store.length;
  }
}

export const reviewHistory = new ReviewHistoryStore();