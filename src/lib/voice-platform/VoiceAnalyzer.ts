/**
 * VoiceAnalyzer.ts — Voice Interaction Platform (VIP)
 * Shared AudioContext + AnalyserNode for real-time waveform data.
 * Connects to the persistent MediaStream from VoiceMicrophoneManager.
 */

import type { WaveformData } from "./VoiceTypes";

const LOG = "[VIP:Analyzer]";
function log(...a: unknown[]) { console.log(LOG, ...a); }

const FFT_SIZE = 256;
const NOISE_WINDOW = 30; // frames for noise floor estimation

type WaveformListener = (data: WaveformData) => void;

class VoiceAnalyzer {
  private _ctx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _source: MediaStreamAudioSourceNode | null = null;
  private _animFrame: number | null = null;
  private _listeners = new Set<WaveformListener>();
  private _connected = false;
  private _noiseBuffer: number[] = [];
  private _lastData: WaveformData | null = null;

  get isConnected(): boolean { return this._connected; }
  get lastData(): WaveformData | null { return this._lastData; }

  /** Connect to a MediaStream. Safe to call again when stream changes. */
  connect(stream: MediaStream): void {
    this._disconnect();

    try {
      this._ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = FFT_SIZE;
      this._analyser.smoothingTimeConstant = 0.8;

      this._source = this._ctx.createMediaStreamSource(stream);
      this._source.connect(this._analyser);
      // Do NOT connect to destination — avoids echo feedback

      this._connected = true;
      log("Connected to stream");
      this._startLoop();
    } catch (err) {
      log("connect() failed:", err);
    }
  }

  /** Resume AudioContext (required after user gesture on some browsers). */
  async resume(): Promise<void> {
    if (this._ctx?.state === "suspended") {
      await this._ctx.resume();
    }
  }

  private _startLoop() {
    const buf = new Uint8Array(this._analyser!.frequencyBinCount);
    const timeBuf = new Uint8Array(this._analyser!.fftSize);

    const tick = () => {
      if (!this._analyser || !this._connected) return;
      this._animFrame = requestAnimationFrame(tick);

      this._analyser.getByteFrequencyData(buf);
      this._analyser.getByteTimeDomainData(timeBuf);

      // Amplitude (0-1)
      let sum = 0, peak = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = Math.abs(timeBuf[i] - 128) / 128;
        sum += v;
        if (v > peak) peak = v;
      }
      const amplitude = sum / timeBuf.length;

      // RMS energy
      let rmsSum = 0;
      for (let i = 0; i < buf.length; i++) rmsSum += buf[i] * buf[i];
      const energy = Math.sqrt(rmsSum / buf.length) / 255;

      // Dominant frequency
      let maxVal = 0, maxIdx = 0;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] > maxVal) { maxVal = buf[i]; maxIdx = i; }
      }
      const sampleRate = this._ctx?.sampleRate ?? 44100;
      const frequency = maxIdx * sampleRate / FFT_SIZE;

      // Noise floor estimation
      this._noiseBuffer.push(amplitude);
      if (this._noiseBuffer.length > NOISE_WINDOW) this._noiseBuffer.shift();
      const noiseLevel = Math.min(...this._noiseBuffer);

      const data: WaveformData = {
        amplitude,
        energy,
        peak,
        frequency,
        noiseLevel,
        bars: new Uint8Array(buf),
      };

      this._lastData = data;
      this._listeners.forEach((fn) => fn(data));
    };

    tick();
  }

  subscribe(fn: WaveformListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _disconnect() {
    if (this._animFrame !== null) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
    try { this._source?.disconnect(); } catch { /* noop */ }
    try { this._ctx?.close(); } catch { /* noop */ }
    this._source = null;
    this._analyser = null;
    this._ctx = null;
    this._connected = false;
    this._noiseBuffer = [];
  }

  destroy() {
    this._disconnect();
    this._listeners.clear();
    log("Destroyed");
  }
}

export function getVoiceAnalyzer(): VoiceAnalyzer {
  if (!(globalThis as any).__VIP_ANALYZER__) {
    (globalThis as any).__VIP_ANALYZER__ = new VoiceAnalyzer();
  }
  return (globalThis as any).__VIP_ANALYZER__;
}