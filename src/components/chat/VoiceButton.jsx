import React, { useRef, useState } from "react";
import { Mic, X } from "lucide-react";

const CANCEL_THRESHOLD = 80;

/**
 * Botão Push-to-Talk.
 *
 * - Pressionar e segurar: inicia captura (onPressStart)
 * - Soltar: finaliza e envia (onPressEnd)
 * - Deslizar para o lado/cima: cancela e descarta (onCancel)
 *
 * Haptics/sons são gerenciados pelo pipeline (onPressStart/onPressEnd disparam o feedback).
 */
export default function VoiceButton({ disabled, onPressStart, onPressEnd, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const pointerId = useRef(null);
  const recordingRef = useRef(false);

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    pointerId.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    startPos.current = { x: e.clientX, y: e.clientY };
    setIsRecording(true);
    recordingRef.current = true;
    setIsCanceling(false);
    onPressStart?.();
  };

  const handlePointerMove = (e) => {
    if (!recordingRef.current || e.pointerId !== pointerId.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    setIsCanceling(dist > CANCEL_THRESHOLD);
  };

  const finish = (e, canceled) => {
    if (!recordingRef.current || (e && e.pointerId !== pointerId.current)) return;
    try { e?.currentTarget?.releasePointerCapture?.(pointerId.current); } catch (_) {}
    recordingRef.current = false;
    setIsRecording(false);
    if (canceled) {
      setIsCanceling(false);
      onCancel?.();
    } else {
      onPressEnd?.();
    }
  };

  const handlePointerUp = (e) => finish(e, isCanceling);

  const handlePointerCancel = () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setIsRecording(false);
    setIsCanceling(false);
    onCancel?.();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative p-3 rounded-2xl transition-all shrink-0 select-none touch-none ${
        isRecording
          ? isCanceling
            ? "bg-red-100 text-red-500 scale-95"
            : "bg-red-500 text-white scale-105"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:scale-95"
      } ${disabled ? "opacity-30 pointer-events-none" : ""}`}
    >
      {isCanceling ? <X className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      {isRecording && !isCanceling && (
        <span className="absolute inset-0 rounded-2xl bg-red-500 animate-ping opacity-30 pointer-events-none" />
      )}
    </button>
  );
}