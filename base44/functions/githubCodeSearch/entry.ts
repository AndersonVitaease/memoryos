/**
 * githubCodeSearch — proxy server-side para /search/code do GitHub.
 *
 * O endpoint /search/code do GitHub bloqueia CORS no navegador
 * (net::ERR_FAILED em chamadas diretas do frontend). Este handler roda
 * no Deno (sem restricao de CORS), busca o token OAuth do usuario+workspace
 * na entidade GitHubOAuthToken e repassa a busca, devolvendo resultados
 * normalizados.
 *
 * Body: { query, owner?, repo?, workspaceId?, per_page? }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { query, owner, repo, workspaceId = 'default', per_page = 20 } = body;
    if (!query) return Response.json({ error: 'Missing query' }, { status: 400 });

    // Resolve o token do usuario para o workspace solicitado.
    const tokens = await base44.asServiceRole.entities.GitHubOAuthToken.filter({
      user_id: user.id,
      workspace_id: workspaceId,
    });
    const token = tokens[0]?.access_token;
    if (!token) return Response.json({ error: 'GitHub token not found for workspace' }, { status: 404 });

    // Monta a query do GitHub: termo + repo filter opcional.
    const repoFilter = owner && repo ? `+repo:${owner}/${repo}` : '';
    const q = encodeURIComponent(query) + repoFilter;
    const ghRes = await fetch(
      `https://api.github.com/search/code?q=${q}&per_page=${Math.min(per_page, 100)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    const ghText = await ghRes.text();
    let ghData = {};
    try { ghData = ghText ? JSON.parse(ghText) : {}; } catch { ghData = {}; }

    if (ghRes.status === 403) {
      return Response.json({
        error: 'GitHub search rate limited — wait 30s and retry',
        retryAfter: ghRes.headers.get('retry-after'),
      }, { status: 429 });
    }
    if (ghRes.status === 422) {
      return Response.json({ error: 'Query too complex for GitHub search' }, { status: 422 });
    }
    if (!ghRes.ok) {
      return Response.json({ error: `GitHub HTTP ${ghRes.status}: ${ghData.message || ghText.slice(0, 200)}` }, { status: 502 });
    }

    const items = (ghData.items ?? []).slice(0, per_page).map((i) => ({
      path: i.path,
      repository: i.repository?.full_name ?? null,
      sha: i.sha,
      url: i.html_url,
      textMatches: (i.text_matches ?? []).map((m) => ({
        fragment: m.fragment,
        matches: (m.matches ?? []).map((mm) => mm.text).slice(0, 3),
      })).slice(0, 3),
    }));

    return Response.json({
      query,
      totalCount: ghData.total_count ?? 0,
      items,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}