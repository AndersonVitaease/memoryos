import React, { useState } from "react";
import {
  Terminal, Package, GitBranch, Folder, Play, Code2,
  Cpu, Globe, Bot, AlertCircle, CheckSquare, CheckCircle,
  ArrowRight, Copy, Check
} from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",      label: "Visão Geral" },
  { id: "requirements",  label: "Requisitos" },
  { id: "install",       label: "Instalação" },
  { id: "structure",     label: "Estrutura" },
  { id: "firstrun",      label: "1ª Execução" },
  { id: "firsttask",     label: "1ª Task" },
  { id: "cicd",          label: "CI/CD" },
  { id: "environments",  label: "Ambientes" },
  { id: "ai",            label: "IA" },
  { id: "troubleshoot",  label: "Troubleshooting" },
  { id: "checklist",     label: "Checklist" },
];

const REQUIREMENTS = [
  { tool: "Node.js",              version: "20 LTS",               note: "Use nvm para gerenciar versões" },
  { tool: "TypeScript",           version: "5.0+",                 note: "Instalado via devDependencies" },
  { tool: "pnpm",                 version: "8+",                   note: "npm install -g pnpm" },
  { tool: "Docker",               version: "24+",                  note: "Docker Desktop recomendado" },
  { tool: "Docker Compose",       version: "v2",                   note: "Incluído no Docker Desktop" },
  { tool: "PostgreSQL",           version: "15+",                  note: "Via Docker" },
  { tool: "Redis",                version: "7+",                   note: "Via Docker" },
  { tool: "Git",                  version: "2.40+",                note: "git --version para verificar" },
  { tool: "GitHub CLI",           version: "2.40+",                note: "gh auth login após instalar" },
  { tool: "VS Code",              version: "latest",               note: "Editor oficial recomendado" },
];

const VSCODE_EXTENSIONS = [
  "ms-vscode.vscode-typescript-next",
  "bradlc.vscode-tailwindcss",
  "esbenp.prettier-vscode",
  "dbaeumer.vscode-eslint",
  "eamodio.gitlens",
  "ms-azuretools.vscode-docker",
  "christian-kohler.path-intellisense",
  "usernamehw.errorlens",
];

const INSTALL_STEPS = [
  { step: "Clone do repositório",       cmd: "git clone https://github.com/memoryos/memoryos.git\ncd memoryos" },
  { step: "Instalação das dependências", cmd: "pnpm install" },
  { step: "Configuração do .env",        cmd: "cp .env.example .env\n# Editar .env com valores locais" },
  { step: "Inicialização do banco",      cmd: "docker compose up -d postgres redis\npnpm db:migrate\npnpm db:seed" },
  { step: "Execução do Runtime",         cmd: "pnpm dev" },
  { step: "Validação da instalação",     cmd: "pnpm health:check\n# ✓ Runtime OK | ✓ DB OK | ✓ Redis OK | ✓ EventBus OK" },
];

const REPO_STRUCTURE = [
  { dir: "src/core/",        desc: "Core Layer — interfaces e contratos",    restricted: true },
  { dir: "src/runtime/",     desc: "Runtime Layer — tipos e contratos",      restricted: true },
  { dir: "src/services/",    desc: "Services Layer — lógica de domínio",     restricted: false },
  { dir: "src/infrastructure/", desc: "Infra — DB, cache, mensageria",       restricted: false },
  { dir: "packages/",        desc: "Packages compartilhados (monorepo)",     restricted: false },
  { dir: "sdk/",             desc: "SDK público do MemoryOS",                restricted: true },
  { dir: "connectors/",      desc: "Conectores oficiais (MCF)",              restricted: false },
  { dir: "specialists/",     desc: "Specialists registrados (MCIS)",         restricted: false },
  { dir: "docs/",            desc: "Documentação oficial (Library)",         restricted: true },
  { dir: "tests/",           desc: "Testes de integração e E2E",             restricted: false },
  { dir: "scripts/",         desc: "Scripts de automação (CI/CD, migrations)", restricted: false },
  { dir: "tools/",           desc: "Ferramentas de desenvolvimento",         restricted: false },
  { dir: "examples/",        desc: "Exemplos de uso do SDK e conectores",    restricted: false },
];

