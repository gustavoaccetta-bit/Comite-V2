import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtPct, listMeses, mesLabel, MESES_PT } from "@/lib/format";
import { useComiteData, type Modo } from "@/hooks/use-comite-data";
import { useFcConsolidado, useFcSaldoInicial } from "@/hooks/use-fluxo-caixa";
import { buildConsolidadoRows } from "@/routes/_authenticated/fluxo-de-caixa";
import { AnaliseCard } from "@/components/analise-card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Divid" }] }),
  component: DashboardPage,
});

type View = "comite" | "carteiras" | "fluxo_caixa";

const COL_PRIMARY = "var(--primary)";
const COL_DESTRUCTIVE = "var(--destructive)";
const COL_SUCCESS = "var(--success)";

function DashboardPage() {
  const meses = useMemo(() => listMeses(), []);
  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Mês mais recente com realizado em comite_realizado (pago ou fechamento_final)
  const { data: ultimoMes } = useQuery({
    queryKey: ["dashboard_ultimo_mes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comite_realizado")
        .select("mes_referencia")
        .in("tipo", ["pago", "fechamento_final"])
        .order("mes_referencia", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0]?.mes_referencia as string | undefined) ?? null;
    },
  });

  const [mes, setMes] = useState<string | null>(null);
  useEffect(() => {
    if (mes === null) setMes(ultimoMes ?? currentMonth);
  }, [ultimoMes, currentMonth, mes]);

  const [view, setView] = useState<View>("comite");
  const mesAtivo = mes ?? currentMonth;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Divid — {mesLabel(mesAtivo)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mesAtivo} onValueChange={setMes}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => (
                <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={view} onValueChange={v => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="comite">Comitê</TabsTrigger>
          <TabsTrigger value="carteiras">Carteiras</TabsTrigger>
          <TabsTrigger value="fluxo_caixa">Fluxo de Caixa</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "comite" && <ComiteView mes={mesAtivo} />}
      {view === "carteiras" && <CarteirasView mes={mesAtivo} />}
      {view === "fluxo_caixa" && <FluxoView mes={mesAtivo} />}
    </div>
  );
}

/* ============================ COMITÊ ============================ */

type ComiteData = ReturnType<typeof useComiteData>["data"];

function buildConsolidadoData(data: ComiteData) {
  return (data?.grupos ?? []).map(g => ({
    grupo: g.grupo,
    orcado: g.orcado,
    realizado: g.realizado,
    delta: g.realizado - g.orcado,
  }));
}

function buildTop10Estouros(data: ComiteData) {
  const cats: { name: string; delta: number }[] = [];
  (data?.grupos ?? []).forEach(g =>
    g.subgrupos.forEach(s =>
      s.categorias.forEach(c => {
        const delta = c.realizado - c.orcado;
        if (delta > 0) cats.push({ name: c.categoria_comite, delta });
      })
    )
  );
  return cats.sort((a, b) => b.delta - a.delta).slice(0, 10).reverse();
}

