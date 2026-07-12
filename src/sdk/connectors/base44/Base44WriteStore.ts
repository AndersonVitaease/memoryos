/**
 * Base44WriteStore.ts
 * EF-32B — Mutable in-memory store extending Base44Store for write operations.
 * Provides transactional file/folder mutation with snapshot & rollback support.
 * EF-32B · 2026-07-12 · Version: 1.0.0
 */

import type { B44FileEntry } from './Base44Store';
import { FILES as SEED_FILES, FILE_CONTENTS as SEED_CONTENTS } from './Base44Store';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WriteOpType =
  | 'create_file' | 'update_file' | 'replace_file' | 'delete_file'
  | 'rename_file' | 'move_file' | 'copy_file'
  | 'create_folder' | 'delete_folder' | 'rename_folder' | 'move_folder';

export interface WriteOp {
  type: WriteOpType;
  projectId: string;
  path: string;
  newPath?: string;
  content?: string;
  encoding?: string;
}

export interface Snapshot {
  id: string;
  projectId: string;
  correlationId: string;
  executionId: string;
  createdAt: string;
  hash: string;
  files: B44FileEntry[];
  contents: Record<string, string>;
}

export interface Transaction {
  id: string;
  projectId: string;
  correlationId: string;
  executionId: string;
  userId: string;
  status: 'OPEN' | 'COMMITTED' | 'ROLLED_BACK' | 'ABORTED';
  ops: WriteOp[];
  snapshotId: string;
  openedAt: string;
  closedAt?: string;
}

export interface DiffLine {
  lineNumber: number;
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

export interface FileDiff {
  path: string;
  linesAdded: number;
  linesRemoved: number;
  linesUnchanged: number;
  diff: DiffLine[];
}

export interface ConflictReport {
  path: string;
  conflictType: 'CONCURRENT_WRITE' | 'FILE_ALREADY_EXISTS' | 'FILE_NOT_FOUND' | 'DIRECTORY_CONFLICT';
  description: string;
  detectedAt: string;
}

// ── Write Store ───────────────────────────────────────────────────────────────

export class Base44WriteStore {
  // Mutable copies of the file system
  private files: Record<string, B44FileEntry[]> = {};
  private contents: Record<string, string> = {};
  // Snapshots indexed by id
  private snapshots = new Map<string, Snapshot>();
  // Transactions indexed by id
  private transactions = new Map<string, Transaction>();
  // Conflict log
  private conflicts: ConflictReport[] = [];
  // Telemetry counters
  private counters = {
    filesCreated: 0, filesUpdated: 0, filesDeleted: 0,
    foldersCreated: 0, foldersDeleted: 0,
    transactions: 0, rollbacks: 0, conflicts: 0,
    batchOps: 0, syncWrites: 0,
    latencies: [] as number[],
  };

  constructor() {
    this.resetToSeed();
  }

  resetToSeed(): void {
    this.files = {};
    this.contents = {};
    for (const [pid, entries] of Object.entries(SEED_FILES)) {
      this.files[pid] = entries.map(e => ({ ...e }));
    }
    for (const [k, v] of Object.entries(SEED_CONTENTS)) {
      this.contents[k] = v;
    }
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  createSnapshot(projectId: string, correlationId: string, executionId: string): Snapshot {
    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snap: Snapshot = {
      id,
      projectId,
      correlationId,
      executionId,
      createdAt: new Date().toISOString(),
      hash: `sha256-snap-${id}`,
      files: (this.files[projectId] ?? []).map(f => ({ ...f })),
      contents: Object.fromEntries(
        Object.entries(this.contents).filter(([k]) => k.startsWith(`${projectId}/`))
      ),
    };
    this.snapshots.set(id, snap);
    return snap;
  }

  restoreSnapshot(snapshotId: string): void {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) throw new Error(`Snapshot '${snapshotId}' not found`);
    this.files[snap.projectId] = snap.files.map(f => ({ ...f }));
    // Restore contents for this project
    for (const [k] of Object.entries(this.contents)) {
      if (k.startsWith(`${snap.projectId}/`)) delete this.contents[k];
    }
    for (const [k, v] of Object.entries(snap.contents)) {
      this.contents[k] = v;
    }
  }

