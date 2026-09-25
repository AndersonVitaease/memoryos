#!/usr/bin/env node
/**
 * notify-hook.mjs — NOTIFY-ROBUST-01
 *
 * Hook Stop / Notification / SessionStart: APPEND best-effort de evento
 * estrutural no spool durable /opt/mission-events/spool.jsonl.
 *
 * Contratos:
 * - Hook FALHA NUNCA quebra o claude: SEMPRE exit 0, tudo em try/catch,
 *   stdout/stderr vazios (claude não interpreta nada).
 * - Hook JAMAIS muta estado de missão — somente append no spool.
 * - Secret NUNCA aqui: o hook não lê credenciais nem fala com rede.
 * - Payload curtinho (msg truncada em 140 chars), uma linha JSON por evento.
 *
 * Entrada: JSON do claude-code em stdin:
 *   { hook_event_name, session_id, cwd, transcript_path, message?, ... }
 * Herança herdr: HERDR_PANE_ID / HERDR_TAB_ID vem do env do claude pai.
 */

import { appendFileSync, mkdirSync, statSync, renameSync, readSync } from "node:fs";
import { createHash } from "node:crypto";

const SPOOL_DIR = "/opt/mission-events";
const SPOOL = `${SPOOL_DIR}/spool.jsonl`;
const SPOOL_MAX_BYTES = 5 * 1024 * 1024; // rotação best-effort

function sh(n) {
  return String(n ?? "").replace(/[\n\r\t]+/g, " ").slice(0, 140);
}

function emit(obj) {
  try {
    try { mkdirSync(SPOOL_DIR, { recursive: true }); } catch {}
    let line;
    try {
      line = JSON.stringify(obj) + "\n";
    } catch {
      line = JSON.stringify({
        ts: new Date().toISOString(),
        event: "hook_error",
        session_id: null,
        msg: "hook failed to serialize event",
      }) + "\n";
    }
    // rotação best-effort antes do append
    try {
      const st = statSync(SPOOL);
      if (st.size > SPOOL_MAX_BYTES) {
        try { renameSync(SPOOL, `${SPOOL}.1`); } catch {}
      }
    } catch {}
    appendFileSync(SPOOL, line);
  } catch {
    // fail-open: spool indisponível não pode quebrar o claude
  }
}

function readStdinSync() {
  const chunks = [];
  try {
    for (;;) {
      const buf = Buffer.alloc(65536);
      const n = readSync(0, buf, 0, buf.length);
      if (n <= 0) break;
      chunks.push(buf.subarray(0, n));
    }
  } catch {}
  return Buffer.concat(chunks).toString("utf8");
}

function main() {
  let raw = "";
  try { raw = readStdinSync(); } catch {}
  let inp = {};
  try { inp = JSON.parse(raw || "{}"); } catch { inp = {}; }

  const eventName = sh(inp.hook_event_name).toLowerCase() || "unknown";
  let kind = "unknown";
  if (eventName === "stop") kind = "turn_done";
  else if (eventName === "notification") {
    kind = (inp.message || "").toLowerCase().includes("permission")
      ? "permission_request"
      : "notification";
  } else if (eventName === "sessionstart" || eventName === "session_start") {
    kind = "session_start";
  }

  emit({
    ts: new Date().toISOString(),
    event: eventName,
    kind,
    session_id: sh(inp.session_id) || null,
    cwd: sh(inp.cwd) || null,
    pane: process.env.HERDR_PANE_ID || null,
    tab: process.env.HERDR_TAB_ID || null,
    msg: sh(inp.message) || null,
    source: "claude-hook",
  });
  process.exit(0);
}

main();
