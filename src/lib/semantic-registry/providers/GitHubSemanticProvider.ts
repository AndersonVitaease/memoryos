/**
 * GitHubSemanticProvider.ts — EXPERIMENTAL Sprint EXP-GITHUB-SEM
 *
 * EXPERIMENTO REVERSIVEL — nao e uma correcao definitiva.
 *
 * REVERSAO:
 *   1. Apagar este arquivo.
 *   2. Remover a linha de registro em semantic-registry/index.ts.
 *   Zero outros arquivos precisam ser alterados.
 *
 * SRP: unico responsavel por todo o conhecimento semantico do dominio GitHub.
 *      Segue o mesmo contrato moderno (detect) utilizado pelo DriveSemanticProvider.
 *
 * REGRA EXPERIMENTAL:
 *   Score positivo apenas quando houver:
 *     - sinal explicito de codigo/repo
 *     - caminho de arquivo (src/, lib/, /)
 *     - extensao de codigo (.ts, .tsx, .jsx, .js)
 *     - referencia tipica de repositorio
 *     - PascalCase identificador de componente de engenharia
 *
 *   "procure" sozinho NAO gera score GitHub.
 *   Apenas "procure" + contexto de codigo gera score.
 *
 * INSTRUMENTACAO: logs [EXP-GITHUB-SEM] para rastreabilidade do experimento.
 */

import type { SemanticProvider, SemanticDetection } from "../SemanticTypes";
import type { NormalizationResult } from "@/lib/conversation-goal-bridge/NaturalLanguageGoalNormalizer";
import type { GoalType } from "@/lib/goals/GoalTypes";

// ── Intent Rules (mesmo padrao do DriveSemanticProvider) ─────────────────────
// priority menor = avaliada primeiro.
// Regras com baseScore mais alto vencem em igualdade de domainScore.

interface GHIntentRule {
  readonly priority:  number;
  readonly goalType:  GoalType;
  readonly baseScore: number;
  readonly signals:   readonly string[];
}