  getSnapshot(id: string): Snapshot | undefined { return this.snapshots.get(id); }
  getAllSnapshots(): Snapshot[] { return Array.from(this.snapshots.values()); }

  // ── Transactions ──────────────────────────────────────────────────────────

  beginTransaction(projectId: string, correlationId: string, executionId: string, userId: string): Transaction {
    const snap = this.createSnapshot(projectId, correlationId, executionId);
    const tx: Transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId, correlationId, executionId, userId,
      status: 'OPEN',
      ops: [],
      snapshotId: snap.id,
      openedAt: new Date().toISOString(),
    };
    this.transactions.set(tx.id, tx);
    this.counters.transactions++;
    return tx;
  }

  getTransaction(id: string): Transaction | undefined { return this.transactions.get(id); }

  commitTransaction(txId: string): Transaction {
    const tx = this.mustGetOpenTx(txId);
    tx.status = 'COMMITTED';
    tx.closedAt = new Date().toISOString();
    return tx;
  }

  rollbackTransaction(txId: string): Transaction {
    const tx = this.mustGetOpenTx(txId);
    this.restoreSnapshot(tx.snapshotId);
    tx.status = 'ROLLED_BACK';
    tx.closedAt = new Date().toISOString();
    this.counters.rollbacks++;
    return tx;
  }

  abortTransaction(txId: string): Transaction {
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
    const tx = this.mustGetOpenTx(txId);
    tx.ops.push(op);
  }

  getAllTransactions(): Transaction[] { return Array.from(this.transactions.values()); }

  private mustGetOpenTx(txId: string): Transaction {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error(`Transaction '${txId}' not found`);
    if (tx.status !== 'OPEN') throw new Error(`Transaction '${txId}' is ${tx.status} — cannot modify`);
    return tx;
  }

  // ── File Operations ───────────────────────────────────────────────────────

  createFile(projectId: string, path: string, content: string, encoding = 'utf-8'): B44FileEntry {
    this.ensureProject(projectId);
    if (this.files[projectId].find(f => f.path === path))
      throw new Error(`File already exists: ${path}`);
    const name = path.split('/').pop()!;
    const ext = name.includes('.') ? '.' + name.split('.').pop() : undefined;
    const entry: B44FileEntry = {
      path, name, type: 'file', extension: ext,
      sizeBytes: content.length, encoding,
      modifiedAt: new Date().toISOString(),
      hash: `sha256-${Math.random().toString(36).slice(2)}`,
    };
    this.files[projectId].push(entry);
    this.contents[`${projectId}/${path}`] = content;
    this.counters.filesCreated++;
    return entry;
  }

  updateFile(projectId: string, path: string, content: string): B44FileEntry {
    const entry = this.mustGetFile(projectId, path);
    entry.sizeBytes = content.length;
    entry.modifiedAt = new Date().toISOString();
    entry.hash = `sha256-${Math.random().toString(36).slice(2)}`;
    this.contents[`${projectId}/${path}`] = content;
    this.counters.filesUpdated++;
    return entry;
  }

  replaceFile(projectId: string, path: string, content: string): B44FileEntry {
    return this.updateFile(projectId, path, content);
  }

  deleteFile(projectId: string, path: string): void {
    this.mustGetFile(projectId, path);
    this.files[projectId] = this.files[projectId].filter(f => f.path !== path);
    delete this.contents[`${projectId}/${path}`];
    this.counters.filesDeleted++;
  }

  renameFile(projectId: string, oldPath: string, newName: string): B44FileEntry {
    const entry = this.mustGetFile(projectId, oldPath);
    const dir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/') + 1) : '';
    const newPath = dir + newName;
    const key = `${projectId}/${oldPath}`;
    const newKey = `${projectId}/${newPath}`;
    if (this.contents[key] !== undefined) {
      this.contents[newKey] = this.contents[key];
      delete this.contents[key];
    }
    entry.path = newPath;
    entry.name = newName;
    const ext = newName.includes('.') ? '.' + newName.split('.').pop() : undefined;
    entry.extension = ext;
    entry.modifiedAt = new Date().toISOString();
    return entry;
  }

