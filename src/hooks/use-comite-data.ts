import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Categoria = {
  id: string;
  categoria_omie: string;
  categoria_comite: string;
  grupo: string;
  subgrupo: string;
};

export type LinhaCategoria = {
  categoria_comite: string;
  grupo: string;
  subgrupo: string;
  orcado: number;
  realizado: number;
  a_pagar: number;
};

export type LinhaSubgrupo = {
  subgrupo: string;
  orcado: number;
  realizado: number;
  a_pagar: number;
  categorias: LinhaCategoria[];
};

export type LinhaGrupo = {
  grupo: string;
  orcado: number;
  realizado: number;
  a_pagar: number;
  subgrupos: LinhaSubgrupo[];
};

export type Modo = "base" | "rolling";

export function useFechamentos() {
  return useQuery({
    queryKey: ["fechamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_fechamento")
        .select("*")
        .order("mes_referencia");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useComiteData(mes: string, modo: Modo) {
  return useQuery({
    queryKey: ["comite", mes, modo],
    queryFn: async () => {
      const [catRes, orcRes, realRes, janRes] = await Promise.all([
        supabase.from("comite_categorias").select("*"),
        supabase.from("comite_orcamento").select("*").eq("mes_referencia", mes),
        supabase.from("comite_realizado").select("*").eq("mes_referencia", mes),
        modo === "base"
          ? supabase.from("comite_realizado").select("*").eq("mes_referencia", "2026-01")
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (catRes.error) throw catRes.error;
      if (orcRes.error) throw orcRes.error;
      if (realRes.error) throw realRes.error;
      if (janRes.error) throw janRes.error;

      const categorias = (catRes.data ?? []) as Categoria[];
      const orcamentos = orcRes.data ?? [];
      const realizados = realRes.data ?? [];
      const janRealizados = janRes.data ?? [];

      // detectar se há fechamento_final
      const hasFinal = realizados.some((r: any) => r.tipo === "fechamento_final");

      // index orçado por categoria_comite
      const orcMap = new Map<string, number>();
      if (modo === "base") {
        // Base Inicial: usa o realizado de jan/2026 como referência
        // mapear categoria_omie -> categoria_comite
        const omieToComite = new Map<string, string>();
        categorias.forEach((c) => omieToComite.set(c.categoria_omie, c.categoria_comite));

        const janHasFinal = janRealizados.some((r: any) => r.tipo === "fechamento_final");
        const janRealMap = new Map<string, { pago: number; final: number }>();
        janRealizados.forEach((r: any) => {
          const cur = janRealMap.get(r.categoria_omie) ?? { pago: 0, final: 0 };
          const v = Number(r.valor) || 0;
          if (r.tipo === "pago") cur.pago += v;
          else if (r.tipo === "fechamento_final") cur.final += v;
          janRealMap.set(r.categoria_omie, cur);
        });
        for (const [omie, vals] of janRealMap.entries()) {
          const comite = omieToComite.get(omie) ?? omie;
          const valor = janHasFinal ? vals.final : vals.pago;
          orcMap.set(comite, (orcMap.get(comite) ?? 0) + valor);
        }
      } else {
        orcamentos.forEach((o: any) => {
          const v = Number(o.valor_rolling) || 0;
          orcMap.set(o.categoria_comite, (orcMap.get(o.categoria_comite) ?? 0) + v);
        });
      }

      // index realizado por categoria_omie
      const realMap = new Map<string, { pago: number; a_pagar: number; final: number }>();
      realizados.forEach((r: any) => {
        const cur = realMap.get(r.categoria_omie) ?? { pago: 0, a_pagar: 0, final: 0 };
        const v = Number(r.valor) || 0;
        if (r.tipo === "pago") cur.pago += v;
        else if (r.tipo === "a_pagar") cur.a_pagar += v;
        else if (r.tipo === "fechamento_final") cur.final += v;
        realMap.set(r.categoria_omie, cur);
      });

      // agrupar por categoria_comite
      const porComite = new Map<string, LinhaCategoria>();
      for (const cat of categorias) {
        const r = realMap.get(cat.categoria_omie) ?? { pago: 0, a_pagar: 0, final: 0 };
        const realizado = hasFinal ? r.final : r.pago;
        const a_pagar = hasFinal ? 0 : r.a_pagar;
        const cur = porComite.get(cat.categoria_comite);
        if (cur) {
          cur.realizado += realizado;
          cur.a_pagar += a_pagar;
        } else {
          porComite.set(cat.categoria_comite, {
            categoria_comite: cat.categoria_comite,
            grupo: cat.grupo,
            subgrupo: cat.subgrupo,
            orcado: 0,
            realizado,
            a_pagar,
          });
        }
      }
      // adicionar orçados sem realizado mapeado e setar orcado
      for (const [comite, valor] of orcMap.entries()) {
        const cur = porComite.get(comite);
        if (cur) cur.orcado = valor;
        else {
          // categoria orçada sem cadastro — colocar em grupo "Sem Categoria"
          porComite.set(comite, {
            categoria_comite: comite, grupo: "Sem Grupo", subgrupo: "—",
            orcado: valor, realizado: 0, a_pagar: 0,
          });
        }
      }

      // agrupar por grupo > subgrupo
      const grupos = new Map<string, LinhaGrupo>();
      for (const lc of porComite.values()) {
        let g = grupos.get(lc.grupo);
        if (!g) {
          g = { grupo: lc.grupo, orcado: 0, realizado: 0, a_pagar: 0, subgrupos: [] };
          grupos.set(lc.grupo, g);
        }
        let s = g.subgrupos.find(s => s.subgrupo === lc.subgrupo);
        if (!s) {
          s = { subgrupo: lc.subgrupo, orcado: 0, realizado: 0, a_pagar: 0, categorias: [] };
          g.subgrupos.push(s);
        }
        s.categorias.push(lc);
        s.orcado += lc.orcado; s.realizado += lc.realizado; s.a_pagar += lc.a_pagar;
        g.orcado += lc.orcado; g.realizado += lc.realizado; g.a_pagar += lc.a_pagar;
      }

      const ordered = Array.from(grupos.values()).sort((a, b) => a.grupo.localeCompare(b.grupo));
      ordered.forEach(g => {
        g.subgrupos.sort((a, b) => a.subgrupo.localeCompare(b.subgrupo));
        g.subgrupos.forEach(s => s.categorias.sort((a, b) => a.categoria_comite.localeCompare(b.categoria_comite)));
      });

      const totals = ordered.reduce((acc, g) => ({
        orcado: acc.orcado + g.orcado,
        realizado: acc.realizado + g.realizado,
        a_pagar: acc.a_pagar + g.a_pagar,
      }), { orcado: 0, realizado: 0, a_pagar: 0 });

      return { grupos: ordered, totals, hasFinal, categoriasCount: categorias.length };
    },
  });
}
