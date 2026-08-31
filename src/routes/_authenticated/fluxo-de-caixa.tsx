import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FcTable, FcStatusTable, pivotValues, sumValueMaps,
  pivotValuesByStatus, sumStatusMaps,
  MESES_ABBR, MES_NUMS,
  type PivotRow, type StatusPivotRow, type StatusVals,
} from "@/components/fc-table";
import {
  useFcConsolidado, useFcReceitas, useFcCentrosCusto, useFcCarteiras, useFcExtras, useFcSaldoInicial,
  type ConsolidadoRow, type ReceitaRow, type CentroCustoRow, type CarteiraRow, type ExtraRow,
} from "@/hooks/use-fluxo-caixa";
import { exportFluxoPDF } from "@/lib/export-fluxo-pdf";
import { exportFluxoExcel } from "@/lib/export-fluxo-excel";

export const Route = createFileRoute("/_authenticated/fluxo-de-caixa")({
  head: () => ({ meta: [{ title: "Fluxo de Caixa — Divid" }] }),
  component: FluxoCaixaPage,
});

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function FluxoCaixaPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1);
  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - 2 + i),
    [currentYear],
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
        <div className="flex items-center gap-2">
          <ExportPdfButton year={year} mesSel={mesSel} />
          <ExportExcelButton year={year} mesSel={mesSel} />
          <Select value={String(mesSel)} onValueChange={(v) => setMesSel(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MES_NUMS.map((m) => (
                <SelectItem key={m} value={String(m)}>{MESES_ABBR[m - 1]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="consolidado">
        <TabsList>
          <TabsTrigger value="consolidado">Consolidado</TabsTrigger>
          <TabsTrigger value="receitas">Receitas</TabsTrigger>
          <TabsTrigger value="centros">Centros de Custo</TabsTrigger>
          <TabsTrigger value="carteiras">Carteiras</TabsTrigger>
          <TabsTrigger value="extras">Extras</TabsTrigger>
        </TabsList>

        <TabsContent value="consolidado"><ConsolidadoTab year={year} mesSel={mesSel} /></TabsContent>
        <TabsContent value="receitas"><ReceitasTab year={year} mesSel={mesSel} /></TabsContent>
        <TabsContent value="centros"><CentrosTab year={year} mesSel={mesSel} /></TabsContent>
        <TabsContent value="carteiras"><CarteirasTab year={year} mesSel={mesSel} /></TabsContent>
        <TabsContent value="extras"><ExtrasTab year={year} mesSel={mesSel} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Loading() {
  return <div className="text-muted-foreground py-10 text-center">Carregando…</div>;
}

/* ---------------- Consolidado ---------------- */

const STRUCT = {
  entradas: ["NOI (ML)", "Administração Long", "Administração Short", "Corretagem", "Serviços", "Up-Selling"],
  saidas: ["Impostos", "CS", "Com. Locatários", "Marketing", "Captações", "Retenção de custos", "Short Stay", "Backoffice", "Gestão de pessoas", "P&D", "Gestão"],
  extraEntradas: ["Receita financeira", "Empréstimos recebidos"],
  extraSaidas: ["CAPEX", "Empréstimos", "Impostos Extras"],
  
};

export function buildConsolidadoRows(
  data: ConsolidadoRow[] | undefined,
  saldosIniciais: { mes_referencia: string; valor: number }[] | undefined,
): PivotRow[] {
  const byLinha = groupBy(data ?? [], (r: ConsolidadoRow) => r.linha);
  const lineValues = (linha: string) => pivotValues(byLinha.get(linha) ?? []);

  const mkLines = (linhas: string[]): PivotRow[] =>
    linhas.map((l) => {
      const { values, total } = lineValues(l);
      const hasData = byLinha.has(l);
      return { key: l, label: l, values: hasData ? values : {}, total: hasData ? total : undefined };
    });

  const sumOf = (linhas: string[]) =>
    sumValueMaps(linhas.map((l) => lineValues(l).values));

  const totalEntradas = sumOf(STRUCT.entradas);
  const totalSaidas = sumOf(STRUCT.saidas);
  const fcOperacional = sumValueMaps([totalEntradas.values, totalSaidas.values]);
  const totalEntradasExtra = sumOf(STRUCT.extraEntradas);
  const totalSaidasExtra = sumOf(STRUCT.extraSaidas);
  const fcExtra = sumValueMaps([totalEntradasExtra.values, totalSaidasExtra.values]);
  // Linhas da seção Saldos vindas da view, na ordem do campo `ordem`, sem hardcode
  const saldosLinhas = Array.from(
    new Map(
      (data ?? [])
        .filter((r: ConsolidadoRow) => r.bloco === "Saldos")
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((r) => [r.linha, r.ordem] as const),
    ).keys(),
  );
  const totalSaldos = sumOf(saldosLinhas);
  const caixaLivre = sumValueMaps([fcOperacional.values, fcExtra.values, totalSaldos.values]);

  // Cadeia de Saldo Inicial -> Caixa Final por mês (1-12)
  const janValor =
    (saldosIniciais ?? []).find((s) => parseInt(s.mes_referencia.slice(5, 7), 10) === 1)?.valor ?? 0;
  const saldoInicial: Record<number, number> = {};
  const caixaFinal: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    saldoInicial[m] = m === 1 ? Number(janValor) : caixaFinal[m - 1] ?? 0;
    caixaFinal[m] = saldoInicial[m] + (caixaLivre.values[m] ?? 0);
  }

  // Último mês com dados no consolidado
  const mesesComDados = new Set(
    (data ?? []).map((r: ConsolidadoRow) => parseInt(r.mes_referencia.slice(5, 7), 10)),
  );
  const ultimoMes = mesesComDados.size ? Math.max(...mesesComDados) : 0;

  return [
    { key: "saldo-inicial", label: "Saldo Inicial", variant: "saldo-inicial", values: saldoInicial },

    { key: "h-entradas", label: "Entradas", variant: "header-green" },
    ...mkLines(STRUCT.entradas),
    { key: "t-entradas", label: "Total Entradas", variant: "total-green", values: totalEntradas.values, total: totalEntradas.total },

    { key: "h-saidas", label: "Saídas", variant: "header-red" },
    ...mkLines(STRUCT.saidas),
    { key: "t-saidas", label: "Total Saídas", variant: "total-red", values: totalSaidas.values, total: totalSaidas.total },

    { key: "fc-op", label: "FC OPERACIONAL", variant: "fc-blue", values: fcOperacional.values, total: fcOperacional.total },

    { key: "h-extra", label: "FC Extra Op", variant: "header-gray" },
    ...mkLines(STRUCT.extraEntradas),
    { key: "t-extra-ent", label: "Total Entradas Extra Op", variant: "subtotal", values: totalEntradasExtra.values, total: totalEntradasExtra.total },
    ...mkLines(STRUCT.extraSaidas),
    { key: "t-extra-sai", label: "Total Saídas Extra Op", variant: "subtotal", values: totalSaidasExtra.values, total: totalSaidasExtra.total },
    { key: "fc-extra", label: "FC EXTRA OP", variant: "fc-blue", values: fcExtra.values, total: fcExtra.total },

    { key: "h-saldos", label: "Saldos Carteiras", variant: "header-purple" },
    ...mkLines(saldosLinhas),
    { key: "t-saldos", label: "Total Saldos", variant: "subtotal", values: totalSaldos.values, total: totalSaldos.total },

    { key: "caixa-livre", label: "FC LIVRE", variant: "caixa-livre", values: caixaLivre.values, total: caixaLivre.total },

    { key: "caixa-final", label: "CAIXA FINAL", variant: "caixa-final", values: caixaFinal, total: ultimoMes ? caixaFinal[ultimoMes] : undefined },
  ];
}

export function buildConsolidadoStatusRows(
  data: ConsolidadoRow[] | undefined,
  saldosIniciais: { mes_referencia: string; valor: number }[] | undefined,
): StatusPivotRow[] {
  const byLinha = groupBy(data ?? [], (r: ConsolidadoRow) => r.linha);
  const lineStatus = (linha: string) =>
    pivotValuesByStatus(
      (byLinha.get(linha) ?? []) as { mes_referencia: string; valor: number; status?: string | null }[],
    );

  const mkLines = (linhas: string[]): StatusPivotRow[] =>
    linhas.map((l) => {
      const { values } = lineStatus(l);
      const hasData = byLinha.has(l);
      return { key: l, label: l, statusValues: hasData ? values : {} };
    });

  const sumOf = (linhas: string[]) =>
    sumStatusMaps(linhas.map((l) => lineStatus(l).values));

  const totalEntradas = sumOf(STRUCT.entradas);
  const totalSaidas = sumOf(STRUCT.saidas);
  const fcOperacional = sumStatusMaps([totalEntradas.values, totalSaidas.values]);
  const totalEntradasExtra = sumOf(STRUCT.extraEntradas);
  const totalSaidasExtra = sumOf(STRUCT.extraSaidas);
  const fcExtra = sumStatusMaps([totalEntradasExtra.values, totalSaidasExtra.values]);

  const saldosLinhas = Array.from(
    new Map(
      (data ?? [])
        .filter((r: ConsolidadoRow) => r.bloco === "Saldos")
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((r) => [r.linha, r.ordem] as const),
    ).keys(),
  );
  const totalSaldos = sumOf(saldosLinhas);
  const fcLivre = sumStatusMaps([fcOperacional.values, fcExtra.values]);

  // Cadeia status-aware: Saldo Inicial -> Caixa Final por mês (1-12)
  const janValor =
    (saldosIniciais ?? []).find((s) => parseInt(s.mes_referencia.slice(5, 7), 10) === 1)?.valor ?? 0;
  const zero: StatusVals = { pago: 0, previsto: 0, total: 0 };
  const saldoInicial: Record<number, StatusVals> = {};
  const caixaFinal: Record<number, StatusVals> = {};
  for (let m = 1; m <= 12; m++) {
    const siTotal = m === 1 ? Number(janValor) : caixaFinal[m - 1]?.total ?? 0;
    saldoInicial[m] = { pago: siTotal, previsto: 0, total: siTotal };
    const fl = fcLivre.values[m] ?? zero;
    const ts = totalSaldos.values[m] ?? zero;
    caixaFinal[m] = {
      pago: siTotal + fl.pago + ts.pago,
      previsto: fl.previsto + ts.previsto,
      total: siTotal + fl.total + ts.total,
    };
  }

  return [
    { key: "saldo-inicial", label: "Saldo Inicial", variant: "saldo-inicial", statusValues: saldoInicial },

    { key: "h-entradas", label: "Entradas", variant: "header-green" },
    ...mkLines(STRUCT.entradas),
    { key: "t-entradas", label: "Total Entradas", variant: "total-green", statusValues: totalEntradas.values },

    { key: "h-saidas", label: "Saídas", variant: "header-red" },
    ...mkLines(STRUCT.saidas),
    { key: "t-saidas", label: "Total Saídas", variant: "total-red", statusValues: totalSaidas.values },

    { key: "fc-op", label: "FC OPERACIONAL", variant: "fc-blue", statusValues: fcOperacional.values },

    { key: "h-extra", label: "FC Extra Op", variant: "header-gray" },
    ...mkLines(STRUCT.extraEntradas),
    { key: "t-extra-ent", label: "Total Entradas Extra Op", variant: "subtotal", statusValues: totalEntradasExtra.values },
    ...mkLines(STRUCT.extraSaidas),
    { key: "t-extra-sai", label: "Total Saídas Extra Op", variant: "subtotal", statusValues: totalSaidasExtra.values },
    { key: "fc-extra", label: "FC EXTRA OP", variant: "fc-blue", statusValues: fcExtra.values },

    { key: "h-saldos", label: "Saldos Carteiras", variant: "header-purple" },
    ...mkLines(saldosLinhas),
    { key: "t-saldos", label: "Total Saldos", variant: "subtotal", statusValues: totalSaldos.values },

    { key: "caixa-livre", label: "FC LIVRE", variant: "caixa-livre", statusValues: fcLivre.values },

    { key: "caixa-final", label: "CAIXA FINAL", variant: "caixa-final", statusValues: caixaFinal },
  ];
}

function ConsolidadoTab({ year, mesSel }: { year: number; mesSel: number }) {
  const { data, isLoading } = useFcConsolidado(year);
  const { data: saldosIniciais } = useFcSaldoInicial(year);

  const rows = useMemo<StatusPivotRow[]>(
    () => buildConsolidadoStatusRows(data, saldosIniciais),
    [data, saldosIniciais],
  );

  if (isLoading) return <Loading />;
  return <FcStatusTable firstColLabel="" rows={rows} mesSel={mesSel} />;
}

/* ---------------- Receitas ---------------- */

function ReceitasTab({ year, mesSel }: { year: number; mesSel: number }) {
  const { data, isLoading } = useFcReceitas(year);

  const rows = useMemo<StatusPivotRow[]>(() => {
    const byCat = groupBy(data ?? [], (r: ReceitaRow) => r.categoria);
    const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const result: StatusPivotRow[] = cats.map((c) => {
      const { values } = pivotValuesByStatus(byCat.get(c)!);
      return { key: c, label: c, statusValues: values };
    });
    const totalGeral = sumStatusMaps(result.map((r) => r.statusValues));
    result.push({ key: "__total", label: "Total Geral", variant: "subtotal", statusValues: totalGeral.values });
    return result;
  }, [data]);

  if (isLoading) return <Loading />;
  return <FcStatusTable firstColLabel="Categoria" rows={rows} mesSel={mesSel} />;
}

/* ---------------- Centros de Custo ---------------- */

export function buildCentrosRows(data: CentroCustoRow[] | undefined): PivotRow[] {
  const byCentro = groupBy(data ?? [], (r: CentroCustoRow) => r.centro_custo);
  const centros = Array.from(byCentro.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const result: PivotRow[] = [];
  const allValues: (Record<number, number | undefined>)[] = [];

  for (const centro of centros) {
    const centroRows = byCentro.get(centro)!;
    const sub = pivotValues(centroRows);
    allValues.push(sub.values);
    result.push({
      key: `c-${centro}`, label: centro, variant: "subtotal",
      values: sub.values, total: sub.total,
    });
    const byCat = groupBy(centroRows, (r) => r.categoria);
    const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
    for (const cat of cats) {
      const { values, total } = pivotValues(byCat.get(cat)!);
      result.push({ key: `c-${centro}-${cat}`, label: cat, indent: true, values, total });
    }
  }

  const totalGeral = sumValueMaps(allValues);
  result.push({ key: "__total", label: "Total Geral", variant: "subtotal", values: totalGeral.values, total: totalGeral.total });
  return result;
}


function CentrosTab({ year, mesSel }: { year: number; mesSel: number }) {
  const { data, isLoading } = useFcCentrosCusto(year);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const rows = useMemo<StatusPivotRow[]>(() => {
    const byCentro = groupBy(data ?? [], (r: CentroCustoRow) => r.centro_custo);
    const centros = Array.from(byCentro.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const result: StatusPivotRow[] = [];
    const allValues: (Record<number, StatusVals | undefined>)[] = [];

    for (const centro of centros) {
      const centroRows = byCentro.get(centro)!;
      const sub = pivotValuesByStatus(centroRows);
      allValues.push(sub.values);
      const isCollapsed = collapsed.has(centro);
      const isNaoId = centro.trim().toLowerCase() === "não identificada";
      result.push({
        key: `c-${centro}`, label: centro, variant: "subtotal",
        labelSuffix: isNaoId ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-orange-500 cursor-help">⚠️</span>
              </TooltipTrigger>
              <TooltipContent>Categorias sem mapeamento no de_para</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : undefined,
        statusValues: sub.values,
        collapsible: true, collapsed: isCollapsed, onToggle: () => toggle(centro),
      });
      if (!isCollapsed) {
        const byCat = groupBy(centroRows, (r) => r.categoria);
        const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
        for (const cat of cats) {
          const { values } = pivotValuesByStatus(byCat.get(cat)!);
          result.push({ key: `c-${centro}-${cat}`, label: cat, indent: true, statusValues: values });
        }
      }
    }

    const totalGeral = sumStatusMaps(allValues);
    result.push({ key: "__total", label: "Total Geral", variant: "subtotal", statusValues: totalGeral.values });
    return result;
  }, [data, collapsed]);

  if (isLoading) return <Loading />;
  return <FcStatusTable firstColLabel="Centro de Custo" rows={rows} mesSel={mesSel} />;
}

/* ---------------- Carteiras ---------------- */

const CARTEIRA_ORDER = ["ML", "MA", "ME", "SS", "Cauções", "CAPEX Proprietário"];
const normCarteira = (c: string) => c.replace(/^Carteira\s+/i, "").trim();

export function buildCarteirasRows(data: CarteiraRow[] | undefined): PivotRow[] {
  const byCart = groupBy(data ?? [], (r: CarteiraRow) => normCarteira(r.carteira));
  const keys = Array.from(byCart.keys());
  const ordered = [
    ...CARTEIRA_ORDER.filter((c) => keys.includes(c)),
    ...keys.filter((c) => !CARTEIRA_ORDER.includes(c)),
  ];

  const result: PivotRow[] = [];
  for (const cart of ordered) {
    const cartRows = byCart.get(cart)!;
    result.push({ key: `h-${cart}`, label: `Carteira ${cart}`, variant: "header-purple" });

    const entradas = cartRows.filter((r) => r.tipo === "CR");
    const saidas = cartRows.filter((r) => r.tipo === "CP");

    const blocks: [string, CarteiraRow[]][] = [
      ["Entradas", entradas],
      ["Saídas", saidas],
    ];
    for (const [label, blockRows] of blocks) {
      if (blockRows.length === 0) continue;
      const byCat = groupBy(blockRows, (r) => r.categoria);
      const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
      for (const cat of cats) {
        const { values, total } = pivotValues(byCat.get(cat)!);
        result.push({ key: `${cart}-${label}-${cat}`, label: cat, indent: true, values, total });
      }
      const sub = pivotValues(blockRows);
      result.push({
        key: `${cart}-${label}-sub`, label: `Total ${label}`, variant: "subtotal",
        values: sub.values, total: sub.total,
      });
    }

    const saldo = pivotValues(cartRows);
    result.push({
      key: `${cart}-saldo`, label: `Saldo ${cart}`, variant: "saldo",
      values: saldo.values, total: saldo.total,
    });
  }
  return result;
}

function buildCarteirasStatusRows(data: CarteiraRow[] | undefined): StatusPivotRow[] {
  const byCart = groupBy(data ?? [], (r: CarteiraRow) => normCarteira(r.carteira));
  const keys = Array.from(byCart.keys());
  const ordered = [
    ...CARTEIRA_ORDER.filter((c) => keys.includes(c)),
    ...keys.filter((c) => !CARTEIRA_ORDER.includes(c)),
  ];

  const result: StatusPivotRow[] = [];
  for (const cart of ordered) {
    const cartRows = byCart.get(cart)!;
    result.push({ key: `h-${cart}`, label: `Carteira ${cart}`, variant: "header-purple" });

    const entradas = cartRows.filter((r) => r.tipo === "CR");
    const saidas = cartRows.filter((r) => r.tipo === "CP");

    const blocks: [string, CarteiraRow[]][] = [
      ["Entradas", entradas],
      ["Saídas", saidas],
    ];
    for (const [label, blockRows] of blocks) {
      if (blockRows.length === 0) continue;
      const byCat = groupBy(blockRows, (r) => r.categoria);
      const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
      for (const cat of cats) {
        const { values } = pivotValuesByStatus(byCat.get(cat)!);
        result.push({ key: `${cart}-${label}-${cat}`, label: cat, indent: true, statusValues: values });
      }
      const sub = pivotValuesByStatus(blockRows);
      result.push({
        key: `${cart}-${label}-sub`, label: `Total ${label}`, variant: "subtotal",
        statusValues: sub.values,
      });
    }

    const saldo = pivotValuesByStatus(cartRows);
    result.push({
      key: `${cart}-saldo`, label: `Saldo ${cart}`, variant: "saldo",
      statusValues: saldo.values,
    });
  }
  return result;
}

function CarteirasTab({ year, mesSel }: { year: number; mesSel: number }) {
  const { data, isLoading } = useFcCarteiras(year);

  const rows = useMemo<StatusPivotRow[]>(() => buildCarteirasStatusRows(data), [data]);

  if (isLoading) return <Loading />;
  return <FcStatusTable firstColLabel="Categoria" rows={rows} mesSel={mesSel} />;
}

/* ---------------- Exportar PDF ---------------- */

function ExportPdfButton({ year, mesSel }: { year: number; mesSel: number }) {
  const { data: consolidado } = useFcConsolidado(year);
  const { data: saldosIniciais } = useFcSaldoInicial(year);
  const { data: centros } = useFcCentrosCusto(year);
  const { data: carteiras } = useFcCarteiras(year);

  const handleExport = () => {
    exportFluxoPDF([
      {
        name: "Consolidado",
        firstColLabel: "Categoria",
        rows: buildConsolidadoRows(consolidado, saldosIniciais),
      },
    ], mesSel);
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      Exportar PDF
    </Button>
  );
}

function ExportExcelButton({ year, mesSel }: { year: number; mesSel: number }) {
  const { data: consolidado } = useFcConsolidado(year);
  const { data: saldosIniciais } = useFcSaldoInicial(year);
  const { data: centros } = useFcCentrosCusto(year);
  const { data: carteiras } = useFcCarteiras(year);

  const handleExport = () => {
    exportFluxoExcel([
      {
        name: "Consolidado",
        firstColLabel: "Categoria",
        rows: buildConsolidadoRows(consolidado, saldosIniciais),
      },
      {
        name: "Centros de Custo",
        firstColLabel: "Centro de Custo",
        rows: buildCentrosRows(centros),
      },
      {
        name: "Carteiras",
        firstColLabel: "Categoria",
        rows: buildCarteirasRows(carteiras),
      },
    ], mesSel);
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <FileSpreadsheet className="mr-2 h-4 w-4" />
      Exportar Excel
    </Button>
  );
}

/* ---------------- Extras ---------------- */

function ExtrasTab({ year, mesSel }: { year: number; mesSel: number }) {
  const { data, isLoading } = useFcExtras(year);

  const rows = useMemo<StatusPivotRow[]>(() => {
    const result: StatusPivotRow[] = [];
    const blocks: [string, "CR" | "CP", string][] = [
      ["CR (Entradas)", "CR", "header-green"],
      ["CP (Saídas)", "CP", "header-red"],
    ];
    for (const [label, tipo, variant] of blocks) {
      const blockRows = (data ?? []).filter((r: ExtraRow) => r.tipo === tipo);
      result.push({ key: `h-${tipo}`, label, variant: variant as StatusPivotRow["variant"] });
      const byCat = groupBy(blockRows, (r) => r.categoria);
      const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
      for (const cat of cats) {
        const { values } = pivotValuesByStatus(byCat.get(cat)!);
        result.push({ key: `${tipo}-${cat}`, label: cat, statusValues: values });
      }
      const sub = sumStatusMaps(cats.map((c) => pivotValuesByStatus(byCat.get(c)!).values));
      result.push({ key: `${tipo}-total`, label: `Total ${tipo}`, variant: "subtotal", statusValues: sub.values });
    }
    return result;
  }, [data]);

  if (isLoading) return <Loading />;
  return <FcStatusTable firstColLabel="Categoria" rows={rows} mesSel={mesSel} />;
}