const GH_INTENT_RULES: readonly GHIntentRule[] = Object.freeze([

  // ── priority 10: leitura de arquivo especifico ──────────────────────────────
  {
    priority:  10,
    goalType:  "github.getFile",
    baseScore: 0.55,
    signals: [
      "leia o arquivo", "leia esse arquivo", "leia este arquivo",
      "ler o arquivo",  "ler esse arquivo",  "ler este arquivo",
      "show file", "read file", "open file",
      "conteudo do arquivo", "content of file",
      "show the file", "get file",
    ],
  },

  // ── priority 20: busca de simbolo / classe / funcao em codigo ───────────────
  {
    priority:  20,
    goalType:  "github.searchCode",
    baseScore: 0.60,
    signals: [
      // EN — explicitos de busca em codigo
      "where is", "where is the", "where is it", "where is this",
      "find class", "find function", "find interface", "find type",
      "search for", "search code", "search class", "search in code",
      "locate", "grep", "who imports", "who calls", "called by",
      "references to", "find usage", "where is used",
      "defined in", "implemented in", "declared in",
      // PT — busca em codigo
      "onde esta", "onde fica", "onde foi definido",
      "onde esta implementado", "onde e usado", "quem usa", "quem importa",
      "onde esta definido", "procurar classe", "encontrar classe",
      "procurar funcao", "encontrar funcao", "achar classe", "achar funcao",
      // busca + contexto de codigo (evita capturar "procure contrato")
      "procure a classe", "procure a funcao", "procure o arquivo",
      "procure o componente", "procure o modulo",
      "encontre a classe", "encontre a funcao", "encontre o arquivo",
      "busque a classe", "busque a funcao", "busque o arquivo",
    ],
  },

  // ── priority 18: busca de REPOSITORIO/PASTA por nome (ANTES do searchCode) ─
  // Causa raiz do bug: "procure por essa pasta no github" mencionava "github"
  // (CODE_ENTITY_SIGNAL), mas nao casava nenhuma rela de searchCode. Caia no
  // Caso 2 (domain-only) que defaultava pra github.searchCode -> /search/code
  // (rate limit 10/min, semanticamente errado — procurar "claude.me" como
  // simbolo de codigo). Esta rela captura "procure ... no github" e roteia
  // pra github.searchRepo -> /search/repositories (30/min, achar repo por nome).
  {
    priority:  18,
    goalType:  "github.searchRepo" as GoalType,
    baseScore: 0.55,
    signals: [
      // PT — busca de repo/pasta por nome
      "procure no github", "procure por", "procurar no github",
      "procurar pasta no github", "procurar repositorio no github",
      "buscar pasta no github", "buscar repositorio no github",
      "encontrar pasta no github", "encontrar repositorio no github",
      "achar repositorio no github", "achar pasta no github",
      "existe um repo", "existe um repositorio",
      // EN
      "search repo", "find repo", "find repository", "search repository",
      "search repos", "find repos", "search github for",
    ],
  },

  // ── priority 30: listagem de arquivos / estrutura ───────────────────────────
  {
    priority:  30,
    goalType:  "github.listFiles",
    baseScore: 0.50,
    signals: [
      "list files", "show files", "file tree", "repository tree",
      "listar arquivos do repositorio", "estrutura do repositorio",
      "show structure", "source files", "arquivos do repo",
    ],
  },

  // ── priority 40: commits / historico ────────────────────────────────────────
  {
    priority:  40,
    goalType:  "github.listCommits",
    baseScore: 0.55,
    signals: [
      "commit history", "list commits", "show commits",
      "recent commits", "ultimos commits", "listar commits",
      "historico de commits", "what changed",
    ],
  },

  // ── priority 50: pull requests / issues ─────────────────────────────────────
  {
    priority:  50,
    goalType:  "github.listPullRequests",
    baseScore: 0.55,
    signals: [
      "pull request", "pull requests", "pr list", "open prs",
      "merge request", "list prs", "listar prs",
    ],
  },

  // ── priority 60: repositorios ───────────────────────────────────────────────
  {
    priority:  60,
    goalType:  "github.listRepos",
    baseScore: 0.50,
    signals: [
      "list repos", "show repos", "my repos", "meus repos",
      "listar repositorios", "meus repositorios", "repositorios disponiveis",
    ],
  },
]);

// ── Domain signals — contribuem para domainScore sem fixar goalType ────────────
// Cada grupo tem peso proprio. Presenca de qualquer sinal do grupo soma o peso.

const CODE_ENTITY_SIGNALS = Object.freeze([
  // extensoes de arquivo de codigo
  ".ts", ".tsx", ".jsx", ".js", ".py", ".go", ".java", ".kt", ".swift",
  // extensoes de documento/config comuns em repos (CLAUDE.md, README.md, etc.)
  ".md", ".json", ".yml", ".yaml", ".sh", ".toml", ".env",
  // caminhos de diretorio
  "src/", "lib/", "/lib/", "src\\",
  // linguagens / runtime
  "typescript", "javascript",
  // contexto de repositorio explicito
  "github", "repository", "repo",
  // controle de versao
  "branch", "commit", "pull request",
]);

// Sinais que sao EXTENSOES de arquivo (para diferenciar o routing no Caso 2:
// extensao de arquivo -> procurar o arquivo (searchCode); "github"/"repo"
// solto -> procurar repositorio por nome (searchRepo)).
const FILE_EXTENSION_SIGNALS = Object.freeze(
  [".ts", ".tsx", ".jsx", ".js", ".py", ".go", ".java", ".kt", ".swift",
   ".md", ".json", ".yml", ".yaml", ".sh", ".toml", ".env"],
);

const CODE_CONCEPT_SIGNALS = Object.freeze([
  // construcoes de linguagem
  "class ", "interface ", "function ", "method ", "module ",
  "component", "service ", "provider ", "factory ",
  "engine", "manager", "runtime", "dispatcher",
  "connector", "gateway", "pipeline", "planner", "router",
  "store", "registry", "builder", "executor",
  // termos gerais de engenharia de software
  "source code", "codigo fonte", "implementation", "implementacao",
  "definition", "definicao", "declaration", "declaracao",
  "debug", "debugger",
]);

