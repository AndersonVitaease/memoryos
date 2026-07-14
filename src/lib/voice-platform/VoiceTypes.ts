/**
 * VoiceTypes.ts — Voice Interaction Platform (VIP)
 * Sprint 7.0.0 · Official type definitions for all voice subsystems
 */

// ─── Permission ───────────────────────────────────────────────────────────────

export type PermissionState = "UNKNOWN" | "REQUESTING" | "GRANTED" | "DENIED" | "BLOCKED";

// ─── Recorder ─────────────────────────────────────────────────────────────────

export type RecorderState = "idle" | "recording" | "paused" | "stopping" | "stopped";

// ─── Playback ─────────────────────────────────────────────────────────────────

export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "stopped" | "error";

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export type VoicePipelinePhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "retrieving"
  | "generating"
  | "speaking"
  | "completed"
  | "cancelled"
  | "error";

// ─── Visualizer ───────────────────────────────────────────────────────────────

export type VisualizerMode = "bars" | "wave" | "orb";

export interface WaveformData {
  amplitude: number;       // 0–1
  energy: number;          // RMS energy
  peak: number;            // peak amplitude 0–1
  frequency: number;       // dominant frequency in Hz
  noiseLevel: number;      // estimated background noise 0–1
  bars: Uint8Array;        // raw FFT bars for rendering
}

// ─── Device ───────────────────────────────────────────────────────────────────

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput";
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface VoiceSession {
  sessionId: string;
  deviceId: string | null;
  language: string;
  startTime: number;
  endTime: number | null;
  duration: number;             // ms — updated live
  averageAmplitude: number;
  peakAmplitude: number;
  noiseLevel: number;
  wordsRecognized: number;
  latency: number | null;       // STT latency ms
  provider: string;             // "web-speech" | "whisper"
  recognitionEngine: string;
  transcriptionEngine: string;
  cancelled: boolean;
  error: string | null;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface VoiceMetrics {
  totalSessions: number;
  successfulSessions: number;
  cancelledSessions: number;
  failedSessions: number;
  avgRecordingDuration: number;    // ms
  avgTranscriptionLatency: number; // ms
  avgAmplitude: number;
  avgPeak: number;
  avgWordsPerSession: number;
  totalRecordingTime: number;      // ms
  permissionDeniedCount: number;
  deviceChangeCount: number;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type VoiceEventType =
  | "PERMISSION_CHANGED"
  | "DEVICE_ACQUIRED"
  | "DEVICE_RELEASED"
  | "DEVICE_CHANGED"
  | "RECORDING_STARTED"
  | "RECORDING_STOPPED"
  | "RECORDING_CANCELLED"
  | "TRANSCRIPTION_STARTED"
  | "TRANSCRIPTION_COMPLETED"
  | "TRANSCRIPTION_FAILED"
  | "PLAYBACK_STARTED"
  | "PLAYBACK_STOPPED"
  | "PLAYBACK_INTERRUPTED"
  | "SESSION_STARTED"
  | "SESSION_ENDED"
  | "PIPELINE_PHASE_CHANGED"
  | "WAVEFORM_DATA"
  | "ERROR";

export interface VoiceEvent {
  type: VoiceEventType;
  timestamp: number;
  payload?: unknown;
}

export type VoiceEventListener = (event: VoiceEvent) => void;

// ─── Future contracts (no implementation) ─────────────────────────────────────

export interface WakeWordContract {
  keyword: string;
  sensitivity: number;
  onDetected: () => void;
}

export interface BargeInContract {
  enabled: boolean;
  threshold: number;
  onDetected: () => void;
}

export interface ContinuousConversationContract {
  maxTurns: number;
  silenceTimeout: number;
  onTurnEnd: (transcript: string) => void;
}

export interface RealtimeStreamingContract {
  endpoint: string;
  protocol: "ws" | "sse";
  onToken: (token: string) => void;
  onEnd: () => void;
}