/**
 * GitHubWriteStore.ts
 * EF-33B — GitHub Connector Write Operations · Mutable In-Memory Store
 * Extends EF-33A read-only store with full write, transaction, rollback,
 * conflict detection, sync queue, and bidirectional sync support.
 * EF-33B · 2026-07-12 · Version: 1.0.0
 */

import type { GHBranch, GHCommit, GHPR, GHIssue, GHWorkflow, GHWorkflowRun } from './GitHubStore';
import { REPOS, BRANCHES as SEED_BRANCHES, COMMITS as SEED_COMMITS, PULL_REQUESTS as SEED_PRS, ISSUES as SEED_ISSUES, WORKFLOWS, FILE_CONTENTS as SEED_CONTENTS, TREES as SEED_TREES } from './GitHubStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WriteOpType =
  | 'create_branch' | 'delete_branch' | 'rename_branch'
  | 'create_file' | 'update_file' | 'delete_file' | 'rename_file' | 'move_file'
  | 'create_commit'
  | 'create_pr' | 'update_pr' | 'close_pr' | 'reopen_pr' | 'merge_pr'
  | 'create_issue' | 'update_issue' | 'close_issue' | 'reopen_issue' | 'add_comment'
  | 'workflow_dispatch' | 'cancel_workflow_run';

export interface WriteOp {
  type: WriteOpType;
  repoId: string;
  payload: Record<string, unknown>;
  executedAt: string;
}

export interface GHSnapshot {
  id: string;
  repoId: string;
  correlationId: string;
  executionId: string;
  createdAt: string;
  hash: string;
  branches: GHBranch[];
  files: Record<string, string>;   // path -> content
  prs: GHPR[];
  issues: GHIssue[];
  commitCount: number;
}

export interface GHTransaction {
  id: string;
  repoId: string;
  userId: string;
  correlationId: string;
  executionId: string;
  status: 'OPEN' | 'COMMITTED' | 'ROLLED_BACK' | 'ABORTED';
  ops: WriteOp[];
  snapshotId: string;
  openedAt: string;
  closedAt?: string;
}

export interface GHConflict {
  type: 'BRANCH_EXISTS' | 'BRANCH_PROTECTED' | 'FILE_EXISTS' | 'FILE_NOT_FOUND' | 'PR_CONFLICT' | 'ISSUE_NOT_FOUND' | 'WORKFLOW_DISABLED' | 'COMMIT_SHA_MISMATCH';
  repoId: string;
  path?: string;
  message: string;
  detectedAt: string;
}

export interface GHWorkflowDispatch {
  id: string;
  workflowId: string;
  repoId: string;
  branch: string;
  inputs: Record<string, string>;
  dispatchedAt: string;
  status: 'queued' | 'in_progress' | 'completed' | 'cancelled';
  conclusion?: 'success' | 'failure' | 'cancelled';
}

export interface SyncQueueItem {
  id: string;
  repoId: string;
  direction: 'base44_to_github' | 'github_to_base44' | 'bidirectional';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'conflict';
  changeCount: number;
  enqueuedAt: string;
  completedAt?: string;
  conflictCount: number;
}

// ── GitHub Write Store ────────────────────────────────────────────────────────

export class GitHubWriteStore {
  // Mutable state
  private branches = new Map<string, GHBranch>();       // key: repoId+name
  private files = new Map<string, string>();             // key: repoId+path
  private commits: GHCommit[] = [];
  private prs: GHPR[] = [];
  private issues: GHIssue[] = [];
  private dispatchedWorkflows: GHWorkflowDispatch[] = [];
  private nextPrNumber: number;
  private nextIssueNumber: number;

  // Infrastructure
  private snapshots = new Map<string, GHSnapshot>();
  private transactions = new Map<string, GHTransaction>();
  private conflicts: GHConflict[] = [];
  private syncQueue: SyncQueueItem[] = [];

  // Telemetry
  private counters = {
    branchesCreated: 0, branchesDeleted: 0,
    filesCreated: 0, filesUpdated: 0, filesDeleted: 0,
    commitsCreated: 0,
    prsCreated: 0, prsMerged: 0, prsClosed: 0,
    issuesCreated: 0, issuesClosed: 0,
    workflowDispatches: 0,
    transactions: 0, rollbacks: 0, conflicts: 0,
    syncs: 0,
    latencies: [] as number[],
  };

  constructor() {
    this.resetToSeed();
    this.nextPrNumber = SEED_PRS.length + 1;
    this.nextIssueNumber = SEED_ISSUES.length + 1;
  }

