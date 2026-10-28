-- fc_replace_lancamentos: escopo do replace passa a incluir o status.
--
-- Bug: o DELETE era por mes_referencia + tipo (todos os status), então subir o
-- previsto (A Pagar/A Receber) apagava o realizado (Pago/Recebido) do mesmo
-- mês/tipo. Realizado e previsto precisam coexistir: o Total Esp. da tela é
-- pago + previsto (pivotValuesByStatus, src/components/fc-table.tsx).
--
-- Regra nova (igual aos uploads de Carteiras e Realizado OMIE):
--   - realizado / previsto: substitui só as linhas daquele status;
--   - fechamento: limpa o mês/tipo inteiro (todos os status) e substitui.
--
-- Assinatura muda de (date, text, jsonb) para (date, text, text, jsonb), sem
-- default em p_status: front antigo contra função nova (ou o inverso) falha na
-- chamada, sem apagar nada. Aplicar junto com o deploy do front.

begin;

drop function if exists public.fc_replace_lancamentos(date, text, jsonb);

create function public.fc_replace_lancamentos(
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

commit;

-- PostgREST: recarrega o cache de schema para enxergar a nova assinatura
notify pgrst, 'reload schema';