// Regex: identificador PascalCase com sufixo tipico de engenharia de software
// Ex: "RuntimeDebug", "ExecutionDispatcher", "ConversationPipeline"
const ENGINEERING_COMPONENT_RE =
  /\b([A-Z][a-z]+){2,}(Engine|Manager|Service|Router|Gateway|Connector|Pipeline|Store|Planner|Queue|Builder|Composer|Executor|Dispatcher|Monitor|Provider|Registry|Resolver|Synthesizer|Handler|Controller|Validator|Detector|Analyzer|Builder|Factory|Bridge|Orchestrator|Debug|Runtime|Client|Server|Worker|Agent|Context|Config|Options|Result|Request|Response|Event|Error|Exception|Test|Spec|Mock|Stub)?/;

// ── Signal matcher ────────────────────────────────────────────────────────────

/**
 * Verifica se `s` aparece em `lower` como palavra/frase INTEIRA.
 * FIX (auditoria cognição): firstMatch() usava .includes() puro. "repo"
 * (CODE_ENTITY_SIGNALS, peso 0.40 — sozinho já acima do
 * MIN_SCORE_THRESHOLD de 0.20) é substring de "reportagem" e "repolho".
 *
 * A fronteira é CONDICIONAL: só exige fronteira Unicode no lado em que
 * o próprio sinal começa/termina com letra ou número. Sinais como
 * ".ts" ou "src/" já começam/terminam com caractere não-alfanumérico,
 * que naturalmente separa palavras — exigir fronteira ali quebraria
 * casos legítimos como "arquivo.ts" (o "o" antes do "." não seria mais
 * reconhecido como fronteira válida).
 */
function firstMatch(lower: string, signals: readonly string[]): string | null {
  for (const s of signals) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startsWithWord = /^[\p{L}\p{N}]/u.test(s);
    const endsWithWord = /[\p{L}\p{N}]$/u.test(s);
    const prefix = startsWithWord ? "(^|[^\\p{L}\\p{N}])" : "";
    const suffix = endsWithWord ? "([^\\p{L}\\p{N}]|$)" : "";
    const pattern = new RegExp(`${prefix}${escaped}${suffix}`, "u");
    if (pattern.test(lower)) return s;
  }
  return null;
}

// ── Domain score ──────────────────────────────────────────────────────────────

interface DomainResult {
  score:          number;
  evidences:      string[];
  fileExtension:  boolean;
}

function computeGHDomainScore(lower: string, original: string): DomainResult {
  const evidences: string[] = [];
  let score = 0;
  let fileExtension = false;

  // Caminho de arquivo ou extensao de codigo (sinal forte)
  const codeEnt = firstMatch(lower, CODE_ENTITY_SIGNALS);
  if (codeEnt) {
    score += 0.40;
    evidences.push(`code-entity:"${codeEnt}"`);
    // Se o sinal que casou eh uma extensao de arquivo (.md, .ts, ...), marca
    // pra o Caso 2 rotear pra searchCode (achar o arquivo) em vez de searchRepo
    // (achar repositorio por nome — errado pra "claude.md", "README.md" etc.).
    if (FILE_EXTENSION_SIGNALS.includes(codeEnt)) fileExtension = true;
  }

  // Conceito de engenharia de software
  const codeConcept = firstMatch(lower, CODE_CONCEPT_SIGNALS);
  if (codeConcept) {
    score += 0.30;
    evidences.push(`code-concept:"${codeConcept}"`);
  }

  // Identificador PascalCase de componente de engenharia (ex: RuntimeDebug)
  const pascal = original.match(ENGINEERING_COMPONENT_RE)?.[0];
  if (pascal) {
    score += 0.35;
    evidences.push(`engineering-component:"${pascal}"`);
  }

  return { score, evidences, fileExtension };
}

