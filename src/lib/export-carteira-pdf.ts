import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MESES_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

type Item = { label: string; valor: number };
type Bloco = { total: number; itens: Item[] };

type LinhaVariant = "cat" | "total-entradas" | "total-saidas" | "saldo";
type PivotLinha = {
  label: string;
  variant: LinhaVariant;
  values: Record<number, number | undefined>;
  total: number;
};
type Pivot = {
  nome: string;
  mesesComDados: number[];
  linhas: PivotLinha[];
};

type ResumoCarteira = {
  nome: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  noi_valor?: number;
  noi_pct?: number;
};

export function exportCarteiraPDF(dados: {
  mes: string;
  geradoEm: string;
  recebidos: {
    saldos: Bloco;
    gmv: Bloco;
    receitasIntrame: Bloco;
    receitasTransitorias: Bloco;
  };
  resumoCarteiras: ResumoCarteira[];
  pivots: Pivot[];
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ── CORES ──
  const azulEscuro: [number, number, number] = [18, 52, 86];
  const roxo: [number, number, number] = [109, 40, 217];
  const cinzaFundo: [number, number, number] = [248, 250, 252];
  const cinzaClaro: [number, number, number] = [226, 232, 240];
  const verde: [number, number, number] = [22, 163, 74];
  const vermelho: [number, number, number] = [220, 38, 38];
  const preto: [number, number, number] = [17, 24, 39];
  const branco: [number, number, number] = [255, 255, 255];
  const cinzaTexto: [number, number, number] = [71, 85, 105];

  // R$ sem centavos
  const fmtAbs = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(v));

  // (R$ 690.743) para negativos
  const fmtExec = (v: number) => (v < 0 ? `(${fmtAbs(v)})` : fmtAbs(v));

  // ══════════════════════════════════════════
  // PÁGINA 1 — RESUMO EXECUTIVO
  // ══════════════════════════════════════════
  const drawHeader = () => {
    doc.setFillColor(...azulEscuro);
    doc.rect(0, 0, W, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...branco);
    doc.text("DIVID", 14, 11);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Carteiras de Locação — Relatório Executivo", 14, 19);
    doc.setFontSize(10);
    doc.setTextColor(180, 210, 255);
    doc.text(`Mês de referência: ${dados.mes}`, W - 14, 11, { align: "right" });
    doc.text(`Gerado em ${dados.geradoEm}`, W - 14, 18, { align: "right" });
  };

  drawHeader();

  // ── Quatro blocos lado a lado ──
  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...azulEscuro);
  doc.text("RECEBIDOS INTRAMÊS", 14, y);
  y += 4;

  const blocos = [
    { label: "Saldos", data: dados.recebidos.saldos },
    { label: "GMV", data: dados.recebidos.gmv },
    { label: "Receitas Intramês", data: dados.recebidos.receitasIntrame },
    { label: "Receitas Transitórias", data: dados.recebidos.receitasTransitorias },
  ];

  const gap = 4;
  const colW = (W - 28 - gap * 3) / 4;
  const blocoTop = y;

  // altura dinâmica: maior número de subitens não-zerados
  const itensVisiveis = blocos.map((b) => b.data.itens.filter((i) => i.valor !== 0));
  const maxItens = Math.max(1, ...itensVisiveis.map((i) => i.length));
  const headerH = 15;
  const rowH = 5.2;
  const blocoH = headerH + 3 + maxItens * rowH + 3;

  blocos.forEach((bloco, i) => {
    const x = 14 + i * (colW + gap);
    // moldura
    doc.setDrawColor(...cinzaClaro);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, blocoTop, colW, blocoH, 2, 2, "S");
    // cabeçalho azul
    doc.setFillColor(...azulEscuro);
    doc.roundedRect(x, blocoTop, colW, headerH, 2, 2, "F");
    doc.rect(x, blocoTop + headerH - 2, colW, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...branco);
    doc.text(bloco.label.toUpperCase(), x + colW / 2, blocoTop + 6, { align: "center" });
    doc.setFontSize(12);
    doc.text(fmtAbs(bloco.data.total), x + colW / 2, blocoTop + 12.5, { align: "center" });

    // subitens (omitir zerados)
    const visiveis = itensVisiveis[i];
    let sy = blocoTop + headerH + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    visiveis.forEach((item, ri) => {
      if (ri % 2 === 1) {
        doc.setFillColor(...cinzaFundo);
        doc.rect(x + 1.5, sy - 3.4, colW - 3, rowH, "F");
      }
      doc.setTextColor(...cinzaTexto);
      const lines = doc.splitTextToSize(item.label, colW * 0.6);
      doc.text(lines[0], x + 2.5, sy);
      doc.setTextColor(...(item.valor < 0 ? vermelho : preto));
      doc.text(fmtExec(item.valor), x + colW - 2.5, sy, { align: "right" });
      sy += rowH;
    });
  });

  y = blocoTop + blocoH + 10;

  // ── Tabela-síntese por carteira ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...azulEscuro);
  doc.text("SÍNTESE DAS CARTEIRAS", 14, y);
  y += 3;

  const cell = (v: number, colorSaldo = false): { content: string; styles: { textColor: [number, number, number] } } => {
    let color: [number, number, number] = v < 0 ? vermelho : preto;
    if (colorSaldo) color = v >= 0 ? verde : vermelho;
    return { content: fmtExec(v), styles: { textColor: color } };
  };

  const totalConsol = dados.resumoCarteiras.reduce(
    (acc, c) => {
      acc.entradas += c.totalEntradas;
      acc.saidas += c.totalSaidas;
      acc.saldo += c.saldo;
      return acc;
    },
    { entradas: 0, saidas: 0, saldo: 0 },
  );

  const body = dados.resumoCarteiras.map((c) => {
    const noi = c.noi_valor !== undefined
      ? `${fmtExec(c.noi_valor)} (${(c.noi_pct ?? 0).toFixed(1)}%)`
      : "—";
    return [
      c.nome,
      cell(c.totalEntradas),
      cell(-Math.abs(c.totalSaidas)),
      cell(c.saldo, true),
      { content: noi, styles: { textColor: c.noi_valor !== undefined && c.noi_valor < 0 ? vermelho : preto } },
    ];
  });

  body.push([
    { content: "CONSOLIDADO", styles: { fontStyle: "bold", textColor: azulEscuro } } as never,
    { content: fmtExec(totalConsol.entradas), styles: { fontStyle: "bold", textColor: totalConsol.entradas < 0 ? vermelho : preto } } as never,
    { content: fmtExec(-Math.abs(totalConsol.saidas)), styles: { fontStyle: "bold", textColor: vermelho } } as never,
    { content: fmtExec(totalConsol.saldo), styles: { fontStyle: "bold", textColor: totalConsol.saldo >= 0 ? verde : vermelho } } as never,
    { content: "", styles: {} } as never,
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [["Carteira", "Total Entradas", "Total Saídas", "Saldo", "NOI (ML)"]],
    body: body as never,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, font: "helvetica", overflow: "linebreak" },
    headStyles: { fillColor: azulEscuro, textColor: branco, fontStyle: "bold", fontSize: 9, halign: "left" },
    columnStyles: {
      0: { cellWidth: (W - 28) * 0.28, fontStyle: "bold" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold" },
      4: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === body.length - 1) {
        d.cell.styles.fillColor = cinzaClaro;
      }
    },
  });

  // ══════════════════════════════════════════
  // PÁGINAS SEGUINTES — UMA CARTEIRA POR PÁGINA
  // ══════════════════════════════════════════
  for (const pivot of dados.pivots) {
    doc.addPage("a4", "landscape");
    drawHeader();

    // Faixa de título roxa
    let py = 30;
    doc.setFillColor(...roxo);
    doc.roundedRect(14, py, W - 28, 9, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...branco);
    doc.text(pivot.nome, W / 2, py + 6, { align: "center" });
    py += 13;

    const meses = pivot.mesesComDados;
    const head = ["Categoria", ...meses.map((m) => MESES_ABBR[m - 1]), "Total"];

    const rowMeta: LinhaVariant[] = [];
    const pivotBody = pivot.linhas.map((linha) => {
      rowMeta.push(linha.variant);
      const isSaldo = linha.variant === "saldo";
      const cells: unknown[] = [linha.label];
      for (const m of meses) {
        const v = linha.values[m];
        if (v == null) {
          cells.push({ content: "", styles: {} });
        } else {
          let color: [number, number, number] = v < 0 ? vermelho : preto;
          if (isSaldo) color = v >= 0 ? verde : vermelho;
          cells.push({ content: fmtExec(v), styles: { textColor: color } });
        }
      }
      // Total
      const tv = linha.total;
      let tcolor: [number, number, number] = tv < 0 ? vermelho : preto;
      if (isSaldo) tcolor = tv >= 0 ? verde : vermelho;
      cells.push({ content: tv === 0 && linha.variant === "cat" ? "" : fmtExec(tv), styles: { textColor: tcolor } });
      return cells;
    });

    const nCols = head.length;
    const labelW = (W - 28) * 0.2;
    const numW = (W - 28 - labelW) / (nCols - 1);
    const colStyles: Record<number, { cellWidth?: number; halign?: "right"; fontStyle?: "bold" }> = {
      0: { cellWidth: labelW },
    };
    for (let c = 1; c < nCols; c++) colStyles[c] = { cellWidth: numW, halign: "right" };

    autoTable(doc, {
      startY: py,
      head: [head],
      body: pivotBody as never,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.8, font: "helvetica", overflow: "linebreak" },
      headStyles: { fillColor: azulEscuro, textColor: branco, fontStyle: "bold", fontSize: 8, halign: "right" },
      columnStyles: colStyles as never,
      margin: { left: 14, right: 14 },
      didParseCell: (d) => {
        if (d.column.index === 0) d.cell.styles.halign = "left";
        if (d.section !== "body") return;
        const variant = rowMeta[d.row.index];
        if (variant === "total-entradas") {
          d.cell.styles.fillColor = [220, 252, 231];
          d.cell.styles.fontStyle = "bold";
        } else if (variant === "total-saidas") {
          d.cell.styles.fillColor = [254, 226, 226];
          d.cell.styles.fontStyle = "bold";
        } else if (variant === "saldo") {
          d.cell.styles.fillColor = cinzaClaro;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // ── RODAPÉ ──
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(...cinzaTexto);
    doc.text(
      `Divid — Carteiras Intramês  |  Página ${p} de ${pageCount}  |  ${dados.geradoEm}`,
      W / 2,
      H - 5,
      { align: "center" },
    );
  }

  doc.save(`carteiras-divid-${dados.mes.replace(/[\s/]/g, "-")}.pdf`);
}