  resetToSeed(): void {
    this.branches.clear();
    this.files.clear();
    for (const b of SEED_BRANCHES) {
      this.branches.set(`${b.repoId}|${b.name}`, { ...b });
    }
    for (const [k, v] of Object.entries(SEED_CONTENTS)) {
      this.files.set(k, v.content);
    }
    this.commits = SEED_COMMITS.map(c => ({ ...c }));
    this.prs = SEED_PRS.map(p => ({ ...p }));
    this.issues = SEED_ISSUES.map(i => ({ ...i }));
    this.dispatchedWorkflows = [];
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  createSnapshot(repoId: string, correlationId: string, executionId: string): GHSnapshot {
    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snap: GHSnapshot = {
      id, repoId, correlationId, executionId,
      createdAt: new Date().toISOString(),
      hash: `sha256-ghsnap-${id}`,
      branches: this.getBranches(repoId).map(b => ({ ...b })),
      files: Object.fromEntries([...this.files.entries()].filter(([k]) => k.startsWith(`${repoId}/`))),
      prs: this.prs.filter(p => p.repoId === repoId).map(p => ({ ...p })),
      issues: this.issues.filter(i => i.repoId === repoId).map(i => ({ ...i })),
      commitCount: this.commits.filter(c => c.repoId === repoId).length,
    };
    this.snapshots.set(id, snap);
    return snap;
  }

  restoreSnapshot(snapshotId: string): void {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new Error(`Snapshot '${snapshotId}' not found`);
    // Restore branches for this repo
    for (const [k] of this.branches) {
      if (k.startsWith(`${snap.repoId}|`)) this.branches.delete(k);
    }
    for (const b of snap.branches) {
      this.branches.set(`${b.repoId}|${b.name}`, { ...b });
    }
    // Restore files
    for (const [k] of this.files) {
      if (k.startsWith(`${snap.repoId}/`)) this.files.delete(k);
    }
    for (const [k, v] of Object.entries(snap.files)) {
      this.files.set(k, v);
    }
    // Restore prs and issues
    this.prs = [...this.prs.filter(p => p.repoId !== snap.repoId), ...snap.prs.map(p => ({ ...p }))];
    this.issues = [...this.issues.filter(i => i.repoId !== snap.repoId), ...snap.issues.map(i => ({ ...i }))];
  }

  getSnapshot(id: string): GHSnapshot | undefined { return this.snapshots.get(id); }
  getAllSnapshots(): GHSnapshot[] { return [...this.snapshots.values()]; }

  // ── Transactions ──────────────────────────────────────────────────────────

  beginTransaction(repoId: string, correlationId: string, executionId: string, userId: string): GHTransaction {
    const snap = this.createSnapshot(repoId, correlationId, executionId);
    const tx: GHTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      repoId, userId, correlationId, executionId,
      status: 'OPEN', ops: [],
      snapshotId: snap.id,
      openedAt: new Date().toISOString(),
    };
    this.transactions.set(tx.id, tx);
    this.counters.transactions++;
    return tx;
  }

  commitTransaction(txId: string): GHTransaction {
    const tx = this.mustGetOpenTx(txId);
    tx.status = 'COMMITTED';
    tx.closedAt = new Date().toISOString();
    return tx;
  }

  rollbackTransaction(txId: string): GHTransaction {
    const tx = this.mustGetOpenTx(txId);
    this.restoreSnapshot(tx.snapshotId);
    tx.status = 'ROLLED_BACK';
    tx.closedAt = new Date().toISOString();
    this.counters.rollbacks++;
    return tx;
  }

  abortTransaction(txId: string): GHTransaction {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error(`Transaction '${txId}' not found`);
    if (tx.status !== 'OPEN') { tx.status = 'ABORTED'; return tx; }
    this.restoreSnapshot(tx.snapshotId);
    tx.status = 'ABORTED';
    tx.closedAt = new Date().toISOString();
    this.counters.rollbacks++;
    return tx;
  }

  addOpToTx(txId: string, op: WriteOp): void {
    this.mustGetOpenTx(txId).ops.push(op);
  }

  getAllTransactions(): GHTransaction[] { return [...this.transactions.values()]; }

  private mustGetOpenTx(txId: string): GHTransaction {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error(`Transaction '${txId}' not found`);
    if (tx.status !== 'OPEN') throw new Error(`Transaction '${txId}' is ${tx.status}`);
    return tx;
  }

