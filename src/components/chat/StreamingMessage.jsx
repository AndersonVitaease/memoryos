/**
 * StreamingMessage.jsx — Voice Experience Platform (VXP)
 * Sprint 7.0.1: Blinking cursor during streaming.
 * ChatGPT-style: content renders as tokens arrive, cursor pulses at the end.
 */

import React from "react";
import ReactMarkdown from "react-markdown";

// CSS blink injected once
const CURSOR_STYLE = `
@keyframes vxp-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.vxp-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: currentColor;
  margin-left: 1px;
  vertical-align: text-bottom;
  animation: vxp-blink 900ms step-start infinite;
  border-radius: 1px;
}
`;

let _styleInjected = false;
function ensureStyle() {
  if (_styleInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = CURSOR_STYLE;
  document.head.appendChild(style);
  _styleInjected = true;
}

export default function StreamingMessage({ content }) {
  ensureStyle();

  // Empty — show dots while thinking (no content yet)
  if (!content) {
    return (
      <div className="flex items-center gap-1 py-1" aria-label="Pensando...">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-zinc-400"
            style={{ animation: `vxp-blink 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="prose prose-sm prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        components={{
          // Mesmo fix do ChatPage.jsx: forca links a abrir em aba nova, senao
          // tentam navegar dentro do frame do MemoryOS e sites externos (ex:
          // Mercado Livre) detectam o embed e redirecionam pra pagina generica.
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      <span className="vxp-cursor" aria-hidden="true" />
    </div>
  );
}