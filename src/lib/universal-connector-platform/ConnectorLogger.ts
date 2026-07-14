/**
 * ConnectorLogger.ts — Sprint 6.3.0
 * Logs connector operations, errors, diagnostics. Never logs secrets.
 */

import type { ConnectorLogEntry } from "./UCPTypes";

let _seq = 0;
function makeLogId(): string { return `log_${Date.now()}_${++_seq}`; }

const REDACT_KEYS = ["token", "secret", "password", "key", "credential", "auth", "apikey", "api_key"];

function redact(message: string): string {
  let out = message;
  for (const k of REDACT_KEYS) {
    out = out.replace(new RegExp(`(${k})[^\\s,}\\]]*`, "gi"), `$1=[REDACTED]`);
  }
  return out;
}

export class ConnectorLogger {
  private _logs: ConnectorLogEntry[] = [];
  private readonly _maxLogs = 1000;

  log(connectorId: string, level: ConnectorLogEntry["level"], message: string): ConnectorLogEntry {
    const entry: ConnectorLogEntry = {
      id: makeLogId(),
      connectorId,
      level,
      message: redact(message),
      timestamp: Date.now(),
    };
    this._logs.unshift(entry);
    if (this._logs.length > this._maxLogs) this._logs.splice(this._maxLogs);
    return entry;
  }

  info(connectorId: string, message: string): ConnectorLogEntry {
    return this.log(connectorId, "INFO", message);
  }

  warn(connectorId: string, message: string): ConnectorLogEntry {
    return this.log(connectorId, "WARN", message);
  }

  error(connectorId: string, message: string): ConnectorLogEntry {
    return this.log(connectorId, "ERROR", message);
  }

  debug(connectorId: string, message: string): ConnectorLogEntry {
    return this.log(connectorId, "DEBUG", message);
  }

  all(): ConnectorLogEntry[] { return [...this._logs]; }

  forConnector(connectorId: string): ConnectorLogEntry[] {
    return this._logs.filter(l => l.connectorId === connectorId);
  }

  clear(): void { this._logs = []; }
}