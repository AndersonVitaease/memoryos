import { useRef, useCallback } from "react";

/**
 * Feedback háptico + sonoro para a experiência de voz.
 *
 * - navigator.vibrate (Android / dispositivos compatíveis)
 * - Web Audio API beep (funciona em iOS Safari onde navigator.vibrate não existe)
 *
 * Tipos:
 * - "start": pressionou o botão (háptico leve + beep grave)
 * - "end": soltou o botão, gravação concluída (háptico médio + beep agudo)
 * - "cancel": cancelou (háptico pesado + beep descendente)
 * - "error": erro (háptico pesado + beep de erro)
 */
export function useHaptics() {
  const audioCtxRef = useRef(null);

  const getCtx = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    } catch (e) {
      return null;
    }
    return audioCtxRef.current;
  }, []);

  const beep = useCallback((freq, duration, volume = 0.08) => {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      // iOS exige resume dentro de um gesto do usuário
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration / 1000);
    } catch (e) { /* noop */ }
  }, [getCtx]);

  const vibrate = useCallback((pattern) => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (e) { /* noop */ }
  }, []);

  const feedback = useCallback((type) => {
    switch (type) {
      case "start":
        vibrate(15);
        beep(523, 60, 0.06); // Dó — leve, início
        break;
      case "end":
        vibrate([10, 20, 10]);
        beep(880, 80, 0.08); // Lá — confirmação, conclusão
        break;
      case "cancel":
        vibrate([30, 40, 30]);
        beep(300, 120, 0.07); // grave — cancelamento
        break;
      case "error":
        vibrate([50, 30, 50, 30, 50]);
        beep(200, 200, 0.08); // grave longo — erro
        break;
      default:
        break;
    }
  }, [beep, vibrate]);

  return { feedback, beep, vibrate };
}