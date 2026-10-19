-- ============================================================
-- Níveis de acesso: admin_divid | viewer_gestor | viewer_operacao
--
-- Rodar no SQL Editor DEPOIS de revisar 2026-10-19_niveis_acesso_pre_aplicacao.sql.
-- Uma única transação: qualquer pré-checagem que falhe aborta tudo, sem alterar nada.
-- role é text + CHECK (não enum), então não precisa de migration fora da transação.
-- Rollback: 2026-10-19_niveis_acesso_rollback.sql (usa o backup do schema bkp_niveis_acesso).
--
-- O projeto Supabase é compartilhado com outras plataformas (auth.users, user_profiles,
-- user_building_access). Esta migration só mexe em objetos do Comitê.
-- ============================================================

begin;

-- ===== 0. Guard: não reaplicar =====
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'bkp_niveis_acesso') then
    raise exception 'Migration já aplicada (schema bkp_niveis_acesso existe). Rode o rollback antes de reaplicar.';
  end if;
end $$;

-- ===== 1. Escopo =====
-- leitura 'restrita' => admin_divid e viewer_gestor (abas Dashboard / Fluxo de Caixa)
-- leitura 'perfil'   => qualquer papel do Comitê (abas Comitê / Carteiras)
-- Escrita sempre só is_admin_divid. TODAS as políticas atuais dessas tabelas são
-- substituídas (inclusive as legadas "Permitir ... autenticados" / "acesso autenticado").
create temp table _escopo (tabela text primary key, prefixo text not null, leitura text not null) on commit drop;
insert into _escopo values
  ('fc_lancamentos',         'fc_lanc',          'restrita'),
  ('fc_saldo_inicial',       'fc_saldo_inicial', 'restrita'),
  ('ai_analises',            'ai',               'restrita'),
  ('comite_categorias',      'cat',              'perfil'),
  ('comite_orcamento',       'orc',              'perfil'),
  ('comite_realizado',       'real',             'perfil'),
  ('comite_fechamento',      'fech',             'perfil'),
  ('comite_responsaveis',    'resp',             'perfil'),
  ('comite_comentarios',     'com',              'perfil'),
  ('comite_extratos',        'ext',              'perfil'),
  ('comite_pareceres',       'par',              'perfil'),
  ('carteiras_recebimentos', 'cart_receb',       'perfil'),
  ('carteiras_pagamentos',   'cart_pag',         'perfil');

-- Tabelas-base das views de Fluxo de Caixa (RLS ligada, sem política de leitura: hoje só
-- service_role/dono leem). Com security_invoker nas views, admin e gestor precisam de
-- SELECT aqui. Só ganham a política de leitura; as demais políticas ficam como estão e
-- não há política de escrita (escrita continua só service_role).
create temp table _leitura_extra (tabela text primary key, prefixo text not null) on commit drop;
insert into _leitura_extra values
  ('de_para',          'de_para'),
  ('lancamentos',      'lancamentos'),
  ('contas_bancarias', 'contas_bancarias');

-- Views: v_fc_* + todas as views que elas leem (ex.: v_fc_mensal -> v_lancamentos_classificados)
create temp table _views on commit drop as
with recursive vw(oid) as (
  select c.oid from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname like 'v\_fc\_%' and c.relkind in ('v','m')
  union
  select d.refobjid
  from vw
  join pg_rewrite rw on rw.ev_class = vw.oid
  join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid
                  and d.refclassid = 'pg_class'::regclass and d.refobjid <> vw.oid
  join pg_class c2 on c2.oid = d.refobjid and c2.relkind in ('v','m')
)
select c.oid, c.relnamespace::regnamespace::text as schema, c.relname::text, c.relkind
from vw join pg_class c on c.oid = vw.oid;

-- ===== 2. Pré-checagens (abortam sem alterar nada) =====
do $$
declare
  v_msgs text[] := '{}';
  r record;
