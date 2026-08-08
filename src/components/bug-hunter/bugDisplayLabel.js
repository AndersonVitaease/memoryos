/**
 * bugDisplayLabel — torna os titulos dos BugFindings legiveis para humanos.
 *
 * O Bug Hunter gera titulos tecnicos em ingles (ex: "RAW internal error
 * exposed", "WrongConnectorSelection"). O dono do MemoryOS nao reconhece o
 * servico envolvido pelo titulo. Este utilitario:
 *   1. Detecta o conector/servico (Google Drive, Gmail, Outlook, GitHub...)
 *      varrendo title + description + actual + expected + console_errors.
 *   2. Retorna { serviceLabel, serviceColor, enhancedTitle, categoryLabel }.
 *
 * Nao altera o dado armazenado — so a exibicao. Usado por BugInsightsChat
 * (painel de selecao a esquerda) e BugFindingsList (relatorio no console).
 */

// Ordem importa: servicos mais especificos primeiro para nao serem
// sobrepostos por generico (ex: "Google Drive" antes de "Gmail" porque
// ambos podem mencionar "email" indiretamente; mas "drive" e especifico).
const SERVICE_MAP = [
  {
    label: "Google Drive",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    keywords: ["google drive", "gdrive", "drive.listfiles", "drive.downloadfile", "drive.uploadfile", "drive.createfolder", "drive.delete", "drive.rename", "arquivo no drive", "meu drive", "downloadfile", "uploadfile", "createfolder"],
  },
  {
    label: "Gmail",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    keywords: ["gmail", "readinbox", "sendemail", "inbox", "caixa de entrada", "email do google", "email do gmail"],
  },
  {
    label: "Google Calendar",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    keywords: ["google calendar", "calendar.listevents", "calendar.createevent", "agenda do google", "evento na agenda", "listevents", "createevent"],
  },
  {
    label: "Outlook Mail",
    color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    keywords: ["outlook", "outlook mail", "outlook mail.readinbox", "outlook mail.sendemail", "email do outlook", "email da microsoft"],
  },
  {
    label: "Outlook Calendar",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    keywords: ["outlook calendar", "outlook calendar.listevents", "outlook calendar.createevent", "calendario do outlook", "calendario da microsoft"],
  },
  {
    label: "OneDrive",
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    keywords: ["onedrive", "onedrive.listdir", "arquivo no onedrive"],
  },
  {
    label: "Microsoft Teams",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    keywords: ["teams", "microsoft teams", "teams.sendmessage"],
  },
  {
    label: "Microsoft 365",
    color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    keywords: ["microsoft 365", "m365", "microsoft graph", "graph", "office 365", "excel", "word", "powerpoint", "onenote", "sharepoint", "todo", "contatos da microsoft"],
  },
  {
    label: "GitHub",
    color: "text-zinc-300 bg-zinc-500/10 border-zinc-400/20",
    keywords: ["github", "github.searchcode", "github.listrepos", "github.creatissue", "searchcode", "listrepos", "readrepo", "creatissue", "repositorio", "repo"],
  },
  {
    label: "WhatsApp",
    color: "text-green-400 bg-green-500/10 border-green-500/20",
    keywords: ["whatsapp", "whatsapp.sendmessage", "mensagem no whatsapp"],
  },
  {
    label: "Memoria (Mem0)",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    keywords: ["memori", "mem0", "remember", "recall", "memori-cloud", "memori.remember", "memori.recall"],
  },
  {
    label: "PDF (Stirling)",
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    keywords: ["stirling", "stirling-pdf", "rotate", "merge", "split", "passwordprotect", "extracttext", "pdf"],
  },
  {
    label: "Autenticacao",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    keywords: ["auth", "login", "token", "oauth", "sessao", "session", "unauthorized", "forbidden", "401", "403", "2fa"],
  },
  {
    label: "Chat / Resposta",
    color: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
    keywords: ["chat", "resposta", "message", "resposta vazia", "blank response", "continuidade", "memory continuity", "empty response"],
  },
  {
    label: "Busca",
    color: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    keywords: ["search", "busca", "serper", "firecrawl", "searchengine"],
  },
];

const CATEGORY_LABELS = {
  ui: "Interface",
  functional: "Funcional",
  broken_flow: "Fluxo Quebrado",
  error: "Erro Exposto",
  performance: "Performance",
  auth: "Autenticacao",
  data: "Dados",
  other: "Outro",
};

function lower(s) {
  return (s || "").toLowerCase();
}

/**
 * Detecta o servico dominante num BugFinding varrendo seus campos de texto.
 * Retorna o label amigavel ou null se nenhum servico for detectado.
 */
export function detectService(finding) {
  if (!finding) return null;
  const haystack = lower(
    [finding.title, finding.description, finding.actual, finding.expected, finding.console_errors].filter(Boolean).join(" ")
  );
  for (const svc of SERVICE_MAP) {
    for (const kw of svc.keywords) {
      if (haystack.includes(lower(kw))) {
        return svc;
      }
    }
  }
  return null;
}

/**
 * Retorna o titulo aprimorado: se um servico foi detectado e o titulo
 * original ja nao o menciona, prefixa com "[Servico] ". Assim o dono do
 * MemoryOS ve imediatamente qual integracao esta envolvida.
 */
export function enhanceBugTitle(finding) {
  if (!finding || !finding.title) return "";
  const svc = detectService(finding);
  const title = finding.title;
  if (!svc) return title;
  // Se o titulo ja menciona o servico, nao duplica
  if (lower(title).includes(lower(svc.label))) return title;
  return `${svc.label} — ${title}`;
}

/**
 * Rotulo amigavel para a categoria tecnica (pt-BR).
 */
export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category || "Outro";
}

/**
 * Dados completos para exibicao: servico + titulo + categoria + cor.
 */
export function getBugDisplayInfo(finding) {
  const svc = detectService(finding);
  return {
    serviceLabel: svc ? svc.label : null,
    serviceColor: svc ? svc.color : null,
    enhancedTitle: enhanceBugTitle(finding),
    categoryLabel: categoryLabel(finding.category),
  };
}