# AíCompensa Growth — Referência

> **Manutenção:** atualize metas e métricas conforme o produto evoluir (ex.: após atingir 1.000 usuários).

## Metas de crescimento

### Fase atual — primeiros 1.000 usuários

| Meta | Alvo | Horizonte sugerido |
|------|------|-------------------|
| Usuários registrados | 1.000 | Marco principal da fase |
| Ofertas reais publicadas | Crescimento semanal contínuo | Base do valor do produto |
| Retenção semanal (W1) | ≥ 25% dos novos usuários voltam na semana 2 | Sinal de product-market fit local |
| Contribuidores ativos | ≥ 10% dos usuários publicam ≥ 1 oferta/mês | Comunidade auto-sustentável |
| Compartilhamentos | ≥ 1 compartilhamento por 5 usuários ativos/semana | Loop viral orgânico |
| Indicações convertidas | ≥ 15% dos novos usuários via indicação | Canal de aquisição barato |

### Objetivos estratégicos (ordem de prioridade)

1. **Ofertas reais** — sem ofertas, não há produto
2. **Retenção semanal** — usuário que volta encontra valor novo
3. **Compartilhamento** — cada oferta boa é um anúncio gratuito
4. **Indicação** — transformar usuários satisfeitos em embaixadores
5. **Contribuidores ativos** — usuários que publicam viram multiplicadores
6. **Monetização futura** — só após massa crítica e confiança (parcerias locais, destaque pago para lojistas)

## Métricas principais

### Aquisição

| Métrica | Definição | Onde medir |
|---------|-----------|------------|
| Novos usuários/dia | Cadastros únicos | Auth / analytics |
| Fonte de aquisição | Orgânico, indicação, QR local, compartilhamento | UTM / referral code |
| CAC efetivo | Custo de campanha ÷ novos usuários | Campanhas locais |

### Ativação

| Métrica | Definição | Meta inicial |
|---------|-----------|--------------|
| Time to first value | Tempo até ver ou salvar 1ª oferta | < 2 min |
| Primeira oferta publicada | % novos que publicam em 7 dias | ≥ 5% |
| Onboarding completo | % que conclui fluxo inicial | ≥ 60% |

### Retenção

| Métrica | Definição | Meta inicial |
|---------|-----------|--------------|
| DAU / MAU | Usuários ativos diários vs mensais | Crescimento mês a mês |
| Retenção D7 | % que volta 7 dias após cadastro | ≥ 20% |
| Retenção W1→W2 | % que volta na 2ª semana | ≥ 25% |
| Sessões/usuário/semana | Frequência de uso | ≥ 2 |

### Engajamento e contribuição

| Métrica | Definição | Meta inicial |
|---------|-----------|--------------|
| Ofertas publicadas/semana | Total de ofertas novas | Tendência crescente |
| Ofertas por contribuidor | Média entre quem publica | ≥ 2/mês |
| Taxa de validação | Ofertas aprovadas ÷ enviadas | ≥ 70% |
| Votos/comentários por oferta | Interação da comunidade | Crescimento orgânico |

### Viralização

| Métrica | Definição | Meta inicial |
|---------|-----------|--------------|
| Compartilhamentos/oferta | Shares por oferta publicada | ≥ 0,3 |
| K-factor (indicação) | Convites × taxa de conversão | > 0,5 (aspiracional) |
| Instalações PWA via link | Installs originados de share | Rastrear deep links |

### Qualidade (anti-spam)

| Métrica | Definição | Alerta |
|---------|-----------|--------|
| Ofertas rejeitadas | % rejeitadas por moderação | > 30% = problema de UX ou incentivo errado |
| Contas flagadas | Suspeita de fraude/indicação fake | Investigar mecanismo de recompensa |

## Funcionalidades prioritárias

Ordem sugerida para **alto impacto + baixo custo**:

