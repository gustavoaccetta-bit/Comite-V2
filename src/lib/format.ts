export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export const fmtPct = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + "%";

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const mesLabel = (mesRef: string) => {
  const [y, m] = mesRef.split("-");
  return `${MESES_PT[parseInt(m, 10) - 1]} ${y}`;
};

/** Lista 24 meses (12 passados, mês atual, 11 futuros) */
export const listMeses = (): string[] => {
  const now = new Date();
  const arr: string[] = [];
  for (let i = -12; i <= 11; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
};
