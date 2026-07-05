# Architecture Auditor Specialist

**Versão:** 3.0
**Status:** Oficial — Estável
**Tipo:** Especialista Oficial

---

## 1. Objetivo

Este documento define oficialmente o Especialista **Architecture Auditor**.

Ele é o primeiro Especialista Oficial do MemoryOS.

Sua missão é auditar automaticamente o projeto utilizando como referência a Biblioteca Oficial localizada em `docs/00-official-library/`.

## 2. Definição

O Architecture Auditor é um **Specialist**. Como todo Specialist do MemoryOS (MAS §4.3, MES §18), ele:

- interpreta;
- coordena;
- compara;
- recomenda.

Ele nunca:

- lê arquivos;
- chama APIs;
- acessa filesystem;
- gera relatórios;
- conhece Providers.

## 3. Separação de Responsabilidades

O Specialist **NÃO** acessa diretamente:

- filesystem;
- `fs`;
- `glob`;
- `path`;
- diretórios;
- arquivos;
- a Biblioteca Oficial;
- AI Providers.

Toda leitura ocorre exclusivamente através das **Capabilities** oficiais (MAS §4.4). Toda comunicação com LLM ocorre exclusivamente através da interface **AIProvider** (MES §17). Toda autorização ocorre exclusivamente através do **PolicyEngine** (MAS §4.6).

## 4. Capabilities Oficiais

### 4.1 ProjectReaderCapability (v1.0)

Responsável apenas por ler o projeto, módulo, pasta, arquivo ou Pull Request.

### 4.2 OfficialLibraryReaderCapability (v1.0)

Responsável apenas por carregar a Biblioteca Oficial.

### 4.3 CodeAnalyzerCapability (v1.0)

Responsável apenas pela análise arquitetural — dividir em módulos, comparar código e documentação, identificar violações e consolidar resultados. Nunca gera relatórios.

### 4.4 ReportBuilderCapability (v1.0)

Responsável apenas pela construção do MACR. Recebe apenas o resultado consolidado da análise.

## 5. AI Provider Interface

Conforme MES §17, a interface oficial:

```
interface AIProvider {
  id: string
  name: string
  version: string
  chat(prompt, schema?): Promise<any>
  summarize(text): Promise<string>
  embeddings(text): Promise<number[]>
}
```

Implementações oficiais:

- **Base44Provider** (v1.0) — ativo no Beta.
- **OpenAIProvider** (v1.0) — stub para futura ativação.
- **AnthropicProvider** (v1.0) — stub para futura ativação.

CodeAnalyzer e ReportBuilder **nunca** conhecem Base44 diretamente. Recebem apenas uma instância de AIProvider.

## 6. Policy Engine

Conforme MAS §4.6, a interface oficial:

```
interface PolicyEngine {
  authorize(request): Promise<{ allow: boolean, reason?: string }>
}
```

**Stub oficial (v1.0):** `authorize()` retorna sempre `{ allow: true }`.

Implementação completa fica para uma fase futura. O objetivo é preservar a arquitetura oficial.

## 7. Contrato Oficial Request/Response

Conforme MES §5 e §6, todas as Capabilities utilizam o contrato padronizado. Nenhuma Capability recebe parâmetros livres.

### Request

```json
{
  "requestId": "",
  "conversationId": "",
  "userId": "",
  "goal": "",
  "context": {},
  "memory": {},
  "metadata": {}
}
```

### Response

```json
{
  "status": "",
  "result": {},
  "events": [],
  "logs": [],
  "memoryUpdates": []
}
```

## 8. Interface Oficial do Specialist

Conforme MES §18, o Specialist implementa apenas:

```
interface Specialist {
  analyze()
  advise()
  confidence()
}
```

Nenhum método adicional para acesso direto ao projeto deve existir dentro do Specialist.

## 9. Versionamento Oficial

Todas as Capabilities e o Specialist possuem versão oficial:

