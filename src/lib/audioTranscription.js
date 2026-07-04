import { base44 } from "@/api/base44Client";

/**
 * Fallback de transcrição: captura áudio via MediaRecorder e transcreve
 * usando Whisper (TranscribeAudio integration).
 *
 * Usado automaticamente quando a Web Speech API retorna vazio (comum no Safari/iOS).
 *
 * Fluxo: audio Blob → UploadFile → TranscribeAudio → texto
 */
export async function transcribeAudioBlob(blob) {
  // Determina extensão com base no tipo do blob
  const type = blob.type || "";
  const ext = type.includes("mp4") ? "m4a"
    : type.includes("ogg") ? "oga"
    : type.includes("wav") ? "wav"
    : "webm";

  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });

  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const result = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });

  if (typeof result === "string") return result.trim();
  if (result?.transcript) return result.transcript.trim();
  if (result?.text) return result.text.trim();
  return String(result || "").trim();
}

/**
 * Verifica se MediaRecorder + getUserMedia estão disponíveis no navegador.
 */
export function isMediaRecorderSupported() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}