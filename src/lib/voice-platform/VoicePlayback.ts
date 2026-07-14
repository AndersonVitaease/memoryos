/**
 * VoicePlayback.ts — Voice Interaction Platform (VIP)
 * Centralized TTS and audio playback. Single source of truth.
 */

import type { PlaybackState } from "./VoiceTypes";

const LOG = "[VIP:Playback]";
function log(...a: unknown[]) { console.log(LOG, ...a); }

export interface PlaybackOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

type StateListener = (state: PlaybackState) => void;

class VoicePlayback {
  private _state: PlaybackState = "idle";
  private _utterance: SpeechSynthesisUtterance | null = null;
  private _stateListeners = new Set<StateListener>();

  // Current settings
  private _volume = 1.0;
  private _rate = 1.0;
  private _pitch = 1.0;
  private _lang = "pt-BR";

  get state(): PlaybackState { return this._state; }
  get isPlaying(): boolean { return this._state === "playing"; }
  get isSpeaking(): boolean { return window.speechSynthesis?.speaking ?? false; }

  setVolume(v: number) { this._volume = Math.max(0, Math.min(1, v)); }
  setRate(r: number) { this._rate = Math.max(0.1, Math.min(10, r)); }
  setPitch(p: number) { this._pitch = Math.max(0, Math.min(2, p)); }
  setLang(l: string) { this._lang = l; }

  subscribe(fn: StateListener): () => void {
    this._stateListeners.add(fn);
    return () => this._stateListeners.delete(fn);
  }

  private _setState(s: PlaybackState) {
    this._state = s;
    this._stateListeners.forEach((fn) => fn(s));
  }

  /** Speak text using Web Speech API TTS. */
  speak(text: string, opts: PlaybackOptions = {}): void {
    if (!window.speechSynthesis) {
      log("SpeechSynthesis not supported");
      opts.onError?.("not-supported");
      return;
    }

    // Interrupt any current playback
    this.stop();

    if (!text.trim()) {
      this._setState("idle");
      return;
    }

    this._setState("loading");

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = opts.lang ?? this._lang;
    utterance.rate = opts.rate ?? this._rate;
    utterance.pitch = opts.pitch ?? this._pitch;
    utterance.volume = opts.volume ?? this._volume;

    // Select voice if specified
    if (opts.voice) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.name === opts.voice || v.voiceURI === opts.voice);
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => {
      this._setState("playing");
      opts.onStart?.();
      log("Playing:", text.slice(0, 40) + (text.length > 40 ? "..." : ""));
    };

    utterance.onend = () => {
      this._setState("idle");
      this._utterance = null;
      opts.onEnd?.();
      log("Ended");
    };

    utterance.onerror = (e) => {
      this._setState("error");
      this._utterance = null;
      opts.onError?.(e.error);
      log("Error:", e.error);
    };

    this._utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    if (!window.speechSynthesis?.speaking) return;
    window.speechSynthesis.pause();
    this._setState("paused");
  }

  resume(): void {
    if (!window.speechSynthesis?.paused) return;
    window.speechSynthesis.resume();
    this._setState("playing");
  }

  stop(): void {
    if (!window.speechSynthesis) return;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    this._utterance = null;
    this._setState("idle");
  }

  /** List available TTS voices for current language. */
  getVoices(lang?: string): SpeechSynthesisVoice[] {
    const all = window.speechSynthesis?.getVoices() ?? [];
    if (!lang) return all;
    return all.filter((v) => v.lang.startsWith(lang));
  }
}

export function getVoicePlayback(): VoicePlayback {
  if (!(globalThis as any).__VIP_PLAYBACK__) {
    (globalThis as any).__VIP_PLAYBACK__ = new VoicePlayback();
  }
  return (globalThis as any).__VIP_PLAYBACK__;
}