  // ── Branch Operations ──────────────────────────────────────────────────────

  getBranches(repoId: string): GHBranch[] {
    return [...this.branches.values()].filter(b => b.repoId === repoId);
  }

  createBranch(repoId: string, name: string, fromSha: string): GHBranch {
    const key = `${repoId}|${name}`;
    if (this.branches.has(key)) throw new Error(`Branch '${name}' already exists in ${repoId}`);
    // Check protection — cannot branch off protected unless forking it
    const b: GHBranch = {
      repoId, name, sha: fromSha,
      protected: false, aheadBy: 0, behindBy: 0,
      updatedAt: new Date().toISOString(),
    };
    this.branches.set(key, b);
    this.counters.branchesCreated++;
    return b;
  }

  deleteBranch(repoId: string, name: string): void {
    const key = `${repoId}|${name}`;
    const b = this.branches.get(key);
    if (!b) throw new Error(`Branch '${name}' not found in ${repoId}`);
    if (b.protected) throw new Error(`Branch '${name}' is protected — cannot delete`);
    this.branches.delete(key);
    this.counters.branchesDeleted++;
  }

  renameBranch(repoId: string, oldName: string, newName: string): GHBranch {
    const oldKey = `${repoId}|${oldName}`;
    const newKey = `${repoId}|${newName}`;
    const b = this.branches.get(oldKey);
    if (!b) throw new Error(`Branch '${oldName}' not found`);
    if (this.branches.has(newKey)) throw new Error(`Branch '${newName}' already exists`);
    this.branches.delete(oldKey);
    b.name = newName;
    b.updatedAt = new Date().toISOString();
    this.branches.set(newKey, b);
    return b;
  }

  // ── File Operations ────────────────────────────────────────────────────────

  getFileContent(repoId: string, path: string): string | undefined {
    return this.files.get(`${repoId}/${path}`);
  }

  createFile(repoId: string, path: string, content: string, _branch: string): void {
    const key = `${repoId}/${path}`;
    if (this.files.has(key)) throw new Error(`File '${path}' already exists in ${repoId}`);
    this.files.set(key, content);
    this.counters.filesCreated++;
  }

  updateFile(repoId: string, path: string, content: string, _branch: string): void {
    const key = `${repoId}/${path}`;
    if (!this.files.has(key)) throw new Error(`File '${path}' not found in ${repoId}`);
    this.files.set(key, content);
    this.counters.filesUpdated++;
  }

  deleteFile(repoId: string, path: string, _branch: string): void {
    const key = `${repoId}/${path}`;
    if (!this.files.has(key)) throw new Error(`File '${path}' not found in ${repoId}`);
    this.files.delete(key);
    this.counters.filesDeleted++;
  }

  renameFile(repoId: string, oldPath: string, newPath: string): void {
    const oldKey = `${repoId}/${oldPath}`;
    const newKey = `${repoId}/${newPath}`;
    if (!this.files.has(oldKey)) throw new Error(`File '${oldPath}' not found`);
    if (this.files.has(newKey)) throw new Error(`File '${newPath}' already exists`);
    const content = this.files.get(oldKey)!;
    this.files.delete(oldKey);
    this.files.set(newKey, content);
  }

  moveFile(repoId: string, fromPath: string, toPath: string): void {
    this.renameFile(repoId, fromPath, toPath);
  }

  getFiles(repoId: string): string[] {
    return [...this.files.keys()].filter(k => k.startsWith(`${repoId}/`)).map(k => k.slice(repoId.length + 1));
  }

  // ── Commit Engine ──────────────────────────────────────────────────────────

