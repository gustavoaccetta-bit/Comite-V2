import ExcelJS from "exceljs";
import type { PivotRow, RowVariant } from "@/components/fc-table";

const AZUL_ESCURO = "FF1E3A5F"; // #1e3a5f
const AZUL_MEDIO = "FF2C5282"; // #2c5282
const AZUL_CLARO = "FFEBF2FA"; // #ebf2fa
const BRANCO = "FFFFFFFF";
const VERMELHO = "FFC0392B"; // #c0392b
const VERDE = "FF1E7E34"; // #1e7e34
const CINZA_BORDA = "FFD9DEE6";

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

const thinBorder = {
  top: { style: "thin" as const, color: { argb: CINZA_BORDA } },
  left: { style: "thin" as const, color: { argb: CINZA_BORDA } },
  bottom: { style: "thin" as const, color: { argb: CINZA_BORDA } },
  right: { style: "thin" as const, color: { argb: CINZA_BORDA } },
};

const fill = (argb: string) => ({
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb },
});

export type ExcelSection = {
  name: string;
  firstColLabel: string;
  rows: PivotRow[];
};

export async function exportFluxoExcel(sections: ExcelSection[]) {
  const workbook = new ExcelJS.Workbook();
  const numCols = 1 + MESES.length + 1; // Categoria + meses + Total

  for (const section of sections) {
    const ws = workbook.addWorksheet(section.name, {
      views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
    });

    ws.columns = [
      { width: 35 },
      ...MESES.map(() => ({ width: 15 })),
      { width: 15 },
    ];

    // Linha 1: título mesclado
    ws.mergeCells(1, 1, 1, numCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `Fluxo de Caixa — Divid | ${section.name}`;
    titleCell.fill = fill(AZUL_ESCURO);
    titleCell.font = { bold: true, color: { argb: BRANCO }, size: 14 };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 24;

    // Linha 2: cabeçalho das colunas
    const headerRow = ws.getRow(2);
    [section.firstColLabel || "Categoria", ...MESES_LABEL, "Total"].forEach(
      (label, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = label;
        cell.fill = fill(AZUL_ESCURO);
        cell.font = { bold: true, color: { argb: BRANCO } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = thinBorder;
      },
    );

    let rowIdx = 3;
    let zebra = 0;

    for (const row of section.rows) {
      const excelRow = ws.getRow(rowIdx);

      if (isHeader(row.variant)) {
        ws.mergeCells(rowIdx, 1, rowIdx, numCols);
        const cell = excelRow.getCell(1);
        cell.value = row.label.toUpperCase();
        cell.fill = fill(AZUL_MEDIO);
        cell.font = { bold: true, color: { argb: BRANCO } };
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = thinBorder;
        rowIdx++;
        continue;
      }

      const highlight = isHighlight(row.variant);
      const label = (row.indent ? "    " : "") + row.label;

      // Categoria
      const labelCell = excelRow.getCell(1);
      labelCell.value = label;
      labelCell.alignment = { horizontal: "left", vertical: "middle" };
      labelCell.border = thinBorder;

      const numericValues: (number | null)[] = MESES.map(
        (m) => (row.values?.[m] ?? null),
      );
      numericValues.push(row.total ?? null);

      numericValues.forEach((v, i) => {
        const cell = excelRow.getCell(i + 2);
        cell.border = thinBorder;
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "R$ #,##0.00";
        if (v != null) {
          cell.value = v;
          if (!highlight) {
            cell.font = {
              color: { argb: v < 0 ? VERMELHO : VERDE },
              bold: i === MESES.length, // coluna Total
            };
          }
        }
      });

      if (highlight) {
        for (let c = 1; c <= numCols; c++) {
          const cell = excelRow.getCell(c);
          cell.fill = fill(AZUL_MEDIO);
          cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: BRANCO } };
          cell.border = thinBorder;
        }
      } else {
        // zebra
        if (zebra % 2 === 1) {
          for (let c = 1; c <= numCols; c++) {
            excelRow.getCell(c).fill = fill(AZUL_CLARO);
          }
          // reaplicar cor de fonte numérica (fill não a sobrescreve, ok)
        }
        zebra++;
      }

      rowIdx++;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Fluxo_de_Caixa_Divid.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
