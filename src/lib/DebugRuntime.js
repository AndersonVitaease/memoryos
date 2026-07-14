/**
 * DebugRuntime — Módulo de coleta de evidências do runtime do browser.
 * Não altera nenhuma lógica da aplicação. Apenas observa e registra.
 * Acesse o resultado em: window.__MEMORY_DEBUG__
 */

(function installDebugRuntime() {
  if (typeof window === 'undefined') return;

  const debug = {
    timestamp: new Date().toISOString(),
    snapshots: [],
    mutations: [],
    errors: [],
    unhandledRejections: [],
    networkErrors: [],
    hiddenElements: [],
    suppressedPopups: [],
    outletChildren: null,
    mainChildren: null,

    // React component lifecycle flags — preenchidos pelos logs [CHAIN]
    react: {
      appMounted: false,
      protectedRouteMounted: false,
      appLayoutMounted: false,
      connectionsMounted: false,
      connectorCardsRendered: 0,
    },

    // Performance entries
    performance: {
      navigation: [],
      resources: [],
    },

    // Storage keys
    storage: {
      localStorage: [],
      sessionStorage: [],
    },

    // Theme/class state
    theme: {
      htmlClass: '',
      bodyClass: '',
    },
  };

  console.log('[DEBUG] Runtime created — timestamp:', debug.timestamp);
  window.__MEMORY_DEBUG__ = debug;
  console.log('[DEBUG] Runtime attached to window — typeof:', typeof window.__MEMORY_DEBUG__);

  // Guard: detecta se foi recriado (sobrescreve objeto anterior)
  if (window.__MEMORY_DEBUG__.__instance) {
    console.warn('[DEBUG] Runtime REPLACED — previous instance existed! Instance #:', window.__MEMORY_DEBUG__.__instance);
  }
  window.__MEMORY_DEBUG__.__instance = (window.__MEMORY_DEBUG__.__instance || 0) + 1;

  // ─── 1. Captura de snapshot do DOM ──────────────────────────────────────────
  function captureSnapshot(label) {
    const snap = {
      label,
      time: new Date().toISOString(),
      readyState: document.readyState,
      pathname: window.location.pathname,
      bodyLength: document.body ? document.body.innerHTML.length : 0,
      mainChildCount: 0,
      outletChildCount: null,
    };

    // Filhos de <main>
    const main = document.querySelector('main');
    snap.mainChildCount = main ? main.children.length : 0;

    // Filhos do Outlet — procura pelo container direto dentro do <main>
    // O Outlet do React Router não tem um atributo próprio; buscamos o
    // primeiro div filho direto de main que contenha mais de 0 filhos.
    if (main) {
      const outletCandidate = main.querySelector('div:not([class*="mobile"]):not([class*="header"])');
      snap.outletChildCount = outletCandidate ? outletCandidate.children.length : 0;
    }

    debug.snapshots.push(snap);
    debug.mainChildren = snap.mainChildCount;
    debug.outletChildren = snap.outletChildCount;
    console.log('[DEBUG] Snapshot added —', label, '| total snapshots:', debug.snapshots.length, '| window.__MEMORY_DEBUG__ === debug:', window.__MEMORY_DEBUG__ === debug);

    return snap;
  }

  // ─── 2. Elementos ocultos ────────────────────────────────────────────────────
  function scanHiddenElements() {
    const hidden = [];
    const all = document.querySelectorAll('*');
    all.forEach((el) => {
      const style = window.getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : '';
      const selector = `${tag}${id}${cls}`.slice(0, 80);

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      ) {
        hidden.push({
          selector,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          rect: el.getBoundingClientRect
            ? JSON.stringify(el.getBoundingClientRect())
            : null,
        });
      }
    });
    debug.hiddenElements = hidden;
    return hidden;
  }

  // ─── 3. Elementos suprimidos pelo Base44 ────────────────────────────────────
  function scanSuppressedPopups() {
    const suppressed = [];
    document.querySelectorAll('[data-base44-suppressed-popup]').forEach((el) => {
      suppressed.push({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        attr: el.getAttribute('data-base44-suppressed-popup'),
      });
    });
    debug.suppressedPopups = suppressed;
    return suppressed;
  }

  // ─── 4. MutationObserver global ─────────────────────────────────────────────
  let firstRenderDone = false;
  const mutationLog = [];

  const globalObserver = new MutationObserver((records) => {
    records.forEach((rec) => {
      const entry = {
        time: new Date().toISOString(),
        afterFirstRender: firstRenderDone,
        type: rec.type,
        targetTag: rec.target ? rec.target.tagName : null,
        targetId: rec.target ? rec.target.id : null,
        targetClass: rec.target && typeof rec.target.className === 'string'
          ? rec.target.className.slice(0, 60)
          : null,
        addedNodes: rec.addedNodes.length,
        removedNodes: rec.removedNodes.length,
        removedNodeTags: Array.from(rec.removedNodes).map((n) => n.nodeName).join(', '),
        attributeName: rec.attributeName || null,
      };
      mutationLog.push(entry);
    });
    debug.mutations = mutationLog;
  });

  // Começa a observar imediatamente
  globalObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'data-base44-suppressed-popup'],
  });

  // Marca primeiro render após DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    captureSnapshot('DOMContentLoaded');
    firstRenderDone = true;
  });

  // ─── 5. Erros globais ────────────────────────────────────────────────────────
  window.onerror = function (message, source, lineno, colno, error) {
    debug.errors.push({
      time: new Date().toISOString(),
      message,
      source,
      lineno,
      colno,
      stack: error ? error.stack : null,
    });
    // Não suprime o handler original
    return false;
  };

  // Detector passivo de destruição: verifica periodicamente se window.__MEMORY_DEBUG__ ainda aponta para este debug
  let _watchInterval = setInterval(() => {
    if (window.__MEMORY_DEBUG__ !== debug) {
      console.error('[DEBUG] Runtime DESTROYED or REPLACED — window.__MEMORY_DEBUG__ foi substituído!', {
        windowValue: typeof window.__MEMORY_DEBUG__,
        localDebugAlive: !!debug,
      });
      clearInterval(_watchInterval);
    }
  }, 1000);

  window.addEventListener('unhandledrejection', (event) => {
    debug.unhandledRejections.push({
      time: new Date().toISOString(),
      reason: event.reason
        ? (event.reason.message || String(event.reason))
        : 'unknown',
      stack: event.reason && event.reason.stack ? event.reason.stack : null,
    });
  });

  // ─── 6. Erros de rede (JS/CSS) ──────────────────────────────────────────────
  window.addEventListener('error', (event) => {
    const el = event.target;
    if (el && (el.tagName === 'SCRIPT' || el.tagName === 'LINK')) {
      debug.networkErrors.push({
        time: new Date().toISOString(),
        tag: el.tagName,
        src: el.src || el.href,
        type: el.type || null,
      });
    }
  }, true /* capture phase para pegar erros de recursos */);

  // ─── 7. Coleta de performance, storage e theme ──────────────────────────────
  function collectMeta() {
    debug.performance.navigation = performance.getEntriesByType('navigation');
    debug.performance.resources = performance.getEntriesByType('resource');
    debug.storage.localStorage = Object.keys(localStorage);
    debug.storage.sessionStorage = Object.keys(sessionStorage);
    debug.theme.htmlClass = document.documentElement.className;
    debug.theme.bodyClass = document.body ? document.body.className : '';
  }

  // ─── 8. Patch no console para detectar logs [CHAIN] e atualizar react.* ─────
  (function patchConsole() {
    const origLog = console.log.bind(console);
    console.log = function (...args) {
      origLog(...args);
      const msg = args[0];
      if (typeof msg !== 'string') return;
      if (msg.includes('[CHAIN][1-App]') && msg.includes('RENDER START')) {
        debug.react.appMounted = true;
      }
      if (msg.includes('[CHAIN][2-ProtectedRoute]') && msg.includes('RENDER START')) {
        debug.react.protectedRouteMounted = true;
      }
      if (msg.includes('[CHAIN][3-AppLayout]') && msg.includes('RENDER START')) {
        debug.react.appLayoutMounted = true;
      }
      if (msg.includes('[CHAIN][4-Connections]') && msg.includes('RENDER START')) {
        debug.react.connectionsMounted = true;
      }
      if (msg.includes('[CHAIN][5-ConnectorCard]') && msg.includes('RENDER')) {
        debug.react.connectorCardsRendered += 1;
      }
    };
  })();

  // ─── 9. Snapshots adicionais em pontos-chave ─────────────────────────────────
  window.addEventListener('load', () => {
    captureSnapshot('window.load');
    scanHiddenElements();
    scanSuppressedPopups();
    collectMeta();
    console.log('[DebugRuntime] window.__MEMORY_DEBUG__ disponível. Estado inicial:', {
      readyState: document.readyState,
      pathname: window.location.pathname,
      bodyLength: document.body.innerHTML.length,
      snapshots: debug.snapshots.length,
      errors: debug.errors.length,
    });
  });

  // Snapshot tardio para capturar o estado pós-React (após hidratação/render)
  setTimeout(() => {
    captureSnapshot('500ms-post-load');
    scanHiddenElements();
    scanSuppressedPopups();
  }, 500);

  setTimeout(() => {
    captureSnapshot('2000ms-post-load');
    scanHiddenElements();
    scanSuppressedPopups();
    collectMeta();
    console.log('[DebugRuntime] Snapshot 2s completo. window.__MEMORY_DEBUG__:', window.__MEMORY_DEBUG__);
  }, 2000);

  setTimeout(() => {
    captureSnapshot('5000ms-post-load');
    scanHiddenElements();
    scanSuppressedPopups();
    collectMeta();
    console.log('[DebugRuntime] Snapshot 5s completo. Mutations registradas:', debug.mutations.length);
    console.log('[DebugRuntime] React chain:', JSON.stringify(debug.react));
    console.log('[DebugRuntime] Theme:', JSON.stringify(debug.theme));
    console.log('[DebugRuntime] Storage keys:', JSON.stringify(debug.storage));
  }, 5000);

})();