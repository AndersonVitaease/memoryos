/**
 * VoiceMetrics.ts — Voice Interaction Platform (VIP)
 * Automatic telemetry recording for all voice sessions.
 */

import type { VoiceMetrics as IVoiceMetrics, VoiceSession } from "./VoiceTypes";

const MAX_HISTORY = 100;

class VoiceMetrics {
  private _sessions: VoiceSession[] = [];

  get history(): VoiceSession[] { return [...this._sessions]; }

  record(session: VoiceSession) {
    this._sessions.push(session);
    if (this._sessions.length > MAX_HISTORY) this._sessions.shift();
  }

  compute(): IVoiceMetrics {
    const sessions = this._sessions;
    const total = sessions.length;
    const successful = sessions.filter((s) => !s.cancelled && !s.error).length;
    const cancelled = sessions.filter((s) => s.cancelled).length;
    const failed = sessions.filter((s) => !!s.error).length;

    const durations = sessions.map((s) => s.duration).filter(Boolean);
    const latencies = sessions.map((s) => s.latency ?? 0).filter(Boolean);
    const amplitudes = sessions.map((s) => s.averageAmplitude).filter(Boolean);
    const peaks = sessions.map((s) => s.peakAmplitude).filter(Boolean);
    const words = sessions.map((s) => s.wordsRecognized);

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const avgF = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      totalSessions: total,
      successfulSessions: successful,
      cancelledSessions: cancelled,
      failedSessions: failed,
      avgRecordingDuration: avg(durations),
      avgTranscriptionLatency: avg(latencies),
      avgAmplitude: avgF(amplitudes),
      avgPeak: avgF(peaks),
      avgWordsPerSession: avg(words),
      totalRecordingTime: durations.reduce((a, b) => a + b, 0),
      permissionDeniedCount: 0, // tracked by PermissionManager
      deviceChangeCount: 0,     // tracked by MicrophoneManager
    };
  }

  clear() { this._sessions = []; }
}

export function getVoiceMetrics(): VoiceMetrics {
  if (!(globalThis as any).__VIP_METRICS__) {
    (globalThis as any).__VIP_METRICS__ = new VoiceMetrics();
  }
  return (globalThis as any).__VIP_METRICS__;
}