// ── Rule evaluator ─────────────────────────────────────────────────────────────

interface RuleMatch {
  rule:   GHIntentRule;
  signal: string;
}

function evaluateGHRules(lower: string): RuleMatch | null {
  for (const rule of GH_INTENT_RULES) {
    const signal = firstMatch(lower, rule.signals);
    if (signal) return { rule, signal };
  }
  return null;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const GitHubSemanticProvider: SemanticProvider = Object.freeze({
  connectorId: "github",

  detect(lower: string, normalized: NormalizationResult): SemanticDetection {
    // Sprint 2b (correção do antipadrão): `normalized.entity` é sempre uma
    // string desde o Sprint 1 (nunca null/undefined) — o fallback `?? lower`
    // já era código morto, mas removido explicitamente para não virar
    // armadilha caso `entity` volte a ser nullable no futuro.
    const domain = computeGHDomainScore(lower, normalized.entity);
    const match  = evaluateGHRules(lower);

    // ── Caso 1: Regra disparou + dominio confirmado ─────────────────────────
    if (match && domain.score > 0) {
      const confidence = Math.min(domain.score + match.rule.baseScore, 1.0);
      const evidences  = [
        `intent-rule:"${match.rule.goalType}"`,
        `signal:"${match.signal}"`,
        ...domain.evidences,
      ];

      console.log("[EXP-GITHUB-SEM]", {
        case:       "rule+domain",
        message:    lower,
        signals:    [match.signal, ...domain.evidences],
        score:      confidence,
        goalType:   match.rule.goalType,
        connector:  "github",
      });

      return Object.freeze({
        connector:  "github",
        goalType:   match.rule.goalType,
        confidence,
        evidences:  Object.freeze(evidences),
        entities:   Object.freeze({}),
      });
    }

    // ── Caso 2: Apenas dominio de codigo sem verbo de intencao especifico ───
    // Ex: "RuntimeDebug" sozinho, ou "src/lib/runtime"
    // FIX: antes defaultava pra github.searchCode (/search/code, rate limit
    // 10/min, semanticamente "procurar simbolo de codigo"). Para menções
    // genéricas de "github" sem verbo de código explícito, o intent natural é
    // achar um REPOSITÓRIO por nome — github.searchRepo (/search/repositories,
    // 30/min). Isto elimina o 429 recorrente em "procure por essa pasta no
    // github" e alinha o routing ao que o usuário realmente pede.
    if (domain.score > 0) {
      const confidence = Math.min(domain.score, 1.0);
      // FIX: se o dominio veio de uma EXTENSAO de arquivo (.md, .ts, ...), o
      // intent natural eh achar o ARQUIVO (searchCode) — ex: "claude.md",
      // "README.md". Se veio so de "github"/"repo" solto, eh achar REPOSITORIO
      // por nome (searchRepo) — ex: "procure por essa pasta no github".
      const goalType = (domain.fileExtension ? "github.searchCode" : "github.searchRepo") as GoalType;
      const evidences  = [
        domain.fileExtension ? "domain-only:file-extension" : "domain-only:code-context",
        ...domain.evidences,
      ];

      console.log("[EXP-GITHUB-SEM]", {
        case:       "domain-only",
        message:    lower,
        signals:    domain.evidences,
        score:      confidence,
        goalType,
        connector:  "github",
      });

      return Object.freeze({
        connector:  "github",
        goalType,
        confidence,
        evidences:  Object.freeze(evidences),
        entities:   Object.freeze({}),
      });
    }

    // ── Caso 3: Nenhum sinal de codigo ──────────────────────────────────────
    console.log("[EXP-GITHUB-SEM]", {
      case:      "no-signal",
      message:   lower,
      score:     0,
      goalType:  null,
      connector: "github",
    });

    return Object.freeze({
      connector:  "github",
      goalType:   null,
      confidence: 0,
      evidences:  Object.freeze(["no-github-signal"]),
      entities:   Object.freeze({}),
    });
  },
});