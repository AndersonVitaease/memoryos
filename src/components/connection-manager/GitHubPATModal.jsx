/**
 * GitHubPATModal — GitHub Personal Access Token input modal
 * Phase 5.7.0 · EF-57.2
 */
import React, { useState } from "react";
import { X, Github, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";

export default function GitHubPATModal({ onClose, onSubmit, loading, error }) {
  const [token, setToken] = useState("");
  const [show, setShow]   = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    onSubmit(t);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center">
              <Github className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Connect GitHub</h2>
              <p className="text-zinc-500 text-xs">Personal Access Token</p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
            className="text-zinc-500 hover:text-white disabled:opacity-40 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-zinc-400 text-xs leading-relaxed">
            Enter a GitHub <strong className="text-zinc-200">Personal Access Token (PAT)</strong> with
            <code className="text-violet-300 bg-violet-900/30 px-1 rounded mx-1">repo</code> and
            <code className="text-violet-300 bg-violet-900/30 px-1 rounded mx-1">read:user</code> scopes.
          </p>

          <a
            href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=MemoryOS"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition w-fit"
          >
            <ExternalLink className="w-3 h-3" />
            Generate a new token on GitHub
          </a>

          <div className="space-y-1">
            <label className="text-zinc-400 text-xs font-medium">Token</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                disabled={loading}
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 disabled:opacity-50 font-mono"
              />
              <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
              <p className="text-red-300 text-xs">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validating…
                </>
              ) : (
                "Connect"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm text-zinc-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}