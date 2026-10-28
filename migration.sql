-- ============================================================
-- Divid Comitê Financeiro — Migration
-- Cole no SQL Editor do Supabase e execute uma única vez.
-- ============================================================

-- ===== TABLES =====
create table if not exists public.comite_categorias (
  id uuid primary key default gen_random_uuid(),
  categoria_omie text not null unique,
  categoria_comite text not null,
  grupo text not null,
  subgrupo text not null
);

create table if not exists public.comite_orcamento (
  id uuid primary key default gen_random_uuid(),
  categoria_comite text not null,
  mes_referencia text not null,
  valor_base numeric not null default 0,
  valor_rolling numeric not null default 0,
  unique(categoria_comite, mes_referencia)
);

create table if not exists public.comite_realizado (
  id uuid primary key default gen_random_uuid(),
  categoria_omie text not null,
  tipo text not null check (tipo in ('pago', 'a_pagar', 'fechamento_final')),
  valor numeric not null,
  mes_referencia text not null,
  data_export date,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id)
);
create index if not exists idx_comite_realizado_mes on public.comite_realizado(mes_referencia);

create table if not exists public.comite_fechamento (
  id uuid primary key default gen_random_uuid(),
  mes_referencia text not null unique,
  fechado_em timestamptz default now(),
  fechado_por uuid references auth.users(id)
);

create table if not exists public.comite_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  role text not null default 'viewer_operacao'
    check (role in ('admin_divid', 'viewer_gestor', 'viewer_operacao'))
);

create table if not exists public.comite_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('admin_divid', 'viewer_gestor', 'viewer_operacao')),
  -- colunas conforme produção (usado / convidado_em); defaults/nulabilidade não confirmados
  convidado_em timestamptz not null default now(),
  usado boolean not null default false
);


-- ===== GRANTS =====
grant select, insert, update, delete on public.comite_categorias to authenticated;
grant select, insert, update, delete on public.comite_orcamento to authenticated;
grant select, insert, update, delete on public.comite_realizado to authenticated;
grant select, insert, update, delete on public.comite_fechamento to authenticated;
grant select, insert, update, delete on public.comite_user_profiles to authenticated;
grant select, insert, update, delete on public.comite_invites to authenticated;
grant all on public.comite_categorias, public.comite_orcamento, public.comite_realizado,
              public.comite_fechamento, public.comite_user_profiles, public.comite_invites to service_role;


-- ===== HELPER: is_admin =====
create or replace function public.is_admin_divid(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.comite_user_profiles
    where id = _user_id and role = 'admin_divid'
  )
$$;

-- ===== HELPER: current_user_role =====
-- SECURITY DEFINER: lê comite_user_profiles sem passar pela RLS dela (evita recursão).
-- Sem perfil => null => nenhuma leitura do Comitê é liberada.
-- Leitura: '(select public.current_user_role()) is not null' nas abas Comitê/Carteiras;
-- '... in (''admin_divid'', ''viewer_gestor'')' em Dashboard/Fluxo de Caixa.
-- Políticas legadas de produção são removidas por migrations/2026-10-19_niveis_acesso.sql.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.comite_user_profiles p where p.id = auth.uid()
$$;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

-- ===== RLS =====
alter table public.comite_categorias enable row level security;
alter table public.comite_orcamento enable row level security;
alter table public.comite_realizado enable row level security;
alter table public.comite_fechamento enable row level security;
alter table public.comite_user_profiles enable row level security;
alter table public.comite_invites enable row level security;

drop policy if exists "inv_admin_all" on public.comite_invites;
create policy "inv_admin_all" on public.comite_invites for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));


-- categorias: quem tem perfil do Comitê lê; admin escreve
drop policy if exists "cat_select" on public.comite_categorias;
create policy "cat_select" on public.comite_categorias for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "cat_admin_write" on public.comite_categorias;
create policy "cat_admin_write" on public.comite_categorias for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- orcamento
drop policy if exists "orc_select" on public.comite_orcamento;
create policy "orc_select" on public.comite_orcamento for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "orc_admin_write" on public.comite_orcamento;
create policy "orc_admin_write" on public.comite_orcamento for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- realizado
drop policy if exists "real_select" on public.comite_realizado;
create policy "real_select" on public.comite_realizado for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "real_admin_write" on public.comite_realizado;
create policy "real_admin_write" on public.comite_realizado for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- fechamento
drop policy if exists "fech_select" on public.comite_fechamento;
create policy "fech_select" on public.comite_fechamento for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "fech_admin_write" on public.comite_fechamento;
create policy "fech_admin_write" on public.comite_fechamento for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- user_profiles: user vê o próprio + admin vê todos; admin altera tudo; user lê próprio
drop policy if exists "prof_select_self_or_admin" on public.comite_user_profiles;
create policy "prof_select_self_or_admin" on public.comite_user_profiles for select to authenticated
  using (id = auth.uid() or public.is_admin_divid(auth.uid()));
