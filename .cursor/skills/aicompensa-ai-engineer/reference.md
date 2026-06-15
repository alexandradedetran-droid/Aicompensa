# AíCompensa AI — Referência

> **Manutenção:** atualize este arquivo ao integrar OpenAI, Gemini ou OCR real. Registre modelo, endpoint, custo e data na seção "Histórico".

## Arquitetura das integrações OpenAI

### Princípios

- **Toda chamada de IA passa pelo `api-server`** — nunca no client React
- **Variáveis de ambiente:** `OPENAI_API_KEY` (server-only, nunca `VITE_*`)
- **Pacote sugerido:** `openai` (SDK oficial Node.js)
- **Local sugerido:** `artifacts/api-server/src/lib/ai/` ou `artifacts/api-server/src/routes/ai/`

### Arquitetura alvo

```
Client (publicar.tsx)
  │ resizeImage() — max 900px, JPEG, ≤ 500 KB base64
  ▼
POST /api/ai/ocr-etiqueta  (ou /api/ofertas/ocr)
  │
  ├─ Rate limit (por IP + userId)
  ├─ Cache (hash SHA-256 da imagem + promptVersion)
  ├─ Timeout (ex.: 15s)
  │
  ▼
OpenAI API
  ├─ Opção barata/rápida: gpt-4o-mini + response_format json_schema
  ├─ Opção OCR-only: não usar — preferir Tesseract ou Gemini Flash
  └─ Fallback: Gemini ou resposta vazia + UX manual
  │
  ▼
Validação Zod → { produto, preco, marca?, categoria? }
  │
  ▼
Client preenche form — usuário confirma antes de publicar
```

### Modelos OpenAI recomendados (AíCompensa)

| Caso de uso | Modelo | Por quê |
|-------------|--------|---------|
| Extração de etiqueta (fallback LLM) | `gpt-4o-mini` | Barato, JSON mode, boa precisão em texto curto |
| Layout complexo / múltiplos campos | `gpt-4o` | Maior precisão, usar só se mini falhar |
| Vision desnecessário | — | Preferir OCR tradicional |

### Estimativa de custo (referência)

Documentar no AI Brief antes de deploy. Exemplo orientativo (valores mudam — consultar pricing oficial):

| Modelo | Input ~ | Output ~ | Etiqueta típica (~1K tokens) |
|--------|---------|----------|------------------------------|
| gpt-4o-mini | $0.15/1M | $0.60/1M | ~$0.001–0.003/requisição |
| gpt-4o | $2.50/1M | $10/1M | ~$0.01–0.03/requisição |

**Meta operacional:** manter OCR de etiqueta abaixo de R$ 0,05/requisição em escala.

---

## Arquitetura Gemini

### Princípios

- **Variável:** `GEMINI_API_KEY` (server-only)
- **Pacote sugerido:** `@google/generative-ai`
- **Usar como:** alternativa mais barata/rápida ou fallback do OpenAI

### Arquitetura alvo

```
api-server
  │
  ▼
Gemini 2.0 Flash (ou Flash-Lite)
  ├─ OCR de etiqueta: prompt + imagem → JSON
  ├─ Lista manuscrita: Flash com instrução de incerteza
  └─ Fallback quando OpenAI timeout/429/5xx
  │
  ▼
Mesmo schema Zod de saída (interoperabilidade entre providers)
```

### Modelos Gemini recomendados

| Caso de uso | Modelo | Por quê |
|-------------|--------|---------|
| OCR etiqueta | `gemini-2.0-flash` | Rápido, barato, multimodal |
| Lista manuscrita | `gemini-2.0-flash` | Tolera handwriting melhor que OCR puro |
| Fallback leve | `gemini-2.0-flash-lite` | Menor custo, menor precisão |

### Fallback entre modelos

```
1. Cache hit? → retornar
2. OCR tradicional (Tesseract) → se confiança > 85%, retornar
3. Gemini Flash → validar Zod
4. Se falhar → OpenAI gpt-4o-mini
5. Se falhar → retornar { sucesso: false, preencherManual: true }
```

Nunca encadear mais de 2 modelos pagos por requisição.

---

## Fluxo OCR

### Etiquetas de supermercado (caso principal)

```
1. Usuário tira foto no /publicar
2. Client: resizeImage() — max 900px, JPEG q=0.78→0.20, ≤ 500 KB
3. POST imagem (base64) para api-server
4. Server:
   a. Validar tamanho (MAX_FOTO_B64_CHARS = 500 * 1024)
   b. Rate limit
   c. Cache lookup (hash imagem)
   d. OCR tradicional OU LLM Vision
   e. Validar JSON com Zod
5. Retornar campos sugeridos
6. Client: toast "Confira e ajuste" — usuário edita e confirma
7. POST /api/ofertas com dados finais (humano no loop)
```

### Campos extraídos (schema sugerido)

