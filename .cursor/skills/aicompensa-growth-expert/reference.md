# AíCompensa Growth — Referência

> **Manutenção:** atualize metas e métricas ao concluir a fase de 90 dias ou ao atingir marcos (ex.: 1.000 usuários).

## Metas de crescimento — fase atual (90 dias)

Horizonte: **90 dias** a partir do início da fase atual.

| Meta | Alvo | Definição |
|------|------|-----------|
| Usuários cadastrados | **1.000** | Contas únicas criadas no período acumulado |
| MAU | **300** | Usuários com ≥ 1 sessão nos últimos 30 dias |
| Contribuidores ativos | **100** | Usuários que publicaram ≥ 1 oferta válida no mês |
| Ofertas válidas | **500** | Ofertas aprovadas pela moderação (acumulado da fase) |
| Retenção W1 | **30%** | % de novos usuários que retornam na semana 1 após cadastro |
| Retenção W4 | **15%** | % de novos usuários ainda ativos na semana 4 após cadastro |
| Ofertas por contribuidor/mês | **5** | Média de ofertas válidas publicadas por contribuidor ativo/mês |
| Conversão visitante → cadastro | **20%** | Cadastros ÷ visitantes únicos no período |
| Taxa de compartilhamento de ofertas | **10%** | Ofertas compartilhadas ÷ ofertas válidas publicadas |
| Tempo até 1ª publicação | **< 10 min** | Mediana do tempo entre cadastro e 1ª oferta enviada |

### Objetivos estratégicos (ordem de prioridade)

1. **Ofertas válidas (500)** — sem ofertas, não há produto
2. **Contribuidores ativos (100)** — comunidade que alimenta o catálogo
3. **Retenção W1 (30%) e W4 (15%)** — usuário que volta encontra valor novo
4. **MAU (300)** — base engajada sustentável
5. **Compartilhamento (10%)** — cada oferta boa é um anúncio gratuito
6. **Conversão visitante → cadastro (20%)** — funil de aquisição eficiente
7. **Usuários cadastrados (1.000)** — marco de escala da fase
8. **Monetização futura** — só após massa crítica e confiança (parcerias locais, destaque pago para lojistas)

## Métricas principais

Todas as métricas abaixo devem ser avaliadas automaticamente ao propor qualquer funcionalidade.

### Aquisição

| Métrica | Definição | Meta 90d | Onde medir |
|---------|-----------|----------|------------|
| Usuários cadastrados | Total acumulado de contas | 1.000 | Auth / analytics |
| Conversão visitante → cadastro | Cadastros ÷ visitantes únicos | 20% | Landing + analytics |
| Novos usuários/semana | Cadastros únicos por semana | Tendência crescente | Auth / analytics |
| Fonte de aquisição | Orgânico, indicação, QR local, compartilhamento | Rastrear mix | UTM / referral code |
| CAC efetivo | Custo de campanha ÷ novos usuários | Minimizar | Campanhas locais |

### Ativação

| Métrica | Definição | Meta 90d | Onde medir |
|---------|-----------|----------|------------|
| Tempo até 1ª publicação | Mediana cadastro → 1ª oferta enviada | < 10 min | Eventos de onboarding |
| Primeira oferta em 7 dias | % novos que publicam em 7 dias | Maximizar | Analytics |
| Onboarding completo | % que conclui fluxo inicial | ≥ 60% | Funil de onboarding |

### Retenção e engajamento

| Métrica | Definição | Meta 90d | Onde medir |
|---------|-----------|----------|------------|
| MAU | Sessões nos últimos 30 dias | 300 | Analytics |
| Retenção W1 | Retorno na semana 1 pós-cadastro | 30% | Cohort semanal |
| Retenção W4 | Ativo na semana 4 pós-cadastro | 15% | Cohort semanal |
| Sessões/usuário/semana | Frequência de uso entre MAU | ≥ 2 | Analytics |

### Contribuição e catálogo

| Métrica | Definição | Meta 90d | Onde medir |
|---------|-----------|----------|------------|
| Contribuidores ativos | Publicaram ≥ 1 oferta válida no mês | 100 | DB ofertas + auth |
| Ofertas válidas | Total aprovadas no período | 500 | Moderação / DB |
| Ofertas por contribuidor/mês | Média entre contribuidores ativos | 5 | DB ofertas |
| Taxa de validação | Ofertas aprovadas ÷ enviadas | ≥ 70% | Moderação |

### Viralização

