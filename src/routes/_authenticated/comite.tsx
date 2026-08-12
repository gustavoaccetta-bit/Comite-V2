import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Printer, Lock, FileSpreadsheet } from "lucide-react";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtBRL, fmtPct, listMeses, mesLabel } from "@/lib/format";
import { exportPDF } from "@/lib/export-pdf";
import { useComiteData, useFechamentos, type Modo } from "@/hooks/use-comite-data";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ResponsaveisCell } from "@/components/responsaveis-cell";
import { ComentariosCell } from "@/components/comentarios-cell";
import { ExtratoSection } from "@/components/extrato-section";
import { ParecerSection } from "@/components/parecer-section";

export const Route = createFileRoute("/_authenticated/comite")({
  head: () => ({ meta: [{ title: "Comitê — Divid" }] }),
  component: ComitePage,
});

function ComitePage() {
  const meses = useMemo(() => listMeses(), []);
  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [mes, setMes] = useState(currentMonth);
  const [modo, setModo] = useState<Modo>("base");
  const { data: fechamentos } = useFechamentos();
  const { data, isLoading } = useComiteData(mes, modo);

  const fechamentoSet = useMemo(
    () => new Map((fechamentos ?? []).map(f => [f.mes_referencia, f])),
    [fechamentos]
  );
  const fechamentoAtual = fechamentoSet.get(mes);

  const exportarExcel = async () => {
    if (!data) return;
    const mesFormatado = mesLabel(mes);
    const modoAtual = modo === "base" ? "Base Inicial" : "Rolling";
    const isFechamento = data.hasFinal;
    const t = data.totals;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Comitê ${mesFormatado}`);

    ws.columns = [
      { key: "cat", width: 42 },
      { key: "orc", width: 16 },
      { key: "real", width: 16 },
      { key: "apagar", width: 16 },
      { key: "percReal", width: 13 },
      { key: "percFalta", width: 13 },
      { key: "varRs", width: 16 },
      { key: "varTotal", width: 18 },
    ];

    const tituloRow = ws.addRow(["Comitê Financeiro — Divid"]);
    tituloRow.getCell(1).font = { bold: true, size: 14 };
    ws.mergeCells("A1:H1");

    const subRow = ws.addRow([
      `Mês: ${mesFormatado} | Modo: ${modoAtual} | Gerado em: ${new Date().toLocaleDateString("pt-BR")}`,
    ]);
    subRow.getCell(1).font = { size: 10, color: { argb: "FF666666" } };
    ws.mergeCells("A2:H2");

    ws.addRow([]);

    const cabecalho = isFechamento
      ? ["CATEGORIA", "ORÇADO", "REALIZADO", "% REALIZADO", "% FALTA", "R$ VARIAÇÃO"]
      : ["CATEGORIA", "ORÇADO", "REALIZADO", "A PAGAR", "% REALIZADO", "% FALTA", "R$ VARIAÇÃO", "R$ REAL+APAGAR"];
    const headerRow = ws.addRow(cabecalho);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1b1b1b" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF72afac" } } };
    });

    const addLinha = (
      nivel: 0 | 1 | 2,
      nome: string,
      orc: number,
      real: number,
      aPagar: number,
      varRs: number,
      varTotal: number,
    ) => {
      const percReal = orc > 0 ? real / orc : 0;
      const percFalta = 1 - percReal;
      const indent = nivel === 0 ? "" : nivel === 1 ? "  " : "    ";

      const rowData = isFechamento
        ? [`${indent}${nome}`, orc, real, percReal, percFalta, varRs]
        : [`${indent}${nome}`, orc, real, aPagar, percReal, percFalta, varRs, varTotal];
      const row = ws.addRow(rowData);

      const nomeCell = row.getCell(1);
      if (nivel === 0) {
        nomeCell.font = { bold: true };
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFf0f0f0" } };
        });
      } else if (nivel === 1) {
        nomeCell.font = { bold: true, color: { argb: "FF444444" } };
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFf8f8f8" } };
        });
      }

      const colsMonetarias = isFechamento ? [2, 3, 6] : [2, 3, 4, 7, 8];
      colsMonetarias.forEach((col) => {
        row.getCell(col).numFmt = "R$ #,##0.00";
      });

      const colsPerc = isFechamento ? [4, 5] : [5, 6];
      colsPerc.forEach((col) => {
        row.getCell(col).numFmt = "0.0%";
      });

      const colVar = isFechamento ? 6 : 7;
      const colVarTotal = isFechamento ? null : 8;

      const corVar = varRs < 0 ? "FFDC2626" : "FF16a34a";
      row.getCell(colVar).font = { ...(nivel === 0 ? { bold: true } : {}), color: { argb: corVar } };
      if (colVarTotal) {
        const corVarTotal = varTotal < 0 ? "FFDC2626" : "FF16a34a";
        row.getCell(colVarTotal).font = { ...(nivel === 0 ? { bold: true } : {}), color: { argb: corVarTotal } };
      }

      row.eachCell((cell) => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFe0e0e0" } } };
      });
    };

    data.grupos.forEach((grupo) => {
      addLinha(0, grupo.grupo, grupo.orcado, grupo.realizado, grupo.a_pagar, grupo.orcado - grupo.realizado, grupo.orcado - grupo.realizado - grupo.a_pagar);
      grupo.subgrupos.forEach((sub) => {
        addLinha(1, sub.subgrupo, sub.orcado, sub.realizado, sub.a_pagar, sub.orcado - sub.realizado, sub.orcado - sub.realizado - sub.a_pagar);
        sub.categorias.forEach((cat) => {
          addLinha(2, cat.categoria_comite, cat.orcado, cat.realizado, cat.a_pagar, cat.orcado - cat.realizado, cat.orcado - cat.realizado - cat.a_pagar);
        });
      });
    });

    ws.addRow([]);

    const totalVar = t.orcado - t.realizado;
    const totalVarComAPagar = t.orcado - t.realizado - t.a_pagar;
    const totalPercReal = t.orcado > 0 ? t.realizado / t.orcado : 0;
    const totalRowData = isFechamento
      ? ["TOTAL", t.orcado, t.realizado, totalPercReal, 1 - totalPercReal, totalVar]
      : ["TOTAL", t.orcado, t.realizado, t.a_pagar, totalPercReal, 1 - totalPercReal, totalVar, totalVarComAPagar];
    const totalRow = ws.addRow(totalRowData);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFf0f0f0" } };
      cell.border = { top: { style: "thin", color: { argb: "FF1b1b1b" } } };
    });
    const colsMonetariasTot = isFechamento ? [2, 3, 6] : [2, 3, 4, 7, 8];
    colsMonetariasTot.forEach((col) => {
      totalRow.getCell(col).numFmt = "R$ #,##0.00";
    });
    const colsPercTot = isFechamento ? [4, 5] : [5, 6];
    colsPercTot.forEach((col) => {
      totalRow.getCell(col).numFmt = "0.0%";
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Comite_${mes}_${modo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = () => {
    if (!data) return;
    const t = data.totals;
    const percRealiz = t.orcado ? (t.realizado / t.orcado) * 100 : 0;
    const linhas: Parameters<typeof exportPDF>[0]["linhas"] = [];
    data.grupos.forEach((grupo) => {
      const pushLinha = (nivel: 1 | 2 | 3, categoria: string, orcado: number, realizado: number, aPagar: number) => {
        const pRealiz = orcado ? (realizado / orcado) * 100 : 0;
        linhas.push({
          nivel,
          categoria,
          responsavel: "",
          orcado,
          realizado,
          aPagar,
          percRealiz: pRealiz,
          percFalta: orcado ? ((orcado - realizado) / orcado) * 100 : 0,
          variacao: orcado - realizado,
          realMaisAPagar: realizado + aPagar,
        });
      };
      pushLinha(1, grupo.grupo, grupo.orcado, grupo.realizado, grupo.a_pagar);
      grupo.subgrupos.forEach((sub) => {
        pushLinha(2, sub.subgrupo, sub.orcado, sub.realizado, sub.a_pagar);
        sub.categorias.forEach((cat) => {
          pushLinha(3, cat.categoria_comite, cat.orcado, cat.realizado, cat.a_pagar);
        });
      });
    });

    exportPDF({
      mes: mesLabel(mes),
      modo: modo === "base" ? "Base Inicial" : "Rolling",
      geradoEm: new Date().toLocaleString("pt-BR"),
      totais: {
        orcado: t.orcado,
        realizado: t.realizado,
        aPagar: t.a_pagar,
        variacao: t.orcado - t.realizado - t.a_pagar,
        percRealiz,
      },
      linhas,
    });
  };



  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho impressão */}
      <div className="print-only mb-4 border-b pb-2">
        <div className="text-xl font-bold">Comitê Financeiro — Divid</div>
        <div className="text-sm text-muted-foreground flex justify-between">
          <span>Mês de referência: {mesLabel(mes)} — {modo === "base" ? "Base Inicial" : "Rolling"}</span>
          <span>Gerado em {new Date().toLocaleString("pt-BR")}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comitê Financeiro</h1>
          <p className="text-sm text-muted-foreground">Divid — {mesLabel(mes)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => {
                const fechado = fechamentoSet.has(m);
                return (
                  <SelectItem key={m} value={m}>
                    {fechado ? "🔒" : "🟢"} {mesLabel(m)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Tabs value={modo} onValueChange={v => setModo(v as Modo)}>
            <TabsList>
              <TabsTrigger value="base">Base Inicial</TabsTrigger>
              <TabsTrigger value="rolling">Rolling</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={exportarPDF} disabled={!data}>
            <Printer className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportarExcel} disabled={!data}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
        </div>
      </div>

      {/* Banner fechado */}
      {fechamentoAtual && (
        <div className="rounded-md border bg-warning/30 text-warning-foreground px-4 py-3 flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4" />
          Mês fechado em {new Date(fechamentoAtual.fechado_em).toLocaleString("pt-BR")}.
        </div>
      )}

      {/* KPIs */}
      <KpiRow data={data} modo={modo} />

      {/* Tabela */}
      <Card>
        <CardHeader className="no-print">
          <CardTitle className="text-base">Detalhamento — {mesLabel(mes)} ({modo === "base" ? "Base Inicial" : "Rolling"})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>}
          {!isLoading && data && <HierarchicalTable data={data} mes={mes} modo={modo} />}
        </CardContent>
      </Card>

      <ExtratoSection mes={mes} />
      <ParecerSection mes={mes} />
    </div>
  );
}

function KpiRow({ data, modo }: { data: ReturnType<typeof useComiteData>["data"]; modo: Modo }) {
  const orcado = data?.totals.orcado ?? 0;
  const realizado = data?.totals.realizado ?? 0;
  const aPagar = data?.totals.a_pagar ?? 0;
  const variacao = orcado - (realizado + aPagar);
  const variacaoPct = orcado ? (variacao / orcado) * 100 : 0;
  const positivo = variacao >= 0;
  const hideAPagar = data?.hasFinal;
  const refLabel = modo === "base" ? "Mês Inicial" : "Total Orçado";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi label={refLabel} value={fmtBRL(orcado)} />
      <Kpi label="Total Realizado" value={fmtBRL(realizado)} />
      {!hideAPagar && <Kpi label="Total A Pagar" value={fmtBRL(aPagar)} />}
      <Kpi
        label={`Variação R$ ${hideAPagar ? "" : "(c/ A Pagar)"}`}
        value={fmtBRL(variacao)}
        sub={fmtPct(variacaoPct)}
        tone={positivo ? "good" : "bad"}
      />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={cn(
          "text-2xl font-bold mt-1",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive"
        )}>{value}</div>
        {sub && <div className={cn(
          "text-xs mt-0.5",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive"
        )}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

function HierarchicalTable({ data, mes, modo }: { data: NonNullable<ReturnType<typeof useComiteData>["data"]>; mes: string; modo: Modo }) {
  const { isAdmin } = useAuth();
  const [openGrupos, setOpenGrupos] = useState<Set<string>>(() => new Set(data.grupos.map(g => g.grupo)));
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const hideAPagar = data.hasFinal;

  const toggle = (set: Set<string>, key: string, fn: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    fn(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="text-left py-2 px-2 font-medium">Categoria</th>
            <th className="text-left py-2 px-2 font-medium w-[120px]">Resp.</th>
            <th className="text-right py-2 px-2 font-medium">{modo === "base" ? "Mês Inicial" : "Orçado"}</th>
            <th className="text-right py-2 px-2 font-medium">Realizado</th>
            {!hideAPagar && <th className="text-right py-2 px-2 font-medium">A Pagar</th>}
            <th className="text-right py-2 px-2 font-medium">% Realiz.</th>
            {!hideAPagar && <th className="text-right py-2 px-2 font-medium">% Falta</th>}
            <th className="text-right py-2 px-2 font-medium">R$ Variação</th>
            {!hideAPagar && <th className="text-right py-2 px-2 font-medium">R$ Real+APagar</th>}
            <th className="py-2 px-2 font-medium w-8"></th>
          </tr>
        </thead>
        <tbody>
          {data.grupos.map(g => {
            const gOpen = openGrupos.has(g.grupo);
            return (
              <RowGroup key={g.grupo} g={g} open={gOpen} hideAPagar={hideAPagar} mes={mes} isAdmin={isAdmin}
                onToggle={() => toggle(openGrupos, g.grupo, setOpenGrupos)}>
                {gOpen && g.subgrupos.map(s => {
                  const sKey = `${g.grupo}::${s.subgrupo}`;
                  const sOpen = openSubs.has(sKey);
                  return (
                    <RowSub key={sKey} s={s} open={sOpen} hideAPagar={hideAPagar} mes={mes} isAdmin={isAdmin}
                      onToggle={() => toggle(openSubs, sKey, setOpenSubs)}>
                      {sOpen && s.categorias.map(c => (
                        <RowCat key={c.categoria_comite} c={c} hideAPagar={hideAPagar} mes={mes} isAdmin={isAdmin} />
                      ))}
                    </RowSub>
                  );
                })}
              </RowGroup>
            );
          })}
          {data.grupos.length === 0 && (
            <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Sem dados para este mês.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-bold bg-secondary">
            <td className="py-2 px-2">TOTAL</td>
            <td className="py-2 px-2"></td>
            <td className="py-2 px-2 text-right">{fmtBRL(data.totals.orcado)}</td>
            <td className="py-2 px-2 text-right">{fmtBRL(data.totals.realizado)}</td>
            {!hideAPagar && <td className="py-2 px-2 text-right">{fmtBRL(data.totals.a_pagar)}</td>}
            <td className="py-2 px-2 text-right">{data.totals.orcado ? fmtPct((data.totals.realizado / data.totals.orcado) * 100) : "—"}</td>
            {!hideAPagar && <td className="py-2 px-2 text-right">{data.totals.orcado ? fmtPct(((data.totals.orcado - data.totals.realizado) / data.totals.orcado) * 100) : "—"}</td>}
            <td className={cn("py-2 px-2 text-right", varColor(data.totals.orcado - data.totals.realizado))}>{fmtBRL(data.totals.orcado - data.totals.realizado)}</td>
            {!hideAPagar && <td className={cn("py-2 px-2 text-right", varColor(data.totals.orcado - data.totals.realizado - data.totals.a_pagar))}>{fmtBRL(data.totals.orcado - data.totals.realizado - data.totals.a_pagar)}</td>}
            <td className="py-2 px-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function varColor(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-destructive";
  return "";
}

function RowGroup({ g, open, hideAPagar, onToggle, children, mes, isAdmin }: any) {
  const pctReal = g.orcado ? (g.realizado / g.orcado) * 100 : 0;
  const pctFalta = g.orcado ? ((g.orcado - g.realizado) / g.orcado) * 100 : 0;
  const variacao = g.orcado - g.realizado;
  const variacaoFull = g.orcado - g.realizado - g.a_pagar;
  return (
    <>
      <tr className="bg-[oklch(0.95_0_0)] font-semibold border-b cursor-pointer hover:bg-accent/50" onClick={onToggle}>
        <td className="py-2 px-2 flex items-center gap-1">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {g.grupo}
        </td>
        <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
          <ResponsaveisCell categoria={g.grupo} isAdmin={isAdmin} />
        </td>
        <td className="py-2 px-2 text-right">{fmtBRL(g.orcado)}</td>
        <td className="py-2 px-2 text-right">{fmtBRL(g.realizado)}</td>
        {!hideAPagar && <td className="py-2 px-2 text-right">{fmtBRL(g.a_pagar)}</td>}
        <td className={cn("py-2 px-2 text-right", varColor(g.orcado - g.realizado))}>{g.orcado ? fmtPct(pctReal) : "—"}</td>
        {!hideAPagar && <td className={cn("py-2 px-2 text-right", varColor(variacaoFull))}>{g.orcado ? fmtPct(pctFalta) : "—"}</td>}
        <td className={cn("py-2 px-2 text-right", varColor(variacao))}>{fmtBRL(variacao)}</td>
        {!hideAPagar && <td className={cn("py-2 px-2 text-right", varColor(variacaoFull))}>{fmtBRL(variacaoFull)}</td>}
        <td className="py-2 px-2 text-center" onClick={e => e.stopPropagation()}>
          <ComentariosCell categoria={g.grupo} mes={mes} />
        </td>
      </tr>
      {children}
    </>
  );
}

function RowSub({ s, open, hideAPagar, onToggle, children, mes, isAdmin }: any) {
  const pctReal = s.orcado ? (s.realizado / s.orcado) * 100 : 0;
  const pctFalta = s.orcado ? ((s.orcado - s.realizado) / s.orcado) * 100 : 0;
  const variacao = s.orcado - s.realizado;
  const variacaoFull = s.orcado - s.realizado - s.a_pagar;
  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-accent/30" onClick={onToggle}>
        <td className="py-1.5 px-2 pl-6 flex items-center gap-1">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-medium">{s.subgrupo}</span>
        </td>
        <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
          <ResponsaveisCell categoria={s.subgrupo} isAdmin={isAdmin} />
        </td>
        <td className="py-1.5 px-2 text-right">{fmtBRL(s.orcado)}</td>
        <td className="py-1.5 px-2 text-right">{fmtBRL(s.realizado)}</td>
        {!hideAPagar && <td className="py-1.5 px-2 text-right">{fmtBRL(s.a_pagar)}</td>}
        <td className={cn("py-1.5 px-2 text-right", varColor(variacao))}>{s.orcado ? fmtPct(pctReal) : "—"}</td>
        {!hideAPagar && <td className={cn("py-1.5 px-2 text-right", varColor(variacaoFull))}>{s.orcado ? fmtPct(pctFalta) : "—"}</td>}
        <td className={cn("py-1.5 px-2 text-right", varColor(variacao))}>{fmtBRL(variacao)}</td>
        {!hideAPagar && <td className={cn("py-1.5 px-2 text-right", varColor(variacaoFull))}>{fmtBRL(variacaoFull)}</td>}
        <td className="py-1.5 px-2 text-center" onClick={e => e.stopPropagation()}>
          <ComentariosCell categoria={s.subgrupo} mes={mes} />
        </td>
      </tr>
      {children}
    </>
  );
}

function RowCat({ c, hideAPagar, mes, isAdmin }: any) {
  const pctReal = c.orcado ? (c.realizado / c.orcado) * 100 : 0;
  const pctFalta = c.orcado ? ((c.orcado - c.realizado) / c.orcado) * 100 : 0;
  const variacao = c.orcado - c.realizado;
  const variacaoFull = c.orcado - c.realizado - c.a_pagar;
  return (
    <tr className="border-b hover:bg-accent/20 text-xs">
      <td className="py-1 px-2 pl-12 text-muted-foreground">{c.categoria_comite}</td>
      <td className="py-1 px-2"><ResponsaveisCell categoria={c.categoria_comite} isAdmin={isAdmin} /></td>
      <td className="py-1 px-2 text-right">{fmtBRL(c.orcado)}</td>
      <td className="py-1 px-2 text-right">{fmtBRL(c.realizado)}</td>
      {!hideAPagar && <td className="py-1 px-2 text-right">{fmtBRL(c.a_pagar)}</td>}
      <td className={cn("py-1 px-2 text-right", varColor(variacao))}>{c.orcado ? fmtPct(pctReal) : "—"}</td>
      {!hideAPagar && <td className={cn("py-1 px-2 text-right", varColor(variacaoFull))}>{c.orcado ? fmtPct(pctFalta) : "—"}</td>}
      <td className={cn("py-1 px-2 text-right", varColor(variacao))}>{fmtBRL(variacao)}</td>
      {!hideAPagar && <td className={cn("py-1 px-2 text-right", varColor(variacaoFull))}>{fmtBRL(variacaoFull)}</td>}
      <td className="py-1 px-2 text-center"><ComentariosCell categoria={c.categoria_comite} mes={mes} /></td>
    </tr>
  );
}
