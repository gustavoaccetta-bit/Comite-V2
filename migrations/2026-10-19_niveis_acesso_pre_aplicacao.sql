-- ============================================================
-- Pré-aplicação (SOMENTE LEITURA) — rodar ANTES de 2026-10-19_niveis_acesso.sql
-- Uma única consulta que devolve um único JSON (coluna "pre_aplicacao").
--
-- Chaves:
--  tabelas_outras_plataformas  colunas e FKs de user_profiles / user_building_access
--                              (para fixar a coluna usada em comite_auth_user_info)
--  logins_sem_perfil_comite    item 6: quem tem login sem perfil do Comitê e se usa outra plataforma
--  viewers_atuais              item 8: viewers (e-mail, nome, último login, outra plataforma?)
--  escritas_via_api            quais papéis do Postgres escreveram nas tabelas restritas
--                              (pg_stat_statements; authenticated/anon = via API com usuário logado)
--  autores_por_tabela          criado_por de cada linha, com o papel do autor no Comitê
--
-- Se der erro em "extensions.pg_stat_statements", remova a chave escritas_via_api.
-- ============================================================

with
autores as (
  select 'fc_lancamentos' as tabela, to_jsonb(t)->>'criado_por' as criado_por, to_jsonb(t)->>'criado_em' as criado_em from public.fc_lancamentos t
  union all
  select 'fc_saldo_inicial', to_jsonb(t)->>'criado_por', to_jsonb(t)->>'criado_em' from public.fc_saldo_inicial t
  union all
  select 'ai_analises', to_jsonb(t)->>'criado_por', to_jsonb(t)->>'criado_em' from public.ai_analises t
  union all
  select 'carteiras_recebimentos', to_jsonb(t)->>'criado_por', to_jsonb(t)->>'criado_em' from public.carteiras_recebimentos t
  union all
  select 'carteiras_pagamentos', to_jsonb(t)->>'criado_por', to_jsonb(t)->>'criado_em' from public.carteiras_pagamentos t
),
usuarios as (
  select u.id, u.email::text as email, u.last_sign_in_at, u.banned_until,
         p.role as comite_role, p.nome as comite_nome,
         exists (select 1 from public.user_profiles x
                 where to_jsonb(x)->>'user_id' = u.id::text or to_jsonb(x)->>'id' = u.id::text) as em_user_profiles,
         exists (select 1 from public.user_building_access x
                 where to_jsonb(x)->>'user_id' = u.id::text or to_jsonb(x)->>'id' = u.id::text) as em_user_building_access
  from auth.users u
  left join public.comite_user_profiles p on p.id = u.id
)
select jsonb_pretty(jsonb_build_object(

  'tabelas_outras_plataformas', (
    select jsonb_agg(jsonb_build_object(
             'tabela', n,
             'existe', to_regclass('public.' || n) is not null,
             'colunas', (select jsonb_agg(column_name::text order by ordinal_position)
                         from information_schema.columns
                         where table_schema = 'public' and table_name = n),
             'fks_para_auth_users', (select jsonb_agg(pg_get_constraintdef(c.oid))
                                     from pg_constraint c
                                     where c.conrelid = to_regclass('public.' || n)
                                       and c.contype = 'f' and c.confrelid = 'auth.users'::regclass)
           ))
    from unnest(array['user_profiles', 'user_building_access']) n
  ),

  'logins_sem_perfil_comite', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', email,
             'id', id,
             'ultimo_login', last_sign_in_at,
             'banned_until', banned_until,
             'em_user_profiles', em_user_profiles,
             'em_user_building_access', em_user_building_access
           ) order by email), '[]'::jsonb)
    from usuarios where comite_role is null
  ),

  'viewers_atuais', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', email,
             'nome', comite_nome,
             'ultimo_login', last_sign_in_at,
             'banned_until', banned_until,
             'usa_outra_plataforma', em_user_profiles or em_user_building_access
           ) order by last_sign_in_at desc nulls last), '[]'::jsonb)
    from usuarios where comite_role = 'viewer'
  ),

  'escritas_via_api', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'papel_pg', r.rolname,
             'chamadas', s.calls,
             'query', left(regexp_replace(s.query, '\s+', ' ', 'g'), 300)
           ) order by s.calls desc), '[]'::jsonb)
    from extensions.pg_stat_statements s
    join pg_roles r on r.oid = s.userid
    where s.query ~* '\m(insert|update|delete|merge)\M|fc_replace_lancamentos'
      and s.query ~* '\m(fc_lancamentos|fc_saldo_inicial|ai_analises|carteiras_recebimentos|carteiras_pagamentos|fc_replace_lancamentos)\M'
  ),

  'autores_por_tabela', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tabela', tabela,
             'criado_por', criado_por,
             'email', email,
             'papel_comite', comite_role,
             'linhas', n,
             'ultima', ultima
           ) order by tabela, n desc), '[]'::jsonb)
    from (
      select a.tabela, a.criado_por, u.email, u.comite_role, count(*) as n, max(a.criado_em) as ultima
      from autores a
      left join usuarios u on u.id::text = a.criado_por
      group by 1, 2, 3, 4
    ) s
  )

)) as pre_aplicacao;