begin
  -- 2a. Tabelas do escopo existem
  v_msgs := v_msgs || array(
    select format('tabela public.%s não existe', t.tabela)
    from (select tabela from _escopo union all select tabela from _leitura_extra) t
    where to_regclass('public.' || t.tabela) is null
  );

  -- 2b. Views: sem materialized view, sem função SECURITY DEFINER, tabelas lidas acessíveis
  for r in select * from _views loop
    if r.relkind = 'm' then
      v_msgs := v_msgs || format('%s.%s é materialized view (não suporta security_invoker)', r.schema, r.relname);
    end if;

    v_msgs := v_msgs || array(
      select format('%s.%s usa função SECURITY DEFINER %s', r.schema, r.relname, p.oid::regprocedure)
      from pg_rewrite rw
      join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid and d.refclassid = 'pg_proc'::regclass
      join pg_proc p on p.oid = d.refobjid
      where rw.ev_class = r.oid and p.prosecdef
    );

    v_msgs := v_msgs || array(
      select distinct format('%s.%s lê %s, sem SELECT para authenticated', r.schema, r.relname, t.oid::regclass)
      from pg_rewrite rw
      join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid and d.refclassid = 'pg_class'::regclass
      join pg_class t on t.oid = d.refobjid and t.relkind in ('r','p','f')
      where rw.ev_class = r.oid and not has_table_privilege('authenticated', t.oid, 'SELECT')
    );

    -- tabela com RLS e sem política de leitura => view viria vazia para todos.
    -- Aceita as tabelas que esta migration passa a cobrir (_escopo e _leitura_extra).
    v_msgs := v_msgs || array(
      select distinct format('%s.%s lê %s, que tem RLS sem política de leitura', r.schema, r.relname, t.oid::regclass)
      from pg_rewrite rw
      join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid and d.refclassid = 'pg_class'::regclass
      join pg_class t on t.oid = d.refobjid and t.relkind in ('r','p') and t.relrowsecurity
      where rw.ev_class = r.oid
        and not (t.relnamespace = 'public'::regnamespace
                 and t.relname in (select tabela from _escopo union all select tabela from _leitura_extra))
        and not exists (
          select 1 from pg_policies pp
          where pp.schemaname = t.relnamespace::regnamespace::text and pp.tablename = t.relname
            and pp.permissive = 'PERMISSIVE' and pp.cmd in ('SELECT','ALL')
        )
    );
  end loop;

  -- 2c. Outras views (fora do conjunto acima) lendo tabelas do escopo sem security_invoker
  --     furariam a RLS nova pela API.
  v_msgs := v_msgs || array(
    select distinct format('view %s lê %s e não tem security_invoker', v.oid::regclass, t.oid::regclass)
    from pg_class v
    join pg_rewrite rw on rw.ev_class = v.oid
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid and d.refclassid = 'pg_class'::regclass
    join pg_class t on t.oid = d.refobjid
    where v.relkind in ('v','m')
      and v.relnamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
      and v.oid not in (select oid from _views)
      and t.relnamespace = 'public'::regnamespace and t.relname in (select tabela from _escopo)
      and not exists (select 1 from unnest(v.reloptions) o where o ~* '^security_invoker=(true|on|1|yes)$')
  );

  -- 2d. Funções SECURITY DEFINER (fora as do Comitê) que tocam tabelas do escopo
  v_msgs := v_msgs || array(
    select format('função SECURITY DEFINER %s toca tabelas do escopo', p.oid::regprocedure)
    from pg_proc p
    where p.prosecdef
      and p.pronamespace = 'public'::regnamespace
      and p.proname not in ('is_admin_divid', 'current_user_role', 'handle_new_user_comite', 'comite_auth_user_info')
      and p.prosrc ~* ('\m(' || (select string_agg(tabela, '|') from _escopo) || ')\M')
  );

  -- 2e. storage.objects: política de leitura sem filtro de bucket exporia Comite-extratos
  v_msgs := v_msgs || array(
    select format('storage.objects: política %s libera leitura sem filtrar bucket (%s)', policyname, coalesce(qual, '<sem using>'))
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and permissive = 'PERMISSIVE' and cmd in ('SELECT','ALL')
      and (roles && array['authenticated','anon','public']::name[])
      and coalesce(qual, '') not ilike '%bucket_id%'
  );

  if cardinality(v_msgs) > 0 then
    raise exception E'Pré-checagem falhou — nada foi alterado:\n%', array_to_string(v_msgs, E'\n');
  end if;
end $$;

-- ===== 3. Backup do estado atual (lido pelo rollback) =====
create schema bkp_niveis_acesso;
revoke all on schema bkp_niveis_acesso from public, anon, authenticated;

create table bkp_niveis_acesso.profile_roles as
  select id, role from public.comite_user_profiles;
create table bkp_niveis_acesso.invite_roles as
  select id, role from public.comite_invites;
create table bkp_niveis_acesso.role_constraints as
  select conrelid::regclass::text as tbl, conname::text, pg_get_constraintdef(oid) as def
  from pg_constraint
  where contype = 'c'
    and conrelid in ('public.comite_user_profiles'::regclass, 'public.comite_invites'::regclass)
    and pg_get_constraintdef(oid) ilike '%role%';