drop policy if exists "prof_admin_write" on public.comite_user_profiles;
create policy "prof_admin_write" on public.comite_user_profiles for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));
-- Sem auto-inserção: perfil só nasce de convite (trigger) ou de admin.
drop policy if exists "prof_insert_self" on public.comite_user_profiles;

-- ===== TRIGGER: cria profile SÓ com convite pendente =====
-- auth.users é compartilhado com outras plataformas: sem convite do Comitê => sem perfil.
create or replace function public.handle_new_user_comite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  update public.comite_invites i
     set usado = true
   where i.id = (
     select i2.id from public.comite_invites i2
     where lower(i2.email) = lower(new.email) and not coalesce(i2.usado, false)
     order by i2.convidado_em desc nulls last
     limit 1
   )
  returning i.role into v_role;

  if v_role is not null then
    insert into public.comite_user_profiles (id, nome, role)
    values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), v_role)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_comite on auth.users;
create trigger on_auth_user_created_comite
  after insert on auth.users
  for each row execute function public.handle_new_user_comite();

-- ===== PROMOVER PRIMEIRO ADMIN =====
-- Após criar o primeiro usuário via /login (signup), rode:
-- update public.comite_user_profiles set role = 'admin_divid' where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');


-- ============================================================
-- ADIÇÕES: Responsáveis, Comentários, Extratos (rode novamente)
-- ============================================================

-- ===== Responsáveis por categoria =====
create table if not exists public.comite_responsaveis (
  categoria_comite text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz default now(),
  primary key (categoria_comite, user_id)
);
-- Permitir grupos/subgrupos (não existem em comite_categorias)
alter table public.comite_responsaveis
  drop constraint if exists comite_responsaveis_categoria_omie_fkey;
alter table public.comite_responsaveis
  drop constraint if exists comite_responsaveis_categoria_comite_fkey;
grant select, insert, update, delete on public.comite_responsaveis to authenticated;
grant all on public.comite_responsaveis to service_role;
alter table public.comite_responsaveis enable row level security;
drop policy if exists "resp_select" on public.comite_responsaveis;
create policy "resp_select" on public.comite_responsaveis for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "resp_admin_write" on public.comite_responsaveis;
create policy "resp_admin_write" on public.comite_responsaveis for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Comentários por categoria + mês =====
create table if not exists public.comite_comentarios (
  id uuid primary key default gen_random_uuid(),
  categoria_comite text not null,
  mes_referencia text not null,
  texto text not null,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id)
);
create index if not exists idx_comentarios_cat_mes on public.comite_comentarios(categoria_comite, mes_referencia);
grant select, insert, update, delete on public.comite_comentarios to authenticated;
grant all on public.comite_comentarios to service_role;
alter table public.comite_comentarios enable row level security;
drop policy if exists "com_select" on public.comite_comentarios;
create policy "com_select" on public.comite_comentarios for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "com_admin_write" on public.comite_comentarios;
create policy "com_admin_write" on public.comite_comentarios for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Extratos =====
create table if not exists public.comite_extratos (
  id uuid primary key default gen_random_uuid(),
  mes_referencia text not null,
  nome_arquivo text not null,
  storage_path text not null,
  url_arquivo text,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id)
);
alter table public.comite_extratos add column if not exists url_arquivo text;
create index if not exists idx_extratos_mes on public.comite_extratos(mes_referencia);
grant select, insert, update, delete on public.comite_extratos to authenticated;
grant all on public.comite_extratos to service_role;
alter table public.comite_extratos enable row level security;
drop policy if exists "ext_select" on public.comite_extratos;
create policy "ext_select" on public.comite_extratos for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "ext_admin_write" on public.comite_extratos;
create policy "ext_admin_write" on public.comite_extratos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Storage bucket: Comite-extratos =====
insert into storage.buckets (id, name, public)
values ('Comite-extratos', 'Comite-extratos', false)
on conflict (id) do nothing;

drop policy if exists "ext_obj_select" on storage.objects;
create policy "ext_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'Comite-extratos' and (select public.current_user_role()) is not null);
drop policy if exists "ext_obj_write" on storage.objects;
create policy "ext_obj_write" on storage.objects for all to authenticated
  using (bucket_id = 'Comite-extratos' and public.is_admin_divid(auth.uid()))
  with check (bucket_id = 'Comite-extratos' and public.is_admin_divid(auth.uid()));

