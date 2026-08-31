import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportCarteiraPDF } from "@/lib/export-carteira-pdf";
import { exportCarteiraExcel } from "@/lib/export-carteira-excel";
import { pivotValues, sumValueMaps, MESES_ABBR, fmtFc, valorClass } from "@/components/fc-table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carteiras")({
  head: () => ({ meta: [{ title: "Carteiras Intramês — Divid" }] }),
  component: CarteirasIntrames,
});

const MESES_EXTENSO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const BLOCOS_RECEBIDOS = [
  {
    titulo: "Saldos",
    categorias: ["Adiantamento de Pacote de Locação", "Caução (MA)", "Caução (ML)"],
  },
  {
    titulo: "Receitas Intramês",
    categorias: ["Comissão Seguro (MA)", "Manutenção de Danos", "Receita de Administração", "Rendimentos de Aplicações", "Up-Selling"],
  },
  {
    titulo: "GMV",
    categorias: ["Locação ME", "Pacote de Locação (MA)", "Pacote de Locação (ML)", "Locação Short Stay"],
  },
  {
    titulo: "Receitas Transitórias",
    categorias: ["Recorrência Imobiliária Credpago", "Reembolso", "Reembolso Proprietário CAPEX"],
  },
];

type CarteiraDef = {
  nome: string;
  sigla: string;
  entradas: string[];
  saidas: string[];
  noi?: boolean;
};

const CARTEIRAS: CarteiraDef[] = [
  {
    nome: "Management Agreement (MA)",
    sigla: "MA",
    entradas: ["Pacote de Locação (MA)", "Recorrência Imobiliária Credpago"],
    saidas: [
      "Água e Esgoto (MA)", "Aluguel (MA)", "CAPEX (MA)", "Condomínio (MA)",
      "Distribuição Proprietário (MA)", "Energia Elétrica (MA)", "Gás (MA)",
      "Internet (MA)", "IPTU (MA)", "Limpeza (MA)", "Manutenção (MA)",
      "Seguros (MA)", "Taxa de Lixo (MA)", "Taxa de Serviço (MA)",
    ],
  },
  {
    nome: "Master Lease (ML)",
    sigla: "ML",
    entradas: ["Pacote de Locação (ML)"],
    saidas: [
      "Água e Esgoto", "Aluguel", "Condomínio", "Energia Elétrica", "Gás",
      "Internet", "IPTU", "Limpeza", "Manutenção", "Seguros", "Taxa de Lixo",
      "IRRF Locatário",
    ],
    noi: true,
  },
  {
    nome: "Carteira ME",
    sigla: "ME",
    entradas: ["Locação ME"],
    saidas: [
      "Distribuição Proprietário ME", "Administração", "Taxa de contrato",
      "Garantido ME", "Manutenção ME", "Seg. Fiança",
    ],
  },
  {
    nome: "Shortstay",
    sigla: "SS",
    entradas: ["Locação Short Stay", "Airbnb", "Booking", "Expedia"],
    saidas: [
      "Distribuição Proprietário Short Stay", "Limpeza Short Stay",
      "Manutenção Short Stay", "Taxa de Limpeza Short Stay",
      "Taxa de Serviço Short Stay",
    ],
  },
];

type Status = "realizado" | "previsto" | "fechamento";
type MovRow = { categoria: string; valor: number; mes_referencia: string; status: Status };

