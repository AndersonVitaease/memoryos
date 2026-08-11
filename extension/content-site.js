/**
 * content-site.js — injetado sob demanda (chrome.scripting.executeScript) na
 * aba autenticada pelo service worker durante a descoberta (Sprint 2).
 *
 * Extrai um snapshot resumido do DOM (para o LLM) + todos os links do mesmo
 * dominio (para a BFS) e envia ao background. Nao mantem estado nem loop — o
 * driver da BFS e o background, que navega a aba e re-injeta este script a
 * cada pagina carregada.
 *
 * O snapshot imita o formato do accessibility snapshot do Playwright MCP que o
 * webConnectorDiscover ja consome: uma linha por elemento interativo com
 * tag/name/id/placeholder/aria-label/label/text/href. Isso permite reaproveitar
 * o MESMO prompt de descoberta (compartilhado em base44/shared/webDiscovery.ts).
 */
(function () {
  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function snapshot() {
    const lines = [];
    const interactive = document.querySelectorAll(
      'input, select, textarea, button, a[href], [role=button], [role=link], [role=textbox], [role=searchbox]'
    );
    let n = 0;
    for (const el of interactive) {
      if (n > 500) break;
      const tag = (el.tagName || '').toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      let label = '';
      if (id) {
        try {
          const lbl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (lbl) label = (lbl.textContent || '').trim();
        } catch (e) { /* CSS.escape fallback */ }
      }
      if (!label) {
        const w = el.closest('label');
        if (w) label = (w.textContent || '').trim();
      }
      const text = (el.innerText || el.textContent || '').trim().slice(0, 100);
      let desc = tag;
      if (type) desc += ' type=' + type;
      if (name) desc += ' name=' + name;
      if (id) desc += ' id=' + id;
      if (placeholder) desc += ' placeholder="' + placeholder + '"';
      if (ariaLabel) desc += ' aria-label="' + ariaLabel + '"';
      if (label) desc += ' label="' + label + '"';
      const isLinky = (tag === 'a' || tag === 'button' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link');
      if (text && isLinky) desc += ' text="' + text + '"';
      if (tag === 'a' && el.href) desc += ' href=' + el.href;
      lines.push(desc);
      n++;
    }
    return lines.join('\n');
  }

  function links() {
    const baseHost = hostOf(location.href);
    const out = [];
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      let h;
      try { h = new URL(a.href); } catch (e) { continue; }
      const hh = h.hostname.replace(/^www\./, '');
      if (!hh.endsWith(baseHost)) continue;
      if (/\/login|\/logout|\/signup|\/register/i.test(h.pathname)) continue;
      const text = (a.innerText || a.textContent || '').trim();
      if (text.length < 3) continue;
      out.push({ text: text.slice(0, 120), href: a.href });
    }
    const seen = new Set();
    const dedup = [];
    for (const it of out) {
      if (seen.has(it.href)) continue;
      seen.add(it.href);
      dedup.push(it);
    }
    return dedup.slice(0, 200);
  }

  try {
    const snap = snapshot();
    const allLinks = links();
    chrome.runtime.sendMessage(
      { type: 'MEMOS_SNAPSHOT_RESULT', currentUrl: location.href, snapshotText: snap, links: allLinks },
      () => { void chrome.runtime.lastError; }
    );
  } catch (e) {
    chrome.runtime.sendMessage(
      { type: 'MEMOS_SNAPSHOT_RESULT', currentUrl: location.href, error: (e && e.message) || String(e) },
      () => { void chrome.runtime.lastError; }
    );
  }
})();