-- ===== Pareceres =====
create table if not exists public.comite_pareceres (
  id uuid primary key default gen_random_uuid(),
  mes_referencia text not null,
  titulo text not null,
  score text not null check (score in ('verde','amarelo','vermelho')),
  comentario text not null,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id)
);
create index if not exists idx_pareceres_mes on public.comite_pareceres(mes_referencia);
grant select, insert, update, delete on public.comite_pareceres to authenticated;
grant all on public.comite_pareceres to service_role;
alter table public.comite_pareceres enable row level security;
drop policy if exists "par_select" on public.comite_pareceres;
create policy "par_select" on public.comite_pareceres for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "par_admin_write" on public.comite_pareceres;
create policy "par_admin_write" on public.comite_pareceres for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Carteiras Intramês =====
create table if not exists public.carteiras_recebimentos (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  categoria text not null,
  valor numeric not null default 0,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id),
  unique (mes_referencia, categoria)
);
create table if not exists public.carteiras_pagamentos (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  categoria text not null,
  valor numeric not null default 0,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id),
  unique (mes_referencia, categoria)
);
create index if not exists idx_cart_receb_mes on public.carteiras_recebimentos(mes_referencia);
create index if not exists idx_cart_pag_mes on public.carteiras_pagamentos(mes_referencia);
grant select, insert, update, delete on public.carteiras_recebimentos to authenticated;
grant select, insert, update, delete on public.carteiras_pagamentos to authenticated;
grant all on public.carteiras_recebimentos, public.carteiras_pagamentos to service_role;
alter table public.carteiras_recebimentos enable row level security;
alter table public.carteiras_pagamentos enable row level security;
drop policy if exists "cart_receb_select" on public.carteiras_recebimentos;
create policy "cart_receb_select" on public.carteiras_recebimentos for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "cart_receb_admin_write" on public.carteiras_recebimentos;
create policy "cart_receb_admin_write" on public.carteiras_recebimentos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));
drop policy if exists "cart_pag_select" on public.carteiras_pagamentos;
create policy "cart_pag_select" on public.carteiras_pagamentos for select to authenticated
  using ((select public.current_user_role()) is not null);
drop policy if exists "cart_pag_admin_write" on public.carteiras_pagamentos;
create policy "cart_pag_admin_write" on public.carteiras_pagamentos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Fluxo de Caixa =====
-- status/constraint abaixo sincronizados com o schema real de produção
-- (o arquivo original ficou desatualizado: a coluna status e a constraint
-- unique (…, status) já existiam no banco antes desta sincronização).
create table if not exists public.fc_lancamentos (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  tipo text not null check (tipo in ('CR','CP')),
  categoria text not null,
  valor numeric not null default 0,
  status text not null default 'realizado' check (status in ('previsto','realizado','fechamento')),
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id),
  unique (mes_referencia, tipo, categoria, status)
);
create index if not exists idx_fc_lanc_mes on public.fc_lancamentos(mes_referencia);
grant select, insert, update, delete on public.fc_lancamentos to authenticated;
grant all on public.fc_lancamentos to service_role;
alter table public.fc_lancamentos enable row level security;
drop policy if exists "fc_lanc_select" on public.fc_lancamentos;
create policy "fc_lanc_select" on public.fc_lancamentos for select to authenticated
  using ((select public.current_user_role()) in ('admin_divid', 'viewer_gestor'));
-- As views v_fc_* e v_lancamentos_classificados (não versionadas aqui) leem fc_lancamentos
-- e PRECISAM ter security_invoker = true, senão ignoram esta RLS.
-- Ver migrations/2026-10-19_niveis_acesso.sql.

-- ===== Tabelas-base das views de Fluxo de Caixa =====
-- de_para, lancamentos e contas_bancarias não são criadas aqui (vêm de fora do Comitê;
-- RLS ligada, escrita só service_role). Com security_invoker nas views, admin e gestor
-- precisam de SELECT nelas. Sem política de escrita.
drop policy if exists "de_para_select" on public.de_para;
create policy "de_para_select" on public.de_para for select to authenticated
  using ((select public.current_user_role()) in ('admin_divid', 'viewer_gestor'));
drop policy if exists "lancamentos_select" on public.lancamentos;
create policy "lancamentos_select" on public.lancamentos for select to authenticated
  using ((select public.current_user_role()) in ('admin_divid', 'viewer_gestor'));
drop policy if exists "contas_bancarias_select" on public.contas_bancarias;
create policy "contas_bancarias_select" on public.contas_bancarias for select to authenticated
  using ((select public.current_user_role()) in ('admin_divid', 'viewer_gestor'));
