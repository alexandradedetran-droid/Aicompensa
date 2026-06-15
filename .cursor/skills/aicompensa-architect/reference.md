# AíCompensa — Mapa do Projeto

> **Manutenção:** atualize este arquivo sempre que o projeto ganhar novas pastas, pacotes, convenções ou fluxos de dependência. Ver seção "Manutenção da documentação" em [SKILL.md](SKILL.md).

Use este mapa ao procurar código semelhante e identificar dependências.

## Monorepo (pnpm)

```bash
pnpm build        # typecheck + build de todos os pacotes
pnpm typecheck    # verificação de tipos
```

## Estrutura principal

| Área | Caminho | Stack |
|------|---------|-------|
| App principal (PWA) | `artifacts/comparador-precos/` | React, Vite, TypeScript, Tailwind/shadcn |
| API REST | `artifacts/api-server/` | Express, TypeScript |
| Sandbox de mockups | `artifacts/mockup-sandbox/` | React, Vite |
| Schema e ORM | `lib/db/src/schema/` | Drizzle ORM, PostgreSQL |
| Spec OpenAPI | `lib/api-spec/` | Orval |
| Cliente React gerado | `lib/api-client-react/` | fetch tipado |
| Validação Zod gerada | `lib/api-zod/` | Zod |

## Onde procurar por tipo de mudança

| Tarefa | Onde buscar primeiro |
|--------|----------------------|
| UI / páginas | `artifacts/comparador-precos/src/pages/` |
| Componentes reutilizáveis | `artifacts/comparador-precos/src/components/` |
| UI primitives (shadcn) | `artifacts/comparador-precos/src/components/ui/` |
| Lógica de negócio (client) | `artifacts/comparador-precos/src/lib/` |
| Rotas da API | `artifacts/api-server/src/routes/` |
| Middleware / app setup | `artifacts/api-server/src/app.ts` |
| Tabelas e tipos DB | `lib/db/src/schema/index.ts` |
| PWA / service worker | `artifacts/comparador-precos/public/sw.js` |
| Instalação PWA | `artifacts/comparador-precos/src/components/pwa-install-prompt.tsx` |

## Convenções observadas

- **Package manager**: pnpm (não usar npm/yarn)
- **Tipagem**: TypeScript estrito; tipos inferidos do Drizzle (`$inferSelect`, `$inferInsert`)
- **Validação**: Zod via `drizzle-zod` no schema; client gerado em `lib/api-zod`
- **API**: rotas Express em `artifacts/api-server/src/routes/`; contrato em `lib/api-spec`
- **UI**: componentes shadcn em `components/ui/`; utilitários em `src/lib/utils.ts`
- **Estilo**: seguir padrão dos arquivos vizinhos (imports, naming, estrutura de pastas)

## Dependências entre pacotes

```
lib/db ─────────────────────────► artifacts/api-server
lib/api-spec ──► lib/api-client-react
              └──► lib/api-zod
lib/api-client-react ──────────► artifacts/comparador-precos
```

Alterações no schema (`lib/db`) impactam API e podem exigir regeneração dos clients (`lib/api-spec`).
