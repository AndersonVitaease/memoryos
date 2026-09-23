// Ambient types for node:sqlite — stable in the Node 24 container runtime, but
// @types/node@20 (the repo's devDependency) predates the module. Minimal
// surface actually used by src/memoryStore.ts; everything else stays unknown.
declare module "node:sqlite" {
  export interface StatementSyncRunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }
  export interface StatementSync {
    run(...anonymousParameters: unknown[]): StatementSyncRunResult;
    get(...anonymousParameters: unknown[]): unknown;
    all(...anonymousParameters: unknown[]): unknown[];
  }
  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
  }
  export class DatabaseSync {
    constructor(location?: string, options?: DatabaseSyncOptions);
    open(): void;
    isOpen(): boolean;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
