/**
 * VoicePermissionManager.ts — Voice Interaction Platform (VIP)
 * Single source of truth for microphone permissions.
 * Only one permission request per session.
 */

import type { PermissionState, VoiceEventListener } from "./VoiceTypes";

const LOG = "[VIP:Permission]";
function log(...a: unknown[]) { console.log(LOG, ...a); }

class VoicePermissionManager {
  private _state: PermissionState = "UNKNOWN";
  private _listeners = new Set<(state: PermissionState) => void>();
  private _permissionsApi: PermissionStatus | null = null;

  get state(): PermissionState { return this._state; }
  get isGranted(): boolean { return this._state === "GRANTED"; }

  /** Subscribe to permission state changes. Returns unsubscribe fn. */
  subscribe(fn: (state: PermissionState) => void): () => void {
    this._listeners.add(fn);
    fn(this._state);
    return () => this._listeners.delete(fn);
  }

  private _emit(state: PermissionState) {
    if (this._state === state) return;
    this._state = state;
    log("→", state);
    this._listeners.forEach((fn) => fn(state));
  }

  /** Query the Permissions API without triggering a prompt. */
  async query(): Promise<PermissionState> {
    if (!navigator.permissions) {
      log("Permissions API unavailable — will discover on request");
      return this._state;
    }
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      this._permissionsApi = status;
      this._syncFromPermissionsApi(status.state);
      status.onchange = () => this._syncFromPermissionsApi(status.state);
    } catch {
      log("query() failed — continuing");
    }
    return this._state;
  }

  private _syncFromPermissionsApi(raw: PermissionState) {
    if (raw === "granted") this._emit("GRANTED");
    else if (raw === "denied") this._emit("BLOCKED");
    else this._emit("UNKNOWN");
  }

  /**
   * Request permission. If already GRANTED, returns immediately.
   * Returns the MediaStream on success (caller should hand off to MicrophoneManager).
   */
  async request(): Promise<MediaStream | null> {
    if (this._state === "GRANTED") return null; // already have it
    if (this._state === "BLOCKED") {
      log("Blocked — cannot request");
      return null;
    }
    this._emit("REQUESTING");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._emit("GRANTED");
      log("Granted — stream obtained");
      return stream;
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.includes("Permission denied") || err?.name === "NotAllowedError") {
        this._emit("DENIED");
      } else {
        this._emit("DENIED");
      }
      log("Denied:", err?.name);
      return null;
    }
  }

  /** Mark as denied programmatically (e.g. after a failed getUserMedia). */
  markDenied() { this._emit("DENIED"); }
  markBlocked() { this._emit("BLOCKED"); }
}

// Singleton
let _instance: VoicePermissionManager | null = null;
export function getVoicePermissionManager(): VoicePermissionManager {
  if (!(globalThis as any).__VIP_PERMISSION__) {
    (globalThis as any).__VIP_PERMISSION__ = new VoicePermissionManager();
  }
  return (globalThis as any).__VIP_PERMISSION__;
}