create table bkp_niveis_acesso.role_defaults as
  select table_name::text as tbl, column_default::text as def
  from information_schema.columns
  where table_schema = 'public' and column_name = 'role'
    and table_name in ('comite_user_profiles', 'comite_invites');
create table bkp_niveis_acesso.policies as
  select schemaname::text, tablename::text, policyname::text, permissive, roles::text[] as roles, cmd, qual, with_check
  from pg_policies
  where (schemaname = 'public'
         and (tablename in (select tabela from _escopo)
              or tablename in (select tabela from _leitura_extra)
              or tablename in ('comite_user_profiles', 'comite_invites')))
     or (schemaname = 'storage' and tablename = 'objects'
         and (coalesce(qual, '') ilike '%Comite-extratos%' or coalesce(with_check, '') ilike '%Comite-extratos%'));
-- Lista de tabelas cujas políticas o rollback remove e restaura do backup
create table bkp_niveis_acesso.rls_flags as
  select c.relname::text as tabela, c.relrowsecurity as rls
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in (select tabela from _escopo union all select tabela from _leitura_extra);
create table bkp_niveis_acesso.views as
  select schema, relname, (select reloptions from pg_class where oid = v.oid) as reloptions
  from _views v where relkind = 'v';
create table bkp_niveis_acesso.functions as
  select 'handle_new_user_comite'::text as name,
         pg_get_functiondef('public.handle_new_user_comite()'::regprocedure) as def;

-- ===== 4. Papéis: CHECK novo + migração viewer -> viewer_operacao =====
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.comite_user_profiles'::regclass, 'public.comite_invites'::regclass)
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

update public.comite_user_profiles set role = 'viewer_operacao' where role = 'viewer';
update public.comite_invites       set role = 'viewer_operacao' where role = 'viewer';

-- ===== 5. Promoção para viewer_gestor (só quem está como viewer_operacao) =====
do $$
declare
  v_emails text[] := array['accettagustavo@gmail.com'];
  v_missing text[];
  v_ignorados text[];
begin
  select array_agg(e) into v_missing
  from unnest(v_emails) e
  where not exists (
    select 1 from auth.users u join public.comite_user_profiles p on p.id = u.id
    where lower(u.email) = lower(trim(e))
  );
  if v_missing is not null then
    raise exception 'E-mails sem login/perfil do Comitê — corrija a lista: %', v_missing;
  end if;

  select array_agg(format('%s (%s)', u.email, p.role)) into v_ignorados
  from auth.users u join public.comite_user_profiles p on p.id = u.id
  where lower(u.email) in (select lower(trim(e)) from unnest(v_emails) e)
    and p.role <> 'viewer_operacao';
  if v_ignorados is not null then
    raise notice 'Não promovidos (não eram viewer): %', v_ignorados;
  end if;

  update public.comite_user_profiles p
     set role = 'viewer_gestor'
    from auth.users u
   where u.id = p.id
     and lower(u.email) in (select lower(trim(e)) from unnest(v_emails) e)
     and p.role = 'viewer_operacao';
end $$;

alter table public.comite_user_profiles
  add constraint comite_user_profiles_role_check
  check (role in ('admin_divid', 'viewer_gestor', 'viewer_operacao'));
alter table public.comite_user_profiles alter column role set default 'viewer_operacao';
alter table public.comite_invites
  add constraint comite_invites_role_check
  check (role in ('admin_divid', 'viewer_gestor', 'viewer_operacao'));

-- ===== 6. Funções =====
-- Papel do usuário logado. SECURITY DEFINER: lê comite_user_profiles sem passar pela
-- RLS dela (evita recursão). Sem perfil => null => nenhuma leitura do Comitê é liberada.
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

-- Dados de auth.users para as Edge Functions invite-user / remove-user (só service_role).
-- outras_plataformas: o usuário tem linha em user_profiles (id -> auth.users) ou
-- user_building_access (user_id -> auth.users).
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

-- ===== 7. RLS das tabelas do escopo =====
do $$
declare
  e record;
  p record;
  v_leitura text;