const CICD_STEPS = [
  { step: "Build",               tool: "TypeScript compiler",     cmd: "tsc --noEmit",             blocker: true },
  { step: "Lint",                tool: "ESLint + Prettier",        cmd: "pnpm lint",                blocker: true },
  { step: "Unit Tests",          tool: "Vitest",                  cmd: "pnpm test:unit",           blocker: true },
  { step: "Integration Tests",   tool: "Vitest + testcontainers", cmd: "pnpm test:integration",    blocker: true },
  { step: "MRI",                 tool: "pnpm mri:run",            cmd: "pnpm mri:run",             blocker: true },
  { step: "MQCCS",               tool: "pnpm mqccs:run",          cmd: "pnpm mqccs:run",           blocker: true },
  { step: "MERS",                tool: "pnpm mers:run",           cmd: "pnpm mers:run",            blocker: true },
  { step: "MADS",                tool: "pnpm mads:check",         cmd: "pnpm mads:check",          blocker: true },
  { step: "Deploy",              tool: "GitHub Actions + Docker", cmd: "somente em main",          blocker: false },
];

const ENVIRONMENTS = [
  { env: "Local",       goal: "Desenvolvimento individual",              promote: "Manual, sem restrição",                        color: "text-zinc-400" },
  { env: "Development", goal: "Integração contínua do time",             promote: "Merge em develop + CI pass",                   color: "text-blue-400" },
  { env: "QA",          goal: "Validação funcional pelo time de QA",     promote: "Deploy manual por Release Manager",            color: "text-yellow-400" },
  { env: "Staging",     goal: "Homologação final, espelho de produção",  promote: "Aprovação do Tech Lead + PO",                  color: "text-orange-400" },
  { env: "Production",  goal: "Ambiente live",                           promote: "Release tag + MERS Final aprovado",            color: "text-green-400" },
];

const AI_USES = [
  { use: "Gerar código",           example: "Implementa o método store() conforme IWorkingMemoryStore", review: true },
  { use: "Explicar arquitetura",   example: "Explica o fluxo de eventos no EventBus",                   review: false },
  { use: "Escrever testes",        example: "Gera testes unitários para EmailMemoryValidator",           review: true },
  { use: "Refatorar",              example: "Refatora para reduzir complexidade ciclomática",            review: true },
  { use: "Gerar documentação",     example: "Gera JSDoc para esta função",                              review: true },
  { use: "Detectar bugs",          example: "Revisa este código por possíveis memory leaks",            review: true },
];

const TROUBLESHOOT = [
  { problem: "pnpm install falha",       cause: "Node.js versão errada",             fix: "nvm use 20" },
  { problem: "Banco indisponível",       cause: "Docker não iniciado",               fix: "docker compose up -d postgres" },
  { problem: "Redis connection refused", cause: "Redis não iniciado",                fix: "docker compose up -d redis" },
  { problem: "tsc errors",              cause: "TypeScript incompatível",            fix: "pnpm install + verificar tsconfig.json" },
  { problem: "Dependências circulares", cause: "Import incorreto",                   fix: "Verificar imports, usar interfaces" },
  { problem: "Falha no MRI",            cause: "Cenário de referência não passa",    fix: "Revisar implementação contra MRI spec" },
  { problem: "Falha no MQCCS",          cause: "Cobertura abaixo do mínimo",         fix: "Adicionar testes faltantes" },
  { problem: "Falha no MERS",           cause: "Architecture/Security score baixo", fix: "Revisar MESR report, endereçar bloqueadores" },
  { problem: "Falha no MADS",           cause: "Drift crítico detectado",            fix: "Revisar MADS report, corrigir antes do merge" },
  { problem: "Docker sem memória",      cause: "Recursos insuficientes",            fix: "Aumentar memória Docker Desktop (≥ 4GB)" },
];

