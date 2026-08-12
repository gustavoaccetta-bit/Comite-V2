// Supabase Edge Function: analise-ia
// Deploy: supabase functions deploy analise-ia
// Secrets necessários:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (padrão)
//   ANTHROPIC_API_KEY (adicionar via Lovable Cloud secrets)
//
// Entrada (POST JSON):
//   { aba: 'comite' | 'carteiras' | 'fluxo_caixa', mes_referencia: 'YYYY-MM-01', modo?: 'base_inicial' | 'rolling' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

/** Nome do mês em pt-BR a partir de "YYYY-MM-01" */
function mesLabel(ref: string) {
  const [y, m] = ref.split("-").map(Number);
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[(m ?? 1) - 1]}/${y}`;
}

/** Mês anterior a "YYYY-MM-01" no mesmo formato */
function mesAnterior(ref: string) {
  const [y, m] = ref.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-01`;
}

const SYSTEM_PROMPT =
  "Você é o analista financeiro sênior da Divid, empresa de gestão de imóveis. Escreva análises executivas em português, concisas (3 a 5 parágrafos), diretas, sem jargão desnecessário. Cite valores em R$ formato pt-BR. Nunca invente números — use apenas os dados fornecidos.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

    const body = (await req.json().catch(() => null)) as {
      aba?: "comite" | "carteiras" | "fluxo_caixa";
      mes_referencia?: string;
      modo?: "base_inicial" | "rolling";
    } | null;

    const aba = body?.aba;
    const mes_referencia = body?.mes_referencia;
    const modo = body?.modo ?? "rolling";

    if (!aba || !["comite", "carteiras", "fluxo_caixa"].includes(aba)) {
      return json({ error: "aba inválida" }, 400);
    }
    if (!mes_referencia || !/^\d{4}-\d{2}-01$/.test(mes_referencia)) {
      return json({ error: "mes_referencia inválido (use YYYY-MM-01)" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ---- user id do JWT (opcional) ----
    let criado_por: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      criado_por = data.user?.id ?? null;
    }

    const mesTexto = mesLabel(mes_referencia);
    let dados: unknown;
    let userPrompt = "";

    // ============================================================
    // ABA: COMITE
    // ============================================================
    if (aba === "comite") {
      // comite_realizado usa mes_referencia como texto "YYYY-MM"
      const mesTxt = mes_referencia.slice(0, 7);

      const { data: realizado, error: realErr } = await admin
        .from("comite_realizado")
        .select("categoria_omie, tipo, valor, mes_referencia")
        .eq("mes_referencia", mesTxt);
      if (realErr) throw realErr;

      const { data: orcamento, error: orcErr } = await admin
        .from("comite_orcamento")
        .select("categoria_comite, mes_referencia, valor_base, valor_rolling")
        .eq("mes_referencia", mesTxt);
      if (orcErr) throw orcErr;

      const { data: categorias, error: catErr } = await admin
        .from("comite_categorias")
        .select("categoria_omie, categoria_comite, grupo, subgrupo");
      if (catErr) throw catErr;

      const semRealizado = !realizado || realizado.length === 0;
      const semOrcamento = !orcamento || orcamento.length === 0;
      if (semRealizado && semOrcamento) return json({ error: "Sem dados para este mês" }, 400);

      const catMap = new Map(
        (categorias ?? []).map((c) => [c.categoria_omie, c]),
      );

      // realizado agregado por categoria_comite
      const realPorCat = new Map<string, { grupo: string; subgrupo: string; realizado: number }>();
      for (const r of realizado ?? []) {
        const c = catMap.get(r.categoria_omie);
        const categoria_comite = c?.categoria_comite ?? r.categoria_omie;
        const cur = realPorCat.get(categoria_comite) ?? {
          grupo: c?.grupo ?? "",
          subgrupo: c?.subgrupo ?? "",
          realizado: 0,
        };
        cur.realizado += Number(r.valor) || 0;
        realPorCat.set(categoria_comite, cur);
      }

      // orçado por categoria_comite
      const orcPorCat = new Map<string, number>();
      for (const o of orcamento ?? []) {
        const val = modo === "base_inicial" ? Number(o.valor_base) : Number(o.valor_rolling);
        orcPorCat.set(o.categoria_comite, (orcPorCat.get(o.categoria_comite) ?? 0) + (val || 0));
      }

      const todasCats = new Set<string>([...realPorCat.keys(), ...orcPorCat.keys()]);
      const linhas = [...todasCats].map((categoria) => {
        const info = realPorCat.get(categoria);
        const orcado = orcPorCat.get(categoria) ?? 0;
        const realizadoV = info?.realizado ?? 0;
        const variacao = realizadoV - orcado;
        const variacaoPct = orcado !== 0 ? (variacao / Math.abs(orcado)) * 100 : null;
        return {
          categoria,
          grupo: info?.grupo ?? "",
          subgrupo: info?.subgrupo ?? "",
          orcado,
          realizado: realizadoV,
          variacao,
          variacao_pct: variacaoPct,
        };
      });
      linhas.sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));

      dados = { mes: mesTexto, modo, linhas };
      userPrompt = `Analise o orçado vs realizado do mês ${mesTexto}. Foque nos principais desvios e aumentos: onde estourou o orçamento, onde ficou abaixo, e o que merece atenção do comitê. Dados: ${JSON.stringify(dados)}`;
    }

    // ============================================================
    // ABA: CARTEIRAS
    // ============================================================
    else if (aba === "carteiras") {
      const anterior = mesAnterior(mes_referencia);

      const [{ data: recAtual, error: e1 }, { data: pagAtual, error: e2 }, { data: recAnt, error: e3 }, { data: pagAnt, error: e4 }] =
        await Promise.all([
          admin.from("carteiras_recebimentos").select("categoria, valor").eq("mes_referencia", mes_referencia),
          admin.from("carteiras_pagamentos").select("categoria, valor").eq("mes_referencia", mes_referencia),
          admin.from("carteiras_recebimentos").select("categoria, valor").eq("mes_referencia", anterior),
          admin.from("carteiras_pagamentos").select("categoria, valor").eq("mes_referencia", anterior),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;

      if ((recAtual?.length ?? 0) === 0 && (pagAtual?.length ?? 0) === 0) {
        return json({ error: "Sem dados para este mês" }, 400);
      }

      const agrupar = (rec: { categoria: string; valor: number }[] | null, pag: { categoria: string; valor: number }[] | null) => {
        const map = new Map<string, { entradas: number; saidas: number }>();
        for (const r of rec ?? []) {
          const cur = map.get(r.categoria) ?? { entradas: 0, saidas: 0 };
          cur.entradas += Number(r.valor) || 0;
          map.set(r.categoria, cur);
        }
        for (const p of pag ?? []) {
          const cur = map.get(p.categoria) ?? { entradas: 0, saidas: 0 };
          cur.saidas += Number(p.valor) || 0;
          map.set(p.categoria, cur);
        }
        return [...map].map(([categoria, v]) => ({
          categoria,
          entradas: v.entradas,
          saidas: v.saidas,
          saldo: v.entradas + v.saidas,
        }));
      };

      dados = {
        mes: mesTexto,
        mes_anterior: mesLabel(anterior),
        atual: agrupar(recAtual, pagAtual),
        anterior: agrupar(recAnt, pagAnt),
      };
      userPrompt = `Analise a performance geral das carteiras (MA, ML, ME, Shortstay) no mês ${mesTexto}, comparando com o mês anterior: saldos, entradas, saídas e destaques. Dados: ${JSON.stringify(dados)}`;
    }

    // ============================================================
    // ABA: FLUXO DE CAIXA
    // ============================================================
    else {
      const year = mes_referencia.slice(0, 4);
      const from = `${year}-01-01`;
      const { data: consolidado, error: fcErr } = await admin
        .from("v_fc_consolidado")
        .select("mes_referencia, bloco, secao, linha, ordem, valor")
        .gte("mes_referencia", from)
        .lte("mes_referencia", mes_referencia);
      if (fcErr) throw fcErr;

      if (!consolidado || consolidado.length === 0) {
        return json({ error: "Sem dados para este mês" }, 400);
      }

      // estruturar por bloco/linha/mês
      type Estrut = { bloco: string; secao: string; linha: string; ordem: number; meses: Record<string, number> };
      const map = new Map<string, Estrut>();
      for (const row of consolidado) {
        const key = `${row.bloco}||${row.secao}||${row.linha}`;
        const cur = map.get(key) ?? { bloco: row.bloco, secao: row.secao, linha: row.linha, ordem: row.ordem, meses: {} };
        const mNum = String(Number(row.mes_referencia.slice(5, 7)));
        cur.meses[mNum] = (cur.meses[mNum] ?? 0) + (Number(row.valor) || 0);
        map.set(key, cur);
      }
      const estrutura = [...map.values()].sort((a, b) => a.ordem - b.ordem);

      dados = { ano: year, ate_mes: mesTexto, estrutura };
      userPrompt = `Discorra sobre o fluxo de caixa do ano até ${mesTexto}: evolução do caixa, meses de maior geração/consumo, comportamento do FC operacional, extraoperacional e saldos de carteiras. Dados: ${JSON.stringify(dados)}`;
    }

    // ============================================================
    // Chamada Anthropic
    // ============================================================
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return json({ error: `Anthropic API: ${errText}` }, 500);
    }

    const anthropicData = await anthropicRes.json();
    const comentario: string =
      anthropicData?.content?.map((c: { text?: string }) => c.text ?? "").join("").trim() ?? "";

    if (!comentario) return json({ error: "Resposta vazia da IA" }, 500);

    // ============================================================
    // Persistir em ai_analises
    // ============================================================
    const { data: inserted, error: insErr } = await admin
      .from("ai_analises")
      .insert({ aba, mes_referencia, modo, comentario, criado_por })
      .select("criado_em")
      .single();
    if (insErr) throw insErr;

    return json({ comentario, created_at: inserted?.criado_em });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro desconhecido" }, 500);
  }
});
