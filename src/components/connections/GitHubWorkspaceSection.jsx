/**
 * GitHubWorkspaceSection — multi-conta GitHub (OAuth) + seletor de repositorios.
 * Espelha GoogleWorkspaceSection.jsx. Permite conectar varias contas GitHub
 * (cada uma num slot), alternar a conta ativa e selecionar multiplos repositorios
 * da conta ativa pra operar em conjunto.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Check, X, Plug, RefreshCw, LogOut, Loader2, AlertTriangle, PlusCircle,
  GitBranch, ChevronDown, ChevronRight, Star, Github, Lock,
} from "lucide-react";
import {
  BASE_SCOPES, getAccessToken, hydrateAll, hydrateToken,
  getActiveGitHubWorkspaceId, setActiveGitHubWorkspaceId,
  getSelectedRepos, setSelectedRepos,
} from "@/lib/github-auth/GitHubAuthSession";
import {
  listGitHubAccounts, connectAdditionalGitHubAccount,
  disconnectGitHubAccount, reconnectGitHubAccount,
} from "@/lib/github-auth/GitHubMultiAccount";
import { getActiveWorkspaceId } from "@/lib/workspace/WorkspaceContext";

const BASE_WORKSPACE_ID = getActiveWorkspaceId();

const PRIVACY_NOTE =
  "Permissoes de leitura/escrita em repos conforme scope 'repo'. Voce pode desconectar a qualquer momento.";

function stateLabel(state) {
  const map = {
    CONNECTED: "Conectado",
    AUTHENTICATING: "Autenticando...",
    DISCONNECTED: "Desconectado",
    NOT_CONNECTED: "Nao conectado",
  };
  return map[state] ?? state;
}

export default function GitHubWorkspaceSection() {
  const [accounts, setAccounts] = useState(() => listGitHubAccounts(BASE_WORKSPACE_ID));
  const [activeWs, setActiveWs] = useState(() => getActiveGitHubWorkspaceId());
  const [authState, setAuth] = useState("NOT_CONNECTED");
  const [loading, setLoading] = useState(false);
  const [loadingAccountId, setLoadingAccountId] = useState(null);
  const [error, setError] = useState(null);

  const [reposOpen, setReposOpen] = useState(false);
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepos, setSelectedReposState] = useState(() => getSelectedRepos(activeWs));

  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState(null);

  const syncAccounts = useCallback(() => {
    setAccounts(listGitHubAccounts(BASE_WORKSPACE_ID));
  }, []);

  useEffect(() => {
    hydrateAll().then(() => syncAccounts()).catch(() => {});
  }, [syncAccounts]);

  useEffect(() => {
    const handler = () => {
      const ws = getActiveGitHubWorkspaceId();
      setActiveWs(ws);
      setSelectedReposState(getSelectedRepos(ws));
      setRepos([]);
      setReposOpen(false);
    };
    window.addEventListener("memoryos:gh-active-account-changed", handler);
    return () => window.removeEventListener("memoryos:gh-active-account-changed", handler);
  }, []);

  const onStateChange = useCallback((s) => {
    setAuth(s);
    if (s === "CONNECTED" || s === "NOT_CONNECTED") syncAccounts();
  }, [syncAccounts]);

  const handleConnectNew = async () => {
    setLoading(true); setError(null);
    try {
      await connectAdditionalGitHubAccount(BASE_WORKSPACE_ID, BASE_SCOPES, onStateChange);
    } catch (e) {
      setError(e?.message ?? "Falha ao conectar. Tente novamente.");
    } finally { setLoading(false); syncAccounts(); }
  };

  const handleDisconnect = async (accountWorkspaceId) => {
    setLoadingAccountId(accountWorkspaceId); setError(null);
    try { await disconnectGitHubAccount(accountWorkspaceId, onStateChange); }
    catch { setError("Falha ao desconectar essa conta."); }
    finally { setLoadingAccountId(null); syncAccounts(); }
  };

  const handleReconnect = async (accountWorkspaceId) => {
    setLoadingAccountId(accountWorkspaceId); setError(null);
    try {
      await reconnectGitHubAccount(accountWorkspaceId, BASE_SCOPES, onStateChange);
    } catch (e) {
      setError(e?.message ?? "Falha ao reconectar.");
    } finally { setLoadingAccountId(null); syncAccounts(); }
  };

  const handleSetActive = (accountWorkspaceId) => {
    setActiveGitHubWorkspaceId(accountWorkspaceId);
    setActiveWs(accountWorkspaceId);
    setSelectedReposState(getSelectedRepos(accountWorkspaceId));
    setRepos([]);
    setReposOpen(false);
  };

  const loadRepos = async () => {
    setReposLoading(true); setError(null);
    try {
      await hydrateToken(activeWs);
      const token = getAccessToken(activeWs);
      if (!token) throw new Error("Token GitHub nao disponivel para a conta ativa.");
      const res = await fetch(
        "https://api.github.com/user/repos?per_page=80&sort=updated&affiliation=owner,collaborator",
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
      const data = await res.json();
      setRepos(data.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        name: r.name,
        owner: r.owner?.login,
        private: r.private,
        stars: r.stargazers_count,
        updated_at: r.updated_at,
      })));
    } catch (e) {
      setError(e?.message ?? "Falha ao carregar repositorios.");
    } finally { setReposLoading(false); }
  };

  const toggleRepo = (fullName) => {
    const cur = getSelectedRepos(activeWs);
    const next = cur.includes(fullName)
      ? cur.filter((r) => r !== fullName)
      : [...cur, fullName];
    setSelectedRepos(activeWs, next);
    setSelectedReposState(next);
  };

  const toggleReposPanel = () => {
    const willOpen = !reposOpen;
    setReposOpen(willOpen);
    if (willOpen && repos.length === 0) loadRepos();
  };

  const runBatchAccess = async () => {
    const sel = getSelectedRepos(activeWs);
    if (sel.length === 0) return;
    setBatchLoading(true); setError(null);
    try {
      await hydrateToken(activeWs);
      const token = getAccessToken(activeWs);
      if (!token) throw new Error("Token GitHub nao disponivel para a conta ativa.");
      // Acessa todos os repos selecionados EM PARALELO (limite de 4 por vez)
      const CONCURRENCY = 4;
      const out = [];
      let i = 0;
      const fetchOne = async (fullName) => {
        const res = await fetch(`https://api.github.com/repos/${fullName}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        });
        const d = res.ok ? await res.json() : null;
        // ultimo commit
        let lastCommit = null;
        if (res.ok && d?.default_branch) {
          try {
            const cr = await fetch(`https://api.github.com/repos/${fullName}/commits/${d.default_branch}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
            });
            lastCommit = cr.ok ? await cr.json() : null;
          } catch {}
        }
        out.push({
          repo: fullName,
          ok: res.ok,
          status: res.status,
          defaultBranch: d?.default_branch ?? null,
          language: d?.language ?? null,
          stars: d?.stargazers_count ?? 0,
          openIssues: d?.open_issues_count ?? 0,
          pushedAt: d?.pushed_at ?? null,
          lastCommitSha: lastCommit?.sha?.slice(0, 7) ?? null,
          lastCommitMsg: lastCommit?.commit?.message?.split("\n")[0] ?? null,
          lastCommitDate: lastCommit?.commit?.author?.date ?? null,
          error: res.ok ? null : `HTTP ${res.status}`,
        });
      };
      while (i < sel.length) {
        const chunk = sel.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(fetchOne));
        i += CONCURRENCY;
      }
      setBatchResults({ count: out.length, succeeded: out.filter((r) => r.ok).length, items: out });
    } catch (e) {
      setError(e?.message ?? "Falha ao acessar repositorios em lote.");
    } finally { setBatchLoading(false); }
  };

  const runBatchAllAccounts = async () => {
    const connected = accounts.filter((c) => c.state === "CONNECTED");
    if (connected.length === 0) return;
    setBatchLoading(true); setError(null);
    try {
      await hydrateAll();
      // Coleta (account, token, repo) de todas as contas conectadas
      const jobs = [];
      for (const acc of connected) {
        const token = getAccessToken(acc.workspaceId);
        if (!token) continue;
        const sel = getSelectedRepos(acc.workspaceId);
        for (const repoFullName of sel) jobs.push({ account: acc.accountLogin || acc.workspaceId, token, repo: repoFullName });
      }
      if (jobs.length === 0) {
        setError("Nenhum repositorio selecionado nas contas conectadas. Selecione repos em cada conta.");
        return;
      }
      const CONCURRENCY = 4;
      const out = [];
      let i = 0;
      const fetchOne = async (job) => {
        const res = await fetch(`https://api.github.com/repos/${job.repo}`, {
          headers: { Authorization: `Bearer ${job.token}`, Accept: "application/vnd.github+json" },
        });
        const d = res.ok ? await res.json() : null;
        let lastCommit = null;
        if (res.ok && d?.default_branch) {
          try {
            const cr = await fetch(`https://api.github.com/repos/${job.repo}/commits/${d.default_branch}`, {
              headers: { Authorization: `Bearer ${job.token}`, Accept: "application/vnd.github+json" },
            });
            lastCommit = cr.ok ? await cr.json() : null;
          } catch {}
        }
        out.push({
          account: job.account,
          repo: job.repo,
          ok: res.ok,
          status: res.status,
          defaultBranch: d?.default_branch ?? null,
          language: d?.language ?? null,
          stars: d?.stargazers_count ?? 0,
          openIssues: d?.open_issues_count ?? 0,
          pushedAt: d?.pushed_at ?? null,
          lastCommitSha: lastCommit?.sha?.slice(0, 7) ?? null,
          lastCommitMsg: lastCommit?.commit?.message?.split("\n")[0] ?? null,
          lastCommitDate: lastCommit?.commit?.author?.date ?? null,
          error: res.ok ? null : `HTTP ${res.status}`,
        });
      };
      while (i < jobs.length) {
        const chunk = jobs.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(fetchOne));
        i += CONCURRENCY;
      }
      // Ordena por conta pra agrupar visualmente
      out.sort((a, b) => a.account.localeCompare(b.account) || a.repo.localeCompare(b.repo));
      setBatchResults({
        count: out.length,
        succeeded: out.filter((r) => r.ok).length,
        accountsCovered: connected.length,
        crossAccount: true,
        items: out,
      });
    } catch (e) {
      setError(e?.message ?? "Falha ao acessar repositorios em lote cross-conta.");
    } finally { setBatchLoading(false); }
  };

  const connectedAccounts = accounts.filter((c) => c.state === "CONNECTED");
  const hasAnyConnected = connectedAccounts.length > 0;
  const activeAccount = connectedAccounts.find((c) => c.workspaceId === activeWs) ?? connectedAccounts[0] ?? null;

  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          <Github className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-foreground">GitHub</h3>
            {hasAnyConnected
              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><Check className="w-3 h-3" /> {connectedAccounts.length} conta{connectedAccounts.length > 1 ? "s" : ""} conectada{connectedAccounts.length > 1 ? "s" : ""}</span>
              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-500"><X className="w-3 h-3" /> Nenhuma conta conectada</span>}
            {loading && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />{stateLabel(authState)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Conecte uma ou mais contas GitHub para habilitar repos, commits, PRs e busca de codigo.</p>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="mt-4 space-y-2">
          {accounts.map((conn) => {
            const isActive = conn.workspaceId === (activeAccount?.workspaceId ?? activeWs);
            return (
              <div key={conn.workspaceId} className={`p-3 rounded-lg border space-y-2 ${isActive ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-200"}`}>
                <div className="flex items-center gap-2 text-xs">
                  {conn.avatarUrl
                    ? <img src={conn.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                    : <Github className="w-4 h-4 text-zinc-600" />}
                  <span className="font-semibold text-foreground">{conn.accountLogin || "Conta GitHub"}</span>
                  {isActive && <span className="px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 text-[10px] font-bold">ATIVA</span>}
                  {conn.isReal && <span className="ml-auto px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px] font-bold">OAuth 2.0</span>}
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <span><span className="font-medium">Escopos:</span> {conn.scopes?.length ?? 0}</span>
                  <span><span className="font-medium">Status:</span> {conn.state}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {!isActive && (
                    <button onClick={() => handleSetActive(conn.workspaceId)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition">
                      <Star className="w-3 h-3" /> Definir como ativa
                    </button>
                  )}
                  <button onClick={() => handleReconnect(conn.workspaceId)} disabled={loadingAccountId === conn.workspaceId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-zinc-700 hover:bg-zinc-50 border border-zinc-200 disabled:opacity-40 transition">
                    {loadingAccountId === conn.workspaceId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Reconectar
                  </button>
                  <button onClick={() => handleDisconnect(conn.workspaceId)} disabled={loadingAccountId === conn.workspaceId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 disabled:opacity-40 transition">
                    {loadingAccountId === conn.workspaceId ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    Desconectar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasAnyConnected && (
        <div className="mt-4 rounded-lg border border-border">
          <button onClick={toggleReposPanel} className="w-full flex items-center gap-2 p-3 text-sm font-medium text-foreground hover:bg-muted/30 transition">
            {reposOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <GitBranch className="w-4 h-4" />
            Selecionar repositorios
            {selectedRepos.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700">
                {selectedRepos.length} selecionado{selectedRepos.length > 1 ? "s" : ""}
              </span>
            )}
          </button>
          {reposOpen && (
            <div className="border-t border-border p-3 space-y-2">
              {!activeAccount && <p className="text-xs text-muted-foreground">Conecte uma conta primeiro.</p>}
              {activeAccount && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Repositorios de <span className="font-semibold">{activeAccount.accountLogin}</span></p>
                    <button onClick={loadRepos} disabled={reposLoading}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40 transition">
                      {reposLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Atualizar
                    </button>
                  </div>
                  {reposLoading && repos.length === 0 && (
                    <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
                  )}
                  {!reposLoading && repos.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">Nenhum repositorio encontrado.</p>
                  )}
                  {repos.length > 0 && (
                    <div className="max-h-64 overflow-auto space-y-1 pr-1">
                      {repos.map((r) => {
                        const checked = selectedRepos.includes(r.full_name);
                        return (
                          <label key={r.id} className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-xs transition ${checked ? "bg-violet-50 border border-violet-200" : "hover:bg-muted/30 border border-transparent"}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRepo(r.full_name)} className="w-3.5 h-3.5 accent-violet-600" />
                            <Github className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span className="font-medium text-foreground truncate">{r.full_name}</span>
                            {r.private && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                            {r.stars > 0 && <span className="ml-auto inline-flex items-center gap-0.5 text-zinc-400"><Star className="w-3 h-3" />{r.stars}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedRepos.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Selecionados ({selectedRepos.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedRepos.map((r) => (
                          <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-700">
                            {r}
                            <button onClick={() => toggleRepo(r)} className="text-violet-400 hover:text-violet-700"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {hasAnyConnected && selectedRepos.length > 0 && (
        <div className="mt-4 rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground">Acesso em lote</p>
              <p className="text-xs text-muted-foreground">
                Acessa os repositorios selecionados em paralelo (metadados + ultimo commit). "Conta ativa" usa a conta selecionada acima; "Todas as contas" varre os repos selecionados em cada conta conectada, cada um com seu proprio token.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={runBatchAccess} disabled={batchLoading}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition">
                {batchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                Conta ativa
              </button>
              {connectedAccounts.length > 1 && (
                <button onClick={runBatchAllAccounts} disabled={batchLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
                  {batchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
                  Todas as contas ({connectedAccounts.length})
                </button>
              )}
            </div>
          </div>
          {batchResults && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="w-3 h-3" /> {batchResults.succeeded} ok
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                  {batchResults.count - batchResults.succeeded} falha
                </span>
                {batchResults.crossAccount && batchResults.accountsCovered && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                    <Github className="w-3 h-3" /> {batchResults.accountsCovered} contas
                  </span>
                )}
              </div>
              <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
                {batchResults.items.map((r) => (
                  <div key={`${r.account ?? ""}/${r.repo}`} className={`p-2 rounded-md border text-xs ${r.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center gap-2">
                      <Github className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="font-semibold text-foreground truncate">{r.repo}</span>
                      {r.account && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px] font-bold">@{r.account}</span>
                      )}
                      {!r.ok && <span className="ml-auto text-red-600 font-medium">{r.error}</span>}
                    </div>
                    {r.ok && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span>branch: <span className="font-medium text-foreground">{r.defaultBranch}</span></span>
                        {r.language && <span>lang: <span className="font-medium text-foreground">{r.language}</span></span>}
                        {r.stars > 0 && <span>★ {r.stars}</span>}
                        {r.openIssues > 0 && <span>issues: {r.openIssues}</span>}
                        {r.lastCommitSha && (
                          <span className="truncate">last: <span className="font-mono text-foreground">{r.lastCommitSha}</span> {r.lastCommitMsg}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground/70 mt-3">{PRIVACY_NOTE}</p>

      {error && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button onClick={handleConnectNew} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (hasAnyConnected ? <PlusCircle className="w-4 h-4" /> : <Plug className="w-4 h-4" />)}
          {hasAnyConnected ? "Adicionar outra conta GitHub" : "Conectar com GitHub"}
        </button>
      </div>
    </div>
  );
}