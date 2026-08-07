# MemoryOS Developer Specification (MDS)

Version: 2.0
Status: Official
Derived From: MemoryOS Architecture Specification (MAS)
Volume: Foundation Core
Chapter: 02 — Engineering Conventions

---

### 2.1 Objetivo

Este capítulo estabelece as convenções obrigatórias de engenharia utilizadas em todos os componentes do MemoryOS.

Seu objetivo é garantir que todos os módulos apresentem a mesma organização, os mesmos padrões de implementação, a mesma qualidade de código e os mesmos critérios de certificação.

As regras deste capítulo aplicam-se a qualquer módulo da plataforma, independentemente de sua função.

---

### 2.2 Escopo

Estas convenções são obrigatórias para:

- Engines
- Runtimes
- Registries
- Connectors
- SDKs
- Pipelines
- Serviços internos
- Dashboards
- Testes
- Documentação técnica

---

### 2.3 Estrutura Padrão de Módulos

Todo módulo deverá seguir a mesma estrutura de diretórios.

```
src/lib/<module-name>/
  <Module>.ts
  <Module>Types.ts
  <module>Tests.ts
  index.ts
```

Caso exista interface visual:

```
src/pages/
  <Module>Page.jsx
```

---

### 2.4 Convenção de Nomes

| Elemento | Convenção |
|---|---|
| Classes | PascalCase |
| Interfaces | PascalCase |
| Tipos | PascalCase |
| Funções públicas | camelCase |
| Constantes globais | UPPER_SNAKE_CASE |
| Arquivos (classes principais) | PascalCase |
| Arquivos (auxiliares) | camelCase |

---

### 2.5 Imutabilidade

Todo objeto retornado publicamente deverá ser imutável.

Regras obrigatórias:

- utilização de `readonly`;
- utilização de `Object.freeze()` em todos os objetos públicos;
- arrays públicos devem ser `readonly`;
- nunca modificar parâmetros recebidos.

---

### 2.6 Single Responsibility Principle

Cada módulo deverá possuir apenas uma responsabilidade claramente definida.

Um módulo nunca deverá acumular responsabilidades de outros componentes.

**Exemplo:**

```
Planning Engine

Responsabilidade:
  → construir planos.

Não deve:
  → executar;
  → acessar memória;
  → consultar IA;
  → persistir dados.
```

---

### 2.7 Dependency Injection

Sempre que um módulo depender de outro componente interno, essa dependência deverá ser recebida por injeção.

É proibida a criação implícita de componentes dentro da lógica principal.

---

### 2.8 Determinismo

Uma mesma entrada deve produzir exatamente a mesma saída.

Não é permitido:

- comportamento aleatório;
- dependência de ordem de execução;
- efeitos colaterais ocultos.

---

### 2.9 Transparência

Toda decisão importante deverá ser rastreável.

O módulo deverá expor:

- métricas;
- logs;
- health;
- estatísticas.

---

### 2.10 Tratamento de Erros

Erros devem ser:

- explícitos;
- determinísticos;
- descritivos.

Mensagens genéricas como `"Unknown error"` não devem ser utilizadas.

Toda exceção deve informar claramente:

- operação;
- causa;
- contexto.

---

### 2.11 Estado

Todo estado interno deverá permanecer encapsulado.

Objetos internos nunca deverão ser expostos diretamente.

Métodos públicos devem retornar cópias imutáveis.

---

### 2.12 Interfaces Públicas

Toda API pública deve ser pequena, consistente e previsível.

Operações obrigatórias, quando aplicáveis:

- `create`
- `update`
- `delete`
- `resolve`
- `validate`
- `list`
- `statistics`
- `metrics`
- `health`
- `logs`
- `clear`

Cada módulo poderá adicionar operações específicas de sua responsabilidade.

---

### 2.13 Métricas

Todo módulo deverá disponibilizar métricas operacionais.

No mínimo:

- total de operações;
- erros;
- tempo médio;
- quantidade de objetos gerenciados.

---

### 2.14 Health

Todo módulo deverá implementar um método de verificação de integridade.

Estados permitidos:

- `SUCCESS`
- `DEGRADED`
- `FAILED`

O resultado deverá incluir verificações detalhadas sempre que possível.

---

### 2.15 Logging

Operações relevantes deverão gerar registros estruturados.

Cada log deve conter, no mínimo:

- identificador da execução;
- operação;
- timestamp;
- duração;
- status;
- erro (quando existir).

---

### 2.16 Testes

Todo módulo deverá possuir suíte própria de testes.

Padrão mínimo:

- critérios de aceitação;
- cenários de hardening;
- validação de SRP;
- validação de imutabilidade;
- validação de métricas;
- validação de health.

---

### 2.17 Dashboard

Sempre que um módulo possuir interface visual, ela deverá conter:

- execução dos testes;
- estatísticas;
- métricas;
- health;
- arquitetura;
- responsabilidade do módulo;
- status de certificação.

---

### 2.18 Certificação

Um módulo somente poderá ser considerado oficial quando:

- compilar sem erros;
- possuir testes aprovados;
- atender aos princípios definidos no MAS;
- atender às convenções deste capítulo;
- passar pela auditoria arquitetural.

---

### 2.19 Conclusão

As convenções estabelecidas neste capítulo são obrigatórias para todos os módulos do MemoryOS.

Qualquer exceção deverá ser justificada, documentada e aprovada por meio do processo oficial de evolução da arquitetura.

---

*Fim do Capítulo 2*