drop policy if exists "fc_lanc_admin_write" on public.fc_lancamentos;
create policy "fc_lanc_admin_write" on public.fc_lancamentos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== RPC: substituição atômica de lançamentos do Fluxo de Caixa =====
-- Escopo do replace inclui o status (migrations/2026-10-28_fc_replace_lancamentos_status.sql):
--   - realizado / previsto: substitui só as linhas daquele status, então os
--     dois coexistem e o Total Esp. da tela (pivotValuesByStatus,
--     src/components/fc-table.tsx) é pago + previsto;
--   - fechamento: limpa o mês/tipo inteiro (todos os status) e substitui.
-- Antes o DELETE era só por mes_referencia + tipo e subir o previsto apagava o realizado.
-- security invoker: roda com o papel de quem chama, então a RLS
-- (fc_lanc_admin_write, exige is_admin_divid) se aplica normalmente.
drop function if exists public.fc_replace_lancamentos(date, text, jsonb);

create or replace function public.fc_replace_lancamentos(
  p_mes date,
  p_tipo text,
  p_status text,
  p_registros jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_registros is null or jsonb_array_length(p_registros) = 0 then
    raise exception 'fc_replace_lancamentos: p_registros vazio — upload abortado para não apagar sem substituir';
  end if;

  if p_status is null or p_status not in ('previsto', 'realizado', 'fechamento') then
    raise exception 'fc_replace_lancamentos: p_status inválido (%)', p_status;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_registros) as r
    where (r->>'status') is distinct from p_status
  ) then
    raise exception 'fc_replace_lancamentos: registros com status diferente de p_status (%) — upload abortado', p_status;
  end if;

  delete from public.fc_lancamentos
  where mes_referencia = p_mes
    and tipo = p_tipo
    and (p_status = 'fechamento' or status = p_status);

  insert into public.fc_lancamentos (mes_referencia, tipo, categoria, valor, status)
  select
    p_mes,
    p_tipo,
    (r->>'categoria')::text,
    (r->>'valor')::numeric,
    p_status
  from jsonb_array_elements(p_registros) as r;
end;
$$;

grant execute on function public.fc_replace_lancamentos(date, text, text, jsonb) to authenticated;

-- ===== Saldo Inicial (Fluxo de Caixa) =====
create table if not exists public.fc_saldo_inicial (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null unique,
  valor numeric not null default 0,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  criado_por uuid references auth.users(id)
);
create index if not exists idx_fc_saldo_inicial_mes on public.fc_saldo_inicial(mes_referencia);
grant select, insert, update, delete on public.fc_saldo_inicial to authenticated;
grant all on public.fc_saldo_inicial to service_role;
alter table public.fc_saldo_inicial enable row level security;
drop policy if exists "fc_saldo_inicial_select" on public.fc_saldo_inicial;
create policy "fc_saldo_inicial_select" on public.fc_saldo_inicial for select to authenticated
  using ((select public.current_user_role()) in ('admin_divid', 'viewer_gestor'));
drop policy if exists "fc_saldo_inicial_admin_write" on public.fc_saldo_inicial;
create policy "fc_saldo_inicial_admin_write" on public.fc_saldo_inicial for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ============================================================
-- ai_analises (análises geradas pela Edge Function analise-ia)
-- ============================================================
create table if not exists public.ai_analises (
  id uuid primary key default gen_random_uuid(),
  aba text not null check (aba in ('comite','carteiras','fluxo_caixa')),
  mes_referencia text not null,
  modo text,
  comentario text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id)
);
create index if not exists idx_ai_analises_aba_mes on public.ai_analises(aba, mes_referencia);
grant select, insert, update, delete on public.ai_analises to authenticated;
grant all on public.ai_analises to service_role;
alter table public.ai_analises enable row level security;
drop policy if exists "ai_select" on public.ai_analises;
create policy "ai_select" on public.ai_analises for select to authenticated
  using ((select public.current_user_role()) in ('admin_divid', 'viewer_gestor'));
drop policy if exists "ai_admin_write" on public.ai_analises;
create policy "ai_admin_write" on public.ai_analises for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ============================================================
-- comite_auth_user_info: dados de auth.users para as Edge Functions
-- invite-user / remove-user (só service_role).
-- outras_plataformas: linha em user_profiles / user_building_access (outras
-- plataformas do mesmo projeto) — remove-user só bane quem não as usa.
-- ============================================================
create or replace function public.comite_auth_user_info(p_user_id uuid default null, p_email text default null)
returns table (
  user_id uuid,
  user_email text,
  user_nome text,
  banned_until timestamptz,
  comite_role text,
  outras_plataformas boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         u.email::text,
         coalesce(u.raw_user_meta_data->>'nome', u.email)::text,
         u.banned_until,
         p.role,
         exists (select 1 from public.user_profiles x where x.id = u.id)
         or exists (select 1 from public.user_building_access x where x.user_id = u.id)
  from auth.users u
  left join public.comite_user_profiles p on p.id = u.id
  where (p_user_id is not null and u.id = p_user_id)
     or (p_email is not null and lower(u.email) = lower(p_email))
$$;
revoke all on function public.comite_auth_user_info(uuid, text) from public, anon, authenticated;
grant execute on function public.comite_auth_user_info(uuid, text) to service_role;
