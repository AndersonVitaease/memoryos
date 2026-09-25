# engineering.image.edit — Presets determinísticos (IMAGE-EDIT-JEV-01)

Fonte de verdade: `IMAGE_EDIT_PRESETS` em `src/imageEditFast.ts`. **Este doc é derivado** — ao
adicionar/mudar um preset, atualize a entrada lá (a doc não é código; o catálogo é dado).

## Como chamar

```jsonc
// rota preset — zero LLM no caminho
{ "preset": "export-png", "params": { "path": "/tmp/export/out.png" } }

// rota jev — composição advisory pelo modelo leve (glm-5.3-flash), validada contra o schema estrito
{ "command": "deixe a imagem em preto e branco" }

// rota direta — payload do executor, schema-strict (imagem 1:1 de src/imageEdit.ts)
{ "action": "export", "output": { "path": "/tmp/out.png", "format": "png", "quality": 95 } }
```

As três rotas são mutuamente exclusivas (falham fechado com `FAST_ROUTE_CONFLICT`/`FAST_ROUTE_MISSING`);
campos de payload do executor (`target`, `output`, `operations`…) só valem na rota direta
(`FAST_ROUTE_FIELDS`). Toda resposta traz `route` e `timing` (estágios em ms) — instrumentação
padrão de cada chamada.

## Princípio anti-rework

Presets são **entrada de config**, não código: adicionar um preset = adicionar um objeto em
`IMAGE_EDIT_PRESETS` (nome, descrição, params declarados, example, sequência de steps). Zero código
novo: a expansão, a interpolação `{{param}}` (preserva tipo no match exato), a validação
schema-strict de cada step e o merge do planner são genéricos. Todo preset novo passa pelo teste
F15 (`test/imageEditFast.test.ts`), que valida cada entrada do catálogo.

## Catálogo (13 presets)

| preset | o que faz | params | steps (ações do executor) |
| --- | --- | --- | --- |
| `inspect` | Snapshot do documento: camadas, dimensões, estado | — | `inspect` |
| `export-png` | Exporta PNG q95 | `path` | `export` |
| `export-jpg` | Exporta JPG q92 | `path` | `export` |
| `export-webp` | Exporta WebP q90 | `path` | `export` |
| `open-doc` | Abre documento (PSD/imagens) | `path` | `document` (op open) |
| `new-doc` | Cria documento novo | `width`, `height` | `document` (op create) |
| `resize-doc` | Redimensiona documento aberto | `width`, `height` | `document` (op resize) |
| `grayscale` | Preto e branco (saturação −100) | — | `adjust` |
| `brightness-contrast` | Brilho + contraste | `brightness`, `contrast` | `adjust` (2 operações) |
| `watermark-corner` | Marca d'água textual | `text`, `color`, `x`, `y` | `compose` (elemento texto) |
| `center-layer` | Centraliza camada alvo | — | `transform` (center both) |
| `hide-layer` | Oculta camada nomeada | `name` | `layers` (op hide) |
| `open-export-png` | **BATCH 2 em 1**: abre e exporta | `source`, `dest` | `document` + `export` |

Os `example` de cada entrada servem como conjunto de parâmetros de teste e documentação
(nomes de parâmetro ≡ chaves do example, invariantes testadas).

## Segurança

- Expansão de preset é **fail-closed**: preset desconhecido (`PRESET_UNKNOWN` + catálogo), parâmetro
  faltando/extra (`PRESET_PARAM_MISSING`/`PRESET_PARAM_UNKNOWN`), step inválido
  (`PRESET_STEP_INVALID`) — tudo antes de qualquer execução.
- Nenhum preset emite algo fora do inventário de 14 ações; a fronteira dura é o schema-strict
  (`imageEditInputSchema`), o mesmo da rota direta — `src/imageEdit.ts` permanece intocado.
- Jev é **advisory**: compõe somente dentro do inventário versionado (`jev-inventory-v1`), a saída é
  revalidada pelo schema-strict e a consequência fora de manifesto permanece humana.
- Falha no meio de uma sequência → envelope `status: "partial"` com contagem honesta
  (`completed`) e status por step — nunca sucesso simulado.