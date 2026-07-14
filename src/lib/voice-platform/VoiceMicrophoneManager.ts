/**
 * VoiceMicrophoneManager.ts — Voice Interaction Platform (VIP)
 * Owns the persistent MediaStream. Never destroys it between recordings.
 * Handles device enumeration and device change events.
 */

import type { AudioDevice } from "./VoiceTypes";
import { getVoicePermissionManager } from "./VoicePermissionManager";

const LOG = "[VIP:Microphone]";
function log(...a: unknown[]) { console.log(LOG, ...a); }

class VoiceMicrophoneManager {
  private _stream: MediaStream | null = null;
  private _deviceId: string | null = null;
  private _devices: AudioDevice[] = [];
  private _changeListeners = new Set<(devices: AudioDevice[], deviceId: string | null) => void>();
  private _deviceChangeHandler: (() => void) | null = null;

  get stream(): MediaStream | null { return this._stream; }
  get deviceId(): string | null { return this._deviceId; }
  get devices(): AudioDevice[] { return this._devices; }
  get isReady(): boolean { return this._stream !== null && this._stream.active; }

  /** Acquire or reuse the persistent stream. Returns true on success. */
  async acquire(deviceId?: string): Promise<boolean> {
    // If we already have a live stream for the same device, reuse it
    if (this._stream && this._stream.active && (!deviceId || deviceId === this._deviceId)) {
      log("Reusing existing stream for device:", this._deviceId ?? "default");
      return true;
    }

    const perm = getVoicePermissionManager();
    let stream: MediaStream | null = null;

    if (!perm.isGranted) {
      // Request permission — this returns the stream
      stream = await perm.request();
    }

    if (!stream) {
      // Permission already granted but no stream yet, or we need a specific device
      try {
        const constraints: MediaStreamConstraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        log("getUserMedia failed:", err?.name);
        perm.markDenied();
        return false;
      }
    }

    // If switching devices, release old tracks (keep stream alive)
    if (this._stream && deviceId && deviceId !== this._deviceId) {
      this._releaseTrack();
    }

    this._stream = stream;
    this._deviceId = stream.getAudioTracks()[0]?.getSettings?.()?.deviceId ?? deviceId ?? null;
    log("Stream acquired, deviceId:", this._deviceId);

    // Enumerate devices now that we have permission
    await this.enumerateDevices();
    this._listenForDeviceChanges();
    return true;
  }

  /** Keep stream alive but mute tracks (between recordings). */
  mute() {
    this._stream?.getAudioTracks().forEach((t) => { t.enabled = false; });
  }

  /** Unmute for recording. */
  unmute() {
    this._stream?.getAudioTracks().forEach((t) => { t.enabled = true; });
  }

  /** Switch to a different microphone device. */
  async switchDevice(deviceId: string): Promise<boolean> {
    if (deviceId === this._deviceId) return true;
    log("Switching device →", deviceId);
    this._releaseTrack();
    return this.acquire(deviceId);
  }

  /** Enumerate available audio input devices. */
  async enumerateDevices(): Promise<AudioDevice[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this._devices = all
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}`, kind: "audioinput" as const }));
      log("Devices:", this._devices.length);
    } catch {
      this._devices = [];
    }
    return this._devices;
  }

  private _listenForDeviceChanges() {
    if (this._deviceChangeHandler) return; // already listening
    this._deviceChangeHandler = async () => {
      log("Device change detected");
      await this.enumerateDevices();
      this._changeListeners.forEach((fn) => fn(this._devices, this._deviceId));
    };
    navigator.mediaDevices.addEventListener("devicechange", this._deviceChangeHandler);
  }

  subscribe(fn: (devices: AudioDevice[], deviceId: string | null) => void): () => void {
    this._changeListeners.add(fn);
    return () => this._changeListeners.delete(fn);
  }

  private _releaseTrack() {
    this._stream?.getAudioTracks().forEach((t) => t.stop());
    this._stream = null;
  }

  /** Full teardown — only call on app unmount. */
  destroy() {
    if (this._deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener("devicechange", this._deviceChangeHandler);
      this._deviceChangeHandler = null;
    }
    this._releaseTrack();
    this._changeListeners.clear();
    log("Destroyed");
  }
}

export function getVoiceMicrophoneManager(): VoiceMicrophoneManager {
  if (!(globalThis as any).__VIP_MICROPHONE__) {
    (globalThis as any).__VIP_MICROPHONE__ = new VoiceMicrophoneManager();
  }
  return (globalThis as any).__VIP_MICROPHONE__;
}