/**
 * VoiceRecorder.ts — Voice Interaction Platform (VIP)
 * Pure recording responsibility. No permission logic. No getUserMedia.
 * Consumes a MediaStream from VoiceMicrophoneManager.
 */

import type { RecorderState } from "./VoiceTypes";

const LOG = "[VIP:Recorder]";
function log(...a: unknown[]) { console.log(LOG, ...a); }

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function bestMimeType(): string {
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

type StateListener = (state: RecorderState) => void;

class VoiceRecorder {
  private _recorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];
  private _startedAt: number = 0;
  private _state: RecorderState = "idle";
  private _stateListeners = new Set<StateListener>();
  private _resolveStop: ((result: RecorderResult) => void) | null = null;
  private _rejectStop: ((err: Error) => void) | null = null;

  get state(): RecorderState { return this._state; }
  get isRecording(): boolean { return this._state === "recording"; }
  get elapsedMs(): number {
    if (!this._startedAt || this._state === "idle") return 0;
    return Date.now() - this._startedAt;
  }

  subscribe(fn: StateListener): () => void {
    this._stateListeners.add(fn);
    return () => this._stateListeners.delete(fn);
  }

  private _setState(s: RecorderState) {
    this._state = s;
    this._stateListeners.forEach((fn) => fn(s));
  }

  /**
   * Start recording from the given stream.
   * Uses timeslice for incremental chunks (better for long recordings).
   */
  start(stream: MediaStream, timesliceMs = 100): void {
    if (this._state === "recording" || this._state === "paused") {
      log("Already recording — ignoring start()");
      return;
    }

    const mimeType = bestMimeType();
    const options = mimeType ? { mimeType } : undefined;

    try {
      this._recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
    } catch (err) {
      log("MediaRecorder init failed:", err);
      return;
    }

    this._chunks = [];
    this._startedAt = Date.now();

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };

    this._recorder.onstop = () => {
      const durationMs = Date.now() - this._startedAt;
      const blob = new Blob(this._chunks, { type: this._recorder?.mimeType ?? "audio/webm" });
      const result: RecorderResult = { blob, mimeType: this._recorder?.mimeType ?? "", durationMs };
      log("Stopped — size:", blob.size, "duration:", durationMs);
      this._setState("stopped");
      this._resolveStop?.(result);
      this._resolveStop = null;
      this._rejectStop = null;
    };

    this._recorder.onerror = (e: any) => {
      log("Error:", e?.error);
      this._setState("idle");
      this._rejectStop?.(new Error(e?.error?.message ?? "MediaRecorder error"));
    };

    this._recorder.start(timesliceMs);
    this._setState("recording");
    log("Started, mimeType:", this._recorder.mimeType);
  }

  pause(): void {
    if (this._state !== "recording") return;
    try { this._recorder?.pause(); this._setState("paused"); } catch (e) { log("pause failed:", e); }
  }

  resume(): void {
    if (this._state !== "paused") return;
    try { this._recorder?.resume(); this._setState("recording"); } catch (e) { log("resume failed:", e); }
  }

  /** Stop recording and return a promise that resolves with the recorded blob. */
  stop(): Promise<RecorderResult> {
    return new Promise((resolve, reject) => {
      if (this._state !== "recording" && this._state !== "paused") {
        reject(new Error("Not recording"));
        return;
      }
      this._resolveStop = resolve;
      this._rejectStop = reject;
      this._setState("stopping");
      try {
        this._recorder?.stop();
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Cancel recording — discards all chunks, resolves nothing. */
  cancel(): void {
    if (this._recorder && this._state !== "idle" && this._state !== "stopped") {
      this._recorder.ondataavailable = null;
      this._recorder.onstop = null;
      try { this._recorder.stop(); } catch { /* noop */ }
    }
    this._chunks = [];
    this._recorder = null;
    this._resolveStop = null;
    this._rejectStop = null;
    this._setState("idle");
    log("Cancelled");
  }
}

export function getVoiceRecorder(): VoiceRecorder {
  if (!(globalThis as any).__VIP_RECORDER__) {
    (globalThis as any).__VIP_RECORDER__ = new VoiceRecorder();
  }
  return (globalThis as any).__VIP_RECORDER__;
}