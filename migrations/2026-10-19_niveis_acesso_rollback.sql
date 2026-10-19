-- ============================================================
-- Rollback de 2026-10-19_niveis_acesso.sql
--
-- Restaura o estado salvo em bkp_niveis_acesso (papéis, CHECKs, defaults, TODAS as
-- políticas das tabelas do escopo, das tabelas-base de_para / lancamentos /
-- contas_bancarias e do bucket Comite-extratos, flags de RLS, opções das views e
-- trigger) e apaga o schema de backup no fim. Uma única transação.
-- As políticas *_select criadas nas tabelas-base saem no passo 1a (remove todas as
-- políticas das tabelas listadas em bkp_niveis_acesso.rls_flags e recria as do backup).
--
-- ATENÇÃO, antes de rodar:
--  - Volte o frontend e as Edge Functions invite-user / remove-user para a versão
--    anterior (as novas usam papéis e a função comite_auth_user_info, que somem aqui).
--  - Usuários com perfil criado depois da migration voltam como 'viewer'.
--  - Usuários removidos pela nova tela (remove-user) continuam sem perfil e, se foram
--    banidos, com o login bloqueado — o ban não é desfeito aqui.
--  - comite_invites.usado marcado pelo trigger novo não é revertido.
-- ============================================================

begin;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'bkp_niveis_acesso') then
    raise exception 'Schema bkp_niveis_acesso não existe — migration não aplicada ou rollback já feito.';
  end if;
end $$;

-- ===== 1. Políticas =====
-- 1a. Remove as atuais: todas das tabelas do escopo, as do bucket Comite-extratos
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where (schemaname = 'public' and tablename in (select tabela from bkp_niveis_acesso.rls_flags))
       or (schemaname = 'storage' and tablename = 'objects'
           and (coalesce(qual, '') ilike '%Comite-extratos%' or coalesce(with_check, '') ilike '%Comite-extratos%'))
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
drop policy if exists "prof_insert_self" on public.comite_user_profiles;

-- 1b. Recria as do backup (escopo + storage + prof_insert_self se existia)
do $$
declare r record;
begin
  for r in
    select * from bkp_niveis_acesso.policies
    where (schemaname = 'public' and tablename in (select tabela from bkp_niveis_acesso.rls_flags))
       or (schemaname = 'storage' and tablename = 'objects')
       or (schemaname = 'public' and tablename = 'comite_user_profiles' and policyname = 'prof_insert_self')
  loop
    execute format(
      'create policy %I on %I.%I as %s for %s to %s%s%s',
      r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd,
      (select string_agg(quote_ident(x), ', ') from unnest(r.roles) x),
      case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end
    );
  end loop;
end $$;

-- 1c. Flags de RLS originais
do $$
declare r record;
begin
  for r in select * from bkp_niveis_acesso.rls_flags loop
    execute format('alter table public.%I %s row level security',
                   r.tabela, case when r.rls then 'enable' else 'disable' end);
  end loop;
end $$;

drop function if exists public.current_user_role();
drop function if exists public.comite_auth_user_info(uuid, text);

-- ===== 2. Views: opções originais =====
do $$
declare r record;
begin
  for r in select * from bkp_niveis_acesso.views loop
    execute format('alter view %I.%I reset (security_invoker)', r.schema, r.relname);
    if r.reloptions is not null then
      execute format('alter view %I.%I set (%s)', r.schema, r.relname, array_to_string(r.reloptions, ', '));
    end if;
  end loop;
end $$;

-- ===== 3. Trigger original =====
do $$
begin
  execute (select def from bkp_niveis_acesso.functions where name = 'handle_new_user_comite');
end $$;

-- ===== 4. Papéis, CHECKs e defaults =====
alter table public.comite_user_profiles drop constraint if exists comite_user_profiles_role_check;
alter table public.comite_invites       drop constraint if exists comite_invites_role_check;

update public.comite_user_profiles p set role = b.role
  from bkp_niveis_acesso.profile_roles b where b.id = p.id;
update public.comite_user_profiles set role = 'viewer'
  where role in ('viewer_gestor', 'viewer_operacao');

update public.comite_invites i set role = b.role
  from bkp_niveis_acesso.invite_roles b where b.id = i.id;
update public.comite_invites set role = 'viewer'
  where role in ('viewer_gestor', 'viewer_operacao');

do $$
declare r record;
begin
  for r in select * from bkp_niveis_acesso.role_constraints loop
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname, r.def);
  end loop;

  for r in select * from bkp_niveis_acesso.role_defaults loop
    if r.def is null then
      execute format('alter table public.%I alter column role drop default', r.tbl);
    else
      execute format('alter table public.%I alter column role set default %s', r.tbl, r.def);
    end if;
  end loop;
end $$;

drop schema bkp_niveis_acesso cascade;

commit;
