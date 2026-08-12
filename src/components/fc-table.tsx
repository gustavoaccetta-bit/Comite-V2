import type React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const MESES_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const MES_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

export const fmtFc = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

export const valorClass = (v: number) =>
  v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "text-muted-foreground";

export type RowVariant =
  | "normal"
  | "subtotal"
  | "total-green"
  | "total-red"
  | "fc-blue"
  | "caixa-livre"
  | "saldo"
  | "saldo-inicial"
  | "caixa-final"
  | "header-green"
  | "header-red"
  | "header-gray"
  | "header-purple";

export type PivotRow = {
  key: string;
  label: string;
  labelSuffix?: React.ReactNode;
  indent?: boolean;
  /** valores por número de mês (1-12). undefined = célula vazia */
  values?: Record<number, number | undefined>;
  total?: number;
  variant?: RowVariant;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
};

const headerBg: Record<string, string> = {
  "header-green": "bg-emerald-800 text-white",
  "header-red": "bg-red-800 text-white",
  "header-gray": "bg-slate-700 text-white",
  "header-purple": "bg-purple-800 text-white",
};

const rowBg: Record<string, string> = {
  subtotal: "bg-muted font-semibold",
  saldo: "font-semibold",
  "total-green": "bg-emerald-100 dark:bg-emerald-950/50 font-bold",
  "total-red": "bg-red-100 dark:bg-red-950/50 font-bold",
  "fc-blue": "bg-blue-900 text-white font-bold",
  "caixa-livre": "bg-blue-950 text-white font-bold text-[15px] border-y-2 border-blue-400",
  "saldo-inicial": "bg-slate-50 dark:bg-slate-900/40 text-blue-900 dark:text-blue-300 font-bold",
  "caixa-final": "bg-slate-900 text-white font-bold text-[15px]",
};

const stickyBase =
  "sticky left-0 z-20 px-3 py-1.5 text-left min-w-[220px] max-w-[220px] truncate";

