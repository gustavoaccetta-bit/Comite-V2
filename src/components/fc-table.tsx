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
  | "header-purple"
  /** linha de grupo recolhível (faixa + total fundidos) — só FcStatusTable */
  | "group";

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

/** Paleta da FcStatusTable: [classes da linha, fundo opaco da 1ª coluna sticky] */
const statusRowStyle: Record<string, [string, string]> = {
  normal: ["", "bg-background"],
  group: ["bg-slate-100 font-bold", "bg-slate-100"],
  subtotal: ["bg-slate-50 font-semibold", "bg-slate-50"],
  "total-green": ["bg-slate-50 font-semibold", "bg-slate-50"],
  "total-red": ["bg-slate-50 font-semibold", "bg-slate-50"],
  saldo: ["bg-slate-50 font-bold", "bg-slate-50"],
  "saldo-inicial": ["bg-slate-50 font-bold", "bg-slate-50"],
  // indicadores intermediários: azul claro com borda
  "fc-blue": ["bg-blue-50 font-bold border-y border-blue-200", "bg-blue-50"],
  "caixa-livre": ["bg-blue-50 font-bold border-y border-blue-200", "bg-blue-50"],
  // fechamento: o elemento mais pesado da tabela
  "caixa-final": ["bg-blue-950 text-slate-50 font-bold text-[1.1em]", "bg-blue-950"],
};

/** Cor pelo sinal do valor; sobre o marinho do Caixa Final, negativo em rosa claro (legível, sem vibrar) */
export const statusValorClass = (v: number, onDark: boolean) =>
  onDark
    ? v < 0 && "text-rose-200"
    : v > 0 ? "text-success" : v < 0 ? "text-destructive" : "text-muted-foreground";

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

  // Densidade: fonte/padding encolhem com clamp() abaixo de ~1500px; muitas linhas => linha mais baixa
  const cellPad = cn("px-[clamp(3px,0.4vw,6px)]", rows.length > 44 ? "py-px" : "py-[2px]");
  const numCell = cn(cellPad, "text-right whitespace-nowrap");
  const thCls = cn(
    cellPad,
    "sticky top-0 z-10 bg-muted text-right border-b font-medium whitespace-nowrap overflow-hidden text-ellipsis",
  );
  const mesAbbr = MESES_ABBR[mesSel - 1];

  return (
    <div className="relative overflow-auto rounded-lg border max-h-[calc(100dvh-7rem)]">
      <table className="w-full table-fixed border-collapse tabular-nums text-[length:clamp(10px,0.8vw,12px)] leading-[15px]">
        <colgroup>
          <col style={{ width: "clamp(150px, 10.5vw, 200px)" }} />
          {monthsBefore.map((m) => <col key={m} />)}
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className={cn(cellPad, "sticky left-0 top-0 z-30 bg-muted text-left border-b")}>
              {firstColLabel}
            </th>
            {monthsBefore.map((m) => (
              <th key={m} className={thCls}>
                {MESES_ABBR[m - 1]}
              </th>
            ))}
            <th className={thCls} title={`${mesAbbr} — Pago/Recebido`}>
              {mesAbbr} · Pago/Rec
            </th>
            <th className={thCls} title={`${mesAbbr} — A Pagar/Receber`}>
              {mesAbbr} · A pag/rec
            </th>
            <th className={thCls} title={`${mesAbbr} — Total Esperado`}>
              {mesAbbr} · Total esp
            </th>
            <th className={cn(thCls, "font-semibold border-l border-border")}>
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
                      cellPad,
                      "sticky left-0 bg-slate-100 text-slate-700 font-bold uppercase text-[0.92em] tracking-wide",
                    )}
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }

            const variant = row.variant ?? "normal";
            const onDark = variant === "caixa-final";
            const [rowCls, stickyBg] = statusRowStyle[variant] ?? statusRowStyle.normal;
            const cor = (v: number | undefined) => v != null && statusValorClass(v, onDark);

            const sel = row.statusValues?.[mesSel];
            const tot = rowTotal(row);

            return (
              <tr key={row.key} className={cn("border-b last:border-0", rowCls)}>
                <td
                  className={cn(
                    cellPad,
                    "sticky left-0 z-20 text-left",
                    stickyBg,
                    row.indent && "pl-5",
                  )}
                >
                  <span className="flex items-center gap-1">
                    {row.collapsible ? (
                      <button
                        type="button"
                        aria-expanded={!row.collapsed}
                        onClick={row.onToggle}
                        className="flex items-center gap-1 text-left cursor-pointer select-none rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {row.collapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className={cn(variant === "group" && "uppercase tracking-wide")}>
                          {row.label}
                        </span>
                      </button>
                    ) : (
                      <span>{row.label}</span>
                    )}
                    {row.labelSuffix}
                  </span>
                </td>
                {monthsBefore.map((m) => {
                  const v = monthTotal(row, m);
                  return (
                    <td key={m} className={cn(numCell, cor(v))}>
                      {v == null ? "" : fmtFc(v)}
                    </td>
                  );
                })}
                <td className={cn(numCell, cor(sel?.pago))}>
                  {sel == null ? "" : fmtFc(sel.pago)}
                </td>
                <td className={cn(numCell, cor(sel?.previsto))}>
                  {sel == null ? "" : fmtFc(sel.previsto)}
                </td>
                <td className={cn(numCell, cor(sel?.total))}>
                  {sel == null ? "" : fmtFc(sel.total)}
                </td>
                <td
                  className={cn(
                    numCell,
                    "border-l",
                    onDark ? "border-blue-800" : "border-border",
                    variant === "normal" && "bg-muted/60",
                    cor(tot),
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

