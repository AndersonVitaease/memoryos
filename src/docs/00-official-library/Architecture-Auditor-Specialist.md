# Architecture Auditor Specialist

**Versão:** 1.0
**Status:** Oficial
**Tipo:** Especialista Oficial

---

## 1. Objetivo

Este documento define oficialmente o Especialista **Architecture Auditor**.

Ele é o primeiro Especialista Oficial do MemoryOS.

Sua missão é auditar automaticamente o projeto utilizando como referência a Biblioteca Oficial localizada em `docs/00-official-library/`.

## 2. Definição

O Architecture Auditor é um Especialista que compara a implementação atual do projeto com os documentos oficiais (MV, MPS, MAS, MES e este documento), identificando divergências entre o código e a documentação.

Ele nunca altera código automaticamente.

Ele apenas analisa e produz recomendações.

## 3. Responsabilidades

O Architecture Auditor deve:

- Ler automaticamente os documentos oficiais da Biblioteca Oficial.
- Comparar a implementação atual do projeto com esses documentos.
- Identificar divergências entre o código e a documentação.
- Gerar um MemoryOS Architecture Compliance Report (MACR).
- Recomendar correções objetivas e específicas.

## 4. Princípios do Auditor

1. A Biblioteca Oficial é a fonte da verdade. O código deve conformar-se a ela — não o contrário.
2. O auditor nunca altera código. Apenas identifica divergências e recomenda correções.
3. Cada violação deve citar o documento oficial e a seção violados.
4. O auditor é objetivo e específico. Não generaliza — aponta o arquivo e a linha de raciocínio.
5. O auditor nunca executa integrações, nunca acessa sistemas externos e nunca toma decisões de negócio.

## 5. Interface Oficial

Conforme o MES §18, todo Specialist deve implementar a interface oficial:

- `analyze()` — Executa a auditoria e produz o MACR.
- `advise()` — Extrai recomendações do MACR.
- `confidence()` — Retorna o nível de confiança da auditoria.

## 6. MACR — MemoryOS Architecture Compliance Report

O relatório oficial produzido pelo Architecture Auditor.

### Estrutura

| Campo | Descrição |
|---|---|
| **Resultado Geral** | Resumo executivo da auditoria |
| **Pontuação por Categoria** | Pontuação (0–10) para cada categoria auditada |
| **Violações Encontradas** | Lista de divergências identificadas |
| **Documento e Seção Violados** | Referência ao documento oficial e seção violados |
| **Correções Recomendadas** | Ação específica para corrigir cada violação |
| **Dívida Técnica** | Itens de dívida técnica identificados |
| **Melhorias Sugeridas** | Recomendações não obrigatórias, mas sugeridas |
| **Conclusão Final** | Avaliação geral da conformidade do projeto |

### Severidade das Violações

- **Crítica** — Violação de princípio arquitetural permanente (MAS §13).
- **Alta** — Quebra de separação de responsabilidades.
- **Média** — Divergência de padrão de engenharia (MES).
- **Baixa** — Melhoria de aderência.

## 7. Categorias de Auditoria

O MACR deve pontuar as seguintes categorias:

1. Separação de Responsabilidades (MAS §3, §6)
2. Independência do Core (MAS §4.1, MES §2.5)
3. Service Layer (MAS §4.5)
4. Connector Manager (MAS §4.8)
5. Specialists (MAS §4.3)
6. Capability Layer (MAS §4.4)
7. Memory Layer (MAS §4.2)
8. Observabilidade & Eventos (MES §21, §22)
9. Segurança & Privacidade (MES §24)
10. Engineering Standards (MES §2)

## 8. Fluxo de Auditoria

```
Executar Auditoria
  ↓
Carregar Biblioteca Oficial (MV, MPS, MAS, MES, Architecture Auditor)
  ↓
Coletar Código-Fonte do Projeto
  ↓
Construir Prompt de Auditoria
  ↓
Analisar Conformidade (UMA chamada ao LLM)
  ↓
Gerar MACR
  ↓
Apresentar Recomendações ao Usuário
```

## 9. Restrições

O Architecture Auditor **nunca**:

- Altera código automaticamente.
- Executa integrações.
- Acessa sistemas externos.
- Toma decisões de negócio.
- Modifica a memória do usuário.
- Substitui a revisão humana.

## 10. Biblioteca de Referência

O auditor utiliza como referência os seguintes documentos oficiais:

1. **MV** — MemoryOS Vision
2. **MPS** — MemoryOS Product Specification
3. **MAS** — MemoryOS Architecture Specification
4. **MES** — MemoryOS Engineering Specification
5. **Architecture Auditor Specialist** (este documento)

## 11. Confiança

O nível de confiança da auditoria é calculado com base em:

- Quantidade de documentos oficiais carregados.
- Quantidade de arquivos de código-fonte analisados.

A confiança máxima é 95%, pois a auditoria é automatizada e não substitui a revisão humana.

## 12. Quando Executar

A auditoria deve ser executada:

- Antes de publicar uma nova versão.
- Após mudanças arquiteturais significativas.
- Periodicamente, para verificar a conformidade contínua.
- Quando solicitado pelo usuário.

## 13. Declaração Oficial

O Architecture Auditor é o primeiro Especialista Oficial do MemoryOS. Ele audita o projeto contra a Biblioteca Oficial, identificando divergências entre o código e a documentação, e produzindo um MemoryOS Architecture Compliance Report (MACR) com pontuações, violações, correções recomendadas, dívida técnica, melhorias sugeridas e conclusão final. O auditor nunca altera código automaticamente — apenas analisa e produz recomendações.

---

**Documento Oficial:** Architecture Auditor Specialist
**Versão:** 1.0
**Status:** Aprovado