export function FcTable({
  firstColLabel,
  rows,
}: {
  firstColLabel: string;
  rows: PivotRow[];
}) {
  return (
    <div className="relative overflow-auto rounded-lg border max-h-[calc(100vh-220px)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 bg-muted px-3 py-2 text-left min-w-[220px] max-w-[220px] border-b">
              {firstColLabel}
            </th>
            {MESES_ABBR.map((m) => (
              <th
                key={m}
                className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[110px] border-b font-medium"
              >
                {m}
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[110px] border-b font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.variant && row.variant.startsWith("header-")) {
              return (
                <tr key={row.key}>
                  <td
                    colSpan={14}
                    className={cn(
                      "sticky left-0 px-3 py-1.5 font-bold uppercase text-xs tracking-wide",
                      headerBg[row.variant],
                    )}
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }

            const variant = row.variant ?? "normal";
            const whiteText =
              variant === "fc-blue" || variant === "caixa-livre" || variant === "caixa-final";
            const rowCls = rowBg[variant] ?? "";
            const stickyBg = whiteText
              ? variant === "caixa-livre"
                ? "bg-blue-950"
                : variant === "caixa-final"
                  ? "bg-slate-900"
                  : "bg-blue-900"
              : variant === "subtotal"
                ? "bg-muted"
                : variant === "saldo-inicial"
                  ? "bg-slate-50 dark:bg-slate-900/40"
                  : variant === "total-green"
                    ? "bg-emerald-100 dark:bg-emerald-950"
                    : variant === "total-red"
                      ? "bg-red-100 dark:bg-red-950"
                      : "bg-background";

            return (
              <tr key={row.key} className={cn("border-b last:border-0", rowCls)}>
                <td
                  className={cn(
                    stickyBase,
                    stickyBg,
                    row.indent && "pl-7",
                    row.collapsible && "cursor-pointer select-none",
                  )}
                  onClick={row.onToggle}
                >
                  <span className="flex items-center gap-1">
                    {row.collapsible &&
                      (row.collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ))}
                    <span className="truncate">{row.label}</span>
                    {row.labelSuffix}
                  </span>
                </td>
                {MES_NUMS.map((m) => {
                  const v = row.values?.[m];
                  return (
                    <td
                      key={m}
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        !whiteText && v != null && valorClass(v),
                      )}
                    >
                      {v == null ? "" : fmtFc(v)}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold",
                    !whiteText && row.total != null && valorClass(row.total),
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

/** Helper: agrega linhas {mes_referencia, valor} em mapa mês->soma */
export function pivotValues(
  rows: { mes_referencia: string; valor: number }[],
): { values: Record<number, number | undefined>; total: number } {
  const values: Record<number, number | undefined> = {};
  let total = 0;
  for (const r of rows) {
    const m = parseInt(r.mes_referencia.slice(5, 7), 10);
    const v = Number(r.valor) || 0;
    values[m] = (values[m] ?? 0) + v;
    total += v;
  }
  return { values, total };
}

/** Soma vários mapas de valores mês->valor (ignora undefined) */
export function sumValueMaps(
  maps: (Record<number, number | undefined> | undefined)[],
): { values: Record<number, number | undefined>; total: number } {
  const values: Record<number, number | undefined> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const m of MES_NUMS) {
      const v = map[m];
      if (v != null) values[m] = (values[m] ?? 0) + v;
    }
  }
  const total = MES_NUMS.reduce((acc, m) => acc + (values[m] ?? 0), 0);
  return { values, total };
}

/* ============= Versão status-aware (Pago/Recebido, A Pagar/Receber, Total) ============= */

export type StatusVals = { pago: number; previsto: number; total: number };

export type StatusPivotRow = {
  key: string;
  label: string;
  labelSuffix?: React.ReactNode;
  indent?: boolean;
  /** valores por número de mês (1-12). undefined = célula vazia */
  statusValues?: Record<number, StatusVals | undefined>;
  variant?: RowVariant;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
};

/** Agrega linhas {mes_referencia, valor, status} em mapa mês -> {pago, previsto, total} */
export function pivotValuesByStatus(
  rows: { mes_referencia: string; valor: number; status?: string | null }[],
): { values: Record<number, StatusVals | undefined>; total: number } {
  const values: Record<number, StatusVals> = {};
  let total = 0;
  for (const r of rows) {
    const m = parseInt(r.mes_referencia.slice(5, 7), 10);
    const v = Number(r.valor) || 0;
    const cell = values[m] ?? (values[m] = { pago: 0, previsto: 0, total: 0 });
    if (r.status === "previsto") cell.previsto += v;
    else cell.pago += v; // 'realizado' | 'fechamento' | null
    cell.total += v;
    total += v;
  }
  return { values, total };
}

/** Soma vários mapas status-aware (soma pago, previsto e total por mês) */
export function sumStatusMaps(
  maps: (Record<number, StatusVals | undefined> | undefined)[],
): { values: Record<number, StatusVals | undefined>; total: number } {
  const values: Record<number, StatusVals> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const m of MES_NUMS) {
      const c = map[m];
      if (!c) continue;
      const cell = values[m] ?? (values[m] = { pago: 0, previsto: 0, total: 0 });
      cell.pago += c.pago;
      cell.previsto += c.previsto;
      cell.total += c.total;
    }
  }
  const total = MES_NUMS.reduce((acc, m) => acc + (values[m]?.total ?? 0), 0);
  return { values, total };
}

export function FcStatusTable({
  firstColLabel,
  rows,
  mesSel,
}: {
  firstColLabel: string;
  rows: StatusPivotRow[];
  mesSel: number;
}) {
  const monthsBefore = MES_NUMS.filter((m) => m < mesSel);
  // total de colunas: primeira + (meses < sel) + 3 (sel) + total
  const colCount = 1 + monthsBefore.length + 3 + 1;

  const monthTotal = (row: StatusPivotRow, m: number) => row.statusValues?.[m]?.total;
  const rowTotal = (row: StatusPivotRow) => {
    // Saldos acumulados: o Total deve refletir o saldo do mês selecionado, não a soma dos meses
    if (row.label === "Saldo Inicial" || row.label === "CAIXA FINAL") {
      return row.statusValues?.[mesSel]?.total ?? 0;
    }
    return MES_NUMS.filter((m) => m <= mesSel).reduce(
      (acc, m) => acc + (row.statusValues?.[m]?.total ?? 0),
      0,
    );
  };

  return (
    <div className="relative overflow-auto rounded-lg border max-h-[calc(100vh-220px)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 bg-muted px-3 py-2 text-left min-w-[220px] max-w-[220px] border-b">
              {firstColLabel}
            </th>
            {monthsBefore.map((m) => (
              <th
                key={m}
                className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[110px] border-b font-medium"
              >
                {MESES_ABBR[m - 1]}
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[120px] border-b font-medium">
              {MESES_ABBR[mesSel - 1]} — Pago/Receb.
            </th>
            <th className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[120px] border-b font-medium">
              {MESES_ABBR[mesSel - 1]} — A Pagar/Receb.
            </th>
            <th className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[120px] border-b font-medium">
              {MESES_ABBR[mesSel - 1]} — Total Esp.
            </th>
            <th className="sticky top-0 z-10 bg-muted px-3 py-2 text-right min-w-[110px] border-b font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.variant && row.variant.startsWith("header-")) {
              return (
                <tr key={row.key}>
                  <td
                    colSpan={colCount}
                    className={cn(
                      "sticky left-0 px-3 py-1.5 font-bold uppercase text-xs tracking-wide",
                      headerBg[row.variant],
                    )}
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }

            const variant = row.variant ?? "normal";
            const whiteText =
              variant === "fc-blue" || variant === "caixa-livre" || variant === "caixa-final";
            const rowCls = rowBg[variant] ?? "";
            const stickyBg = whiteText
              ? variant === "caixa-livre"
                ? "bg-blue-950"
                : variant === "caixa-final"
                  ? "bg-slate-900"
                  : "bg-blue-900"
              : variant === "subtotal"
                ? "bg-muted"
                : variant === "saldo-inicial"
                  ? "bg-slate-50 dark:bg-slate-900/40"
                  : variant === "total-green"
                    ? "bg-emerald-100 dark:bg-emerald-950"
                    : variant === "total-red"
                      ? "bg-red-100 dark:bg-red-950"
                      : "bg-background";

            const sel = row.statusValues?.[mesSel];
            const tot = rowTotal(row);

            return (
              <tr key={row.key} className={cn("border-b last:border-0", rowCls)}>
                <td
                  className={cn(
                    stickyBase,
                    stickyBg,
                    row.indent && "pl-7",
                    row.collapsible && "cursor-pointer select-none",
                  )}
                  onClick={row.onToggle}
                >
                  <span className="flex items-center gap-1">
                    {row.collapsible &&
                      (row.collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ))}
                    <span className="truncate">{row.label}</span>
                    {row.labelSuffix}
                  </span>
                </td>
                {monthsBefore.map((m) => {
                  const v = monthTotal(row, m);
                  return (
                    <td
                      key={m}
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        !whiteText && v != null && valorClass(v),
                      )}
                    >
                      {v == null ? "" : fmtFc(v)}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    !whiteText && sel != null && valorClass(sel.pago),
                  )}
                >
                  {sel == null ? "" : fmtFc(sel.pago)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    !whiteText && sel != null && valorClass(sel.previsto),
                  )}
                >
                  {sel == null ? "" : fmtFc(sel.previsto)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    !whiteText && sel != null && valorClass(sel.total),
                  )}
                >
                  {sel == null ? "" : fmtFc(sel.total)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold",
                    !whiteText && valorClass(tot),
                  )}
                >
                  {fmtFc(tot)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