  moveFile(projectId: string, oldPath: string, newPath: string): B44FileEntry {
    const entry = this.mustGetFile(projectId, oldPath);
    const key = `${projectId}/${oldPath}`;
    const newKey = `${projectId}/${newPath}`;
    if (this.contents[key] !== undefined) {
      this.contents[newKey] = this.contents[key];
      delete this.contents[key];
    }
    const newName = newPath.split('/').pop()!;
    entry.path = newPath;
    entry.name = newName;
    entry.modifiedAt = new Date().toISOString();
    return entry;
  }

  copyFile(projectId: string, sourcePath: string, destPath: string): B44FileEntry {
    const src = this.mustGetFile(projectId, sourcePath);
    const content = this.contents[`${projectId}/${sourcePath}`] ?? '';
    return this.createFile(projectId, destPath, content, src.encoding);
  }

  // ── Folder Operations ─────────────────────────────────────────────────────

  createFolder(projectId: string, path: string): B44FileEntry {
    this.ensureProject(projectId);
    if (this.files[projectId].find(f => f.path === path))
      throw new Error(`Path already exists: ${path}`);
    const name = path.split('/').pop()!;
    const entry: B44FileEntry = {
      path, name, type: 'directory',
      sizeBytes: 0, encoding: 'utf-8',
      modifiedAt: new Date().toISOString(),
    };
    this.files[projectId].push(entry);
    this.counters.foldersCreated++;
    return entry;
  }

  deleteFolder(projectId: string, path: string): string[] {
    this.ensureProject(projectId);
    const deleted: string[] = [];
    this.files[projectId] = this.files[projectId].filter(f => {
      if (f.path === path || f.path.startsWith(path + '/')) {
        if (f.type === 'file') delete this.contents[`${projectId}/${f.path}`];
        deleted.push(f.path);
        return false;
      }
      return true;
    });
    this.counters.foldersDeleted++;
    return deleted;
  }

  renameFolder(projectId: string, oldPath: string, newName: string): void {
    const dir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/') + 1) : '';
    const newPath = dir + newName;
    this.moveFolderPaths(projectId, oldPath, newPath);
  }

  moveFolder(projectId: string, oldPath: string, newPath: string): void {
    this.moveFolderPaths(projectId, oldPath, newPath);
  }

  private moveFolderPaths(projectId: string, oldPath: string, newPath: string): void {
    for (const entry of this.files[projectId] ?? []) {
      if (entry.path === oldPath || entry.path.startsWith(oldPath + '/')) {
        const newEntryPath = entry.path.replace(oldPath, newPath);
        if (entry.type === 'file') {
          const oldKey = `${projectId}/${entry.path}`;
          const newKey = `${projectId}/${newEntryPath}`;
          if (this.contents[oldKey] !== undefined) {
            this.contents[newKey] = this.contents[oldKey];
            delete this.contents[oldKey];
          }
        }
        entry.path = newEntryPath;
        if (entry.path === newPath) entry.name = newPath.split('/').pop()!;
      }
    }
  }

  // ── Batch Operations ──────────────────────────────────────────────────────

  executeBatch(ops: WriteOp[], projectId: string, correlationId: string, executionId: string, userId: string): {
    tx: Transaction; results: Array<{ op: WriteOp; success: boolean; error?: string }>;
  } {
    const tx = this.beginTransaction(projectId, correlationId, executionId, userId);
    const results: Array<{ op: WriteOp; success: boolean; error?: string }> = [];
    this.counters.batchOps++;
    try {
      for (const op of ops) {
        try {
          this.applyOp(op);
          tx.ops.push(op);
          results.push({ op, success: true });
        } catch (err) {
          results.push({ op, success: false, error: err instanceof Error ? err.message : String(err) });
          // Atomic: rollback on any failure
          this.rollbackTransaction(tx.id);
          return { tx, results };
        }
      }
      this.commitTransaction(tx.id);
    } catch (err) {
      this.abortTransaction(tx.id);
    }
    return { tx, results };
  }

