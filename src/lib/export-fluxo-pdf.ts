import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PivotRow, RowVariant } from "@/components/fc-table";

type RGB = [number, number, number];

const AZUL_ESCURO: RGB = [30, 58, 95]; // #1e3a5f
const AZUL_MEDIO: RGB = [44, 82, 130]; // #2c5282
const AZUL_CLARO: RGB = [235, 242, 250]; // #ebf2fa
const BRANCO: RGB = [255, 255, 255];
const VERMELHO: RGB = [192, 57, 43]; // #c0392b
const VERDE: RGB = [30, 126, 52]; // #1e7e34

// Meses Jan-Mai 2026 (números 1-5)
const MESES = [1, 2, 3, 4, 5];
const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai"];

const HIGHLIGHT_VARIANTS: RowVariant[] = [
  "subtotal",
  "total-green",
  "total-red",
  "fc-blue",
  "caixa-livre",
  "saldo",
  "saldo-inicial",
  "caixa-final",
];

const isHeader = (v?: RowVariant) => !!v && v.startsWith("header-");
const isHighlight = (v?: RowVariant) => !!v && HIGHLIGHT_VARIANTS.includes(v);

export type PdfSection = {
  name: string;
  firstColLabel: string;
  rows: PivotRow[];
};

export function exportFluxoPDF(sections: PdfSection[]) {
  const section = sections[0];
  if (!section) return;

  type LinhaPDF = {
    categoria: string;
    valores: (number | undefined)[];
    total?: number;
    tipo: "normal" | "secao" | "total" | "caixa";
  };

  const linhas: LinhaPDF[] = section.rows.map((row) => {
    const variant = row.variant;
    const tipo: LinhaPDF["tipo"] = isHeader(variant)
      ? "secao"
      : variant === "caixa-final"
        ? "caixa"
        : isHighlight(variant)
          ? "total"
          : "normal";

    return {
      categoria: `${row.indent ? "    " : ""}${row.label}`,
      valores: MESES.map((m) => row.values?.[m]),
      total: row.total,
      tipo,
    };
  });

  const fmtPdf = (v?: number) =>
    v == null || v === 0
      ? ""
      : `${v < 0 ? "-" : ""}R$ ${Math.abs(v).toLocaleString("pt-BR", {
          maximumFractionDigits: 0,
        })}`;

  const head = [[section.firstColLabel || "Categoria", ...MESES_LABEL, "Total"]];
  const body = linhas.map((linha) => [
    linha.categoria,
    ...linha.valores.map(fmtPdf),
    fmtPdf(linha.total),
  ]);

  const largura = 297;
  const margemTopo = 26;
  const margemBase = 10;
  const alturaLinha = 7;
  const totalRows = body.length + 1;
  const altura = margemTopo + totalRows * alturaLinha + margemBase;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [largura, altura],
  });

  autoTable(doc, {
    head,
    body,
    startY: margemTopo,
    margin: { top: margemTopo, left: 8, right: 8, bottom: margemBase },
    tableWidth: "auto",
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.5,
      minCellHeight: alturaLinha,
      valign: "middle",
      lineColor: [220, 225, 230],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: AZUL_ESCURO,
      textColor: BRANCO,
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 60, halign: "left" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;

      const linha = linhas[data.row.index];
      if (!linha) return;

      if (linha.tipo === "secao") {
        data.cell.styles.fillColor = AZUL_CLARO;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = AZUL_ESCURO;
      } else if (linha.tipo === "total" || linha.tipo === "caixa") {
        data.cell.styles.fillColor = AZUL_MEDIO;
        data.cell.styles.textColor = BRANCO;
        data.cell.styles.fontStyle = "bold";
      } else if (data.column.index > 0) {
        const raw = data.cell.text[0] || "";
        if (raw.startsWith("-")) data.cell.styles.textColor = VERMELHO;
        else if (raw) data.cell.styles.textColor = VERDE;
      }
    },
    didDrawPage: () => {
      doc.setFontSize(13);
      doc.setTextColor(...AZUL_ESCURO);
      doc.setFont("helvetica", "bold");
      doc.text("Fluxo de Caixa — Divid", 8, 12);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...AZUL_ESCURO);
      doc.text("Consolidado", 8, 18);
      doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, largura - 8, 12, {
        align: "right",
      });
      doc.text("Página 1", largura - 8, 18, { align: "right" });

      doc.setDrawColor(...AZUL_ESCURO);
      doc.setLineWidth(0.4);
      doc.line(8, 21, largura - 8, 21);
    },
  });

  doc.save("Fluxo_de_Caixa_Consolidado_Divid.pdf");
}