begin
  for e in select * from _escopo loop
    execute format('alter table public.%I enable row level security', e.tabela);

    for p in select policyname from pg_policies where schemaname = 'public' and tablename = e.tabela loop
      raise notice 'public.%: removendo política "%"', e.tabela, p.policyname;
      execute format('drop policy %I on public.%I', p.policyname, e.tabela);
    end loop;

    -- (select ...) => avaliado uma vez por query, não por linha
    v_leitura := case e.leitura
      when 'restrita' then $q$(select public.current_user_role()) in ('admin_divid', 'viewer_gestor')$q$
      else $q$(select public.current_user_role()) is not null$q$
    end;

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   e.prefixo || '_select', e.tabela, v_leitura);
    execute format('create policy %I on public.%I for all to authenticated '
                   'using (public.is_admin_divid(auth.uid())) with check (public.is_admin_divid(auth.uid()))',
                   e.prefixo || '_admin_write', e.tabela);
  end loop;
end $$;

-- ===== 7b. Tabelas-base do Fluxo de Caixa: só leitura para admin e gestor =====
-- Nenhuma política existente é removida; escrita continua só service_role.
do $$
declare e record;
begin
  for e in select * from _leitura_extra loop
    execute format('drop policy if exists %I on public.%I', e.prefixo || '_select', e.tabela);
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   e.prefixo || '_select', e.tabela,
                   $q$(select public.current_user_role()) in ('admin_divid', 'viewer_gestor')$q$);
  end loop;
end $$;

-- ===== 8. Storage: bucket Comite-extratos =====
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ilike '%Comite-extratos%' or coalesce(with_check, '') ilike '%Comite-extratos%')
  loop
    raise notice 'storage.objects: removendo política "%"', p.policyname;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

drop policy if exists "ext_obj_select" on storage.objects;
drop policy if exists "ext_obj_write" on storage.objects;
create policy "ext_obj_select" on storage.objects for select to authenticated
  using (bucket_id = 'Comite-extratos' and (select public.current_user_role()) is not null);
create policy "ext_obj_write" on storage.objects for all to authenticated
  using (bucket_id = 'Comite-extratos' and public.is_admin_divid(auth.uid()))
  with check (bucket_id = 'Comite-extratos' and public.is_admin_divid(auth.uid()));

-- ===== 9. Views passam a respeitar a RLS de quem consulta =====
do $$
declare r record;
begin
  for r in select * from _views where relkind = 'v' loop
    execute format('alter view %I.%I set (security_invoker = true)', r.schema, r.relname);
  end loop;
end $$;

-- ===== 10. Trigger de novo usuário: perfil SÓ com convite pendente =====
-- Sem convite do Comitê (ex.: usuário de outra plataforma) => nenhum perfil => sem acesso.
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

-- ===== 11. Sem auto-inserção de perfil =====
-- Perfil só nasce de convite (trigger) ou de admin. Antes: qualquer usuário sem perfil
-- podia se inserir — inclusive como admin_divid.
drop policy if exists "prof_insert_self" on public.comite_user_profiles;

-- ===== 12. Pós-checagens =====
do $$
declare v_bad text[];
begin
  -- 12a. INSERT em comite_invites só para admin_divid
  if not (select relrowsecurity from pg_class where oid = 'public.comite_invites'::regclass) then
    raise exception 'RLS desligada em comite_invites — nada foi alterado.';
  end if;
  select array_agg(format('%s (%s)', policyname, coalesce(with_check, qual, '<vazio>')))
    into v_bad
  from pg_policies
  where schemaname = 'public' and tablename = 'comite_invites'
    and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')
    and coalesce(with_check, qual, '') not ilike '%is_admin_divid%';
  if v_bad is not null then
    raise exception 'comite_invites aceita INSERT de não-admin — nada foi alterado: %', v_bad;
  end if;

  -- 12b. Nenhuma política de comite_user_profiles permite INSERT de não-admin
  select array_agg(policyname) into v_bad
  from pg_policies
  where schemaname = 'public' and tablename = 'comite_user_profiles'
    and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')
    and coalesce(with_check, qual, '') not ilike '%is_admin_divid%';
  if v_bad is not null then
    raise exception 'comite_user_profiles aceita INSERT de não-admin — nada foi alterado: %', v_bad;
  end if;

  -- 12c. Todas as views do conjunto com security_invoker
  select array_agg(format('%s.%s', v.schema, v.relname)) into v_bad
  from _views v join pg_class c on c.oid = v.oid
  where v.relkind = 'v'
    and not exists (select 1 from unnest(c.reloptions) o where o ~* '^security_invoker=(true|on|1|yes)$');
  if v_bad is not null then
    raise exception 'Views sem security_invoker — nada foi alterado: %', v_bad;
  end if;
end $$;

commit;
