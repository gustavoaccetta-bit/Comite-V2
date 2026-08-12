import ExcelJS from "exceljs";

const MESES_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const FMT_CONTABIL = 'R$ #.##0;[Red](R$ #.##0);-';
const ROXO = "FF6D28D9";
const CINZA = "FFE2E8F0";
const AZUL = "FF123456";
const BRANCO = "FFFFFFFF";

type Item = { label: string; valor: number };
type Bloco = { total: number; itens: Item[] };

type CatRow = { label: string; values: Record<number, number | undefined> };

type Pivot = {
  nome: string;
  sheetName: string;
  entradas: CatRow[];
  saidas: CatRow[];
};

type ResumoCarteira = {
  nome: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  noi_valor?: number;
  noi_pct?: number;
};

export async function exportCarteiraExcel(dados: {
  year: number;
  mes: string;
  recebidos: {
    saldos: Bloco;
    gmv: Bloco;
    receitasIntrame: Bloco;
    receitasTransitorias: Bloco;
  };
  resumoCarteiras: ResumoCarteira[];
  pivots: Pivot[];
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Divid";
  wb.created = new Date();

  const colLetter = (n: number) => String.fromCharCode(64 + n); // 1->A

  // ══════════════════════════════════════════
  // ABA 1 — RESUMO
  // ══════════════════════════════════════════
  const ws = wb.addWorksheet("Resumo");
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= 5; c++) ws.getColumn(c).width = 24;

  const titulo = ws.getCell("A1");
  titulo.value = "Carteiras de Locação — Relatório Executivo";
  titulo.font = { bold: true, size: 14, color: { argb: AZUL } };
  ws.getCell("A2").value = `Mês de referência: ${dados.mes}`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF475569" } };

  let r = 4;

  // Quatro cards (blocos)
  ws.getCell(`A${r}`).value = "RECEBIDOS INTRAMÊS";
  ws.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: AZUL } };
  r += 1;

  const blocos = [
    { label: "Saldos", data: dados.recebidos.saldos },
    { label: "GMV", data: dados.recebidos.gmv },
    { label: "Receitas Intramês", data: dados.recebidos.receitasIntrame },
    { label: "Receitas Transitórias", data: dados.recebidos.receitasTransitorias },
  ];

  for (const bloco of blocos) {
    const hRow = ws.getRow(r);
    const cTitle = hRow.getCell(1);
    cTitle.value = bloco.label;
    cTitle.font = { bold: true, color: { argb: BRANCO } };
    cTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    const cTot = hRow.getCell(2);
    cTot.value = bloco.data.total;
    cTot.numFmt = FMT_CONTABIL;
    cTot.font = { bold: true, color: { argb: BRANCO } };
    cTot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    r += 1;
    for (const item of bloco.data.itens) {
      const row = ws.getRow(r);
      row.getCell(1).value = `   ${item.label}`;
      const vc = row.getCell(2);
      vc.value = item.valor;
      vc.numFmt = FMT_CONTABIL;
      r += 1;
    }
    r += 1;
  }

  // Tabela-síntese por carteira
  ws.getCell(`A${r}`).value = "SÍNTESE DAS CARTEIRAS";
  ws.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: AZUL } };
  r += 1;

  const synthHeader = ws.getRow(r);
  ["Carteira", "Total Entradas", "Total Saídas", "Saldo", "NOI (ML)"].forEach((h, i) => {
    const c = synthHeader.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: BRANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROXO } };
    c.alignment = { horizontal: i === 0 ? "left" : "right" };
  });
  r += 1;

  const consol = { entradas: 0, saidas: 0, saldo: 0 };
  for (const c of dados.resumoCarteiras) {
    const row = ws.getRow(r);
    row.getCell(1).value = c.nome;
    const e = row.getCell(2); e.value = c.totalEntradas; e.numFmt = FMT_CONTABIL;
    const s = row.getCell(3); s.value = -Math.abs(c.totalSaidas); s.numFmt = FMT_CONTABIL;
    const sal = row.getCell(4); sal.value = c.saldo; sal.numFmt = FMT_CONTABIL;
    const noi = row.getCell(5);
    if (c.noi_valor !== undefined) {
      noi.value = `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(c.noi_valor)} (${(c.noi_pct ?? 0).toFixed(1)}%)`;
    } else {
      noi.value = "—";
    }
    noi.alignment = { horizontal: "right" };
    consol.entradas += c.totalEntradas;
    consol.saidas += Math.abs(c.totalSaidas);
    consol.saldo += c.saldo;
    r += 1;
  }
  // Consolidado
  const cRow = ws.getRow(r);
  cRow.getCell(1).value = "CONSOLIDADO";
  const ce = cRow.getCell(2); ce.value = consol.entradas; ce.numFmt = FMT_CONTABIL;
  const cs = cRow.getCell(3); cs.value = -consol.saidas; cs.numFmt = FMT_CONTABIL;
  const csal = cRow.getCell(4); csal.value = consol.saldo; csal.numFmt = FMT_CONTABIL;
  cRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
  });

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  // ══════════════════════════════════════════
  // ABAS 2–5 — PIVOTS POR CARTEIRA
  // ══════════════════════════════════════════
  for (const pivot of dados.pivots) {
    const sh = wb.addWorksheet(pivot.sheetName);
    sh.getColumn(1).width = 34;
    for (let c = 2; c <= 13; c++) sh.getColumn(c).width = 14;

    // Header de meses
    const header = sh.getRow(1);
    header.getCell(1).value = "Categoria";
    header.getCell(1).font = { bold: true, color: { argb: BRANCO } };
    header.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROXO } };
    MESES_ABBR.forEach((m, i) => {
      const c = header.getCell(i + 2);
      c.value = `${m}/${dados.year}`;
      c.font = { bold: true, color: { argb: BRANCO } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROXO } };
      c.alignment = { horizontal: "right" };
    });

    let rr = 2;

    const writeCatRow = (cat: CatRow) => {
      const row = sh.getRow(rr);
      row.getCell(1).value = cat.label;
      for (let m = 1; m <= 12; m++) {
        const v = cat.values[m];
        const cell = row.getCell(m + 1);
        if (v != null) {
          cell.value = v;
          cell.numFmt = FMT_CONTABIL;
        }
      }
      rr += 1;
    };

    // Entradas
    const entradaStart = rr;
    pivot.entradas.forEach(writeCatRow);
    const entradaEnd = rr - 1;

    // Total Entradas (SUM sobre intervalo)
    const totEntRow = sh.getRow(rr);
    totEntRow.getCell(1).value = "Total Entradas";
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(m + 1);
      const cell = totEntRow.getCell(m + 1);
      cell.value = pivot.entradas.length
        ? { formula: `SUM(${col}${entradaStart}:${col}${entradaEnd})` }
        : 0;
      cell.numFmt = FMT_CONTABIL;
    }
    const totEntRowNum = rr;
    rr += 1;

    // Saídas
    const saidaStart = rr;
    pivot.saidas.forEach(writeCatRow);
    const saidaEnd = rr - 1;

    // Total Saídas
    const totSaiRow = sh.getRow(rr);
    totSaiRow.getCell(1).value = "Total Saídas";
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(m + 1);
      const cell = totSaiRow.getCell(m + 1);
      cell.value = pivot.saidas.length
        ? { formula: `SUM(${col}${saidaStart}:${col}${saidaEnd})` }
        : 0;
      cell.numFmt = FMT_CONTABIL;
    }
    const totSaiRowNum = rr;
    rr += 1;

    // Saldo = Total Entradas + Total Saídas
    const saldoRow = sh.getRow(rr);
    saldoRow.getCell(1).value = "Saldo";
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(m + 1);
      const cell = saldoRow.getCell(m + 1);
      cell.value = { formula: `${col}${totEntRowNum}+${col}${totSaiRowNum}` };
      cell.numFmt = FMT_CONTABIL;
    }
    const saldoRowNum = rr;

    // Estilo das linhas de totais (cinza claro + negrito)
    [totEntRowNum, totSaiRowNum, saldoRowNum].forEach((n) => {
      const row = sh.getRow(n);
      for (let c = 1; c <= 13; c++) {
        const cell = row.getCell(c);
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
      }
    });

    sh.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carteiras-divid-${dados.year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