  createCommit(repoId: string, branch: string, message: string, author: string, additions: number, deletions: number, files: number): GHCommit {
    if (!message?.trim()) throw new Error('Commit message cannot be empty');
    if (message.length < 10) throw new Error('Commit message too short (min 10 chars)');
    const sha = `sha-write-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const commit: GHCommit = {
      sha, repoId, branch, message,
      author, authorEmail: `${author}@memoryos.dev`,
      timestamp: new Date().toISOString(),
      additions, deletions, files, verified: true,
    };
    this.commits.unshift(commit);  // newest first
    this.counters.commitsCreated++;
    // Update branch SHA
    const bKey = `${repoId}|${branch}`;
    const b = this.branches.get(bKey);
    if (b) { b.sha = sha; b.aheadBy++; b.updatedAt = commit.timestamp; }
    return commit;
  }

  getCommits(repoId: string, branch?: string, limit = 50): GHCommit[] {
    let cs = this.commits.filter(c => c.repoId === repoId);
    if (branch) cs = cs.filter(c => c.branch === branch);
    return cs.slice(0, limit);
  }

  // ── Pull Request Engine ────────────────────────────────────────────────────

  createPR(repoId: string, title: string, body: string, head: string, base: string, author: string, draft = false): GHPR {
    const number = this.nextPrNumber++;
    const pr: GHPR = {
      number, repoId, title, body,
      state: draft ? 'open' : 'open',
      author, base, head,
      reviewers: [], approvals: 0, checksStatus: 'pending',
      labels: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.prs.push(pr);
    this.counters.prsCreated++;
    return pr;
  }

  updatePR(repoId: string, number: number, patch: Partial<Pick<GHPR, 'title' | 'body' | 'state' | 'labels' | 'reviewers'>>): GHPR {
    const pr = this.mustGetPR(repoId, number);
    Object.assign(pr, patch, { updatedAt: new Date().toISOString() });
    return pr;
  }

  closePR(repoId: string, number: number): GHPR {
    const pr = this.mustGetPR(repoId, number);
    if (pr.state === 'merged') throw new Error(`PR #${number} is already merged`);
    pr.state = 'closed'; pr.updatedAt = new Date().toISOString();
    this.counters.prsClosed++;
    return pr;
  }

  reopenPR(repoId: string, number: number): GHPR {
    const pr = this.mustGetPR(repoId, number);
    if (pr.state === 'merged') throw new Error(`Cannot reopen a merged PR`);
    pr.state = 'open'; pr.updatedAt = new Date().toISOString();
    return pr;
  }

  mergePR(repoId: string, number: number): GHPR {
    const pr = this.mustGetPR(repoId, number);
    if (pr.state !== 'open') throw new Error(`PR #${number} is not open`);
    pr.state = 'merged';
    pr.mergedAt = new Date().toISOString();
    pr.updatedAt = pr.mergedAt;
    this.counters.prsMerged++;
    return pr;
  }

  getPRs(repoId: string, state?: string): GHPR[] {
    let prs = this.prs.filter(p => p.repoId === repoId);
    if (state && state !== 'all') prs = prs.filter(p => p.state === state);
    return prs;
  }

  private mustGetPR(repoId: string, number: number): GHPR {
    const pr = this.prs.find(p => p.repoId === repoId && p.number === number);
    if (!pr) throw new Error(`PR #${number} not found in ${repoId}`);
    return pr;
  }

  // ── Issue Engine ───────────────────────────────────────────────────────────

  createIssue(repoId: string, title: string, body: string, author: string, labels: string[] = [], assignees: string[] = []): GHIssue {
    const number = this.nextIssueNumber++;
    const issue: GHIssue = {
      number, repoId, title, body, state: 'open',
      author, assignees, labels, commentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.issues.push(issue);
    this.counters.issuesCreated++;
    return issue;
  }

  updateIssue(repoId: string, number: number, patch: Partial<Pick<GHIssue, 'title' | 'body' | 'labels' | 'assignees' | 'milestone'>>): GHIssue {
    const issue = this.mustGetIssue(repoId, number);
    Object.assign(issue, patch, { updatedAt: new Date().toISOString() });
    return issue;
  }

  closeIssue(repoId: string, number: number): GHIssue {
    const issue = this.mustGetIssue(repoId, number);
    issue.state = 'closed';
    issue.closedAt = new Date().toISOString();
    issue.updatedAt = issue.closedAt;
    this.counters.issuesClosed++;
    return issue;
  }

  reopenIssue(repoId: string, number: number): GHIssue {
    const issue = this.mustGetIssue(repoId, number);
    if (issue.state === 'open') throw new Error(`Issue #${number} is already open`);
    issue.state = 'open'; issue.closedAt = undefined; issue.updatedAt = new Date().toISOString();
    return issue;
  }

  addComment(repoId: string, number: number): GHIssue {
    const issue = this.mustGetIssue(repoId, number);
    issue.commentCount++;
    issue.updatedAt = new Date().toISOString();
    return issue;
  }

  getIssues(repoId: string, state?: string): GHIssue[] {
    let iss = this.issues.filter(i => i.repoId === repoId);
    if (state && state !== 'all') iss = iss.filter(i => i.state === state);
    return iss;
  }

  private mustGetIssue(repoId: string, number: number): GHIssue {
    const issue = this.issues.find(i => i.repoId === repoId && i.number === number);
    if (!issue) throw new Error(`Issue #${number} not found in ${repoId}`);
    return issue;
  }

  // ── Workflow Dispatch ──────────────────────────────────────────────────────

  dispatchWorkflow(repoId: string, workflowId: string, branch: string, inputs: Record<string, string> = {}): GHWorkflowDispatch {
    const wf = WORKFLOWS.find(w => w.id === workflowId && w.repoId === repoId);
    if (!wf) throw new Error(`Workflow '${workflowId}' not found in ${repoId}`);
    if (wf.state === 'disabled') throw new Error(`Workflow '${workflowId}' is disabled`);
    const dispatch: GHWorkflowDispatch = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workflowId, repoId, branch, inputs,
      dispatchedAt: new Date().toISOString(),
      status: 'queued',
    };
    this.dispatchedWorkflows.push(dispatch);
    this.counters.workflowDispatches++;
    return dispatch;
  }