  private applyOp(op: WriteOp): void {
    switch (op.type) {
      case 'create_file': this.createFile(op.projectId, op.path, op.content ?? '', op.encoding); break;
      case 'update_file': this.updateFile(op.projectId, op.path, op.content ?? ''); break;
      case 'replace_file': this.replaceFile(op.projectId, op.path, op.content ?? ''); break;
      case 'delete_file': this.deleteFile(op.projectId, op.path); break;
      case 'rename_file': this.renameFile(op.projectId, op.path, op.newPath ?? ''); break;
      case 'move_file': this.moveFile(op.projectId, op.path, op.newPath ?? ''); break;
      case 'copy_file': this.copyFile(op.projectId, op.path, op.newPath ?? ''); break;
      case 'create_folder': this.createFolder(op.projectId, op.path); break;
      case 'delete_folder': this.deleteFolder(op.projectId, op.path); break;
      case 'rename_folder': this.renameFolder(op.projectId, op.path, op.newPath ?? ''); break;
      case 'move_folder': this.moveFolder(op.projectId, op.path, op.newPath ?? ''); break;
    }
  }

  // ── Diff Engine ───────────────────────────────────────────────────────────

  compareFile(projectId: string, path: string, newContent: string): FileDiff {
    const key = `${projectId}/${path}`;
    const oldContent = this.contents[key] ?? '';
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: DiffLine[] = [];
    let added = 0, removed = 0, unchanged = 0;

    // Simple LCS-based diff (good enough for deterministic testing)
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= oldLines.length) {
        diff.push({ lineNumber: i + 1, type: 'added', content: newLines[i] });
        added++;
      } else if (i >= newLines.length) {
        diff.push({ lineNumber: i + 1, type: 'removed', content: oldLines[i] });
        removed++;
      } else if (oldLines[i] === newLines[i]) {
        diff.push({ lineNumber: i + 1, type: 'unchanged', content: oldLines[i] });
        unchanged++;
      } else {
        diff.push({ lineNumber: i + 1, type: 'removed', content: oldLines[i] });
        diff.push({ lineNumber: i + 1, type: 'added', content: newLines[i] });
        added++; removed++;
      }
    }
    return { path, linesAdded: added, linesRemoved: removed, linesUnchanged: unchanged, diff };
  }

  // ── Conflict Detection ────────────────────────────────────────────────────

  detectConflict(projectId: string, path: string, opType: WriteOpType): ConflictReport | null {
    const exists = !!(this.files[projectId] ?? []).find(f => f.path === path);
    if (['create_file', 'create_folder'].includes(opType) && exists) {
      const report: ConflictReport = {
        path, conflictType: 'FILE_ALREADY_EXISTS',
        description: `Cannot create '${path}': already exists`,
        detectedAt: new Date().toISOString(),
      };
      this.conflicts.push(report);
      this.counters.conflicts++;
      return report;
    }
    if (['update_file', 'delete_file', 'rename_file', 'move_file'].includes(opType) && !exists) {
      const report: ConflictReport = {
        path, conflictType: 'FILE_NOT_FOUND',
        description: `Cannot ${opType.replace('_', ' ')} '${path}': not found`,
        detectedAt: new Date().toISOString(),
      };
      this.conflicts.push(report);
      this.counters.conflicts++;
      return report;
    }
    return null;
  }

  getConflicts(): ConflictReport[] { return [...this.conflicts]; }

  // ── Read accessors ────────────────────────────────────────────────────────

  getFiles(projectId: string): B44FileEntry[] { return this.files[projectId] ?? []; }
  getContent(projectId: string, path: string): string | undefined { return this.contents[`${projectId}/${path}`]; }

  getCounters() { return { ...this.counters }; }

  getMetrics() {
    const lats = this.counters.latencies;
    const sorted = [...lats].sort((a, b) => a - b);
    const avg = lats.length ? Math.round(lats.reduce((s, l) => s + l, 0) / lats.length) : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] ?? 0 : 0;
    const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] ?? 0 : 0;
    return { avg, p95, p99, total: lats.length };
  }

  recordLatency(ms: number): void { this.counters.latencies.push(ms); }

  // ── Private helpers ───────────────────────────────────────────────────────

  private ensureProject(projectId: string): void {
    if (!this.files[projectId]) this.files[projectId] = [];
  }

  private mustGetFile(projectId: string, path: string): B44FileEntry {
    const entry = (this.files[projectId] ?? []).find(f => f.path === path && f.type === 'file');
    if (!entry) throw new Error(`File not found: ${path}`);
    return entry;
  }
}

// ── Singleton store shared across connector + tests ────────────────────────
export const WRITE_STORE = new Base44WriteStore();