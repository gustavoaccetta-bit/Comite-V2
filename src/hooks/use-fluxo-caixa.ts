import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const range = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

function makeFcQuery<T>(view: string, year: number) {
  return useQuery({
    queryKey: ["fc", view, year],
    queryFn: async () => {
      const { from, to } = range(year);
      const { data, error } = await supabase
        .from(view)
        .select("*")
        .gte("mes_referencia", from)
        .lte("mes_referencia", to);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export type SaldoInicialRow = {
  mes_referencia: string;
  valor: number;
};

export const useFcSaldoInicial = (year: number) =>
  makeFcQuery<SaldoInicialRow>("fc_saldo_inicial", year);

export type ConsolidadoRow = {
  mes_referencia: string;
  bloco: string;
  secao: string;
  linha: string;
  ordem: number;
  valor: number;
};

export type ReceitaRow = {
  mes_referencia: string;
  categoria: string;
  valor: number;
};

export type CentroCustoRow = {
  mes_referencia: string;
  centro_custo: string;
  categoria: string;
  valor: number;
};

export type CarteiraRow = {
  mes_referencia: string;
  carteira: string;
  tipo: "CR" | "CP";
  categoria: string;
  valor: number;
};

export type ExtraRow = {
  mes_referencia: string;
  tipo: "CR" | "CP";
  categoria: string;
  valor: number;
};

export const useFcConsolidado = (year: number) =>
  makeFcQuery<ConsolidadoRow>("v_fc_consolidado", year);
export const useFcReceitas = (year: number) =>
  makeFcQuery<ReceitaRow>("v_fc_receitas", year);
export const useFcCentrosCusto = (year: number) =>
  makeFcQuery<CentroCustoRow>("v_fc_centros_custo", year);
export const useFcCarteiras = (year: number) =>
  makeFcQuery<CarteiraRow>("v_fc_carteiras", year);
export const useFcExtras = (year: number) =>
  makeFcQuery<ExtraRow>("v_fc_extras", year);

/** Número do mês (1-12) a partir de mes_referencia "2026-06-01" */
export const mesNum = (ref: string) => parseInt(ref.slice(5, 7), 10);
