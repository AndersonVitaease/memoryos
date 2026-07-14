/**
 * VoiceSession.ts — Voice Interaction Platform (VIP)
 * Persistent session object for a single voice interaction.
 * Tracks all telemetry: duration, amplitude, latency, words, etc.
 */

import type { VoiceSession as IVoiceSession } from "./VoiceTypes";

function makeId() {
  return `vip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class VoiceSessionObject implements IVoiceSession {
  sessionId: string;
  deviceId: string | null;
  language: string;
  startTime: number;
  endTime: number | null = null;
  duration: number = 0;
  averageAmplitude: number = 0;
  peakAmplitude: number = 0;
  noiseLevel: number = 0;
  wordsRecognized: number = 0;
  latency: number | null = null;
  provider: string = "web-speech";
  recognitionEngine: string = "SpeechRecognition";
  transcriptionEngine: string = "Whisper";
  cancelled: boolean = false;
  error: string | null = null;

  private _amplitudeSamples: number[] = [];
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(deviceId: string | null, language: string) {
    this.sessionId = makeId();
    this.deviceId = deviceId;
    this.language = language;
    this.startTime = Date.now();
    this._startTimer();
  }

  private _startTimer() {
    this._timer = setInterval(() => {
      this.duration = Date.now() - this.startTime;
    }, 100);
  }

  recordAmplitude(amplitude: number, peak: number, noise: number) {
    this._amplitudeSamples.push(amplitude);
    if (peak > this.peakAmplitude) this.peakAmplitude = peak;
    this.noiseLevel = noise;
    // Running average
    const sum = this._amplitudeSamples.reduce((a, b) => a + b, 0);
    this.averageAmplitude = sum / this._amplitudeSamples.length;
  }

  recordTranscriptionLatency(ms: number) {
    this.latency = ms;
  }

  recordWords(count: number) {
    this.wordsRecognized = count;
  }

  setProvider(provider: string, recognition: string, transcription: string) {
    this.provider = provider;
    this.recognitionEngine = recognition;
    this.transcriptionEngine = transcription;
  }

  end(opts: { cancelled?: boolean; error?: string } = {}) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.cancelled = opts.cancelled ?? false;
    this.error = opts.error ?? null;
  }

  toSnapshot(): IVoiceSession {
    return {
      sessionId: this.sessionId,
      deviceId: this.deviceId,
      language: this.language,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      averageAmplitude: this.averageAmplitude,
      peakAmplitude: this.peakAmplitude,
      noiseLevel: this.noiseLevel,
      wordsRecognized: this.wordsRecognized,
      latency: this.latency,
      provider: this.provider,
      recognitionEngine: this.recognitionEngine,
      transcriptionEngine: this.transcriptionEngine,
      cancelled: this.cancelled,
      error: this.error,
    };
  }
}