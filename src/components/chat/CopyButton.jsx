import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition"
      title="Copiar resposta"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          Copiar
        </>
      )}
    </button>
  );
}