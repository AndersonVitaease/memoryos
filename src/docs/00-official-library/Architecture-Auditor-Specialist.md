# Architecture Auditor Specialist

**Versão:** 2.0
**Status:** Oficial
**Tipo:** Especialista Oficial

---

## 1. Objetivo

Este documento define oficialmente o Especialista **Architecture Auditor**.

Ele é o primeiro Especialista Oficial do MemoryOS.

Sua missão é auditar automaticamente o projeto utilizando como referência a Biblioteca Oficial localizada em `docs/00-official-library/`.

## 2. Definição

O Architecture Auditor é um **Specialist**. Como todo Specialist do MemoryOS (MAS §4.3, MES §18), ele:

- interpreta;
- analisa;
- compara;
- recomenda.

Ele nunca executa responsabilidades pertencentes a outras camadas.

Ele nunca altera código automaticamente.

Ele apenas analisa e produz recomendações.

## 3. Separação de Responsabilidades

O Specialist **NÃO** acessa diretamente:

- filesystem;
- `fs`;
- `glob`;
- `path`;
- diretórios;
- arquivos;
- a Biblioteca Oficial.

Essas responsabilidades pertencem às **Capabilities** (MAS §4.4). O Specialist apenas solicita essas capacidades.

## 4. Capabilities Oficiais

O Architecture Auditor orquestra quatro Capabilities oficiais:

### 4.1 ProjectReaderCapability

Responsável por:

- ler projeto;
- ler módulo;
- ler pasta;
- ler arquivo;
- ler Pull Request.

Ela é a **única** responsável por acessar o código.

### 4.2 OfficialLibraryReaderCapability

Responsável por carregar automaticamente a Biblioteca Oficial (`docs/00-official-library/`).

Documentos:

- MV
- MPS
- MAS
- MES
- Architecture Auditor Specialist

O Specialist nunca abre esses arquivos diretamente.

### 4.3 CodeAnalyzerCapability

Responsável por:

- dividir o projeto em módulos;
- comparar código e documentação;
- identificar violações;
- consolidar resultados.

Ela **nunca** gera relatórios.

### 4.4 ReportBuilderCapability

Responsável por gerar o MemoryOS Architecture Compliance Report (MACR).

Ela recebe apenas o resultado consolidado da análise.

## 5. Interface Oficial do Specialist

Conforme MES §18, o Specialist implementa apenas:

```
interface Specialist {
  analyze()
  advise()
  confidence()
}
```

Nenhum método adicional para acesso direto ao projeto deve existir dentro do Specialist.

## 6. Interface Oficial das Capabilities

Conforme MES §19, toda Capability implementa:

```
interface Capability<TInput, TOutput> {
  id: string
  name: string
  execute(input: TInput): Promise<TOutput>
  validate(input: TInput): Promise<boolean>
}
```

Nenhuma Capability deve utilizar interfaces próprias.

## 7. Fluxo Oficial

```
Usuário
  ↓
Architecture Auditor (Specialist)
  ↓
ProjectReaderCapability
  ↓
OfficialLibraryReaderCapability
  ↓
CodeAnalyzerCapability
  ↓
ReportBuilderCapability
  ↓
MACR
  ↓
Usuário
```

Esse fluxo substitui qualquer implementação onde o Specialist leia arquivos diretamente.

## 8. Pipeline de Auditoria

A análise substitui a chamada única ao LLM por um pipeline escalável:

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

O sistema está preparado para projetos grandes, dividindo o código em lotes que respeitam o orçamento de contexto do LLM.

## 9. Níveis de Auditoria

O Architecture Auditor suporta quatro níveis, todos utilizando exatamente o mesmo pipeline:

1. **Arquivo** — um arquivo específico.
2. **Pasta/Módulo** — uma pasta ou módulo.
3. **Projeto Completo** — todo o projeto.
4. **Pull Request** — arquivos alterados.

## 10. MACR — MemoryOS Architecture Compliance Report

Formato oficial:

| Campo | Descrição |
|---|---|
| **Resultado Geral** | Veredito da auditoria |
| **Resumo Executivo** | Síntese dos achados relevantes |
| **Pontuação por categoria** | Pontuação (0–10) por categoria |
| **Violações** | Lista de divergências |
| **Documento violado** | Documento oficial violado (ex: MAS, MES) |
| **Seção violada** | Seção violada (ex: §4.1) |
| **Impacto** | Descrição do impacto da violação |
| **Correção recomendada** | Ação específica para corrigir |
| **Prioridade** | crítica, alta, média ou baixa |
| **Riscos arquiteturais** | Riscos identificados |
| **Dívida técnica** | Itens de dívida técnica |
| **Melhorias recomendadas** | Recomendações não obrigatórias |
| **Documentação a atualizar** | Documentos que precisam ser atualizados |
| **Conclusão** | Avaliação geral da conformidade |

## 11. Restrições

O Architecture Auditor **nunca**:

- Altera código automaticamente.
- Acessa filesystem diretamente.
- Acessa a Biblioteca Oficial diretamente.
- Gera relatórios (responsabilidade do ReportBuilder).
- Executa integrações.
- Acessa sistemas externos.
- Toma decisões de negócio.
- Modifica a memória do usuário.
- Substitui a revisão humana.

## 12. Confiança

O nível de confiança da auditoria é calculado com base em:

- Quantidade de documentos oficiais carregados.
- Quantidade de arquivos de código-fonte analisados.

A confiança máxima é 95%, pois a auditoria é automatizada e não substitui a revisão humana.

## 13. Página de Auditoria

A página "Auditoria" utiliza o Architecture Auditor **apenas** através da interface oficial do Specialist (`analyze()`).

Ela **nunca** acessa diretamente:

- filesystem;
- Biblioteca Oficial;
- Capabilities.

Toda orquestração acontece pelo Specialist, que por sua vez orquestra as Capabilities.

## 14. Declaração Oficial

O Architecture Auditor é o primeiro Especialista Oficial do MemoryOS. Ele audita o projeto contra a Biblioteca Oficial, orquestrando quatro Capabilities oficiais (ProjectReader, OfficialLibraryReader, CodeAnalyzer, ReportBuilder) num pipeline modular e escalável. O Specialist implementa apenas `analyze()`, `advise()` e `confidence()`, nunca acessando arquivos diretamente. Ele nunca altera código — apenas analisa e produz recomendações no formato MACR oficial.

---

**Documento Oficial:** Architecture Auditor Specialist
**Versão:** 2.0
**Status:** Aprovado