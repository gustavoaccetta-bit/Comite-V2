import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportPDF(dados: {
  mes: string;
  modo: "Rolling" | "Base Inicial";
  geradoEm: string;
  totais: { orcado: number; realizado: number; aPagar: number; variacao: number; percRealiz: number };
  linhas: Array<{
    nivel: 1 | 2 | 3;
    categoria: string;
    responsavel: string;
    orcado: number;
    realizado: number;
    aPagar: number;
    percRealiz: number;
    percFalta: number;
    variacao: number;
    realMaisAPagar: number;
  }>;
}) {
  const numRows = dados.linhas.length + 2;
  const estimatedHeight = 64 + numRows * 9 + 20;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [210, Math.max(297, estimatedHeight)],
  });
  const W = doc.internal.pageSize.getWidth();

  // ── CORES ──
  const azulEscuro: [number, number, number] = [18, 52, 86];
  const azulMedio: [number, number, number] = [37, 99, 235];
  const azulClaro: [number, number, number] = [219, 234, 254];
  const cinzaFundo: [number, number, number] = [248, 250, 252];
  const verde: [number, number, number] = [22, 163, 74];
  const vermelho: [number, number, number] = [220, 38, 38];
  const amarelo: [number, number, number] = [202, 138, 4];
  const branco: [number, number, number] = [255, 255, 255];
  const cinzaTexto: [number, number, number] = [71, 85, 105];

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  // ── HEADER ──
  doc.setFillColor(...azulEscuro);
  doc.rect(0, 0, W, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...branco);
  doc.text("DIVID", 14, 11);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Comitê Financeiro", 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(180, 210, 255);
  doc.text(`Mês de referência: ${dados.mes}  ·  Modo: ${dados.modo}`, 14, 24);
  doc.text(`Gerado em ${dados.geradoEm}`, W - 14, 24, { align: "right" });

  // ── CARDS DE RESUMO ──
  const cardY = 32;
  const cardH = 20;
  const cardW = (W - 28 - 9) / 4;
  const cards = [
    { label: "TOTAL ORÇADO", value: fmt(dados.totais.orcado), cor: azulEscuro, textoCor: branco },
    { label: "TOTAL REALIZADO", value: `${fmt(dados.totais.realizado)} · ${fmtPct(dados.totais.percRealiz)}`, cor: azulMedio, textoCor: branco },
    { label: "TOTAL A PAGAR", value: fmt(dados.totais.aPagar), cor: azulClaro, textoCor: azulEscuro },
    {
      label: "VARIAÇÃO (c/ A Pagar)",
      value: fmt(dados.totais.variacao),
      cor: dados.totais.variacao >= 0 ? [220, 252, 231] as [number, number, number] : [254, 226, 226] as [number, number, number],
      textoCor: dados.totais.variacao >= 0 ? verde : vermelho,
    },
  ];

  cards.forEach((card, i) => {
    const x = 14 + i * (cardW + 3);
    doc.setFillColor(...card.cor);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "F");
    doc.setTextColor(...card.textoCor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(card.label, x + cardW / 2, cardY + 6, { align: "center" });
    doc.setFontSize(10);
    doc.text(card.value, x + cardW / 2, cardY + 14, { align: "center" });
  });

  // ── TABELA ──
  const tableY = cardY + cardH + 6;
  const body = dados.linhas.map(l => {
    const indent = l.nivel === 1 ? "" : l.nivel === 2 ? "  › " : "      · ";
    return [
      indent + l.categoria,
      l.responsavel,
      fmt(l.orcado),
      fmt(l.realizado),
      fmt(l.aPagar),
      fmtPct(l.percRealiz),
      fmtPct(l.percFalta),
      fmt(l.variacao),
      fmt(l.realMaisAPagar),
    ];
  });

  // Linha de TOTAL
  body.push([
    "TOTAL",
    "",
    fmt(dados.totais.orcado),
    fmt(dados.totais.realizado),
    fmt(dados.totais.aPagar),
    fmtPct(dados.totais.percRealiz),
    fmtPct(100 - dados.totais.percRealiz),
    fmt(dados.totais.variacao),
    fmt(dados.totais.realizado + dados.totais.aPagar),
  ]);

  autoTable(doc, {
    startY: tableY,
    head: [[
      "Categoria", "Resp.", "Orçado", "Realizado", "A Pagar",
      "% Realiz.", "% Falta", "R$ Variação", "R$ Real+A Pagar",
    ]],
    body,
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    horizontalPageBreak: false,
    tableWidth: "auto",
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2, font: "helvetica" },
    headStyles: {
      fillColor: azulEscuro,
      textColor: branco,
      fontStyle: "bold",
      halign: "center",
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 8, halign: "center" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 13, halign: "center" },
      6: { cellWidth: 13, halign: "center" },
      7: { cellWidth: 22, halign: "right" },
      8: { cellWidth: 22, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const l = dados.linhas[data.row.index];
        if (!l) {
          // Linha de TOTAL
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = azulClaro;
          data.cell.styles.textColor = azulEscuro;
          return;
        }
        // Fundo por nível
        if (l.nivel === 1) {
          data.cell.styles.fillColor = [230, 238, 250];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = azulEscuro;
        } else if (l.nivel === 2) {
          data.cell.styles.fillColor = cinzaFundo;
          data.cell.styles.fontStyle = "bold";
        }
        // % Realiz. (col 5): verde se <= 100%, vermelho se > 100%
        if (data.column.index === 5) {
          const pct = l.percRealiz;
          data.cell.styles.textColor = pct <= 100 ? verde : vermelho;
          data.cell.styles.fontStyle = "bold";
        }
        // % Falta (col 6): verde se > 0%, vermelho se < 0%
        if (data.column.index === 6) {
          const pct = l.percFalta;
          data.cell.styles.textColor = pct > 0 ? verde : vermelho;
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 7) {
          data.cell.styles.textColor = l.variacao >= 0 ? verde : vermelho;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Divid — Comitê Financeiro  |  ${dados.geradoEm}`,
        W / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: "center" }
      );
    },
    margin: { left: 14, right: 14, top: tableY },
  });

  doc.save(`comite-divid-${dados.mes.replace("/", "-")}.pdf`);
}