```typescript
const OcrEtiquetaSchema = z.object({
  produto:   z.string().min(2),
  preco:     z.number().positive(),
  marca:     z.string().optional(),
  categoria: z.string().optional(),
  confianca: z.number().min(0).max(1).optional(),
});
```

### OCR de listas manuscritas (futuro)

- Maior risco de alucinação → exigir `confianca` por item
- Retornar array `{ items: [{ produto, preco?, confianca }] }`
- UX: revisão item a item, nunca auto-publicar
- Preferir Gemini Flash (melhor custo/benefício para handwriting)

---

## Fluxo Vision

### Quando usar Vision/LLM multimodal

| Cenário | OCR tradicional | Vision/LLM |
|---------|-----------------|------------|
| Etiqueta térmica legível | ✅ Preferir | ❌ |
| Etiqueta amassada/desbotada | ⚠️ Tentar OCR | ✅ Se OCR falhar |
| Foto do produto (sem etiqueta) | ❌ | ✅ Identificar produto |
| Lista manuscrita | ❌ | ✅ |
| Shelf tag com layout complexo | ⚠️ | ✅ |

### Quando NÃO usar Vision

- Texto já legível por OCR → custo 10–50× maior sem ganho
- Imagem > 500 KB sem compressão → comprimir primeiro
- Usuário pode digitar em < 30s → IA não compensa

---

## Checklist antes do deploy

```
Funcionalidade
- [ ] AI Brief documentado (modelo, custo, riscos)
- [ ] Schema Zod para resposta validado
- [ ] Campos obrigatórios definidos e testados
- [ ] Usuário confirma dados antes de publicar (human-in-the-loop)
- [ ] Mock/simulação removido ou feature-flagged

Resiliência
- [ ] Timeout configurado (≤ 15s OCR etiqueta)
- [ ] Retry com backoff (max 2 tentativas, só erros 5xx/429)
- [ ] Fallback de modelo definido
- [ ] Cache por hash de imagem + versão do prompt
- [ ] Rate limit por IP e userId

Imagem
- [ ] Compressão client-side antes do upload (900px, JPEG)
- [ ] Validação server-side MAX_FOTO_B64_CHARS (500 KB)
- [ ] Resolução suficiente para OCR (min ~800px no lado maior recomendado)

Observabilidade
- [ ] Log de latência, modelo usado, cache hit/miss
- [ ] Log de custo estimado por requisição
- [ ] Métrica de taxa de preenchimento aceito pelo usuário
- [ ] Alerta se custo diário > limite configurado

Integração
- [ ] API keys só no server (.env, nunca commitadas)
- [ ] Rota registrada em artifacts/api-server/src/routes/
- [ ] Contrato OpenAPI atualizado (lib/api-spec) se endpoint público
- [ ] typecheck e build passando
```

---

## Checklist de segurança

```
- [ ] API keys em variáveis de ambiente server-side apenas
- [ ] Nunca logar imagem base64 completa nem resposta bruta com PII
- [ ] Rate limiting anti-abuso (OCR é vetor de custo)
- [ ] Validar MIME type e tamanho antes de processar
- [ ] Sanitizar strings extraídas antes de persistir no DB
- [ ] Não confiar em preço extraído sem confirmação humana
- [ ] Prompt injection: instruções fixas no system prompt, imagem como user content
- [ ] Limitar tamanho do prompt + imagem (token budget)
- [ ] Feature flag para desligar IA rapidamente se custo disparar
- [ ] Rotacionar keys se expostas; nunca em VITE_* ou client bundle
```

---

## Checklist de custos

```
Antes de implementar
- [ ] Custo por requisição estimado (input + output tokens)
- [ ] Volume esperado: ofertas/dia × % que usa OCR
- [ ] Custo mensal projetado = volume × custo unitário
- [ ] Comparar: OCR tradicional vs Gemini Flash vs OpenAI mini

Após deploy
- [ ] Dashboard ou log agregado de custo diário
- [ ] Cache hit rate > 20% (fotos duplicadas de mesma etiqueta)
- [ ] % requisições resolvidas no 1º modelo (sem fallback caro)
- [ ] Limite hard: desabilitar IA se custo/dia > threshold
- [ ] Revisar mensalmente: modelo ainda é o mais barato?
```

### Projeção exemplo (500 ofertas/mês, 60% usa OCR)

| Cenário | Custo unitário | Custo mensal |
|---------|----------------|--------------|
| Gemini Flash | ~$0.001 | ~$0.30 |
| gpt-4o-mini | ~$0.002 | ~$0.60 |
| gpt-4o (sem fallback) | ~$0.02 | ~$6.00 |

---

## Exemplos de prompts reutilizáveis

### OCR de etiqueta (system)