function CarteirasIntrames() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const [mesSel, setMesSel] = useState(now.getMonth() + 1); // 1-12, default mês vigente

  const mesExtenso = `${MESES_EXTENSO[mesSel - 1]} ${year}`;
  const mesReferencia = `${year}-${String(mesSel).padStart(2, "0")}-01`;

  const inicioAno = `${year}-01-01`;
  const fimAno = `${year}-12-01`;

  // Fetch único cobrindo Jan–Dez do ano vigente
  const { data: recebimentos } = useQuery({
    queryKey: ["carteiras_recebimentos_ano", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carteiras_recebimentos")
        .select("categoria, valor, mes_referencia, status")
        .gte("mes_referencia", inicioAno)
        .lte("mes_referencia", fimAno);
      if (error) throw error;
      return (data ?? []) as MovRow[];
    },
  });

  const { data: pagamentos } = useQuery({
    queryKey: ["carteiras_pagamentos_ano", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carteiras_pagamentos")
        .select("categoria, valor, mes_referencia, status")
        .gte("mes_referencia", inicioAno)
        .lte("mes_referencia", fimAno);
      if (error) throw error;
      return (data ?? []) as MovRow[];
    },
  });

  // --- Cards superiores: filtra apenas o mês selecionado ---
  const valorPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recebimentos ?? []) {
      if (r.mes_referencia.slice(0, 7) !== mesReferencia.slice(0, 7)) continue;
      map.set(r.categoria, (map.get(r.categoria) ?? 0) + Number(r.valor));
    }
    return map;
  }, [recebimentos, mesReferencia]);

  const pagamentoPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of pagamentos ?? []) {
      if (r.mes_referencia.slice(0, 7) !== mesReferencia.slice(0, 7)) continue;
      map.set(r.categoria, (map.get(r.categoria) ?? 0) + Number(r.valor));
    }
    return map;
  }, [pagamentos, mesReferencia]);

  const handleExportPDF = () => {
    const bloco = (titulo: string) => {
      const def = BLOCOS_RECEBIDOS.find(b => b.titulo === titulo);
      const itens = (def?.categorias ?? []).map(cat => ({
        label: cat,
        valor: valorPorCategoria.get(cat) ?? 0,
      }));
      return { total: itens.reduce((a, l) => a + l.valor, 0), itens };
    };

    // Resumo do mês selecionado por carteira
    const resumoCarteiras = CARTEIRAS.map(def => {
      const totalEntradas = def.entradas.reduce((a, cat) => a + (valorPorCategoria.get(cat) ?? 0), 0);
      const totalSaidas = def.saidas.reduce((a, cat) => a + Math.abs(pagamentoPorCategoria.get(cat) ?? 0), 0);
      const saldo = totalEntradas - totalSaidas;
      const r: {
        nome: string; totalEntradas: number; totalSaidas: number; saldo: number;
        noi_valor?: number; noi_pct?: number;
      } = { nome: def.nome, totalEntradas, totalSaidas, saldo };
      if (def.noi) {
        r.noi_valor = saldo;
        r.noi_pct = totalEntradas !== 0 ? (saldo / totalEntradas) * 100 : 0;
      }
      return r;
    });

    // Pivots anuais por carteira
    const recPorCat = new Map<string, MovRow[]>();
    for (const r of recebimentos ?? []) {
      const arr = recPorCat.get(r.categoria);
      if (arr) arr.push(r); else recPorCat.set(r.categoria, [r]);
    }
    const pagPorCat = new Map<string, MovRow[]>();
    for (const r of pagamentos ?? []) {
      const arr = pagPorCat.get(r.categoria);
      if (arr) arr.push(r); else pagPorCat.set(r.categoria, [r]);
    }

    type PivotLinha = { label: string; variant: "cat" | "total-entradas" | "total-saidas" | "saldo"; values: Record<number, number | undefined>; total: number };

    const pivots = CARTEIRAS.map(def => {
      const linhas: PivotLinha[] = [];
      const mesesSet = new Set<number>();

      const entradaMaps: Record<number, number | undefined>[] = [];
      for (const cat of def.entradas) {
        if (!recPorCat.has(cat)) continue; // omite categoria vazia no ano
        const { values, total } = pivotValues(recPorCat.get(cat)!);
        entradaMaps.push(values);
        for (const m in values) if (values[m] != null) mesesSet.add(Number(m));
        linhas.push({ label: cat, variant: "cat", values, total });
      }
      const totalEntradas = sumValueMaps(entradaMaps);
      linhas.push({ label: "Total Entradas", variant: "total-entradas", values: totalEntradas.values, total: totalEntradas.total });

      const saidaMaps: Record<number, number | undefined>[] = [];
      for (const cat of def.saidas) {
        if (!pagPorCat.has(cat)) continue; // omite categoria vazia no ano
        const neg = pagPorCat.get(cat)!.map(r => ({ ...r, valor: -Math.abs(Number(r.valor)) }));
        const { values, total } = pivotValues(neg);
        saidaMaps.push(values);
        for (const m in values) if (values[m] != null) mesesSet.add(Number(m));
        linhas.push({ label: cat, variant: "cat", values, total });
      }
      const totalSaidas = sumValueMaps(saidaMaps);
      linhas.push({ label: "Total Saídas", variant: "total-saidas", values: totalSaidas.values, total: totalSaidas.total });

      const saldo = sumValueMaps([totalEntradas.values, totalSaidas.values]);
      linhas.push({ label: "Saldo", variant: "saldo", values: saldo.values, total: saldo.total });

      const mesesComDados = Array.from(mesesSet).sort((a, b) => a - b);
      return { nome: def.nome, mesesComDados, linhas };
    });

    exportCarteiraPDF({
      mes: mesExtenso,
      geradoEm: new Date().toLocaleString("pt-BR"),
      recebidos: {
        saldos: bloco("Saldos"),
        gmv: bloco("GMV"),
        receitasIntrame: bloco("Receitas Intramês"),
        receitasTransitorias: bloco("Receitas Transitórias"),
      },
      resumoCarteiras,
      pivots,
    });
  };

  const handleExportExcel = async () => {
    const bloco = (titulo: string) => {
      const def = BLOCOS_RECEBIDOS.find(b => b.titulo === titulo);
      const itens = (def?.categorias ?? []).map(cat => ({
        label: cat,
        valor: valorPorCategoria.get(cat) ?? 0,
      }));
      return { total: itens.reduce((a, l) => a + l.valor, 0), itens };
    };

    const resumoCarteiras = CARTEIRAS.map(def => {
      const totalEntradas = def.entradas.reduce((a, cat) => a + (valorPorCategoria.get(cat) ?? 0), 0);
      const totalSaidas = def.saidas.reduce((a, cat) => a + Math.abs(pagamentoPorCategoria.get(cat) ?? 0), 0);
      const saldo = totalEntradas - totalSaidas;
      const r: {
        nome: string; totalEntradas: number; totalSaidas: number; saldo: number;
        noi_valor?: number; noi_pct?: number;
      } = { nome: def.nome, totalEntradas, totalSaidas, saldo };
      if (def.noi) {
        r.noi_valor = saldo;
        r.noi_pct = totalEntradas !== 0 ? (saldo / totalEntradas) * 100 : 0;
      }
      return r;
    });

    const recPorCat = new Map<string, MovRow[]>();
    for (const r of recebimentos ?? []) {
      const arr = recPorCat.get(r.categoria);
      if (arr) arr.push(r); else recPorCat.set(r.categoria, [r]);
    }
    const pagPorCat = new Map<string, MovRow[]>();
    for (const r of pagamentos ?? []) {
      const arr = pagPorCat.get(r.categoria);
      if (arr) arr.push(r); else pagPorCat.set(r.categoria, [r]);
    }

    const sheetNames: Record<string, string> = {
      "Management Agreement (MA)": "MA",
      "Master Lease (ML)": "ML",
      "Carteira ME": "ME",
      "Shortstay": "Shortstay",
    };

    const pivots = CARTEIRAS.map(def => {
      const entradas = def.entradas.map(cat => ({
        label: cat,
        values: recPorCat.has(cat) ? pivotValues(recPorCat.get(cat)!).values : {},
      }));
      const saidas = def.saidas.map(cat => {
        const neg = (pagPorCat.get(cat) ?? []).map(r => ({ ...r, valor: -Math.abs(Number(r.valor)) }));
        return { label: cat, values: pagPorCat.has(cat) ? pivotValues(neg).values : {} };
      });
      return { nome: def.nome, sheetName: sheetNames[def.nome] ?? def.nome, entradas, saidas };
    });

    await exportCarteiraExcel({
      year,
      mes: mesExtenso,
      recebidos: {
        saldos: bloco("Saldos"),
        gmv: bloco("GMV"),
        receitasIntrame: bloco("Receitas Intramês"),
        receitasTransitorias: bloco("Receitas Transitórias"),
      },
      resumoCarteiras,
      pivots,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Carteiras Intramês</h1>
          <p className="text-sm text-muted-foreground">Divid — {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          <Button onClick={handleExportPDF} variant="outline" size="sm">
            <FileDown className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <section className="space-y-3 sticky top-0 z-10 bg-background pb-3 -mx-6 px-6 border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">Recebidos Intramês</h2>
          <Select value={String(mesSel)} onValueChange={(v) => setMesSel(Number(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_EXTENSO.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{`${m} ${year}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {BLOCOS_RECEBIDOS.map(bloco => {
            const linhas = bloco.categorias.map(cat => ({
              categoria: cat,
              valor: valorPorCategoria.get(cat) ?? 0,
            }));
            const total = linhas.reduce((acc, l) => acc + l.valor, 0);
            return (
              <Card key={bloco.titulo}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="font-bold">{bloco.titulo}</span>
                    <span className="font-bold">{brl.format(total)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {linhas.map(l => (
                      <li key={l.categoria} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground truncate">{l.categoria}</span>
                        <span className={l.valor === 0 ? "text-muted-foreground" : "text-foreground"}>
                          {brl.format(l.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Carteiras de Locação</h2>
        <Tabs defaultValue={CARTEIRAS[0].sigla}>
          <TabsList>
            {CARTEIRAS.map(c => (
              <TabsTrigger key={c.sigla} value={c.sigla}>{c.sigla}</TabsTrigger>
            ))}
          </TabsList>
          {CARTEIRAS.map(c => (
            <TabsContent key={c.sigla} value={c.sigla}>
              <CarteiraPivot
                def={c}
                mesSel={mesSel}
                recebimentos={recebimentos ?? []}
                pagamentos={pagamentos ?? []}
              />
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}

type Cells = Record<string, number | undefined>;

/** Chaves de coluna: m1..m(mesSel-1) para meses anteriores; sel-pago/sel-prev/sel-total no mês selecionado */
function colKeysFor(mesSel: number): string[] {
  const keys: string[] = [];
  for (let m = 1; m < mesSel; m++) keys.push(`m${m}`);
  keys.push("sel-pago", "sel-prev", "sel-total");
  return keys;
}

/** Agrega linhas de uma categoria (com sinal já aplicado) nas colunas dinâmicas */
function computeCells(rows: MovRow[], mesSel: number): { cells: Cells; total: number } {
  const cells: Cells = {};
  let total = 0;
  for (const r of rows) {
    const m = parseInt(r.mes_referencia.slice(5, 7), 10);
    if (m > mesSel) continue;
    const v = Number(r.valor) || 0;
    total += v;
    if (m < mesSel) {
      cells[`m${m}`] = (cells[`m${m}`] ?? 0) + v;
    } else {
      if (r.status === "previsto") cells["sel-prev"] = (cells["sel-prev"] ?? 0) + v;
      else cells["sel-pago"] = (cells["sel-pago"] ?? 0) + v; // realizado + fechamento
      cells["sel-total"] = (cells["sel-total"] ?? 0) + v;
    }
  }
  return { cells, total };
}

/** Soma vários mapas de células nas colunas informadas */
function sumCells(maps: (Cells | undefined)[], keys: string[]): { cells: Cells; total: number } {
  const cells: Cells = {};
  for (const map of maps) {
    if (!map) continue;
    for (const k of keys) {
      const v = map[k];
      if (v != null) cells[k] = (cells[k] ?? 0) + v;
    }
  }
  const total = totalFromCells(cells, keys);
  return { cells, total };
}

/** Total = soma dos meses anteriores + total esperado do mês selecionado (sem dupla contagem) */
function totalFromCells(cells: Cells, keys: string[]): number {
  let t = 0;
  for (const k of keys) {
    if (k === "sel-pago" || k === "sel-prev") continue;
    t += cells[k] ?? 0;
  }
  return t;
}

type CRow = {
  key: string;
  label: string;
  indent?: boolean;
  variant?: "header" | "total-green" | "total-red" | "saldo";
  cells?: Cells;
  total?: number;
};

/** Pivot dinâmico (Jan → mês selecionado) com split do mês selecionado em 3 colunas */
function CarteiraPivot({
  def,
  mesSel,
  recebimentos,
  pagamentos,
}: {
  def: CarteiraDef;
  mesSel: number;
  recebimentos: MovRow[];
  pagamentos: MovRow[];
}) {
  const { cols, rows } = useMemo(() => {
    const keys = colKeysFor(mesSel);
    const mesAbbr = MESES_ABBR[mesSel - 1];
    const cols: { key: string; label: string }[] = [];
    for (let m = 1; m < mesSel; m++) cols.push({ key: `m${m}`, label: MESES_ABBR[m - 1] });
    cols.push({ key: "sel-pago", label: `${mesAbbr} — Pago/Recebido` });
    cols.push({ key: "sel-prev", label: `${mesAbbr} — A Pagar/Receber` });
    cols.push({ key: "sel-total", label: `${mesAbbr} — Total Esperado` });

    const recPorCat = new Map<string, MovRow[]>();
    for (const r of recebimentos) {
      const arr = recPorCat.get(r.categoria);
      if (arr) arr.push(r); else recPorCat.set(r.categoria, [r]);
    }
    const pagPorCat = new Map<string, MovRow[]>();
    for (const r of pagamentos) {
      const arr = pagPorCat.get(r.categoria);
      if (arr) arr.push(r); else pagPorCat.set(r.categoria, [r]);
    }

    const rows: CRow[] = [];
    rows.push({ key: `h-${def.nome}`, label: def.nome, variant: "header" });

    // Entradas
    const entradaMaps: Cells[] = [];
    for (const cat of def.entradas) {
      const hasData = recPorCat.has(cat);
      const { cells, total } = computeCells(recPorCat.get(cat) ?? [], mesSel);
      entradaMaps.push(cells);
      rows.push({
        key: `${def.nome}-e-${cat}`, label: cat, indent: true,
        cells: hasData ? cells : {}, total: hasData ? total : undefined,
      });
    }
    const totalEntradas = sumCells(entradaMaps, keys);
    rows.push({
      key: `${def.nome}-total-e`, label: "Total Entradas", variant: "total-green",
      cells: totalEntradas.cells, total: totalEntradas.total,
    });

    // Saídas (valores negativos)
    const saidaMaps: Cells[] = [];
    for (const cat of def.saidas) {
      const hasData = pagPorCat.has(cat);
      const neg = (pagPorCat.get(cat) ?? []).map(r => ({ ...r, valor: -Math.abs(Number(r.valor)) }));
      const { cells, total } = computeCells(neg, mesSel);
      saidaMaps.push(cells);
      rows.push({
        key: `${def.nome}-s-${cat}`, label: cat, indent: true,
        cells: hasData ? cells : {}, total: hasData ? total : undefined,
      });
    }
    const totalSaidas = sumCells(saidaMaps, keys);
    rows.push({
      key: `${def.nome}-total-s`, label: "Total Saídas", variant: "total-red",
      cells: totalSaidas.cells, total: totalSaidas.total,
    });

    // Saldo = Total Entradas + Total Saídas (saídas já negativas) por coluna
    const saldo = sumCells([totalEntradas.cells, totalSaidas.cells], keys);
    rows.push({
      key: `${def.nome}-saldo`, label: "Saldo", variant: "saldo",
      cells: saldo.cells, total: saldo.total,
    });

    return { cols, rows };
  }, [def, mesSel, recebimentos, pagamentos]);

  const colCount = cols.length + 2;

  const rowBg: Record<string, string> = {
    "total-green": "bg-emerald-100 dark:bg-emerald-950/50 font-bold",
    "total-red": "bg-red-100 dark:bg-red-950/50 font-bold",
    saldo: "font-semibold",
  };
  const stickyBg = (variant?: string) =>
    variant === "total-green"
      ? "bg-emerald-100 dark:bg-emerald-950"
      : variant === "total-red"
        ? "bg-red-100 dark:bg-red-950"
        : "bg-background";

  return (
    <div className="relative overflow-auto rounded-lg border max-h-[calc(100vh-220px)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 bg-muted px-3 py-2 text-left min-w-[220px] max-w-[220px] border-b">
              Categoria
            </th>
            {cols.map((c) => (
              <th
                key={c.key}
                className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[120px] border-b font-medium"
              >
                {c.label}
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[110px] border-b font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.variant === "header") {
              return (
                <tr key={row.key}>
                  <td
                    colSpan={colCount}
                    className="sticky left-0 bg-purple-800 text-white px-3 py-1.5 font-bold uppercase text-xs tracking-wide"
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }
            const rowCls = row.variant ? rowBg[row.variant] ?? "" : "";
            return (
              <tr key={row.key} className={cn("border-b last:border-0", rowCls)}>
                <td
                  className={cn(
                    "sticky left-0 z-20 px-3 py-1.5 text-left min-w-[220px] max-w-[220px] truncate",
                    stickyBg(row.variant),
                    row.indent && "pl-7",
                  )}
                >
                  {row.label}
                </td>
                {cols.map((c) => {
                  const v = row.cells?.[c.key];
                  return (
                    <td
                      key={c.key}
                      className={cn("px-3 py-1.5 text-right tabular-nums", v != null && valorClass(v))}
                    >
                      {v == null ? "" : fmtFc(v)}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold",
                    row.total != null && valorClass(row.total),
                  )}
                >
                  {row.total == null ? "" : fmtFc(row.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

