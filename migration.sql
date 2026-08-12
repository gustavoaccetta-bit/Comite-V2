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
  role text not null default 'viewer' check (role in ('admin_divid', 'viewer'))
);

create table if not exists public.comite_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null check (role in ('admin_divid', 'viewer')),
  criado_em timestamptz not null default now()
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


-- categorias: todos autenticados leem; admin escreve
drop policy if exists "cat_select" on public.comite_categorias;
create policy "cat_select" on public.comite_categorias for select to authenticated using (true);
drop policy if exists "cat_admin_write" on public.comite_categorias;
create policy "cat_admin_write" on public.comite_categorias for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- orcamento
drop policy if exists "orc_select" on public.comite_orcamento;
create policy "orc_select" on public.comite_orcamento for select to authenticated using (true);
drop policy if exists "orc_admin_write" on public.comite_orcamento;
create policy "orc_admin_write" on public.comite_orcamento for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- realizado
drop policy if exists "real_select" on public.comite_realizado;
create policy "real_select" on public.comite_realizado for select to authenticated using (true);
drop policy if exists "real_admin_write" on public.comite_realizado;
create policy "real_admin_write" on public.comite_realizado for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- fechamento
drop policy if exists "fech_select" on public.comite_fechamento;
create policy "fech_select" on public.comite_fechamento for select to authenticated using (true);
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
drop policy if exists "prof_insert_self" on public.comite_user_profiles;
create policy "prof_insert_self" on public.comite_user_profiles for insert to authenticated
  with check (id = auth.uid());

-- ===== TRIGGER: cria profile automaticamente =====
create or replace function public.handle_new_user_comite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.comite_user_profiles (id, nome, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'viewer')
  on conflict (id) do nothing;
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
create policy "resp_select" on public.comite_responsaveis for select to authenticated using (true);
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
create policy "com_select" on public.comite_comentarios for select to authenticated using (true);
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
create policy "ext_select" on public.comite_extratos for select to authenticated using (true);
drop policy if exists "ext_admin_write" on public.comite_extratos;
create policy "ext_admin_write" on public.comite_extratos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Storage bucket: Comite-extratos =====
insert into storage.buckets (id, name, public)
values ('Comite-extratos', 'Comite-extratos', false)
on conflict (id) do nothing;

drop policy if exists "ext_obj_select" on storage.objects;
create policy "ext_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'Comite-extratos');
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
create policy "par_select" on public.comite_pareceres for select to authenticated using (true);
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
create policy "cart_receb_select" on public.carteiras_recebimentos for select to authenticated using (true);
drop policy if exists "cart_receb_admin_write" on public.carteiras_recebimentos;
create policy "cart_receb_admin_write" on public.carteiras_recebimentos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));
drop policy if exists "cart_pag_select" on public.carteiras_pagamentos;
create policy "cart_pag_select" on public.carteiras_pagamentos for select to authenticated using (true);
drop policy if exists "cart_pag_admin_write" on public.carteiras_pagamentos;
create policy "cart_pag_admin_write" on public.carteiras_pagamentos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

-- ===== Fluxo de Caixa =====
create table if not exists public.fc_lancamentos (
  id uuid primary key default gen_random_uuid(),
  mes_referencia date not null,
  tipo text not null check (tipo in ('CR','CP')),
  categoria text not null,
  valor numeric not null default 0,
  criado_em timestamptz default now(),
  criado_por uuid references auth.users(id),
  unique (mes_referencia, tipo, categoria)
);
create index if not exists idx_fc_lanc_mes on public.fc_lancamentos(mes_referencia);
grant select, insert, update, delete on public.fc_lancamentos to authenticated;
grant all on public.fc_lancamentos to service_role;
alter table public.fc_lancamentos enable row level security;
drop policy if exists "fc_lanc_select" on public.fc_lancamentos;
create policy "fc_lanc_select" on public.fc_lancamentos for select to authenticated using (true);
drop policy if exists "fc_lanc_admin_write" on public.fc_lancamentos;
create policy "fc_lanc_admin_write" on public.fc_lancamentos for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));

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
create policy "fc_saldo_inicial_select" on public.fc_saldo_inicial for select to authenticated using (true);
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
create policy "ai_select" on public.ai_analises for select to authenticated using (true);
drop policy if exists "ai_admin_write" on public.ai_analises;
create policy "ai_admin_write" on public.ai_analises for all to authenticated
  using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()));