| Métrica | Definição | Meta 90d | Onde medir |
|---------|-----------|----------|------------|
| Taxa de compartilhamento de ofertas | Shares ÷ ofertas válidas publicadas | 10% | Evento `share_offer` |
| Instalações PWA via link | Installs originados de share/deep link | Rastrear | `?ref=share` |
| K-factor (indicação) | Convites × taxa de conversão | Monitorar | Referral code |

### Qualidade (anti-spam)

| Métrica | Definição | Alerta |
|---------|-----------|--------|
| Ofertas rejeitadas | % rejeitadas por moderação | > 30% = UX ou incentivo errado |
| Contas flagadas | Suspeita de fraude/indicação fake | Investigar mecanismo de recompensa |

## Mapa funcionalidade → metas

Use ao avaliar impacto automaticamente:

| Tipo de funcionalidade | Metas mais impactadas |
|------------------------|----------------------|
| Compartilhamento, deep links | Usuários, conversão, taxa compartilhamento |
| Indicação, campanhas locais | Usuários, conversão, MAU |
| Onboarding, redução de atrito | Conversão, tempo 1ª publicação, W1 |
| Ranking, gamificação, recompensas | Contribuidores, ofertas válidas, ofertas/contribuidor, W4 |
| Notificações, alertas de preço | MAU, W1, W4 |
| Fluxo de publicação | Ofertas válidas, tempo 1ª publicação, contribuidores |
| Monetização (futuro) | MAU, retenção (indireto) |

## Funcionalidades prioritárias

Ordem sugerida para **alto impacto + baixo custo** na fase de 90 dias:

| Prioridade | Funcionalidade | Metas que move | Esforço |
|------------|----------------|----------------|---------|
| P0 | Compartilhamento de ofertas (deep link + OG) | Usuários, conversão, taxa 10% | Baixo |
| P0 | Onboarding até 1ª publicação (< 10 min) | Tempo 1ª pub, W1, conversão | Baixo–Médio |
| P0 | Campanha local Cuiabá/Várzea Grande | Usuários, conversão, MAU | Baixo (operacional) |
| P1 | Sistema de indicação | Usuários, conversão | Médio |
| P1 | Ranking semanal de contribuidores | Contribuidores, ofertas/contribuidor, W4 | Baixo |
| P1 | Notificações inteligentes (PWA push) | MAU, W1, W4 | Médio |
| P2 | Alertas de preço | MAU, W4 | Médio–Alto |
| P2 | Desafios de economia semanal | W4, MAU | Médio |
| P2 | Recompensas para contribuidores | Ofertas válidas, ofertas/contribuidor | Médio |

### Critério de priorização

```
Score = (metas 90d impactadas positivamente) / esforço técnico
```

Desempate: preferir o que **valida hipótese mais rápido** com **menos código novo**.

## Contexto do produto (AíCompensa)

- **O quê:** comparador de preços PWA com ofertas da comunidade
- **Onde:** foco local — Cuiabá e Várzea Grande (MT)
- **Stack relevante para growth:** PWA install prompt, push notifications, deep links, share API
- **Código:** `artifacts/comparador-precos/` (app), `artifacts/api-server/` (API)

## Exemplos de prompts

A skill é auto-invocada no workspace; estes prompts reforçam o foco nas metas:

### Avaliar uma ideia antes de implementar

```
Quero adicionar um sistema de pontos por oferta publicada.
Analise impacto nas metas de 90 dias, as 6 perguntas e o Growth Brief.
```

### Priorizar roadmap

```
Temos 1 semana de dev. O que implementar primeiro: indicação, ranking semanal
ou alertas de preço? Justifique pelo impacto nas metas de 90 dias.
```

### Campanha local

```
Planeje campanha de aquisição em Cuiabá com QR em 3 mercados.
Meta: contribuir para 1.000 usuários e 20% de conversão visitante → cadastro.
```

### Combinar com arquiteto

```
@aicompensa-architect Implementar compartilhamento de ofertas com deep link.
Growth Brief e impacto nas metas primeiro.
```

## Growth Brief — exemplo preenchido

**Funcionalidade:** Compartilhamento de ofertas com deep link

| Campo | Exemplo |
|-------|---------|
| Hipótese de crescimento | Usuários compartilham ofertas no WhatsApp; amigos cadastram para ver o preço |
| Impacto esperado | ↑ usuários cadastrados; ↑ conversão 20%; ↑ taxa compartilhamento 10% |
| Esforço técnico | Baixo — Web Share API + rota `/oferta/:id` + meta OG |
| Risco | Preview quebrado; ofertas expiradas compartilhadas |
| Métrica | `share_offer`, `signup_from_share`, taxa compartilhamento |
| Prioridade | P0 — move 3 metas 90d, baixo custo |
