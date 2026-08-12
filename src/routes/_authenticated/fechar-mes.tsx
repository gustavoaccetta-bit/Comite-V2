import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useComiteData, useFechamentos } from "@/hooks/use-comite-data";
import { listMeses, mesLabel, fmtBRL } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fechar-mes")({
  head: () => ({ meta: [{ title: "Fechar Mês — Divid Comitê" }] }),
  component: FecharMesPage,
});

function FecharMesPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/comite" }); }, [loading, isAdmin, navigate]);

  const meses = useMemo(() => listMeses(), []);
  const [mes, setMes] = useState(meses[12]);
  const { data: fechamentos } = useFechamentos();
  const { data } = useComiteData(mes, "rolling");
  const fechamento = (fechamentos ?? []).find(f => f.mes_referencia === mes) as any | undefined;
  const jaFechado = !!fechamento;

  const confirmar = async () => {
    const { error } = await supabase.from("comite_fechamento").insert({
      mes_referencia: mes, fechado_por: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Mês fechado.");
    qc.invalidateQueries();
  };

  const reabrir = async () => {
    const { error } = await supabase.from("comite_fechamento").delete().eq("mes_referencia", mes);
    if (error) { toast.error(error.message); return; }
    toast.success("Mês reaberto com sucesso");
    qc.invalidateQueries();
  };

  if (!isAdmin) return null;

  const fechadoEm = fechamento?.created_at ?? fechamento?.fechado_em;
  const fechadoEmStr = fechadoEm ? new Date(fechadoEm).toLocaleDateString("pt-BR") : "";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Fechar Mês</h1>
      <Card>
        <CardHeader>
          <CardTitle>Selecione o mês</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>

          {jaFechado && (
            <div className="rounded-md border bg-warning/30 px-4 py-3 text-sm">
              Mês fechado{fechadoEmStr ? ` em ${fechadoEmStr}` : ""}
              {fechamento?.fechado_por ? ` por ${fechamento.fechado_por}` : ""}.
            </div>
          )}

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase">
                <tr><th className="text-left p-2">Grupo</th><th className="text-right p-2">Orçado</th><th className="text-right p-2">Realizado</th><th className="text-right p-2">Variação</th></tr>
              </thead>
              <tbody>
                {(data?.grupos ?? []).map(g => (
                  <tr key={g.grupo} className="border-t">
                    <td className="p-2 font-medium">{g.grupo}</td>
                    <td className="p-2 text-right">{fmtBRL(g.orcado)}</td>
                    <td className="p-2 text-right">{fmtBRL(g.realizado)}</td>
                    <td className="p-2 text-right">{fmtBRL(g.orcado - g.realizado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-secondary">
                  <td className="p-2">TOTAL</td>
                  <td className="p-2 text-right">{fmtBRL(data?.totals.orcado ?? 0)}</td>
                  <td className="p-2 text-right">{fmtBRL(data?.totals.realizado ?? 0)}</td>
                  <td className="p-2 text-right">{fmtBRL((data?.totals.orcado ?? 0) - (data?.totals.realizado ?? 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
            O mês ficará bloqueado para novos uploads. Para reabrir, será necessário clicar em Reabrir Mês.
          </div>

          {jaFechado ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">🔓 Reabrir Mês</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reabrir mês</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja reabrir <b>{mesLabel(mes)}</b>? Novos uploads voltarão a ser permitidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={reabrir}>Confirmar reabertura</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Fechar mês {mesLabel(mes)}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar fechamento</AlertDialogTitle>
                  <AlertDialogDescription>
                    Você está prestes a fechar <b>{mesLabel(mes)}</b>. O mês ficará bloqueado para novos uploads. Para reabrir, será necessário clicar em Reabrir Mês.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmar}>Confirmar fechamento</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