function ConsolidadoChart({
  title,
  data,
}: {
  title: string;
  data: { grupo: string; orcado: number; realizado: number; delta: number }[];
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="grupo" fontSize={12} />
            <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
            <RTooltip formatter={(v: number) => fmtBRL(v)} />
            <Legend />
            <Bar dataKey="orcado" name="Orçado" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="realizado" name="Realizado" fill={COL_PRIMARY} radius={[4, 4, 0, 0]} />
            <Bar dataKey="delta" name="Delta" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.delta > 0 ? COL_DESTRUCTIVE : COL_SUCCESS} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function EstourosChart({ title, data }: { title: string; data: { name: string; delta: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-16 text-center">Sem estouros neste mês.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => fmtBRL(v)} fontSize={11} />
              <YAxis type="category" dataKey="name" width={160} fontSize={11} />
              <RTooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="delta" name="Delta" fill={COL_DESTRUCTIVE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Mês fixo usado como proxy do orçado "Base Inicial" (mesma regra do hook useComiteData). */
const BASE_PROXY_MES = "2026-01";

type YtdRow = {
  mes: string;
  custosRealizado: number;
  despesasRealizado: number;
  realizadoTotal: number;
  orcadoRollingTotal: number;
  varRolling: number;
  varBase: number;
};

/** Série jan→mês selecionado, um único round-trip (3 queries com .in(), sem chamar o hook por mês). */
function useComiteYtdSeries(mes: string) {
  const meses = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    return Array.from({ length: m }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  }, [mes]);
  const mesesFetch = useMemo(() => Array.from(new Set([...meses, BASE_PROXY_MES])), [meses]);

  return useQuery({
    queryKey: ["comite_ytd", mes],
    queryFn: async (): Promise<YtdRow[]> => {
      const [catRes, orcRes, realRes] = await Promise.all([
        supabase.from("comite_categorias").select("categoria_omie, grupo"),
        supabase.from("comite_orcamento").select("mes_referencia, valor_rolling").in("mes_referencia", meses),
        supabase.from("comite_realizado").select("mes_referencia, categoria_omie, tipo, valor").in("mes_referencia", mesesFetch),
      ]);
      if (catRes.error) throw catRes.error;
      if (orcRes.error) throw orcRes.error;
      if (realRes.error) throw realRes.error;

      const grupoByOmie = new Map<string, string>();
      (catRes.data ?? []).forEach((c: any) => grupoByOmie.set(c.categoria_omie, c.grupo));

      const orcadoPorMes = new Map<string, number>();
      (orcRes.data ?? []).forEach((o: any) => {
        orcadoPorMes.set(o.mes_referencia, (orcadoPorMes.get(o.mes_referencia) ?? 0) + (Number(o.valor_rolling) || 0));
      });

      // hasFinal por mês: mesma regra do hook (fechamento_final tem prioridade sobre pago)
      const hasFinalPorMes = new Map<string, boolean>();
      (realRes.data ?? []).forEach((r: any) => {
        if (r.tipo === "fechamento_final") hasFinalPorMes.set(r.mes_referencia, true);
      });

      const realizadoPorMes = new Map<string, { custos: number; despesas: number; total: number }>();
      mesesFetch.forEach(m => realizadoPorMes.set(m, { custos: 0, despesas: 0, total: 0 }));
      (realRes.data ?? []).forEach((r: any) => {
        const hasFinal = hasFinalPorMes.get(r.mes_referencia) ?? false;
        if (r.tipo !== (hasFinal ? "fechamento_final" : "pago")) return;
        const grupo = grupoByOmie.get(r.categoria_omie);
        if (!grupo) return; // categoria órfã (sem cadastro) fica de fora, igual ao hook
        const cur = realizadoPorMes.get(r.mes_referencia);
        if (!cur) return;
        const v = Number(r.valor) || 0;
        if (grupo === "Custos Diretos") cur.custos += v;
        else if (grupo === "Despesas") cur.despesas += v;
        cur.total += v;
      });

      const janTotal = realizadoPorMes.get(BASE_PROXY_MES)?.total ?? 0;

      return meses.map((m): YtdRow => {
        const rp = realizadoPorMes.get(m) ?? { custos: 0, despesas: 0, total: 0 };
        const orcadoRollingTotal = orcadoPorMes.get(m) ?? 0;
        return {
          mes: m,
          custosRealizado: rp.custos,
          despesasRealizado: rp.despesas,
          realizadoTotal: rp.total,
          orcadoRollingTotal,
          varRolling: rp.total - orcadoRollingTotal,
          varBase: rp.total - janTotal,
        };
      });
    },
  });
}

function YtdChart({ data }: { data: YtdRow[] }) {
  const chartData = data.map(r => ({
    mesLabel: MESES_PT[Number(r.mes.slice(5, 7)) - 1].slice(0, 3),
    custosRealizado: r.custosRealizado,
    despesasRealizado: r.despesasRealizado,
    varRolling: r.varRolling,
    varBase: r.varBase,
  }));

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Realizado x Variação — Acumulado do ano</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mesLabel" fontSize={12} />
            <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
            <RTooltip formatter={(v: number) => fmtBRL(v)} />
            <Legend />
            <Bar dataKey="custosRealizado" name="Custos Diretos (Realizado)" fill={COL_PRIMARY} radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesasRealizado" name="Despesas (Realizado)" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="varRolling" name="Variação (Rolling)" stroke={COL_DESTRUCTIVE} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="varBase" name="Variação (Base, proxy jan/26)" stroke={COL_SUCCESS} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ComiteView({ mes }: { mes: string }) {
  const [modo, setModo] = useState<Modo>("base");
  const { data: dataRolling } = useComiteData(mes, "rolling");
  const { data: dataBase } = useComiteData(mes, "base");
  const { data: ytdSeries } = useComiteYtdSeries(mes);

  const consolidadoRolling = useMemo(() => buildConsolidadoData(dataRolling), [dataRolling]);
  const consolidadoBase = useMemo(() => buildConsolidadoData(dataBase), [dataBase]);
  const top10Rolling = useMemo(() => buildTop10Estouros(dataRolling), [dataRolling]);
  const top10Base = useMemo(() => buildTop10Estouros(dataBase), [dataBase]);

  const orcadoRolling = dataRolling?.totals.orcado ?? 0;
  const realizadoRolling = dataRolling?.totals.realizado ?? 0;
  const variacaoRolling = realizadoRolling - orcadoRolling;
  const variacaoPctRolling = orcadoRolling ? (variacaoRolling / orcadoRolling) * 100 : null;

  const modoAi = modo === "base" ? "base_inicial" : "rolling";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Orçado (Rolling)" value={fmtBRL(orcadoRolling)} />
        <Kpi label="Total Realizado" value={fmtBRL(realizadoRolling)} />
        <Kpi
          label="Variação R$"
          value={fmtBRL(variacaoRolling)}
          tone={variacaoRolling > 0 ? "bad" : "good"}
        />
        <Kpi
          label="Variação %"
          value={variacaoPctRolling === null ? "—" : fmtPct(variacaoPctRolling)}
          tone={variacaoPctRolling === null ? undefined : variacaoPctRolling > 0 ? "bad" : "good"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ConsolidadoChart title="Consolidado — Rolling" data={consolidadoRolling} />
        <EstourosChart title="Top 10 estouros — Rolling" data={top10Rolling} />
        <ConsolidadoChart title="Consolidado — Base Inicial (proxy: realizado jan/26)" data={consolidadoBase} />
        <EstourosChart title="Top 10 estouros — Base Inicial (proxy jan/26)" data={top10Base} />
      </div>

      <YtdChart data={ytdSeries ?? []} />

      <div className="flex justify-end">
        <Tabs value={modo} onValueChange={v => setModo(v as Modo)}>
          <TabsList>
            <TabsTrigger value="base">Base Inicial</TabsTrigger>
            <TabsTrigger value="rolling">Rolling</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <AnaliseCard aba="comite" mesRef={`${mes}-01`} modo={modoAi} />
    </div>
  );
}

/* ============================ CARTEIRAS ============================ */

const BLOCOS_RECEBIDOS = [
  { titulo: "Saldos", categorias: ["Adiantamento de Pacote de Locação", "Caução (MA)", "Caução (ML)"] },
  { titulo: "GMV", categorias: ["Locação ME", "Pacote de Locação (MA)", "Pacote de Locação (ML)", "Locação Short Stay"] },
  { titulo: "Receitas Intramês", categorias: ["Comissão Seguro (MA)", "Manutenção de Danos", "Receita de Administração", "Rendimentos de Aplicações", "Up-Selling"] },
  { titulo: "Receitas Transitórias", categorias: ["Recorrência Imobiliária Credpago", "Reembolso", "Reembolso Proprietário CAPEX"] },
];

const CARTEIRAS = [
  { nome: "MA", entradas: ["Pacote de Locação (MA)", "Recorrência Imobiliária Credpago"], saidas: ["Água e Esgoto (MA)", "Aluguel (MA)", "CAPEX (MA)", "Condomínio (MA)", "Distribuição Proprietário (MA)", "Energia Elétrica (MA)", "Gás (MA)", "Internet (MA)", "IPTU (MA)", "Limpeza (MA)", "Manutenção (MA)", "Seguros (MA)", "Taxa de Lixo (MA)", "Taxa de Serviço (MA)"] },
  { nome: "ML", entradas: ["Pacote de Locação (ML)"], saidas: ["Água e Esgoto", "Aluguel", "Condomínio", "Energia Elétrica", "Gás", "Internet", "IPTU", "Limpeza", "Manutenção", "Seguros", "Taxa de Lixo", "IRRF Locatário"] },
  { nome: "ME", entradas: ["Locação ME"], saidas: ["Distribuição Proprietário ME", "Administração", "Taxa de contrato", "Garantido ME", "Manutenção ME", "Seg. Fiança"] },
  { nome: "Shortstay", entradas: ["Locação Short Stay"], saidas: ["Distribuição Proprietário Short Stay", "Limpeza Short Stay", "Manutenção Short Stay", "Taxa de Limpeza Short Stay", "Taxa de Serviço Short Stay"] },
];

type MovRow = { categoria: string; valor: number; mes_referencia: string };

function CarteirasView({ mes }: { mes: string }) {
  const year = Number(mes.slice(0, 4));
  const mesNum = Number(mes.slice(5, 7));
  const mesAnteriorNum = mesNum - 1;

  const { data: recebimentos } = useQuery({
    queryKey: ["carteiras_recebimentos_ano", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carteiras_recebimentos")
        .select("categoria, valor, mes_referencia")
        .gte("mes_referencia", `${year}-01-01`)
        .lte("mes_referencia", `${year}-12-01`);
      if (error) throw error;
      return (data ?? []) as MovRow[];
    },
  });
  const { data: pagamentos } = useQuery({
    queryKey: ["carteiras_pagamentos_ano", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carteiras_pagamentos")
        .select("categoria, valor, mes_referencia")
        .gte("mes_referencia", `${year}-01-01`)
        .lte("mes_referencia", `${year}-12-01`);
      if (error) throw error;
      return (data ?? []) as MovRow[];
    },
  });

  const catMap = (rows: MovRow[] | undefined, m: number) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) {
      if (Number(r.mes_referencia.slice(5, 7)) !== m) continue;
      map.set(r.categoria, (map.get(r.categoria) ?? 0) + Number(r.valor));
    }
    return map;
  };

  const saldoCarteira = (rec: Map<string, number>, pag: Map<string, number>, def: typeof CARTEIRAS[number]) => {
    const entradas = def.entradas.reduce((a, c) => a + (rec.get(c) ?? 0), 0);
    const saidas = def.saidas.reduce((a, c) => a + Math.abs(pag.get(c) ?? 0), 0);
    return entradas - saidas;
  };

  const recAtual = catMap(recebimentos, mesNum);
  const pagAtual = catMap(pagamentos, mesNum);
  const recAnt = catMap(recebimentos, mesAnteriorNum);
  const pagAnt = catMap(pagamentos, mesAnteriorNum);

  const chartData = CARTEIRAS.map(def => ({
    carteira: def.nome,
    atual: saldoCarteira(recAtual, pagAtual, def),
    anterior: mesAnteriorNum >= 1 ? saldoCarteira(recAnt, pagAnt, def) : 0,
  }));

  const blocoTotal = (titulo: string) => {
    const def = BLOCOS_RECEBIDOS.find(b => b.titulo === titulo)!;
    return def.categorias.reduce((a, c) => a + (recAtual.get(c) ?? 0), 0);
  };

  const mesAntLabel = mesAnteriorNum >= 1 ? MESES_PT[mesAnteriorNum - 1] : "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Saldos" value={fmtBRL(blocoTotal("Saldos"))} />
        <Kpi label="GMV" value={fmtBRL(blocoTotal("GMV"))} />
        <Kpi label="Receitas Intramês" value={fmtBRL(blocoTotal("Receitas Intramês"))} />
        <Kpi label="Receitas Transitórias" value={fmtBRL(blocoTotal("Receitas Transitórias"))} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Saldo por carteira — {MESES_PT[mesNum - 1]} vs {mesAntLabel}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="carteira" fontSize={12} />
              <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
              <RTooltip formatter={(v: number) => fmtBRL(v)} />
              <Legend />
              <Bar name={MESES_PT[mesNum - 1]} dataKey="atual" fill={COL_PRIMARY} radius={[4, 4, 0, 0]} />
              <Bar name={mesAntLabel} dataKey="anterior" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <AnaliseCard aba="carteiras" mesRef={`${mes}-01`} />
    </div>
  );
}

/* ============================ FLUXO DE CAIXA ============================ */

function FluxoView({ mes }: { mes: string }) {
  const year = Number(mes.slice(0, 4));
  const { data: consolidado } = useFcConsolidado(year);
  const { data: saldosIniciais } = useFcSaldoInicial(year);

  const { caixaFinal, fcOperacional } = useMemo(() => {
    const rows = buildConsolidadoRows(consolidado, saldosIniciais);
    const cf = rows.find(r => r.key === "caixa-final")?.values ?? {};
    const op = rows.find(r => r.key === "fc-op")?.values ?? {};
    return { caixaFinal: cf, fcOperacional: op };
  }, [consolidado, saldosIniciais]);

  const chartData = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      mes: MESES_PT[i].slice(0, 3),
      caixaFinal: caixaFinal[i + 1] ?? 0,
      fcOperacional: fcOperacional[i + 1] ?? 0,
    })),
    [caixaFinal, fcOperacional]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Caixa Final — evolução {year}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Line type="monotone" dataKey="caixaFinal" name="Caixa Final" stroke={COL_PRIMARY} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">FC Operacional por mês — {year}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={chartData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis tickFormatter={(v) => fmtBRL(v)} fontSize={11} width={90} />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="fcOperacional" name="FC Operacional" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fcOperacional >= 0 ? COL_SUCCESS : COL_DESTRUCTIVE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <AnaliseCard aba="fluxo_caixa" mesRef={`${mes}-01`} />
    </div>
  );
}

/* ============================ KPI ============================ */

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={
        "text-xl font-bold mt-1 " +
        (tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "")
      }>{value}</div>
    </div>
  );
}