  cancelWorkflowRun(dispatchId: string): GHWorkflowDispatch {
    const d = this.dispatchedWorkflows.find(x => x.id === dispatchId);
    if (!d) throw new Error(`Dispatch '${dispatchId}' not found`);
    if (d.status === 'completed') throw new Error('Cannot cancel completed dispatch');
    d.status = 'cancelled'; d.conclusion = 'cancelled';
    return d;
  }

  getDispatches(repoId?: string): GHWorkflowDispatch[] {
    return repoId ? this.dispatchedWorkflows.filter(d => d.repoId === repoId) : [...this.dispatchedWorkflows];
  }

  // ── Conflict Detection ─────────────────────────────────────────────────────

  detectConflict(type: GHConflict['type'], repoId: string, details: { path?: string; message: string }): GHConflict {
    const conflict: GHConflict = { type, repoId, ...details, detectedAt: new Date().toISOString() };
    this.conflicts.push(conflict);
    this.counters.conflicts++;
    return conflict;
  }

  checkBranchConflict(repoId: string, name: string): GHConflict | null {
    if (this.branches.has(`${repoId}|${name}`)) {
      return this.detectConflict('BRANCH_EXISTS', repoId, { message: `Branch '${name}' already exists` });
    }
    return null;
  }

  checkFileConflict(repoId: string, path: string, opType: 'create' | 'update' | 'delete'): GHConflict | null {
    const exists = this.files.has(`${repoId}/${path}`);
    if (opType === 'create' && exists) {
      return this.detectConflict('FILE_EXISTS', repoId, { path, message: `File '${path}' already exists` });
    }
    if ((opType === 'update' || opType === 'delete') && !exists) {
      return this.detectConflict('FILE_NOT_FOUND', repoId, { path, message: `File '${path}' not found` });
    }
    return null;
  }

  getConflicts(): GHConflict[] { return [...this.conflicts]; }

  // ── Sync Queue ────────────────────────────────────────────────────────────

  enqueueSyncOp(repoId: string, direction: SyncQueueItem['direction'], changeCount: number): SyncQueueItem {
    const item: SyncQueueItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      repoId, direction, status: 'pending',
      changeCount, conflictCount: 0,
      enqueuedAt: new Date().toISOString(),
    };
    this.syncQueue.push(item);
    this.counters.syncs++;
    return item;
  }

  completeSyncOp(syncId: string, conflictCount = 0): SyncQueueItem {
    const item = this.syncQueue.find(s => s.id === syncId);
    if (!item) throw new Error(`Sync op '${syncId}' not found`);
    item.status = conflictCount > 0 ? 'conflict' : 'completed';
    item.conflictCount = conflictCount;
    item.completedAt = new Date().toISOString();
    return item;
  }

  getSyncQueue(): SyncQueueItem[] { return [...this.syncQueue]; }

  // ── Telemetry ─────────────────────────────────────────────────────────────

  getCounters() { return { ...this.counters }; }

  recordLatency(ms: number): void { this.counters.latencies.push(ms); }

  getMetrics() {
    const lats = [...this.counters.latencies].sort((a, b) => a - b);
    const avg = lats.length ? Math.round(lats.reduce((s, v) => s + v, 0) / lats.length) : 0;
    const p95 = lats.length ? lats[Math.floor(lats.length * 0.95)] ?? 0 : 0;
    const p99 = lats.length ? lats[Math.floor(lats.length * 0.99)] ?? 0 : 0;
    return { avg, p95, p99, total: lats.length };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
export const GH_WRITE_STORE = new GitHubWriteStore();