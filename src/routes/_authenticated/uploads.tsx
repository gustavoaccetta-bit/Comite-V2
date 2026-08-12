import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listMeses, mesLabel } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/uploads")({
  head: () => ({ meta: [{ title: "Uploads — Divid Comitê" }] }),
  component: UploadsPage,
});

function UploadsPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/comite" });
  }, [loading, isAdmin, navigate]);

  if (!isAdmin) return null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Uploads</h1>
      <UploadOrcamento />
      <UploadRealizado />
      <UploadExtrato />
      <UploadCarteiras />
      <UploadFluxoCaixa />
    </div>
  );
}

function UploadFluxoCaixa() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluxo de Caixa</CardTitle>
        <CardDescription>
          Upload das planilhas de Contas a Receber (C.R) e Contas a Pagar (C.P).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FluxoCaixaBlock titulo="Recebimentos (C.R)" tipo="CR" />
          <FluxoCaixaBlock titulo="Pagamentos (C.P)" tipo="CP" />
        </div>
        <SaldoInicialBlock />
      </CardContent>
    </Card>
  );
}

function SaldoInicialBlock() {
  const MES = "2026-01-01";
  const [valor, setValor] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fc_saldo_inicial")
        .select("valor")
        .eq("mes_referencia", MES)
        .maybeSingle();
      if (data) {
        setSaved(Number(data.valor));
        setValor(String(data.valor));
      }
    })();
  }, []);

  const fmtBRL = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const handle = async () => {
    setBusy(true);
    try {
      const num = parseNumber(valor);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("fc_saldo_inicial")
        .upsert(
          { mes_referencia: MES, valor: num, criado_por: u.user?.id },
          { onConflict: "mes_referencia" },
        );
      if (error) throw error;
      setSaved(num);
      toast.success("Saldo inicial salvo com sucesso.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3 md:max-w-sm">
      <div className="font-medium text-sm">Saldo Inicial de Janeiro</div>
      <div className="space-y-2">
        <Label>Valor (R$)</Label>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={valor}
          onChange={e => setValor(e.target.value)}
        />
        {saved != null && (
          <div className="text-xs text-muted-foreground">
            Valor atual salvo: <span className="font-medium">{fmtBRL(saved)}</span>
          </div>
        )}
      </div>
      <Button onClick={handle} disabled={busy} className="w-full">
        {busy ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}

function FluxoCaixaBlock({ titulo, tipo }: { titulo: string; tipo: "CR" | "CP" }) {
  const meses = listMeses();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [status, setStatus] = useState<"realizado" | "previsto" | "fechamento">("realizado");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const statusLabels: Record<string, string> = {
    realizado: "Realizado",
    previsto: "Previsto",
    fechamento: "Fechamento Final",
  };

  const mesLabelStr = mesLabel(mes).replace(" ", "/");

  const handle = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const worksheet = wb.Sheets[wb.SheetNames[0]];
      const primeiroDiaDoMes = `${mes}-01`;

      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: null });
      const excluidas = ["total geral", "entrada de transferência", "saída de transferência"];
      const registros = rows
        .filter(row => {
          const cat = typeof row[0] === "string" ? row[0].trim() : "";
          const valorValido =
            typeof row[1] === "number" ||
            (row[1] !== "" && row[1] != null && !isNaN(Number(row[1])));
          return cat !== "" && valorValido && !excluidas.includes(cat.toLowerCase());
        })
        .map(row => ({
          mes_referencia: primeiroDiaDoMes, // formato 'YYYY-MM-DD'
          tipo: tipo, // 'CR' ou 'CP'
          categoria: String(row[0]).trim(),
          valor: Number(row[1]) || 0,
          status,
        }))
        .filter(r => r.valor !== 0);

      if (!registros.length) {
        toast.warning("Nenhuma linha válida para importar.");
        return;
      }

      // 1. Delete
      let delQuery = supabase
        .from("fc_lancamentos")
        .delete()
        .eq("mes_referencia", primeiroDiaDoMes)
        .eq("tipo", tipo);
      if (status !== "fechamento") delQuery = delQuery.eq("status", status);
      const { error: delError } = await delQuery;
      if (delError) throw delError;

      // 2. Insert
      const { error } = await supabase.from("fc_lancamentos").insert(registros);
      if (error) throw error;

      const tipoLabel = tipo === "CR" ? "C.R" : "C.P";
      toast.success(`${tipoLabel} • ${statusLabels[status]} • ${mesLabelStr} • ${registros.length} categorias`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="font-medium text-sm">{titulo}</div>
      <div className="space-y-2">
        <Label>Mês de Referência</Label>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {meses.map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={v => setStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="realizado">Realizado (Pago/Recebido)</SelectItem>
            <SelectItem value="previsto">Previsto (A Pagar/A Receber)</SelectItem>
            <SelectItem value="fechamento">Fechamento Final</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <Button onClick={handle} disabled={!file || busy} className="w-full">
        {busy ? "Importando…" : "Importar"}
      </Button>
    </div>
  );
}

const MESES_CARTEIRA = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function UploadCarteiras() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Carteiras Intramês</CardTitle>
        <CardDescription>
          Upload das planilhas de recebimentos e pagamentos referentes ao mês selecionado em cada card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CarteiraBlock
            titulo="Upload Recebimentos"
            tipoLabel="Recebimentos"
            sheetMatch="Receb"
            table="carteiras_recebimentos"
          />
          <CarteiraBlock
            titulo="Upload Pagamentos"
            tipoLabel="Pagamentos"
            sheetMatch="Pagam"
            table="carteiras_pagamentos"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CarteiraBlock({
  titulo,
  tipoLabel,
  sheetMatch,
  table,
}: {
  titulo: string;
  tipoLabel: string;
  sheetMatch: string;
  table: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [mes, setMes] = useState(() => new Date().getMonth() + 1); // 1-12
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [status, setStatus] = useState<"realizado" | "previsto" | "fechamento">("realizado");
  const inputRef = useRef<HTMLInputElement>(null);

  const mesReferencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const mesLabelStr = `${MESES_CARTEIRA[mes - 1]}/${ano}`;

  const statusLabels: Record<string, string> = {
    realizado: "Realizado",
    previsto: "Previsto",
    fechamento: "Fechamento Final",
  };

  const handle = async () => {
    if (!file || !mesReferencia) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      // Uma única aba: usa direto. Múltiplas: faz matching por nome.
      const sheetName =
        wb.SheetNames.length === 1
          ? wb.SheetNames[0]
          : wb.SheetNames.find(n => n.includes(sheetMatch));
      if (!sheetName) throw new Error(`Aba contendo "${sheetMatch}" não encontrada na planilha`);
      const ws = wb.Sheets[sheetName];

      // Lê pares: coluna A = categoria, coluna B = valor.
      // Ignora qualquer linha em que a coluna A esteja vazia (inclui a primeira).
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
      // Agrega categorias repetidas somando os valores.
      const agregado = new Map<string, number>();
      for (const r of rows) {
        const categoria = r[0] != null ? String(r[0]).trim() : "";
        if (!categoria) continue;
        agregado.set(categoria, (agregado.get(categoria) ?? 0) + parseNumber(r[1]));
      }
      const payload = Array.from(agregado, ([categoria, valor]) => ({
        mes_referencia: mesReferencia,
        categoria,
        valor,
        status,
      }));

      if (!payload.length) {
        toast.warning("Nenhuma linha válida para importar.");
        return;
      }

      // Reimportação segura: confirma antes de substituir dados existentes
      let countQuery = supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("mes_referencia", mesReferencia);
      if (status !== "fechamento") countQuery = countQuery.eq("status", status);
      const { count } = await countQuery;
      if ((count ?? 0) > 0) {
        const ok = window.confirm(
          `Já existem dados de ${tipoLabel} (${statusLabels[status]}) para ${mesLabelStr}. Substituir?`,
        );
        if (!ok) return;
      }

      let delQuery = supabase.from(table).delete().eq("mes_referencia", mesReferencia);
      if (status !== "fechamento") delQuery = delQuery.eq("status", status);
      const { error: delError } = await delQuery;
      if (delError) throw delError;

      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;

      toast.success(
        `${tipoLabel} • ${statusLabels[status]} • ${mesLabelStr} • ${payload.length} categorias`,
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="font-medium text-sm">{titulo}</div>
      <Input ref={inputRef} type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Mês</Label>
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES_CARTEIRA.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Ano</Label>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2027">2027</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={v => setStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="realizado">Realizado (Pago/Recebido)</SelectItem>
            <SelectItem value="previsto">Previsto (A Pagar/A Receber)</SelectItem>
            <SelectItem value="fechamento">Fechamento Final</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handle} disabled={!file || !mesReferencia || busy} className="w-full">
        {busy ? "Importando…" : "Importar"}
      </Button>
    </div>
  );
}


function UploadExtrato() {
  const meses = listMeses();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [extratos, setExtratos] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("comite_extratos")
        .select("*")
        .eq("mes_referencia", mes)
        .order("criado_em", { ascending: false });
      setExtratos(data ?? []);
    })();
  }, [mes, version]);

  const handle = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const sanitizeFileName = (name: string) =>
        name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/_+/g, "_");

      const nomeOriginal = file.name;
      const nomeSanitizado = sanitizeFileName(nomeOriginal);
      const storagePath = `${mes}/${nomeSanitizado}`;

      const { error: uploadError } = await supabase.storage
        .from("Comite-extratos")
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

      const { data: signedData, error: signedError } = await supabase.storage
        .from("Comite-extratos")
        .createSignedUrl(storagePath, 31536000);
      if (signedError || !signedData?.signedUrl) throw new Error("Erro ao gerar URL");

      const { data: u } = await supabase.auth.getUser();
      const { error: dbError } = await supabase.from("comite_extratos").insert({
        mes_referencia: mes,
        nome_arquivo: nomeOriginal,
        storage_path: storagePath,
        url_arquivo: signedData.signedUrl,
        criado_por: u.user?.id,
      });
      if (dbError) throw new Error(`Erro ao salvar: ${dbError.message}`);

      toast.success("Extrato enviado com sucesso");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setVersion(v => v + 1);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, path: string) => {
    if (!confirm("Remover este extrato?")) return;
    await supabase.storage.from("Comite-extratos").remove([path]);
    await supabase.from("comite_extratos").delete().eq("id", id);
    toast.success("Extrato removido");
    setVersion(v => v + 1);
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const downloadExtrato = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("Comite-extratos")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Erro ao gerar link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extrato do Mês</CardTitle>
        <CardDescription>
          Faça upload do arquivo Excel de extrato para disponibilizar para download no comitê.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Mês de Referência</Label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {meses.map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={handle} disabled={!file || busy}>{busy ? "Enviando…" : "Fazer upload"}</Button>

        <div className="space-y-2 pt-2">
          <div className="text-sm font-medium">Extratos enviados — {mesLabel(mes)}</div>
          {extratos.length === 0 && <div className="text-xs text-muted-foreground">Nenhum extrato para este mês.</div>}
          {extratos.map(e => (
            <div key={e.id} className="flex items-center justify-between rounded border p-2 text-sm gap-2">
              <div className="truncate min-w-0">
                <div className="truncate font-medium">{e.nome_arquivo}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(e.criado_em)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => downloadExtrato(e.storage_path)}>⬇️ Download</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(e.id, e.storage_path)}>Remover</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function parseNumber(v: any): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  return Number(s) || 0;
}

async function readFile(file: File): Promise<any[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return new Promise((res, rej) => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: r => res(r.data as any[]),
        error: rej,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

async function readExcelFile(file: File): Promise<{ categoria: string; valor: number }[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      const result = rows
        .slice(2)
        .filter(row => row[0] && row[1] && row[0] !== "Total geral")
        .map(row => ({
          categoria: String(row[0]).trim(),
          valor: Math.abs(Number(row[1])),
        }))
        .filter(row => row.valor > 0);
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function UploadOrcamento() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await readFile(file);
      // espera colunas: categoria_comite, mes_referencia, valor_base, valor_rolling
      const fechRes = await supabase.from("comite_fechamento").select("mes_referencia");
      const fechados = new Set((fechRes.data ?? []).map(f => f.mes_referencia));

      const payload: any[] = [];
      let skipped = 0;
      for (const r of rows) {
        const categoria = String(r.categoria_comite ?? r.Categoria ?? r.categoria ?? "").trim();
        const mes = String(r.mes_referencia ?? r.mes ?? "").trim();
        if (!categoria || !mes) continue;
        if (fechados.has(mes)) { skipped++; continue; }
        payload.push({
          categoria_comite: categoria,
          mes_referencia: mes,
          valor_base: parseNumber(r.valor_base ?? r.base ?? 0),
          valor_rolling: parseNumber(r.valor_rolling ?? r.rolling ?? 0),
        });
      }
      if (!payload.length) {
        toast.warning("Nenhuma linha válida para importar.");
        return;
      }
      const { error } = await supabase
        .from("comite_orcamento")
        .upsert(payload, { onConflict: "categoria_comite,mes_referencia" });
      if (error) throw error;
      toast.success(`${payload.length} linhas importadas${skipped ? ` (${skipped} puladas — mês fechado)` : ""}.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Orçamento</CardTitle>
        <CardDescription>
          CSV ou Excel com colunas: <code>categoria_comite</code>, <code>mes_referencia</code> (YYYY-MM), <code>valor_base</code>, <code>valor_rolling</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={handle} disabled={!file || busy}>{busy ? "Importando…" : "Importar"}</Button>
      </CardContent>
    </Card>
  );
}

function UploadRealizado() {
  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState<"pago" | "a_pagar" | "fechamento_final">("pago");
  const meses = listMeses();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dataExport, setDataExport] = useState(new Date().toISOString().split("T")[0]);
  const [busy, setBusy] = useState(false);
  const [naoMapeadas, setNaoMapeadas] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async () => {
    if (!file) return;
    setBusy(true);
    setNaoMapeadas([]);
    try {
      const { data: fech } = await supabase.from("comite_fechamento").select("id").eq("mes_referencia", mes).maybeSingle();
      if (fech) { toast.error(`Mês ${mesLabel(mes)} está fechado. Reabra o mês em Fechar Mês antes de importar.`); return; }

      const { data: cats } = await supabase.from("comite_categorias").select("categoria_omie");
      const validas = new Set((cats ?? []).map(c => c.categoria_omie));

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      let importRows: { categoria: string; valor: number }[] = [];
      if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
        importRows = await readExcelFile(file);
      } else {
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
        const csvRows = (parsed.data ?? []) as string[][];
        importRows = csvRows
          .filter(r => r[0] && r[1])
          .map(r => ({ categoria: String(r[0]).trim(), valor: Math.abs(parseNumber(r[1])) }))
          .filter(r => r.valor > 0);
      }

      const payload: any[] = [];
      const naoMap: string[] = [];

      for (const r of importRows) {
        const cat = r.categoria;
        if (!cat) continue;
        if (!validas.has(cat)) { naoMap.push(cat); continue; }
        payload.push({
          categoria_omie: cat, tipo,
          valor: r.valor,
          mes_referencia: mes, data_export: dataExport, criado_por: userId,
        });
      }

      if (tipo === "fechamento_final") {
        await supabase.from("comite_realizado").delete().eq("mes_referencia", mes);
      } else {
        await supabase.from("comite_realizado").delete().eq("mes_referencia", mes).eq("tipo", tipo);
      }

      if (payload.length) {
        const { error } = await supabase.from("comite_realizado").insert(payload);
        if (error) throw error;
      }

      const unicas = [...new Set(naoMap)];
      setNaoMapeadas(unicas);
      toast.success(`${payload.length} categorias importadas${unicas.length ? `, ${unicas.length} não mapeadas` : ""}.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Realizado (OMIE)</CardTitle>
        <CardDescription>CSV (categoria, valor_líquido) ou Excel OMIE (.xlsx).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">Pago no mês</SelectItem>
                <SelectItem value="a_pagar">A Pagar</SelectItem>
                <SelectItem value="fechamento_final">Fechamento Final</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mês de Referência</Label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {meses.map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data do Export</Label>
            <Input type="date" value={dataExport} onChange={e => setDataExport(e.target.value)} />
          </div>
        </div>
        <Input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={handle} disabled={!file || busy}>{busy ? "Importando…" : "Importar"}</Button>
        {naoMapeadas.length > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <div className="font-semibold mb-1">Categorias não mapeadas ({naoMapeadas.length}):</div>
            <ul className="list-disc pl-5 space-y-0.5 text-xs">
              {naoMapeadas.map(c => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
