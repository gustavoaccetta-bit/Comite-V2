-- ============================================================
-- Detalhe dos perfis do Comitê não-admin (SOMENTE LEITURA)
-- Uma única consulta que devolve um único JSON (coluna "viewers_detalhe").
--
-- Para decidir quem tem perfil do Comitê só porque o trigger antigo criava um
-- 'viewer' para TODO usuário novo do projeto (ex.: quem só usa o Fechamento SS):
--  convidado_ao_comite    há convite em comite_invites para o e-mail (entrou pelo Comitê)
--  perfil_outra_plat      user_profiles.perfil
--  predios                user_building_access.building
--  login_criado_em        quando o login nasceu (mesmo dia do onboarding de outra plataforma?)
--  ultimo_login           é global (auth compartilhado): não prova uso do Comitê
--  escreveu_no_comite     autoria em tabelas do Comitê (viewers normalmente não escrevem)
-- ============================================================

select jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
         'email', u.email,
         'comite_role', p.role,
         'convidado_ao_comite', exists (select 1 from public.comite_invites i where lower(i.email) = lower(u.email)),
         'perfil_outra_plat', (select up.perfil from public.user_profiles up where up.id = u.id),
         'predios', (select jsonb_agg(distinct b.building) from public.user_building_access b where b.user_id = u.id),
         'login_criado_em', u.created_at,
         'ultimo_login', u.last_sign_in_at,
         'escreveu_no_comite',
           exists (select 1 from public.comite_comentarios c where c.criado_por = u.id)
           or exists (select 1 from public.comite_pareceres c where c.criado_por = u.id)
           or exists (select 1 from public.comite_extratos c where c.criado_por = u.id)
           or exists (select 1 from public.comite_realizado c where c.criado_por = u.id)
       ) order by u.created_at), '[]'::jsonb)) as viewers_detalhe
from auth.users u
join public.comite_user_profiles p on p.id = u.id
where p.role <> 'admin_divid';