| Componente | Versão |
|---|---|
| Architecture Auditor (Specialist) | 1.0 |
| ProjectReaderCapability | 1.0 |
| OfficialLibraryReaderCapability | 1.0 |
| CodeAnalyzerCapability | 1.0 |
| ReportBuilderCapability | 1.0 |
| Base44Provider | 1.0 |
| OpenAIProvider | 1.0 (stub) |
| AnthropicProvider | 1.0 (stub) |
| PolicyEngine | 1.0 (stub) |

## 10. Eventos de Auditoria

Conforme MES §22 e Correção 5, infraestrutura mínima de eventos:

- `audit.started` — emitido ao iniciar a auditoria.
- `audit.completed` — emitido ao concluir com sucesso.
- `audit.failed` — emitido em caso de falha.

Não há Event Bus completo — apenas emissão de eventos. A implementação completa fica para uma fase futura.

## 11. Pipeline Oficial

```
Usuário
  ↓
Architecture Auditor (Specialist)
  ↓
ProjectReaderCapability
  ↓
OfficialLibraryReaderCapability
  ↓
PolicyEngine
  ↓
CodeAnalyzerCapability
  ↓
ReportBuilderCapability
  ↓
MACR
  ↓
Usuário
```

Nenhuma etapa pode ser ignorada.

## 12. Pipeline de Análise

```
Projeto
  ↓
Indexação
  ↓
Divisão em módulos
  ↓
Análise módulo por módulo
  ↓
Consolidação
  ↓
Geração do MACR
```

## 13. Níveis de Auditoria

1. **Arquivo** — um arquivo específico.
2. **Pasta/Módulo** — uma pasta ou módulo.
3. **Projeto Completo** — todo o projeto.
4. **Pull Request** — arquivos alterados.

## 14. MACR — Formato Oficial

| Campo | Descrição |
|---|---|
| Resultado Geral | Veredito da auditoria |
| Resumo Executivo | Síntese dos achados |
| Pontuação por categoria | Pontuação (0–10) por categoria |
| Violações | Lista de divergências |
| Documento violado | Documento oficial violado |
| Seção violada | Seção violada |
| Impacto | Descrição do impacto |
| Correção recomendada | Ação específica |
| Prioridade | crítica, alta, média ou baixa |
| Riscos arquiteturais | Riscos identificados |
| Dívida técnica | Itens de dívida técnica |
| Melhorias recomendadas | Recomendações não obrigatórias |
| Documentação a atualizar | Documentos que precisam ser atualizados |
| Conclusão | Avaliação geral da conformidade |

## 15. Restrições

O Architecture Auditor **nunca**:

- Altera código automaticamente.
- Acessa filesystem diretamente.
- Acessa a Biblioteca Oficial diretamente.
- Conhece AI Providers diretamente.
- Gera relatórios (responsabilidade do ReportBuilder).
- Executa integrações.
- Acessa sistemas externos.
- Toma decisões de negócio.
- Modifica a memória do usuário.
- Substitui a revisão humana.

## 16. Confiança

Máximo 95% — auditoria automatizada não substitui revisão humana.

## 17. Declaração Oficial

O Architecture Auditor é o primeiro Especialista Oficial do MemoryOS. Ele audita o projeto contra a Biblioteca Oficial, orquestrando quatro Capabilities oficiais (ProjectReader, OfficialLibraryReader, CodeAnalyzer, ReportBuilder), um PolicyEngine (stub) e uma AIProvider Interface — num pipeline modular, escalável e totalmente desacoplado de Base44. O Specialist implementa apenas `analyze()`, `advise()` e `confidence()`, nunca acessando arquivos, Providers ou filesystem diretamente. Ele nunca altera código — apenas analisa e produz recomendações no formato MACR oficial. Esta versão (3.0) é considerada estável e pronta para uso como primeiro Especialista Oficial do MemoryOS.

---

**Documento Oficial:** Architecture Auditor Specialist
**Versão:** 3.0
**Status:** Aprovado — Estável