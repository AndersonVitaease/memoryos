import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Wand2, RotateCw, Lock, Unlock, FileText, Loader2, ChevronDown, X } from "lucide-react";

/**
 * PdfToolsButton — menu de ações PDF powered by Stirling-PDF (stirlingPdfCall).
 * Opera sobre um documento PDF ja ingerido (file_url armazenado no entity Document).
 *
 * Acoes disponiveis (single-file):
 *   - rotate        (90/180/270)
 *   - addPassword   (prompt de senha)
 *   - removePassword (prompt de senha atual)
 *   - pdfToText     (extrai texto -> download .txt)
 *
 * Resultados binarios (rotate, addPassword, removePassword) retornam como base64 JSON
 * e sao baixados como blobs .pdf.
 */
export default function PdfToolsButton({ doc, onNotification }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // operation id em execucao
  const [promptState, setPromptState] = useState(null); // { kind: "password"|"remove"|"rotate", ... }
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const notify = (msg, type = "info") => onNotification?.(msg, type);

  const downloadBase64 = (base64, filename, mime = "application/pdf") => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const callStirling = async (operation, extra = {}) => {
    const res = await base44.functions.invoke("stirlingPdfCall", {
      operation,
      fileUrl: doc.file_url,
      ...extra,
    });
    const data = res?.data ?? res;
    if (!data?.ok) throw new Error(data?.error || `Falha na operacao ${operation}`);
    return data;
  };

  const runRotate = async (angle) => {
    setPromptState(null);
    setBusy("rotate");
    try {
      const data = await callStirling("rotate", { angle });
      const baseName = doc.name.replace(/\.pdf$/i, "");
      downloadBase64(data.base64, `${baseName}_rotated-${angle}.pdf`, "application/pdf");
      notify(`PDF girado ${angle}° com sucesso.`, "success");
    } catch (e) {
      notify(`Erro ao girar: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const runAddPassword = async (password) => {
    setPromptState(null);
    setBusy("addPassword");
    try {
      const data = await callStirling("addPassword", { password });
      const baseName = doc.name.replace(/\.pdf$/i, "");
      downloadBase64(data.base64, `${baseName}_protected.pdf`, "application/pdf");
      notify("Senha adicionada ao PDF.", "success");
    } catch (e) {
      notify(`Erro ao proteger: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const runRemovePassword = async (password) => {
    setPromptState(null);
    setBusy("removePassword");
    try {
      const data = await callStirling("removePassword", { password });
      const baseName = doc.name.replace(/\.pdf$/i, "");
      downloadBase64(data.base64, `${baseName}_unlocked.pdf`, "application/pdf");
      notify("Senha removida do PDF.", "success");
    } catch (e) {
      notify(`Erro ao remover senha: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const runExtractText = async () => {
    setOpen(false);
    setBusy("pdfToText");
    try {
      const data = await callStirling("pdfToText");
      const text = data.text || "";
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, "") + ".txt";
      a.click();
      URL.revokeObjectURL(url);
      notify("Texto extraído do PDF.", "success");
    } catch (e) {
      notify(`Erro ao extrair texto: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const isBusy = !!busy;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isBusy}
        title="Ferramentas PDF (Stirling-PDF)"
        className="p-1.5 rounded-lg hover:bg-amber-50 transition text-zinc-400 hover:text-amber-600 disabled:opacity-50"
      >
        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
      </button>

      {open && !promptState && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-white rounded-xl border border-zinc-200 shadow-lg py-1.5">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wide border-b border-zinc-100">
            Ferramentas PDF
          </div>
          <MenuItem icon={RotateCw} label="Girar 90°" onClick={() => setPromptState({ kind: "rotate" })} disabled={isBusy} />
          <MenuItem icon={RotateCw} label="Girar 180°" onClick={() => runRotate(180)} disabled={isBusy} />
          <MenuItem icon={RotateCw} label="Girar 270°" onClick={() => runRotate(270)} disabled={isBusy} />
          <div className="border-t border-zinc-100 my-1" />
          <MenuItem icon={Lock} label="Adicionar senha" onClick={() => setPromptState({ kind: "addPassword" })} disabled={isBusy} />
          <MenuItem icon={Unlock} label="Remover senha" onClick={() => setPromptState({ kind: "removePassword" })} disabled={isBusy} />
          <div className="border-t border-zinc-100 my-1" />
          <MenuItem icon={FileText} label="Extrair texto" onClick={runExtractText} disabled={isBusy} />
        </div>
      )}

      {open && promptState?.kind === "rotate" && (
        <PromptCard title="Escolha o ângulo" onClose={() => setPromptState(null)}>
          <div className="flex gap-2">
            {[90, 180, 270].map((a) => (
              <button
                key={a}
                onClick={() => runRotate(a)}
                disabled={isBusy}
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-100 hover:bg-violet-50 hover:text-violet-700 text-sm font-medium transition disabled:opacity-50"
              >
                {a}°
              </button>
            ))}
          </div>
        </PromptCard>
      )}

      {open && (promptState?.kind === "addPassword" || promptState?.kind === "removePassword") && (
        <PasswordPrompt
          title={promptState.kind === "addPassword" ? "Definir senha do PDF" : "Senha atual do PDF"}
          confirmLabel={promptState.kind === "addPassword" ? "Proteger" : "Desbloquear"}
          onCancel={() => setPromptState(null)}
          onConfirm={promptState.kind === "addPassword" ? runAddPassword : runRemovePassword}
          busy={isBusy}
        />
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition disabled:opacity-50"
    >
      <Icon className="w-3.5 h-3.5 text-zinc-400" />
      {label}
    </button>
  );
}

function PromptCard({ title, children, onClose }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white rounded-xl border border-zinc-200 shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">{title}</p>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function PasswordPrompt({ title, confirmLabel, onConfirm, onCancel, busy }) {
  const [password, setPassword] = useState("");
  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white rounded-xl border border-zinc-200 shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">{title}</p>
        <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        type="password"
        value={password}
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Senha"
        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 mb-2"
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => password && onConfirm(password)}
          disabled={busy || !password}
          className="flex-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}