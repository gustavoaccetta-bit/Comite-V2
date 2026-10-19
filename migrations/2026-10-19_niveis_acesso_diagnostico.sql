-- ============================================================
-- Diagnóstico (SOMENTE LEITURA) — rodar ANTES de 2026-10-19_niveis_acesso.sql
-- Uma única consulta que devolve um único JSON (coluna "diagnostico").
-- Cole no SQL Editor, rode, copie o valor da célula e cole na conversa.
-- ============================================================

with recursive
-- v_fc_* + views aninhadas que elas leem
vw(oid) as (
  select c.oid from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname like 'v\_fc\_%' and c.relkind in ('v','m')
  union
  select d.refobjid
  from vw
  join pg_rewrite r on r.ev_class = vw.oid
  join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
                  and d.refclassid = 'pg_class'::regclass and d.refobjid <> vw.oid
  join pg_class c2 on c2.oid = d.refobjid and c2.relkind in ('v','m')
),
-- dependências diretas (pg_depend) das regras de cada view
vw_deps as (
  select vw.oid as view_oid, d.refclassid, d.refobjid
  from vw
  join pg_rewrite r on r.ev_class = vw.oid
  join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid and d.refobjid <> vw.oid
)
select jsonb_pretty(jsonb_build_object(

  -- 1. Versão do Postgres (security_invoker em views exige 15+)
  'versao', version(),

  -- 2. Views v_fc_* e aninhadas: tipo (v = view, m = materialized), opções, dono e definição
  'views', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'view', c.relname,
             'relkind', c.relkind,
             'reloptions', c.reloptions,
             'dono', pg_get_userbyid(c.relowner),
             'definicao', pg_get_viewdef(c.oid, true)
           ) order by c.relname), '[]'::jsonb)
    from vw join pg_class c on c.oid = vw.oid
  ),

  -- 3. Tabelas/views lidas por cada view, com RLS e SELECT do authenticated
  'views_leem', (
    select coalesce(jsonb_agg(x order by x->>'view', x->>'le_de'), '[]'::jsonb)
    from (
      select distinct jsonb_build_object(
               'view', v.relname,
               'le_de', t.oid::regclass::text,
               'relkind', t.relkind,
               'rls_ligada', t.relrowsecurity,
               'authenticated_tem_select', has_table_privilege('authenticated', t.oid, 'SELECT')
             ) as x
      from vw_deps dd
      join pg_class v on v.oid = dd.view_oid
      join pg_class t on t.oid = dd.refobjid
      where dd.refclassid = 'pg_class'::regclass
    ) s
  ),

  -- 4. Funções chamadas pelas views (security_definer = true => SECURITY DEFINER)
  'views_funcoes', (
    select coalesce(jsonb_agg(x order by x->>'view', x->>'funcao'), '[]'::jsonb)
    from (
      select distinct jsonb_build_object(
               'view', v.relname,
               'funcao', p.oid::regprocedure::text,
               'security_definer', p.prosecdef
             ) as x
      from vw_deps dd
      join pg_class v on v.oid = dd.view_oid
      join pg_proc p on p.oid = dd.refobjid
      where dd.refclassid = 'pg_proc'::regclass
        and p.pronamespace <> 'pg_catalog'::regnamespace
    ) s
  ),

  -- 5. CHECKs de role
  'checks_role', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabela', conrelid::regclass::text,
             'conname', conname,
             'def', pg_get_constraintdef(oid)
           )), '[]'::jsonb)
    from pg_constraint
    where contype = 'c'
      and conrelid in (to_regclass('public.comite_user_profiles'), to_regclass('public.comite_invites'))
  ),

  -- 6. Colunas de comite_invites (confere se usado_em já existe)
  'colunas_comite_invites', (
    select coalesce(jsonb_agg(column_name::text order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'comite_invites'
  ),

  -- 7. RLS ligada por tabela em public
  'rls_tabelas', (
    select coalesce(jsonb_object_agg(c.relname, c.relrowsecurity), '{}'::jsonb)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
  ),

  -- 8. Políticas atuais
  'politicas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabela', tablename,
             'politica', policyname,
             'permissive', permissive,
             'roles', roles,
             'cmd', cmd,
             'using', qual,
             'with_check', with_check
           ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'public'
  ),

  -- 9. Trigger de novo usuário (null se a função não existir)
  'trigger_handle_new_user_comite', (
    select pg_get_functiondef(p)
    from to_regprocedure('public.handle_new_user_comite()') p
    where p is not null
  ),

  -- 10. Distribuição de papéis e convites
  'papeis_perfis', (
    select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
    from (select role, count(*) as n from public.comite_user_profiles group by role) s
  ),
  'papeis_convites', (
    select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
    from (select role, count(*) as n from public.comite_invites group by role) s
  ),

  -- 11. Logins SEM perfil (ex.: removidos pela tela antiga, que só apagava o perfil)
  'logins_sem_perfil', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id,
             'email', u.email,
             'ultimo_login', u.last_sign_in_at,
             'banned_until', u.banned_until
           ) order by u.last_sign_in_at desc nulls last), '[]'::jsonb)
    from auth.users u
    left join public.comite_user_profiles p on p.id = u.id
    where p.id is null
  ),

  -- 12. Funções SECURITY DEFINER em public que tocam as tabelas que serão restritas
  'funcoes_definer_tocando_restritas', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text), '[]'::jsonb)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.prosrc ~* '(fc_lancamentos|fc_saldo_inicial|ai_analises|v_fc_)'
  )

)) as diagnostico;