| Prioridade | Funcionalidade | Por quê agora | Esforço |
|------------|----------------|---------------|---------|
| P0 | Compartilhamento de ofertas (deep link + OG) | Cada share traz usuário qualificado; reutiliza ofertas existentes | Baixo |
| P0 | Onboarding até 1ª oferta salva/publicada | Reduz atrito; ativa valor imediato | Baixo–Médio |
| P0 | Campanha local Cuiabá/Várzea Grande (QR + parceiro) | Aquisição barata e relevante | Baixo (operacional) |
| P1 | Sistema de indicação (código + recompensa condicional) | Escala aquisição após produto validado | Médio |
| P1 | Ranking semanal de contribuidores | Retém publicadores; gamificação leve | Baixo |
| P1 | Notificações inteligentes (PWA push) | Traz usuários de volta sem ads | Médio |
| P2 | Alertas de preço | Retenção forte, mas exige dados de histórico | Médio–Alto |
| P2 | Desafios de economia semanal | Engajamento recorrente | Médio |
| P2 | Recompensas para contribuidores (badges/destaque) | Incentiva qualidade; cuidado com spam | Médio |

### Critério de priorização

```
Score = (impacto em usuários + retenção + ofertas + shares) / esforço técnico
```

Desempate: preferir o que **valida hipótese mais rápido** com **menos código novo**.

## Contexto do produto (AíCompensa)

- **O quê:** comparador de preços PWA com ofertas da comunidade
- **Onde:** foco local — Cuiabá e Várzea Grande (MT)
- **Stack relevante para growth:** PWA install prompt, push notifications, deep links, share API
- **Código:** `artifacts/comparador-precos/` (app), `artifacts/api-server/` (API)

## Exemplos de prompts para usar esta skill

### Avaliar uma ideia antes de implementar

```
@aicompensa-growth-expert Quero adicionar um sistema de pontos por oferta publicada.
Analise com as 6 perguntas e preencha o Growth Brief. Priorize MVP de baixo custo.
```

### Priorizar roadmap

```
@aicompensa-growth-expert Temos 1 semana de dev. O que implementar primeiro:
indicação, ranking semanal ou alertas de preço? Justifique com impacto/esforço.
```

### Campanha local

```
@aicompensa-growth-expert Planeje uma campanha de aquisição em Cuiabá com QR code
em 3 mercados parceiros. Meta: 100 novos usuários em 2 semanas. Métricas e riscos.
```

### Revisar feature existente

```
@aicompensa-growth-expert O fluxo de publicar oferta tem 6 passos. Isso mata retenção?
Sugira redução de atrito mantendo qualidade das ofertas.
```

### Combinar com arquiteto

```
@aicompensa-growth-expert @aicompensa-architect
Implementar compartilhamento de ofertas com deep link. Growth Brief primeiro,
depois plano técnico reutilizando componentes existentes.
```

### Análise de retenção

```
@aicompensa-growth-expert Nossa retenção W1 está em 12%. Quais 3 ações de alto
impacto e baixo custo devo fazer antes de investir em ads?
```

### Anti-spam em gamificação

```
@aicompensa-growth-expert Quero ranking semanal com prêmio simbólico. Como evitar
spam de ofertas falsas e manter qualidade?
```

## Growth Brief — exemplo preenchido

**Funcionalidade:** Compartilhamento de ofertas com deep link

| Campo | Exemplo |
|-------|---------|
| Hipótese de crescimento | Usuários compartilham ofertas boas no WhatsApp; amigos instalam o PWA para ver o preço |
| Impacto esperado | +20% novos usuários orgânicos em 30 dias; K-factor +0,1 |
| Esforço técnico | Baixo — Web Share API + rota `/oferta/:id` + meta OG |
| Risco | Links quebrados em preview; ofertas expiradas shared |
| Métrica | `share_offer_clicked`, installs via `?ref=share` |
| Prioridade | P0 — alto impacto, baixo custo, valida viral loop |
