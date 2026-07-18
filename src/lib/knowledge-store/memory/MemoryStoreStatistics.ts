// MemoryStoreStatistics.ts — Sprint EF-39.1 (hardened)
// EF-39.1: counters are consistent across all lifecycle sequences including
// store → archive → restore → archive → restore → delete.

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
  // _active and _archived track net state — never go below 0
  private _active   = 0;
  private _archived = 0;
  private _deleted  = 0;
  private _writes   = 0;
  private _queries  = 0;
  private _searches = 0;
  private _totalVersions  = 0;
  private _recordsTracked = 0;  // unique records ever stored (never decremented)
  private readonly _startedAt = Date.now();

  onStore()  {
    this._active++;
    this._writes++;
    this._recordsTracked++;
    this._totalVersions++;
  }

  onUpdate() {
    this._writes++;
    this._totalVersions++;
  }

  onArchive() {
    // Move one from active → archived
    if (this._active > 0) this._active--;
    this._archived++;
  }

  onRestore() {
    // Move one from archived → active
    if (this._archived > 0) this._archived--;
    this._active++;
  }

  onDelete(wasArchived: boolean) {
    if (wasArchived) {
      if (this._archived > 0) this._archived--;
    } else {
      if (this._active > 0) this._active--;
    }
    this._deleted++;
  }

  onQuery()  { this._queries++;  }
  onSearch() { this._searches++; }

  snapshot(): StoreStatisticsSnapshot {
    return Object.freeze({
      totalRecords:    this._active + this._archived,
      activeRecords:   this._active,
      archivedRecords: this._archived,
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