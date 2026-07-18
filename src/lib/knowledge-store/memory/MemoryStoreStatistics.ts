// MemoryStoreStatistics.ts — Sprint EF-39
// Immutable statistics collection.

export interface StoreStatisticsSnapshot {
  readonly totalRecords:   number;
  readonly activeRecords:  number;
  readonly archivedRecords:number;
  readonly deletedCount:   number;
  readonly avgVersions:    number;
  readonly totalWrites:    number;
  readonly totalQueries:   number;
  readonly totalSearches:  number;
  readonly uptimeMs:       number;
  readonly capturedAt:     number;
}

export class MemoryStoreStatistics {
  private _active   = 0;
  private _archived = 0;
  private _deleted  = 0;
  private _writes   = 0;
  private _queries  = 0;
  private _searches = 0;
  private _totalVersions  = 0;
  private _recordsTracked = 0;
  private readonly _startedAt = Date.now();

  onStore()   { this._active++;   this._writes++;  this._recordsTracked++; this._totalVersions++; }
  onUpdate()  { this._writes++;   this._totalVersions++; }
  onArchive() { this._active--;   this._archived++; }
  onRestore() { this._archived--; this._active++;   }
  onDelete(wasArchived: boolean) {
    if (wasArchived) { this._archived--; } else { this._active--; }
    this._deleted++;
    this._recordsTracked = Math.max(0, this._recordsTracked - 1);
  }
  onQuery()  { this._queries++;  }
  onSearch() { this._searches++; }

  snapshot(): StoreStatisticsSnapshot {
    const total = this._active + this._archived;
    return Object.freeze({
      totalRecords:    total,
      activeRecords:   Math.max(0, this._active),
      archivedRecords: Math.max(0, this._archived),
      deletedCount:    this._deleted,
      avgVersions:     this._recordsTracked > 0 ? this._totalVersions / this._recordsTracked : 0,
      totalWrites:     this._writes,
      totalQueries:    this._queries,
      totalSearches:   this._searches,
      uptimeMs:        Date.now() - this._startedAt,
      capturedAt:      Date.now(),
    });
  }

  reset(): void {
    this._active = 0; this._archived = 0; this._deleted = 0;
    this._writes = 0; this._queries  = 0; this._searches = 0;
    this._totalVersions = 0; this._recordsTracked = 0;
  }
}