const CHECKLIST_ITEMS = [
  "Ambiente configurado (Node, pnpm, Docker)",
  "Repositório clonado e dependências instaladas",
  ".env configurado e válido",
  "Runtime funcionando (pnpm dev)",
  "Todos os testes executados (pnpm test)",
  "MRI aprovado localmente",
  "MQCCS aprovado localmente",
  "Foundation estudada (MV, MPS, MAS, MDS, MRS, MCS)",
  "MEOM lido (processo operacional)",
  "Primeiro PR aberto",
  "Primeira revisão de PR concluída (como reviewer)",
  "Primeira Task merged",
];

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, text, color = "violet" }) {
  const bg = { violet: "bg-violet-700", blue: "bg-blue-700", green: "bg-green-700", red: "bg-red-700", yellow: "bg-yellow-700", orange: "bg-orange-700", cyan: "bg-cyan-700", zinc: "bg-zinc-700" };
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-8 h-8 rounded-lg ${bg[color] ?? "bg-zinc-700"} flex items-center justify-center shrink-0`}>
        <Icon size={15} className="text-white" />
      </div>
      <h2 className="text-white font-bold text-sm md:text-base">{text}</h2>
    </div>
  );
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre">{code}</pre>
      <button onClick={copy} className="absolute top-2 right-2 p-1 rounded bg-zinc-700 hover:bg-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-zinc-400" />}
      </button>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function MdokSystem() {
  const [tab, setTab] = useState("overview");
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked(p => ({ ...p, [i]: !p[i] }));
  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center shrink-0">
              <Terminal size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base md:text-lg">MDOK — Developer Onboarding Kit</h1>
              <p className="text-zinc-500 text-xs">Official Engineering Operations · Foundation v1.0 · 2026-07-10</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {["v1.0", "12 Capítulos", "Ambiente Completo", "Primeira Task Guiada", "CI/CD Documentado"].map(b => (
              <span key={b} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono">{b}</span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto mb-6">
          <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 min-w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW ────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-4">
            <SectionTitle icon={Terminal} text="Capítulo 1 — Filosofia" color="green" />
            <div className="bg-gradient-to-br from-green-950 to-zinc-900 border border-green-800 rounded-xl p-5">
              <p className="text-green-100 font-semibold text-sm mb-2">"Todo novo desenvolvedor deverá conseguir configurar, executar e contribuir — sem auxílio externo."</p>
              <p className="text-zinc-400 text-sm">O MDOK reduz o tempo entre a chegada de um desenvolvedor e sua primeira contribuição de qualidade ao MemoryOS.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                "Configurar o ambiente",
                "Executar a plataforma",
                "Compreender a Foundation",
                "Implementar uma Task",
                "Executar os pipelines",
                "Abrir um Pull Request",
              ].map(item => (
                <div key={item} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex gap-3">
                  <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-zinc-200">{item}</span>
                </div>
              ))}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Declaração Final</h3>
              <div className="space-y-1 text-sm">
                {[
                  ["Foundation", "define a plataforma"],
                  ["MEOM",       "define como a equipe trabalha"],
                  ["MDOK",       "garante onboarding rápido e padronizado"],
                ].map(([name, desc]) => (
                  <div key={name} className="flex gap-2 text-zinc-400">
                    <span className="text-green-400 font-semibold shrink-0">{name}</span>— {desc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REQUIREMENTS ──────────────────────────────────────────── */}
        {tab === "requirements" && (
          <div className="space-y-4">
            <SectionTitle icon={Package} text="Capítulo 2 — Requisitos do Ambiente" color="blue" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="px-4 py-2 text-left">Ferramenta</th>
                    <th className="px-4 py-2 text-center">Versão</th>
                    <th className="px-4 py-2 text-left hidden md:table-cell">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {REQUIREMENTS.map(r => (
                    <tr key={r.tool}>
                      <td className="px-4 py-2.5 font-semibold text-zinc-200">{r.tool}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-violet-400 text-xs">{r.version}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs hidden md:table-cell">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Extensões VS Code Recomendadas</h3>
              <div className="space-y-1">
                {VSCODE_EXTENSIONS.map(ext => (
                  <p key={ext} className="font-mono text-xs text-zinc-400">{ext}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INSTALL ───────────────────────────────────────────────── */}
        {tab === "install" && (
          <div className="space-y-4">
            <SectionTitle icon={Terminal} text="Capítulo 3 — Instalação" color="green" />
            <div className="space-y-3">
              {INSTALL_STEPS.map((item, i) => (
                <div key={item.step}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center shrink-0 font-bold">{i + 1}</div>
                    <p className="text-sm font-semibold text-zinc-200">{item.step}</p>
                  </div>
                  <div className="ml-9">
                    <CodeBlock code={item.cmd} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STRUCTURE ──────────────────────────────────────────────── */}
        {tab === "structure" && (
          <div className="space-y-4">
            <SectionTitle icon={Folder} text="Capítulo 4 — Estrutura do Repositório" color="yellow" />
            <div className="space-y-1.5">
              {REPO_STRUCTURE.map(item => (
                <div key={item.dir} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <span className="font-mono text-violet-400 text-xs w-36 shrink-0">{item.dir}</span>
                  <span className="text-zinc-300 text-sm flex-1">{item.desc}</span>
                  {item.restricted
                    ? <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded font-mono shrink-0">Apenas RFC</span>
                    : <span className="text-xs bg-green-900/20 text-green-400 border border-green-800 px-2 py-0.5 rounded font-mono shrink-0">Task + Review</span>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FIRST RUN ──────────────────────────────────────────────── */}
        {tab === "firstrun" && (
          <div className="space-y-4">
            <SectionTitle icon={Play} text="Capítulo 5 — Primeira Execução" color="green" />
            <CodeBlock code={`# Executar localmente
pnpm dev

# Validar logs
pnpm logs:tail

# Abrir interface
open http://localhost:3000

# Executar todos os testes
pnpm test

# Verificar observabilidade
pnpm audit:trail:check
pnpm metrics:check`} />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Checklist de saúde esperado</h3>
              <div className="space-y-1.5">
                {[
                  "Runtime iniciado na porta 3000",
                  "PostgreSQL conectado",
                  "Redis conectado",
                  "EventBus inicializado",
                  "AuditTrail ativo",
                  "Todos os testes passando",
                ].map(item => (
                  <div key={item} className="flex gap-2 text-sm text-zinc-300">
                    <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" />{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── FIRST TASK ──────────────────────────────────────────────── */}
        {tab === "firsttask" && (
          <div className="space-y-4">
            <SectionTitle icon={Code2} text="Capítulo 6 — Primeira Task" color="violet" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-400 text-xs mb-2">Exemplo: Criar um Memory Validator</p>
              <CodeBlock code={`# 1. Criar branch
git checkout -b feature/memory-validator-email

# 2. Implementar em src/services/validators/

# 3. Executar testes unitários
pnpm test:unit -- EmailMemoryValidator

# 4. Executar MRI
pnpm mri:run

# 5. Executar MQCCS
pnpm mqccs:run

# 6. Executar MERS
pnpm mers:run

# 7. Verificar MADS drift
pnpm mads:check

# 8. Abrir PR
gh pr create --title "feat(validators): add EmailMemoryValidator"`} />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-400 text-xs mb-2">Template de implementação</p>
              <CodeBlock code={`// src/services/validators/EmailMemoryValidator.ts
// MDS Cap.4 — Validation Layer | MRS Cap.3 — Service Contract

import { IMemoryValidator } from '@/core/interfaces/IMemoryValidator';
import { IdentityContext } from '@/runtime/types/IdentityContext';
import { ValidationResult } from '@/runtime/types/ValidationResult';

/**
 * Validates email-type memory entries.
 * @implements IMemoryValidator
 * @see MDS Cap.4
 */
export class EmailMemoryValidator implements IMemoryValidator {
  validate(value: string, ctx: IdentityContext): ValidationResult {
    // implementation
  }
}`} />
            </div>
          </div>
        )}

        {/* ── CI/CD ──────────────────────────────────────────────────── */}
        {tab === "cicd" && (
          <div className="space-y-4">
            <SectionTitle icon={GitBranch} text="Capítulo 7 — CI/CD" color="orange" />
            <div className="space-y-1">
              {CICD_STEPS.map((item, i) => (
                <div key={item.step}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                    <span className="text-zinc-600 font-mono text-xs w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-200">{item.step}</p>
                      <p className="text-xs text-zinc-500 font-mono">{item.cmd}</p>
                    </div>
                    <span className="text-xs text-zinc-500 hidden md:block shrink-0">{item.tool}</span>
                    {item.blocker
                      ? <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded font-mono shrink-0">Bloqueador</span>
                      : <span className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded font-mono shrink-0">Condicional</span>
                    }
                  </div>
                  {i < CICD_STEPS.length - 1 && <div className="flex justify-center py-0.5"><ArrowRight size={10} className="text-zinc-700 rotate-90" /></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ENVIRONMENTS ───────────────────────────────────────────── */}
        {tab === "environments" && (
          <div className="space-y-4">
            <SectionTitle icon={Globe} text="Capítulo 8 — Ambientes" color="cyan" />
            <div className="space-y-2">
              {ENVIRONMENTS.map((env, i) => (
                <div key={env.env}>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                    <span className={`font-mono font-bold text-sm w-20 shrink-0 ${env.color}`}>{env.env}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">{env.goal}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">↑ {env.promote}</p>
                    </div>
                  </div>
                  {i < ENVIRONMENTS.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowRight size={10} className="text-zinc-700 rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI ─────────────────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="space-y-4">
            <SectionTitle icon={Bot} text="Capítulo 9 — Pair Programming com IA" color="violet" />
            <div className="space-y-2">
              {AI_USES.map(item => (
                <div key={item.use} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{item.use}</p>
                    <p className="text-xs text-zinc-500 italic">"{item.example}"</p>
                  </div>
                  {item.review
                    ? <span className="text-xs bg-yellow-900/20 text-yellow-400 border border-yellow-800 px-2 py-0.5 rounded font-mono shrink-0">Revisão obrigatória</span>
                    : <span className="text-xs bg-zinc-800 text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded font-mono shrink-0">Consulta</span>
                  }
                </div>
              ))}
            </div>
            <div className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl p-4">
              <h3 className="text-yellow-300 font-semibold text-sm mb-2">Regras obrigatórias</h3>
              <div className="space-y-1 text-sm">
                {[
                  "Toda sugestão de código deve ser revisada antes do merge",
                  "Nunca aceitar código gerado sem entender o que ele faz",
                  "Nunca usar IA para contornar MRI/MQCCS/MERS",
                  "Código gerado segue os mesmos padrões que código humano",
                  "O desenvolvedor é responsável pelo código, independente da origem",
                ].map(rule => (
                  <div key={rule} className="flex gap-2 text-zinc-400">
                    <ArrowRight size={10} className="text-yellow-400 mt-0.5 shrink-0" />{rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TROUBLESHOOT ───────────────────────────────────────────── */}
        {tab === "troubleshoot" && (
          <div className="space-y-4">
            <SectionTitle icon={AlertCircle} text="Capítulo 10 — Troubleshooting" color="red" />
            <div className="space-y-2">
              {TROUBLESHOOT.map(item => (
                <div key={item.problem} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-red-300">{item.problem}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Causa: {item.cause}</p>
                  <div className="mt-1.5">
                    <CodeBlock code={item.fix} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHECKLIST ──────────────────────────────────────────────── */}
        {tab === "checklist" && (
          <div className="space-y-4">
            <SectionTitle icon={CheckSquare} text="Capítulo 11 — Checklist do Novo Desenvolvedor" color="green" />
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
              <p className="text-zinc-300 text-sm">Progresso de Onboarding</p>
              <span className={`font-mono text-sm font-bold ${doneCount === CHECKLIST_ITEMS.length ? "text-green-400" : "text-zinc-400"}`}>
                {doneCount}/{CHECKLIST_ITEMS.length}
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-2">
              <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${(doneCount / CHECKLIST_ITEMS.length) * 100}%` }} />
            </div>
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item, i) => (
                <button key={item} onClick={() => toggle(i)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    checked[i]
                      ? "bg-green-950/20 border-green-800 text-green-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600"
                  }`}>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${checked[i] ? "bg-green-600 border-green-500" : "border-zinc-600"}`}>
                    {checked[i] && <Check size={11} className="text-white" />}
                  </div>
                  <span className="text-sm">{item}</span>
                </button>
              ))}
            </div>
            {doneCount === CHECKLIST_ITEMS.length && (
              <div className="bg-green-950/30 border border-green-700 rounded-xl p-4 text-center">
                <CheckCircle size={24} className="text-green-400 mx-auto mb-1" />
                <p className="text-green-300 font-bold text-sm">Onboarding concluído!</p>
                <p className="text-zinc-400 text-xs mt-0.5">Pronto para contribuir com o MemoryOS.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}