```
Você extrai dados de etiquetas de supermercado brasileiras.
Retorne APENAS JSON válido, sem markdown.
Campos: produto (string), preco (number, BRL), marca (string opcional), categoria (string opcional).
Se não conseguir ler o preço com confiança, omita preco.
Nunca invente dados que não estejam visíveis na imagem.
```

### OCR de etiqueta (user — com imagem)

```
Extraia produto, preço, marca e categoria desta foto de etiqueta.
Preço em reais (R$). Use ponto para decimais no JSON (ex.: 12.99).
```

### Lista manuscrita

```
Esta imagem contém uma lista de compras manuscrita em português.
Retorne JSON: { "items": [{ "produto": string, "preco": number|null, "confianca": 0-1 }] }.
Use confianca < 0.7 quando a leitura for incerta.
Não invente preços ausentes — use null.
```

### Validação pós-extração (sem imagem — barato)

```
Dado este JSON extraído de uma etiqueta: { ... }
Valide: produto faz sentido? preco é plausível (0.01–9999)?
Retorne { "valido": boolean, "motivo": string|null }.
```

### Normalização de produto (sem IA — preferir código)

Usar `normalizeProductName()` em `artifacts/api-server/src/lib/dedup.ts` — **não usar LLM** para normalização.

---

## Histórico das integrações utilizadas no projeto

| Data | Integração | Status | Arquivo / notas |
|------|------------|--------|-----------------|
| 2026-06 | Compressão client-side | ✅ Ativo | `publicar.tsx` — `resizeImage()`, max 900px, JPEG progressivo, ≤ 500 KB |
| 2026-06 | OCR simulado (mock) | ⚠️ Placeholder | `publicar.tsx` — `setTimeout(1600ms)`, sem extração real |
| 2026-06 | Normalização de produto | ✅ Ativo | `dedup.ts` — `normalizeProductName()`, sem IA |
| — | OpenAI | ❌ Não integrado | Planejado: api-server, server-only |
| — | Gemini | ❌ Não integrado | Planejado: fallback / opção barata |
| — | Tesseract / OCR tradicional | ❌ Não integrado | Avaliar antes de Vision |
| — | Cache de OCR | ❌ Não integrado | Hash imagem + promptVersion |
| — | Rate limit IA | ❌ Não integrado | Por IP + userId |

> Ao integrar, adicionar linha com: data, modelo, endpoint, custo medido e PR/commit.

---

## Boas práticas de Prompt Engineering

### Estrutura

1. **System prompt fixo** — regras, formato JSON, proibição de inventar dados
2. **User content** — imagem + instrução mínima
3. **Schema enforcement** — `response_format: json_schema` (OpenAI) ou instrução + Zod pós-validação

### Reduzir alucinação

- Instruir: "Nunca invente dados que não estejam visíveis"
- Retornar `confianca` quando aplicável
- Human-in-the-loop: usuário sempre confirma antes de publicar
- Validar preço com regras (range 0.01–9999, formato BRL)

### Reduzir inconsistência

- Temperatura baixa (0–0.2) para extração
- Schema Zod rígido; rejeitar e retry uma vez se inválido
- Versionar prompts (`promptVersion` no cache key)

### Reduzir custo

- Comprimir imagem antes de enviar (já implementado no client)
- Cache por hash da imagem
- OCR tradicional primeiro; LLM só se necessário
- Modelo menor (Flash, gpt-4o-mini) como default
- Não reprocessar mesma imagem sem cache miss

### Reduzir latência

- Timeout agressivo (15s) + fallback rápido
- Resposta parcial aceitável (só produto + preço, resto manual)
- Processar no server próximo ao usuário (futuro: região sa-east)

---

## Onde procurar no código

| Tarefa | Onde buscar |
|--------|-------------|
| Upload e compressão de foto | `artifacts/comparador-precos/src/pages/publicar.tsx` |
| Limite de foto no backend | `artifacts/api-server/src/routes/ofertas.ts` — `MAX_FOTO_B64_CHARS` |
| Normalização de produto | `artifacts/api-server/src/lib/dedup.ts` |
| Novas rotas de IA | `artifacts/api-server/src/routes/` (criar `ai.ts` ou similar) |
| Lib compartilhada de IA | `artifacts/api-server/src/lib/ai/` (criar) |
| Validação Zod | `lib/api-zod/` ou schema local no route |

---

## Exemplos de prompts para usar esta skill

```
@aicompensa-ai-engineer Quero implementar OCR real de etiqueta no /publicar.
Compare Gemini Flash vs gpt-4o-mini vs Tesseract. AI Brief completo.
```

```
@aicompensa-ai-engineer A OCR simulada precisa virar produção.
Defina arquitetura, custo estimado e checklists antes de codar.
```

```
@aicompensa-ai-engineer @aicompensa-architect
Implementar POST /api/ai/ocr-etiqueta com cache, rate limit e fallback Gemini→OpenAI.
```
