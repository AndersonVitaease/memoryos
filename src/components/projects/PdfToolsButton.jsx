import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Wand2, RotateCw, Lock, Unlock, FileText, Loader2, ChevronDown, X, Layers, Scissors, Wrench } from "lucide-react";

/**
 * PdfToolsButton — menu de ações PDF powered by Stirling-PDF (stirlingPdfCall).
 * Opera sobre um documento PDF ja ingerido (file_url armazenado no entity Document).
 *
 * Acoes disponiveis:
 *   - rotate        (90/180/270)
 *   - addPassword   (prompt de senha)
 *   - removePassword (prompt de senha atual)
 *   - pdfToText     (extrai texto -> download .txt)
 *   - merge         (mescla com outros PDFs do mesmo projeto)
 *   - split         (divide por intervalos ou faixa de paginas)
 *
 * Resultados binarios retornam como base64 JSON e sao baixados como blobs.
 */
export default function PdfToolsButton({ doc, allPdfs = [], onNotification }) {
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
    if (!data?.ok) {
      const extra = data?.repairDetail || data?.extractDetail || data?.detail || "";
      const detail = extra ? ` (${extra.slice(0, 300)})` : "";
      throw new Error(`${data?.error || `Falha na operacao ${operation}`}${detail}`);
    }
    return data;
  };

  const runMerge = async (otherDocs) => {
    setPromptState(null);
    setBusy("merge");
    try {
      const fileUrls = [doc.file_url, ...otherDocs.map((d) => d.file_url)];
      const data = await callStirling("merge", { fileUrls });
      const baseName = doc.name.replace(/\.pdf$/i, "");
      downloadBase64(data.base64, `${baseName}_merged.pdf`, "application/pdf");
      notify(`PDF mesclado com ${otherDocs.length} arquivo(s).`, "success");
    } catch (e) {
      notify(`Erro ao mesclar: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const runSplit = async ({ mode, intervals, firstPage, lastPage }) => {
    setPromptState(null);
    setBusy("split");
    try {
      const extra = { mode };
      if (mode === "intervals") extra.intervals = intervals;
      if (mode === "pages") {
        extra.firstPage = firstPage;
        extra.lastPage = lastPage;
      }
      const data = await callStirling("split", extra);
      const baseName = doc.name.replace(/\.pdf$/i, "");
      const mime = data.contentType || "application/zip";
      const ext = mime.includes("zip") ? "zip" : "pdf";
      downloadBase64(data.base64, `${baseName}_split.${ext}`, mime);
      notify(mode === "intervals" ? "PDF dividido (ZIP)." : "Faixa extraída.", "success");
    } catch (e) {
      notify(`Erro ao dividir: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
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

  const runRepair = async () => {
    setOpen(false);
    setBusy("repair");
    try {
      const data = await callStirling("repair");
      const baseName = doc.name.replace(/\.pdf$/i, "");
      downloadBase64(data.base64, `${baseName}_repaired.pdf`, "application/pdf");
      notify("PDF reparado com sucesso.", "success");
    } catch (e) {
      notify(`Erro ao reparar: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const runExtractText = async () => {
    setOpen(false);
    setBusy("pdfToText");
    try {
      const res = await base44.functions.invoke("stirlingPdfCall", {
        operation: "pdfToText",
        fileUrl: doc.file_url,
      });
      const data = res?.data ?? res;
      const text = data?.text || "";

      // Fallback de OCR por visao: PDF escaneado/imagem ou reparo indisponivel
      if (!data?.ok || !text.trim()) {
        if (data?.needOcr) {
          notify("Sem camada de texto. Aplicando OCR por visão (pode levar alguns segundos)...", "info");
          const ocrText = await runOcrFallback();
          if (!ocrText) {
            notify("OCR por visão não conseguiu extrair texto do PDF.", "error");
            return;
          }
          const blob = new Blob([ocrText], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = doc.name.replace(/\.pdf$/i, "") + "_ocr.txt";
          a.click();
          URL.revokeObjectURL(url);
          notify(`Texto extraído por OCR de visão (${ocrText.length} caracteres).`, "success");
          return;
        }
        const extra = data?.repairDetail || data?.extractDetail || data?.detail || "";
        const detail = extra ? ` (${extra.slice(0, 200)})` : "";
        throw new Error(`${data?.error || "Falha na extração"}${detail}`);
      }

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, "") + ".txt";
      a.click();
      URL.revokeObjectURL(url);
      notify(`Texto extraído (${text.length} caracteres)${data.repaired ? " — PDF foi reparado automaticamente." : ""}.`, "success");
    } catch (e) {
      notify(`Erro ao extrair texto: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  // OCR por visao: envia o PDF original diretamente ao LLM de visao (Gemini suporta PDFs nativamente)
  const runOcrFallback = async () => {
    const llmRes = await base44.integrations.Core.InvokeLLM({
      prompt: "Você é um motor de OCR. Analise este documento PDF e extraia TODO o texto visível em cada página, preservando a estrutura, parágrafos, tabelas e ordem de leitura. Se o PDF tiver páginas escaneadas/imagem, faça OCR delas. Retorne apenas o texto extraído, sem comentários.",
      file_urls: [doc.file_url],
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Todo o texto extraído do documento, página por página" },
        },
        required: ["text"],
      },
    });
    return (llmRes?.text || "").trim();
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
          <MenuItem icon={Layers} label="Mesclar com outros" onClick={() => setPromptState({ kind: "merge" })} disabled={isBusy || allPdfs.length === 0} />
          <MenuItem icon={Scissors} label="Dividir / extrair páginas" onClick={() => setPromptState({ kind: "split" })} disabled={isBusy} />
          <div className="border-t border-zinc-100 my-1" />
          <MenuItem icon={Wrench} label="Reparar PDF" onClick={runRepair} disabled={isBusy} />
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

      {open && promptState?.kind === "merge" && (
        <MergePrompt
          currentDoc={doc}
          allPdfs={allPdfs}
          onCancel={() => setPromptState(null)}
          onConfirm={runMerge}
          busy={isBusy}
        />
      )}

      {open && promptState?.kind === "split" && (
        <SplitPrompt
          onCancel={() => setPromptState(null)}
          onConfirm={runSplit}
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

function MergePrompt({ currentDoc, allPdfs, onCancel, onConfirm, busy }) {
  const [selected, setSelected] = useState([]);
  const others = allPdfs.filter((d) => d.id !== currentDoc.id && d.file_url);
  const toggle = (d) =>
    setSelected((prev) => (prev.some((s) => s.id === d.id) ? prev.filter((s) => s.id !== d.id) : [...prev, d]));
  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white rounded-xl border border-zinc-200 shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">Mesclar com (ordem: atual primeiro)</p>
        <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-44 overflow-y-auto space-y-1 mb-2">
        {others.length === 0 ? (
          <p className="text-xs text-zinc-400 px-1 py-2">Nenhum outro PDF no projeto.</p>
        ) : (
          others.map((d) => {
            const checked = selected.some((s) => s.id === d.id);
            const idx = selected.findIndex((s) => s.id === d.id);
            return (
              <button
                key={d.id}
                onClick={() => toggle(d)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition ${
                  checked ? "bg-violet-50 text-violet-700" : "hover:bg-zinc-50 text-zinc-600"
                }`}
              >
                <span className="w-4 text-center font-semibold">{checked ? `${idx + 2}` : "•"}</span>
                <span className="flex-1 truncate">{d.name}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(selected)}
          disabled={busy || selected.length === 0}
          className="flex-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:opacity-50"
        >
          Mesclar
        </button>
      </div>
    </div>
  );
}

function SplitPrompt({ onCancel, onConfirm, busy }) {
  const [mode, setMode] = useState("intervals");
  const [intervals, setIntervals] = useState("");
  const [firstPage, setFirstPage] = useState("");
  const [lastPage, setLastPage] = useState("");
  const valid = mode === "intervals" ? /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(intervals.trim()) : firstPage && lastPage;
  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white rounded-xl border border-zinc-200 shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">Dividir PDF</p>
        <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-1 mb-2 bg-zinc-100 rounded-lg p-0.5">
        <button
          onClick={() => setMode("intervals")}
          className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition ${
            mode === "intervals" ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500"
          }`}
        >
          Intervalos (ZIP)
        </button>
        <button
          onClick={() => setMode("pages")}
          className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition ${
            mode === "pages" ? "bg-white text-violet-700 shadow-sm" : "text-zinc-500"
          }`}
        >
          Faixa (PDF)
        </button>
      </div>
      {mode === "intervals" ? (
        <input
          value={intervals}
          autoFocus
          onChange={(e) => setIntervals(e.target.value)}
          placeholder="Ex: 1-3,4-6,7"
          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 mb-2"
        />
      ) : (
        <div className="flex gap-2 mb-2">
          <input
            value={firstPage}
            onChange={(e) => setFirstPage(e.target.value)}
            placeholder="De"
            type="number"
            min="1"
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          />
          <input
            value={lastPage}
            onChange={(e) => setLastPage(e.target.value)}
            placeholder="Até"
            type="number"
            min="1"
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          />
        </div>
      )}
      <p className="text-[10px] text-zinc-400 mb-2 leading-relaxed">
        {mode === "intervals"
          ? "Cada intervalo vira um PDF. Resultado em ZIP."
          : "Extrai páginas contíguas num único PDF."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={() => valid && onConfirm(mode === "intervals" ? { mode, intervals: intervals.trim() } : { mode, firstPage: Number(firstPage), lastPage: Number(lastPage) })}
          disabled={busy || !valid}
          className="flex-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:opacity-50"
        >
          Dividir
        </button>
      </div>
    </div>
  );
}