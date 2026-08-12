# Divid Comitê Financeiro

App de gestão orçamentária com hierarquia Grupo → Subgrupo → Categoria, conectado ao Supabase fornecido pelo usuário (`nivmrhetdujvmpnvxufb`).

## Pontos a confirmar antes de implementar

1. **Supabase próprio vs Lovable Cloud**: Você forneceu URL e anon key de um projeto Supabase existente. Vou usar **esse** projeto (não vou habilitar Lovable Cloud). Isso significa que **você precisará rodar a migration SQL no seu Supabase manualmente** (ou me dar acesso). Posso gerar o arquivo `migration.sql` pronto para colar no SQL Editor do seu Supabase. **Confirma?**
2. **RLS**: Vou ativar RLS em todas as tabelas com policies baseadas em role (`admin_divid` escreve, `viewer` lê). OK?
3. **Trigger de criação de profile**: Ao criar usuário no Auth, vou criar trigger que insere em `comite_user_profiles` com role default `viewer`.

## Escopo

### Setup
- Instalar `@supabase/supabase-js`
- Criar cliente Supabase em `src/integrations/supabase/client.ts` com URL/anon key fornecidos
- Migration SQL completa (tabelas + RLS + função `has_role` + trigger profile + seed de exemplo opcional)
- Design tokens em `src/styles.css`: branco/cinza/`#72afac`, fonte DM Sans, vermelho/verde de variação

### Rotas (file-based em `src/routes/`)
- `__root.tsx` — shell + QueryClient + listener `onAuthStateChange`
- `_authenticated.tsx` — layout protegido com sidebar (`AppSidebar`) + outlet; verifica role via `comite_user_profiles`
- `login.tsx` — email/senha
- `_authenticated/comite.tsx` — página principal (viewer+)
- `_authenticated/uploads.tsx` — admin only (gate em `beforeLoad`)
- `_authenticated/fechar-mes.tsx` — admin only
- `_authenticated/admin/usuarios.tsx` — admin only
- `index.tsx` — redireciona para `/comite` ou `/login`

### Página /comite
- Header: seletor mês/ano (com 🔒/🟢), toggle Base/Rolling, export PDF (`window.print` + CSS print), avatar/logout
- 4 KPI cards (Orçado, Realizado, A Pagar, Variação R$ + %)
- Banner amarelo quando mês fechado
- Tabela hierárquica 3 níveis expansíveis (Grupo → Subgrupo → Categoria) com cores condicionais
- Modo "fechamento_final" oculta colunas A Pagar
- Query agrega `comite_orcamento` + `comite_realizado` via `categoria_omie` → `categoria_comite`

### Página /uploads
- Seção A: Orçamento (CSV/XLSX) — usa `papaparse` + `xlsx`, upsert em `comite_orcamento`, pula meses fechados
- Seção B: Realizado OMIE (CSV) — mapeia `categoria_omie`, tipo Pago/A Pagar/Fechamento Final, mostra não-mapeadas, bloqueia se mês fechado

### Página /fechar-mes
- Tabela resumo Orçado vs Realizado (sem A Pagar)
- Modal de confirmação dupla → insert em `comite_fechamento`

### Página /admin/usuarios
- Lista `comite_user_profiles`
- Convite via `supabase.auth.admin.inviteUserByEmail` (precisa service role) — **alternativa**: usar `signInWithOtp` com `shouldCreateUser: true` enviando magic link do client (funciona com anon key). Vou usar essa abordagem.
- Alterar role (update direto, protegido por RLS admin-only)
- Remover (delete em `comite_user_profiles`; auth user fica órfão — limitação sem service role)

### Componentes
- `AppSidebar` (shadcn sidebar) com itens condicionais por role
- `MonthPicker`, `KpiCard`, `HierarchicalTable`, `FileUpload`
- `useAuth` hook + `useUserRole` hook
- `useComiteData(mes, modo)` hook com React Query

### Dependências a instalar
`@supabase/supabase-js`, `papaparse`, `xlsx`, `@types/papaparse`

## Detalhes técnicos

- Sem TanStack server functions / sem service role — tudo client-side com RLS protegendo
- Datas/valores formatados em pt-BR (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`)
- `mes_referencia` string `YYYY-MM`
- Export PDF via CSS `@media print` + `window.print()` (sem libs extras)

## O que NÃO está incluso (posso adicionar depois)

- Convite com service role (requer Lovable Cloud ou edge function)
- Histórico de uploads / audit log detalhado
- Comparativo Base vs Rolling lado a lado
- Gráficos / visualizações além das KPIs

Confirma para eu seguir?