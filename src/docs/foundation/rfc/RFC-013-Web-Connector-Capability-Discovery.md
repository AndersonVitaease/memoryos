# RFC-013 — Web Connector: Motor de Descoberta de Capabilities (Frente B)

**Status:** Draft (spike de validação antes de comprometer implementação completa)
**ADR relacionada:** ADR-019
**RFC dependente:** RFC-012 (precisa de uma `WebSession` ativa para explorar)
**Sprints:** WEB-CONN-02 (spike), WEB-CONN-03 (se validado)
**Data:** 2026-08-09
**Autores:** Anderson (arquitetura), MemoryOS Engineering (Claude)

---

## Contexto

Depois que existe uma sessão autenticada (RFC-012), o Web Connector precisa **descobrir quais operações o sistema permite** (buscar, criar, cancelar, consultar) sem que um humano precise mapear isso manualmente para cada site.

Este é o item de **maior risco de engenharia** do plano inteiro: é um motor LLM+Playwright decidindo ações a partir de snapshots de acessibilidade, similar em mecânica ao que `bugHunterRun` já faz — mas com objetivo completamente diferente (catalogar operações, não achar bugs) e critério de segurança mais rígido (nunca executar escrita durante a exploração).

### Reaproveitamento explícito, sem edição do original

O padrão de loop "LLM decide ação a partir de snapshot → executa via Playwright MCP → avalia resultado → repete" já está validado em produção em `bugHunterRun/entry.ts`. Este RFC **reaproveita o padrão como referência de design**, implementado em arquivo próprio (`webConnectorDiscover/entry.ts`) — o arquivo original de Bug Hunter não é lido em runtime por este código nem editado.

---

## Escopo funcional

1. A partir de uma `WebSession` ativa, o motor navega a aplicação autenticada.
2. Para cada tela/fluxo, identifica candidatos a capability (ex: um formulário de busca vira candidato a `reservation.search`).
3. **Uma capability não é válida só por existir um botão na interface** — precisa de validação antes de virar oficial.
4. Validação = execução em modo seguro (somente leitura, ou dry-run quando o site expõe algo equivalente a preview/confirmação antes de submeter) confirmando que a estrutura da operação (campos de entrada, formato de saída) é a esperada.
5. Capabilities validadas entram no `CapabilityMap` do site — reutilizável por qualquer outra empresa que conecte o mesmo sistema (ex: qualquer cliente Wooba usa o mesmo mapa, cada um com sua própria `WebSession`).

---

## Modelo de dados

### Entidade `CapabilityCandidate`

```jsonc
{
  "name": "CapabilityCandidate",
  "type": "object",
  "properties": {
    "web_session_id": { "type": "string", "description": "Sessão usada na exploração que originou este candidato" },
    "site_url": { "type": "string" },
    "suggested_id": { "type": "string", "description": "ex: 'reservation.search', 'passenger.search'" },
    "evidence": { "type": "string", "description": "JSON: snapshot/seletor/fluxo que originou a sugestão" },
    "status": { "type": "string", "enum": ["candidate", "validating", "validated", "rejected"], "default": "candidate" },
    "validation_notes": { "type": "string" }
  },
  "required": ["site_url", "suggested_id", "status"]
}
```

### Entidade `CapabilityMap`

```jsonc
{
  "name": "CapabilityMap",
  "type": "object",
  "properties": {
    "site_url": { "type": "string" },
    "site_name": { "type": "string" },
    "capabilities": { "type": "string", "description": "JSON array de capabilities validadas: {id, description, inputSchema, outputSchema, discoveredFrom}" },
    "version": { "type": "number", "default": 1 },
    "last_validated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["site_url", "capabilities"]
}
```

---

## Regra de segurança inegociável

**Durante a fase de descoberta, o motor nunca executa ações de escrita/submissão real** (criar reserva, cancelar, enviar formulário) — apenas leitura, navegação, e inspeção de estrutura (ex: abrir um formulário e inspecionar campos, sem clicar em "Enviar"). Ações de escrita só são executadas depois de:
1. O candidato estar `validated`
2. Um humano confirmar explicitamente que aquela capability pode ser promovida para uso real (gate manual no MVP; automação de validação fica para depois do spike)

---

## Critério de sucesso do spike (Sprint WEB-CONN-02)

Rodar o motor de descoberta contra **1 site de teste real, de baixo risco** (não produção crítica — a definir com Anderson). Sucesso significa:
- [ ] Pelo menos 2-3 capabilities candidatas descobertas corretamente batem com o que existe de verdade no site (validação manual do Anderson)
- [ ] Nenhuma ação de escrita foi executada durante a exploração
- [ ] O `CapabilityMap` resultante é legível e faz sentido como especificação de API

**Se o critério não for atingido:** esta frente pausa. Capabilities passam a ser cadastradas manualmente no `CapabilityMap` como fallback seguro — isso **não bloqueia** RFC-012 nem RFC-014, que continuam funcionando com capabilities cadastradas à mão.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Falso positivo: candidato parece uma capability mas não é (ex: botão decorativo) | Etapa de validação obrigatória antes de `validated`; nunca pular direto de `candidate` para uso real |
| LLM tenta executar ação destrutiva durante exploração | Regra de segurança acima é enforced no código, não só no prompt — o motor não deve ter acesso a tools de submit/write nesta fase, por design, não por instrução |
| Custo de chamadas LLM por exploração | Mesmo princípio do doc de Anderson: LLM decide o objetivo da exploração, não cada clique — o loop usa heurísticas determinísticas (ex: listar todos os forms da página) sempre que possível antes de chamar o LLM |

---

## Fora de escopo

- Execução de capabilities validadas em produção → RFC-014
- Cadastro manual de capabilities como fallback → mecanismo simples, não precisa de RFC próprio

---

*RFC-013 — Web Connector: Descoberta de Capabilities — 2026-08-09 — Draft*
